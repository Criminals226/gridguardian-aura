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
  status: ComponentStatus;
}

export interface SmartMeterState {
  load: number | null;          // MW delivered to consumers
  efficiency: number | null;    // 0..1
  voltage: number | null;       // mirrors feeder voltage at meter point
  status: ComponentStatus;
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
      status: feederStatus,
    },
    meter: {
      load: meterLoad,
      efficiency,
      voltage: feederVoltage,
      status: meterStatus,
    },
    sample,
  };
}

export function offlineSystem(): ModeledSystem {
  return {
    plant: { voltage: null, frequency: null, generation: null, rpm: null, status: 'OFFLINE' },
    feeder: { voltage: null, transmissionLoss: null, frequency: null, status: 'OFFLINE' },
    meter: { load: null, efficiency: null, voltage: null, status: 'OFFLINE' },
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
