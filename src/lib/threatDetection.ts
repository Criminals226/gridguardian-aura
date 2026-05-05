import type { ThreatLog } from '@/lib/api';
import type { GridSample } from '@/lib/attackEngine';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type SecurityPostureLevel = 'NORMAL' | 'WARNING' | 'CRITICAL';

export type ThreatCategory =
  | 'VOLTAGE_ANOMALY'
  | 'FREQUENCY_ANOMALY'
  | 'FDI_ATTACK'
  | 'DOS_ATTACK'
  | 'REPLAY_SUSPECTED';

export interface DetectionResult {
  detected: boolean;
  category?: ThreatCategory;
  subcategory?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  explanation?: string;
  score: number;
}

export interface DetectorState {
  /** consecutive ticks with identical timestamp */
  replayStreak: number;
  /** consecutive ticks with null/blackout telemetry */
  dosStreak: number;
  /** consecutive ticks with voltage out of band */
  voltageStreak: number;
  /** consecutive ticks with frequency out of band */
  frequencyStreak: number;
}

export function createDetectorState(): DetectorState {
  return { replayStreak: 0, dosStreak: 0, voltageStreak: 0, frequencyStreak: 0 };
}

/* -------------------------------------------------------------------------- */
/* Nominal grid bands + debounce thresholds                                   */
/* -------------------------------------------------------------------------- */

const NOMINAL_VOLTAGE = 230;
const VOLTAGE_WARN_DELTA = 18;   // slightly wider to suppress noise
const VOLTAGE_CRIT_DELTA = 30;

const NOMINAL_FREQUENCY = 50;
const FREQ_WARN_DELTA = 0.6;
const FREQ_CRIT_DELTA = 1.0;

// Debounce: how many consecutive bad ticks before we flag.
const REPLAY_MIN_STREAK = 3;
const DOS_MIN_STREAK = 2;
const ANOMALY_MIN_STREAK = 2;

/* -------------------------------------------------------------------------- */
/* Core detection                                                             */
/* -------------------------------------------------------------------------- */

export function detectThreat(
  current: GridSample | null | undefined,
  prev: GridSample | null | undefined,
  state: DetectorState,
): DetectionResult {
  // 1. DoS — telemetry blackout, debounced
  const isBlackout =
    current === null || current === undefined || current.voltage === null;

  if (isBlackout) {
    state.dosStreak += 1;
    state.replayStreak = 0;
    state.voltageStreak = 0;
    state.frequencyStreak = 0;
    if (state.dosStreak >= DOS_MIN_STREAK) {
      return {
        detected: true,
        category: 'DOS_ATTACK',
        subcategory: 'Telemetry blackout',
        severity: 'CRITICAL',
        explanation: 'No telemetry received — possible Denial-of-Service against SCADA link.',
        score: 16,
      };
    }
    return { detected: false, score: 0 };
  }
  state.dosStreak = 0;

  const voltage = typeof current!.voltage === 'number' ? current!.voltage : NOMINAL_VOLTAGE;
  const frequency = typeof current!.frequency === 'number' ? current!.frequency : NOMINAL_FREQUENCY;

  // 2. Replay — identical timestamp + values vs previous, debounced
  const sameTs = !!(prev && prev.timestamp && current!.timestamp && current!.timestamp === prev.timestamp);
  const sameV = !!(prev && current!.voltage === prev.voltage);
  const sameF = !!(prev && current!.frequency === prev.frequency);
  if (sameTs && sameV && sameF) {
    state.replayStreak += 1;
    if (state.replayStreak >= REPLAY_MIN_STREAK) {
      return {
        detected: true,
        category: 'REPLAY_SUSPECTED',
        subcategory: 'Frozen telemetry packet',
        severity: 'WARNING',
        explanation: `Identical telemetry packet repeated ${state.replayStreak}× — possible replay attack.`,
        score: 8,
      };
    }
  } else {
    state.replayStreak = 0;
  }

  const vDelta = Math.abs(voltage - NOMINAL_VOLTAGE);
  const fDelta = Math.abs(frequency - NOMINAL_FREQUENCY);

  const voltageCritical = vDelta >= VOLTAGE_CRIT_DELTA;
  const voltageWarn = vDelta >= VOLTAGE_WARN_DELTA;
  const freqCritical = fDelta >= FREQ_CRIT_DELTA;
  const freqWarn = fDelta >= FREQ_WARN_DELTA;

  if (voltageWarn) state.voltageStreak += 1; else state.voltageStreak = 0;
  if (freqWarn) state.frequencyStreak += 1; else state.frequencyStreak = 0;

  // 3. FDI — both V & F simultaneously out of band, sustained
  if (voltageCritical && freqCritical &&
      state.voltageStreak >= ANOMALY_MIN_STREAK &&
      state.frequencyStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected: true,
      category: 'FDI_ATTACK',
      subcategory: 'Correlated V/F injection',
      severity: 'CRITICAL',
      explanation: `False Data Injection suspected: V=${voltage.toFixed(1)}V, f=${frequency.toFixed(2)}Hz simultaneously out of nominal band.`,
      score: 18,
    };
  }

  // 4. Voltage anomaly (debounced)
  if (voltageCritical && state.voltageStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected: true,
      category: 'VOLTAGE_ANOMALY',
      subcategory: 'Critical deviation',
      severity: 'CRITICAL',
      explanation: `Voltage ${voltage.toFixed(1)}V deviates ${vDelta.toFixed(1)}V from nominal (${NOMINAL_VOLTAGE}V).`,
      score: 10,
    };
  }
  if (voltageWarn && state.voltageStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected: true,
      category: 'VOLTAGE_ANOMALY',
      subcategory: 'Warning deviation',
      severity: 'WARNING',
      explanation: `Voltage ${voltage.toFixed(1)}V outside normal operating band.`,
      score: 4,
    };
  }

  // 5. Frequency anomaly (debounced)
  if (freqCritical && state.frequencyStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected: true,
      category: 'FREQUENCY_ANOMALY',
      subcategory: 'Critical drift',
      severity: 'CRITICAL',
      explanation: `Frequency ${frequency.toFixed(2)}Hz drifted ${fDelta.toFixed(2)}Hz from 50Hz nominal.`,
      score: 8,
    };
  }
  if (freqWarn && state.frequencyStreak >= ANOMALY_MIN_STREAK) {
    return {
      detected: true,
      category: 'FREQUENCY_ANOMALY',
      subcategory: 'Warning drift',
      severity: 'WARNING',
      explanation: `Frequency ${frequency.toFixed(2)}Hz outside normal band.`,
      score: 3,
    };
  }

  return { detected: false, score: 0 };
}

/* -------------------------------------------------------------------------- */

export function postureFromScore(score: number): SecurityPostureLevel {
  if (score >= 15) return 'CRITICAL';
  if (score >= 5) return 'WARNING';
  return 'NORMAL';
}

export function decayScore(score: number, factor = 0.92): number {
  const next = score * factor;
  return next < 0.05 ? 0 : Number(next.toFixed(2));
}

let localThreatId = 1_000_000;

export function buildThreatLog(result: DetectionResult): ThreatLog {
  const id = localThreatId++;
  const timestamp = new Date().toISOString();
  return {
    id,
    timestamp,
    decision_id: `LOCAL-${id}`,
    action: 'DETECT',
    layer: 'CLIENT_DETECTOR',
    threat_classification: {
      category: result.category ?? 'UNKNOWN',
      subcategory: result.subcategory ?? '',
      severity: result.severity ?? 'INFO',
    },
    explanation: result.explanation ?? '',
    metadata: { score: result.score },
  };
}
