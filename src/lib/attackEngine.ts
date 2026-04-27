import type { AttackType, AttackParams } from '@/contexts/AttackContext';

/**
 * Generic shape of a SCADA telemetry sample. Mirrors the relevant
 * fields of `SystemState` so the engine can transform live data
 * without coupling to the API types.
 */
export interface GridSample {
  voltage?: number;
  frequency?: number;
  current?: number;
  power?: number;
  generation?: number;
  load?: number;
  // SystemState fields used by the realistic attacks:
  gen_mw?: number;
  load_mw?: number;
  area1?: string;
  area2?: string;
  calculated_bill?: number;
  price_rate?: number;
  security_level?: string;
  attack_score?: number;
  timestamp?: number | string;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Replay buffer (legacy)                                                     */
/* -------------------------------------------------------------------------- */

const REPLAY_BUFFER_SIZE = 60;
const replayBuffer: GridSample[] = [];
let replayCursor = 0;
let mitmCursor = 0;

function recordSample(sample: GridSample): void {
  replayBuffer.push({ ...sample });
  if (replayBuffer.length > REPLAY_BUFFER_SIZE) replayBuffer.shift();
}

export function resetAttackEngine(): void {
  replayBuffer.length = 0;
  replayCursor = 0;
  mitmCursor = 0;
}

/* -------------------------------------------------------------------------- */
/* Attack simulators                                                          */
/* -------------------------------------------------------------------------- */

/** False Data Injection — voltage & frequency pushed out of band. */
function simulateFDI(data: GridSample): GridSample {
  const tampered: GridSample = { ...data };
  const v = typeof tampered.voltage === 'number' ? tampered.voltage : 230;
  const f = typeof tampered.frequency === 'number' ? tampered.frequency : 50;

  tampered.voltage = Math.round(v * 1.18);              // +18% → ~270V
  tampered.frequency = Number((f + 1.8).toFixed(2));    // +1.8Hz → ~51.8Hz
  if (typeof tampered.current === 'number') {
    tampered.current = Math.round(tampered.current * 1.2);
  }
  // Mark security level so the diagram reflects the threat immediately.
  tampered.security_level = 'CRITICAL';
  return tampered;
}

/**
 * Load Switching — forces one or both areas OFF and zeroes their share
 * of the load so the SCADA diagram visibly stops flowing power.
 */
function simulateLoadSwitch(data: GridSample, params: AttackParams): GridSample {
  const tampered: GridSample = { ...data };
  const target = params.area ?? 'area1';

  if (target === 'area1' || target === 'both') tampered.area1 = 'OFF';
  if (target === 'area2' || target === 'both') tampered.area2 = 'OFF';

  // Drop load consistently with the areas being de-energised.
  const baseLoad = typeof data.load_mw === 'number' ? data.load_mw : 0;
  const factor =
    target === 'both' ? 0 : target === 'area1' ? 0.4 : 0.6; // residual load
  tampered.load_mw = Math.max(0, Math.round(baseLoad * factor));
  tampered.security_level = target === 'both' ? 'CRITICAL' : 'WARNING';
  return tampered;
}

/**
 * Smart Meter Tampering — biases reported consumption & resulting bill.
 * Default factor 0.45 (under-reports usage by ~55%).
 */
function simulateMeterTamper(data: GridSample, params: AttackParams): GridSample {
  const tampered: GridSample = { ...data };
  const factor = params.tamperFactor ?? 0.45;

  if (typeof tampered.load_mw === 'number') {
    tampered.load_mw = Math.max(0, Math.round(tampered.load_mw * factor));
  }
  if (typeof tampered.calculated_bill === 'number') {
    tampered.calculated_bill = Number((tampered.calculated_bill * factor).toFixed(2));
  }
  tampered.security_level = 'WARNING';
  return tampered;
}

/**
 * Man-in-the-Middle — introduces jitter and small inconsistencies on
 * V/f/load and replays a slightly stale packet on every 3rd sample so
 * downstream analytics see suspicious fluctuation.
 */
function simulateMITM(data: GridSample, params: AttackParams): GridSample {
  const jitter = params.jitter ?? 0.08; // ±8%
  const noise = () => 1 + (Math.random() * 2 - 1) * jitter;

  // Every third sample, replay a slightly stale packet from the buffer.
  mitmCursor += 1;
  const base =
    mitmCursor % 3 === 0 && replayBuffer.length > 0
      ? replayBuffer[Math.max(0, replayBuffer.length - 2)]
      : data;

  const tampered: GridSample = { ...base };
  if (typeof tampered.voltage === 'number') tampered.voltage = Number((tampered.voltage * noise()).toFixed(1));
  if (typeof tampered.frequency === 'number') tampered.frequency = Number((tampered.frequency * noise()).toFixed(2));
  if (typeof tampered.load_mw === 'number') tampered.load_mw = Math.max(0, Math.round(tampered.load_mw * noise()));
  if (typeof tampered.gen_mw === 'number') tampered.gen_mw = Math.max(0, Math.round(tampered.gen_mw * noise()));
  tampered.security_level = 'WARNING';
  return tampered;
}

/** Replay (legacy). */
function simulateReplay(data: GridSample): GridSample {
  if (replayBuffer.length === 0) return { ...data };
  const sample = replayBuffer[replayCursor % replayBuffer.length];
  replayCursor += 1;
  return { ...sample };
}

/** DoS (legacy). */
function simulateDoS(): null {
  return null;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Apply a Red Team attack transformation to a telemetry sample.
 *
 * Pipeline contract:
 *   Raw Data → applyAttack() → Detection → Global State → UI
 */
export function applyAttack(
  data: GridSample,
  attack: AttackType,
  params: AttackParams = {},
): GridSample | null {
  // Always retain a clean baseline (except during a full blackout).
  if (attack !== 'DOS') recordSample(data);

  switch (attack) {
    case 'FDI':
      return simulateFDI(data);
    case 'LOAD_SWITCH':
      return simulateLoadSwitch(data, params);
    case 'METER_TAMPER':
      return simulateMeterTamper(data, params);
    case 'MITM':
      return simulateMITM(data, params);
    case 'REPLAY':
      return simulateReplay(data);
    case 'DOS':
      return simulateDoS();
    case 'NONE':
    default:
      return { ...data };
  }
}
