import type { GridSample } from '@/lib/attackEngine';

/**
 * Smart-grid system model.
 *
 *   Power Plant  →  Smart Feeder  →  Smart Meter
 *
 * Centralised inside ScadaContext. UI components must NEVER recompute
 * these values themselves — they read them from `useScada().components`.
 *
 *   Power Plant : raw voltage / frequency / generation (from MQTT or sim)
 *   Smart Feeder: feederVoltage = plantVoltage − transmissionLoss (3–5 V)
 *   Smart Meter : load_mw      = generation × efficiencyFactor (0.75–0.9)
 */

export type ComponentStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';

export interface PowerPlantState {
  voltage: number | null;
  frequency: number | null;
  generation: number | null; // MW
  rpm: number | null;
  status: ComponentStatus;
}

export interface SmartFeederState {
  voltage: number | null;       // after transmission loss
  transmissionLoss: number | null;
  frequency: number | null;
  feederLoad: number | null;    // MW flowing through the feeder
  status: ComponentStatus;
}

export type AreaState = 'ON' | 'OFF';

export interface SmartMeterState {
  load: number | null;          // MW delivered to consumers (sum of areas)
  efficiency: number | null;    // 0..1
  voltage: number | null;       // mirrors feeder voltage at meter point
  status: ComponentStatus;
  area1: AreaState;
  area2: AreaState;
  area1Load: number | null;     // MW consumed by industrial area
  area2Load: number | null;     // MW consumed by residential area
  calculatedBill: number | null;// $ accumulated bill
}

export interface ModeledSystem {
  plant: PowerPlantState;
  feeder: SmartFeederState;
  meter: SmartMeterState;
  /** Flat sample carrying canonical fields for downstream consumers. */
  sample: GridSample;
}

const NOMINAL_V = 230;
const NOMINAL_F = 50;

function pickNumber(...vals: Array<unknown>): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function classify(
  value: number | null,
  nominal: number,
  warnDelta: number,
  critDelta: number,
): ComponentStatus {
  if (value === null) return 'OFFLINE';
  const d = Math.abs(value - nominal);
  if (d >= critDelta) return 'CRITICAL';
  if (d >= warnDelta) return 'WARNING';
  return 'NORMAL';
}

function worst(...statuses: ComponentStatus[]): ComponentStatus {
  const order: ComponentStatus[] = ['OFFLINE', 'CRITICAL', 'WARNING', 'NORMAL'];
  for (const s of order) if (statuses.includes(s)) return s;
  return 'NORMAL';
}

/**
 * Build the Power Plant → Smart Feeder → Smart Meter chain from a raw
 * telemetry sample (MQTT or simulator). Pure function — no side effects.
 */
export function modelSystem(raw: GridSample): ModeledSystem {
  const plantVoltage = pickNumber(raw.voltage);
  const plantFrequency = pickNumber(raw.frequency);
  const plantGeneration = pickNumber(raw.gen_mw, raw.generation, raw.power);
  const plantRpm = pickNumber((raw as Record<string, unknown>).gen_rpm);

  // Transmission loss between plant and feeder (3 – 5 V). Deterministic-ish:
  // derive from generation so it stays stable across renders for same input.
  const transmissionLoss =
    plantGeneration !== null
      ? Number((3 + (Math.abs(plantGeneration) % 20) / 10).toFixed(2)) // 3..5
      : null;

  const feederVoltage =
    plantVoltage !== null && transmissionLoss !== null
      ? Number((plantVoltage - transmissionLoss).toFixed(2))
      : null;

  // Efficiency 0.75 – 0.9 — slowly varying with frequency drift.
  const efficiency =
    plantFrequency !== null
      ? Number(
          Math.max(
            0.75,
            Math.min(0.9, 0.85 - Math.abs(plantFrequency - NOMINAL_F) * 0.1),
          ).toFixed(3),
        )
      : null;

  const meterLoad =
    plantGeneration !== null && efficiency !== null
      ? Number((plantGeneration * efficiency).toFixed(2))
      : null;

  // Areas come from the raw sample (backend control state).
  const rawArea1 = (raw as Record<string, unknown>).area1;
  const rawArea2 = (raw as Record<string, unknown>).area2;
  const area1: AreaState = rawArea1 === 'OFF' ? 'OFF' : 'ON';
  const area2: AreaState = rawArea2 === 'OFF' ? 'OFF' : 'ON';

  // Split meter load between active areas: industrial 60% / residential 40%.
  const activeShare = (area1 ? 0.6 : 0) + (area2 ? 0.4 : 0);
  const area1Load =
    meterLoad !== null && area1 === 'ON'
      ? Number(((meterLoad * 0.6) / Math.max(activeShare, 0.0001)).toFixed(2))
      : meterLoad !== null
      ? 0
      : null;
  const area2Load =
    meterLoad !== null && area2 === 'ON'
      ? Number(((meterLoad * 0.4) / Math.max(activeShare, 0.0001)).toFixed(2))
      : meterLoad !== null
      ? 0
      : null;

  const priceRate = pickNumber((raw as Record<string, unknown>).price_rate) ?? 0.25;
  const calculatedBill =
    pickNumber((raw as Record<string, unknown>).calculated_bill) ??
    (meterLoad !== null ? Number((meterLoad * priceRate).toFixed(2)) : null);

  const feederLoad = meterLoad;

  const plantStatus = worst(
    classify(plantVoltage, NOMINAL_V, 15, 30),
    classify(plantFrequency, NOMINAL_F, 0.5, 1),
    plantGeneration === null ? 'OFFLINE' : 'NORMAL',
  );

  const feederStatus = worst(
    classify(feederVoltage, NOMINAL_V - 4, 15, 30),
    plantStatus === 'OFFLINE' ? 'OFFLINE' : 'NORMAL',
  );

  const meterStatus = worst(
    meterLoad === null ? 'OFFLINE' : 'NORMAL',
    feederStatus === 'OFFLINE' ? 'OFFLINE' : 'NORMAL',
  );

  // Canonical sample re-projected with modeled values so downstream UI
  // (gauges, cards, detector) all see the same numbers.
  const sample: GridSample = {
    ...raw,
    voltage: plantVoltage,
    frequency: plantFrequency,
    generation: plantGeneration,
    gen_mw: plantGeneration,
    load_mw: meterLoad,
    load: meterLoad,
    timestamp: raw.timestamp ?? Date.now(),
  };

  return {
    plant: {
      voltage: plantVoltage,
      frequency: plantFrequency,
      generation: plantGeneration,
      rpm: plantRpm,
      status: plantStatus,
    },
    feeder: {
      voltage: feederVoltage,
      transmissionLoss,
      frequency: plantFrequency,
      feederLoad,
      status: feederStatus,
    },
    meter: {
      load: meterLoad,
      efficiency,
      voltage: feederVoltage,
      status: meterStatus,
      area1,
      area2,
      area1Load,
      area2Load,
      calculatedBill,
    },
    sample,
  };
}

export function offlineSystem(): ModeledSystem {
  return {
    plant: { voltage: null, frequency: null, generation: null, rpm: null, status: 'OFFLINE' },
    feeder: { voltage: null, transmissionLoss: null, frequency: null, feederLoad: null, status: 'OFFLINE' },
    meter: {
      load: null, efficiency: null, voltage: null, status: 'OFFLINE',
      area1: 'OFF', area2: 'OFF', area1Load: null, area2Load: null, calculatedBill: null,
    },
    sample: {
      voltage: null,
      frequency: null,
      generation: null,
      gen_mw: null,
      load_mw: null,
      timestamp: Date.now(),
    },
  };
}
