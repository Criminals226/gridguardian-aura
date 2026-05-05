import type { GridSample } from '@/lib/attackEngine';

/**
 * Smart-grid system model — single source of truth.
 *
 *   Power Plant  →  Smart Feeder  →  Smart Meter  →  Areas
 *
 * Backend MQTT contract drives everything:
 *   gen_mw, load_mw, area1, area2, calculated_bill, price_rate
 *
 * Rules:
 *   • feederLoad   = load_mw                       (no synthetic noise)
 *   • voltage      = nominal − k × load            (sags under demand)
 *   • distribution = depends on area1 / area2 toggles
 */

export type ComponentStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
export type AreaState = 'ON' | 'OFF';

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
  feederLoad: number | null;    // = load_mw
  status: ComponentStatus;
}

export interface SmartMeterState {
  load: number | null;          // MW delivered
  voltage: number | null;
  area1: AreaState;
  area2: AreaState;
  area1Load: number | null;     // MW going to area 1
  area2Load: number | null;     // MW going to area 2
  calculatedBill: number | null;
  priceRate: number | null;
  status: ComponentStatus;
}

export interface ModeledSystem {
  plant: PowerPlantState;
  feeder: SmartFeederState;
  meter: SmartMeterState;
  sample: GridSample;
}

const NOMINAL_V = 230;
const NOMINAL_F = 50;
const VOLTAGE_LOAD_COEFF = 0.0015; // V drop per MW above 0

function pickNumber(...vals: Array<unknown>): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function pickArea(v: unknown): AreaState {
  return v === 'OFF' ? 'OFF' : 'ON';
}

function classify(value: number | null, nominal: number, warn: number, crit: number): ComponentStatus {
  if (value === null) return 'OFFLINE';
  const d = Math.abs(value - nominal);
  if (d >= crit) return 'CRITICAL';
  if (d >= warn) return 'WARNING';
  return 'NORMAL';
}

function worst(...statuses: ComponentStatus[]): ComponentStatus {
  const order: ComponentStatus[] = ['OFFLINE', 'CRITICAL', 'WARNING', 'NORMAL'];
  for (const s of order) if (statuses.includes(s)) return s;
  return 'NORMAL';
}

export function modelSystem(raw: GridSample): ModeledSystem {
  const plantGeneration = pickNumber(raw.gen_mw, raw.generation, raw.power);
  const plantFrequency = pickNumber(raw.frequency);
  const loadMw = pickNumber(raw.load_mw, raw.load);
  const plantRpm = pickNumber((raw as Record<string, unknown>).gen_rpm);
  const priceRate = pickNumber((raw as Record<string, unknown>).price_rate) ?? 0.25;
  const calculatedBillRaw = pickNumber((raw as Record<string, unknown>).calculated_bill);

  // Plant voltage: prefer raw, otherwise derive from load (voltage sags under load)
  let plantVoltage = pickNumber(raw.voltage);
  if (plantVoltage === null && loadMw !== null) {
    plantVoltage = Number((NOMINAL_V - loadMw * VOLTAGE_LOAD_COEFF).toFixed(2));
  }

  // Transmission loss: scales with load (more current = more I²R loss)
  const transmissionLoss =
    loadMw !== null
      ? Number((3 + Math.min(2, loadMw / 2000)).toFixed(2)) // 3..5 V
      : plantGeneration !== null
        ? Number((3 + (Math.abs(plantGeneration) % 20) / 10).toFixed(2))
        : null;

  const feederVoltage =
    plantVoltage !== null && transmissionLoss !== null
      ? Number((plantVoltage - transmissionLoss).toFixed(2))
      : null;

  // Areas drive distribution
  const area1 = pickArea((raw as Record<string, unknown>).area1);
  const area2 = pickArea((raw as Record<string, unknown>).area2);
  const activeAreas = (area1 === 'ON' ? 1 : 0) + (area2 === 'ON' ? 1 : 0);

  // Distribution: load is split across active areas; if all areas off → 0
  const meterLoad =
    loadMw === null
      ? null
      : activeAreas === 0
        ? 0
        : Number(loadMw.toFixed(2));

  const area1Load =
    meterLoad === null ? null : area1 === 'ON' && activeAreas > 0 ? Number((meterLoad / activeAreas).toFixed(2)) : 0;
  const area2Load =
    meterLoad === null ? null : area2 === 'ON' && activeAreas > 0 ? Number((meterLoad / activeAreas).toFixed(2)) : 0;

  // Bill: prefer backend value, otherwise derive
  const calculatedBill =
    calculatedBillRaw !== null
      ? calculatedBillRaw
      : meterLoad !== null
        ? Number((meterLoad * priceRate * 0.001).toFixed(2))
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
    activeAreas === 0 ? 'WARNING' : 'NORMAL',
  );

  const sample: GridSample = {
    ...raw,
    voltage: plantVoltage,
    frequency: plantFrequency,
    generation: plantGeneration,
    gen_mw: plantGeneration,
    load_mw: meterLoad,
    load: meterLoad,
    area1,
    area2,
    calculated_bill: calculatedBill ?? undefined,
    price_rate: priceRate,
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
      feederLoad: meterLoad,
      status: feederStatus,
    },
    meter: {
      load: meterLoad,
      voltage: feederVoltage,
      area1,
      area2,
      area1Load,
      area2Load,
      calculatedBill,
      priceRate,
      status: meterStatus,
    },
    sample,
  };
}

export function offlineSystem(): ModeledSystem {
  return {
    plant: { voltage: null, frequency: null, generation: null, rpm: null, status: 'OFFLINE' },
    feeder: { voltage: null, transmissionLoss: null, frequency: null, feederLoad: null, status: 'OFFLINE' },
    meter: {
      load: null, voltage: null, area1: 'OFF', area2: 'OFF',
      area1Load: null, area2Load: null, calculatedBill: null, priceRate: null,
      status: 'OFFLINE',
    },
    sample: {
      voltage: null, frequency: null, generation: null,
      gen_mw: null, load_mw: null, timestamp: Date.now(),
    },
  };
}
