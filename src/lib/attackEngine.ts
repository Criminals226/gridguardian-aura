import type { AttackType } from '@/contexts/AttackContext';

/**
 * Generic shape of a SCADA telemetry sample.
 * Kept loose so the engine can operate on any grid data object
 * (hardware_state, system_state, merged_state, etc.).
 *
 * Common fields used by attacks:
 *  - voltage   (V)
 *  - frequency (Hz)
 *  - current   (A)
 *  - power / generation / load (W)
 */
export interface GridSample {
  voltage?: number;
  frequency?: number;
  current?: number;
  power?: number;
  generation?: number;
  load?: number;
  timestamp?: number;
  [key: string]: unknown;
}

/** Maximum number of samples retained for the Replay attack buffer. */
const REPLAY_BUFFER_SIZE = 60;

/** Internal circular buffer of recent legitimate samples. */
const replayBuffer: GridSample[] = [];

/** Cursor used to step through the replay buffer deterministically. */
let replayCursor = 0;

/**
 * Push a fresh, legitimate sample into the replay buffer.
 * Call this from the data ingestion path BEFORE applying any attack
 * so the buffer always holds clean baseline data.
 */
function recordSample(sample: GridSample): void {
  replayBuffer.push({ ...sample });
  if (replayBuffer.length > REPLAY_BUFFER_SIZE) {
    replayBuffer.shift();
  }
}

/** Clear the internal replay buffer (e.g. on logout / reset). */
export function resetAttackEngine(): void {
  replayBuffer.length = 0;
  replayCursor = 0;
}

/* -------------------------------------------------------------------------- */
/* Individual attack simulators                                               */
/* -------------------------------------------------------------------------- */

/**
 * False Data Injection — pushes voltage and frequency outside
 * normal operating bands to simulate a tampered sensor reading.
 */
function simulateFDI(data: GridSample): GridSample {
  const tampered: GridSample = { ...data };

  // Nominal grid: 230 V / 50 Hz. Inject +15% voltage and +1.5 Hz drift.
  if (typeof tampered.voltage === 'number') {
    tampered.voltage = Math.round(tampered.voltage * 1.15);
  } else {
    tampered.voltage = 265;
  }

  if (typeof tampered.frequency === 'number') {
    tampered.frequency = Number((tampered.frequency + 1.5).toFixed(2));
  } else {
    tampered.frequency = 51.5;
  }

  // Slight current spike to make the anomaly correlated and detectable.
  if (typeof tampered.current === 'number') {
    tampered.current = Math.round(tampered.current * 1.2);
  }

  return tampered;
}

/**
 * Replay Attack — re-emits a previously captured legitimate sample.
 * Falls back to the incoming sample if the buffer is empty.
 */
function simulateReplay(data: GridSample): GridSample {
  if (replayBuffer.length === 0) {
    return { ...data };
  }
  const sample = replayBuffer[replayCursor % replayBuffer.length];
  replayCursor += 1;
  // Preserve the original timestamp from the replayed packet so that
  // SOC tooling can detect the time-skew anomaly.
  return { ...sample };
}

/**
 * Denial of Service — simulates total data loss by returning null.
 * Consumers should treat null as "no telemetry received this tick".
 */
function simulateDoS(): null {
  return null;
}

/**
 * Load Switching Attack — forces a substation cutoff by zeroing
 * area switches, load, generation, and voltage.
 */
function simulateLoadSwitch(data: GridSample): GridSample {
  const tampered: GridSample = { ...data };
  tampered.area1 = 'OFF';
  tampered.area2 = 'OFF';
  if ('load_mw' in tampered) {
    tampered.load_mw = 0;
  } else {
    tampered.load = 0;
  }
  if ('gen_mw' in tampered) {
    tampered.gen_mw = 0;
  } else {
    tampered.generation = 0;
  }
  tampered.voltage = 0;
  return tampered;
}

/**
 * Smart Meter Tampering — inflates reported load to simulate
 * billing fraud. Other fields remain untouched so an imbalance
 * vs generation becomes detectable.
 */
function simulateMeterTamper(data: GridSample): GridSample {
  const tampered: GridSample = { ...data };
  const factor = 1.4 + Math.random() * 0.8; // 1.4..2.2
  if (typeof tampered.load_mw === 'number') {
    tampered.load_mw = Math.round(tampered.load_mw * factor);
  } else if (typeof tampered.load === 'number') {
    tampered.load = Math.round(tampered.load * factor);
  } else {
    tampered.load = Math.round(1000 * factor);
  }
  return tampered;
}

/** Phase flag used to alternate the sign of MITM jitter each tick. */
let mitmPhase = false;

/**
 * Man-in-the-Middle — adds bounded jitter to voltage / frequency /
 * load to simulate packet manipulation. Values stay within
 * physically plausible ranges.
 */
function simulateMITM(data: GridSample): GridSample {
  const tampered: GridSample = { ...data };
  mitmPhase = !mitmPhase;
  const sign = mitmPhase ? 1 : -1;

  const vJitter = (8 + Math.random() * 12) * sign;          // ±8..20 V
  const fJitter = (0.3 + Math.random() * 0.6) * sign;       // ±0.3..0.9 Hz
  const lJitter = (200 + Math.random() * 600) * sign;       // ±200..800 W

  const baseV = typeof tampered.voltage === 'number' ? tampered.voltage : 230;
  const baseF = typeof tampered.frequency === 'number' ? tampered.frequency : 50;

  tampered.voltage = Math.max(180, Math.min(280, Math.round(baseV + vJitter)));
  tampered.frequency = Math.max(
    48,
    Math.min(52, Number((baseF + fJitter).toFixed(2))),
  );

  if (typeof tampered.load_mw === 'number') {
    tampered.load_mw = Math.max(0, Math.round(tampered.load_mw + lJitter));
  } else if (typeof tampered.load === 'number') {
    tampered.load = Math.max(0, Math.round(tampered.load + lJitter));
  }

  return tampered;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Apply a Red Team attack transformation to a telemetry sample.
 *
 * @param data    The latest legitimate telemetry sample.
 * @param attack  The attack type currently active.
 * @returns       The (possibly tampered) sample, or `null` for DoS.
 *
 * Notes:
 *  - When `attack === 'NONE'`, the sample is recorded in the replay
 *    buffer and returned unchanged.
 *  - During FDI, the clean sample is still recorded so a subsequent
 *    Replay attack has realistic data to draw from.
 */
export function applyAttack(
  data: GridSample,
  attack: AttackType,
): GridSample | null {
  // Always keep the clean sample in the buffer (except during DoS,
  // where we assume nothing arrived).
  if (attack !== 'DOS') {
    recordSample(data);
  }

  switch (attack) {
    case 'FDI':
      return simulateFDI(data);
    case 'REPLAY':
      return simulateReplay(data);
    case 'DOS':
      return simulateDoS();
    case 'LOAD_SWITCH':
      return simulateLoadSwitch(data);
    case 'METER_TAMPER':
      return simulateMeterTamper(data);
    case 'MITM':
      return simulateMITM(data);
    case 'NONE':
    default:
      return { ...data };
  }
}
