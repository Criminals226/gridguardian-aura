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
  score: number; // contribution to attack score (0..20)
}

/* -------------------------------------------------------------------------- */
/* Nominal grid bands                                                         */
/* -------------------------------------------------------------------------- */

const NOMINAL_VOLTAGE = 230;
const VOLTAGE_WARN_DELTA = 15;
const VOLTAGE_CRIT_DELTA = 30;

const NOMINAL_FREQUENCY = 50;
const FREQ_WARN_DELTA = 0.5;
const FREQ_CRIT_DELTA = 1.0;

/* -------------------------------------------------------------------------- */
/* Core detection                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Inspect a single SCADA telemetry sample and decide whether it
 * represents a security-relevant anomaly.
 *
 * @param current  Latest (possibly tampered) sample, or null on blackout.
 * @param prev     Previous committed sample (used for replay detection).
 */
export function detectThreat(
  current: GridSample | null | undefined,
  prev?: GridSample | null,
): DetectionResult {
  // 1. DoS — telemetry blackout (null sample OR null voltage)
  if (
    current === null ||
    current === undefined ||
    current.voltage === null
  ) {
    return {
      detected: true,
      category: 'DOS_ATTACK',
      subcategory: 'Telemetry blackout',
      severity: 'CRITICAL',
      explanation:
        'No telemetry received — possible Denial-of-Service against SCADA link.',
      score: 16,
    };
  }

  const voltage =
    typeof current.voltage === 'number' ? current.voltage : NOMINAL_VOLTAGE;
  const frequency =
    typeof current.frequency === 'number' ? current.frequency : NOMINAL_FREQUENCY;

  // 2. Replay — identical timestamp + identical values vs previous sample
  if (prev && prev.timestamp && current.timestamp) {
    const sameTs = current.timestamp === prev.timestamp;
    const sameV = current.voltage === prev.voltage;
    const sameF = current.frequency === prev.frequency;
    if (sameTs && sameV && sameF) {
      return {
        detected: true,
        category: 'REPLAY_SUSPECTED',
        subcategory: 'Frozen telemetry packet',
        severity: 'WARNING',
        explanation:
          'Identical telemetry packet re-observed — possible replay attack.',
        score: 8,
      };
    }
  }

  const vDelta = Math.abs(voltage - NOMINAL_VOLTAGE);
  const fDelta = Math.abs(frequency - NOMINAL_FREQUENCY);

  const voltageCritical = vDelta >= VOLTAGE_CRIT_DELTA;
  const voltageWarn = vDelta >= VOLTAGE_WARN_DELTA;
  const freqCritical = fDelta >= FREQ_CRIT_DELTA;
  const freqWarn = fDelta >= FREQ_WARN_DELTA;

  // 3. FDI — correlated voltage + frequency drift
  if (voltageCritical && freqCritical) {
    return {
      detected: true,
      category: 'FDI_ATTACK',
      subcategory: 'Correlated V/F injection',
      severity: 'CRITICAL',
      explanation: `False Data Injection suspected: V=${voltage.toFixed(
        1,
      )}V, f=${frequency.toFixed(2)}Hz simultaneously out of nominal band.`,
      score: 18,
    };
  }

  // 4. Voltage anomaly
  if (voltageCritical) {
    return {
      detected: true,
      category: 'VOLTAGE_ANOMALY',
      subcategory: 'Critical deviation',
      severity: 'CRITICAL',
      explanation: `Voltage ${voltage.toFixed(1)}V deviates ${vDelta.toFixed(
        1,
      )}V from nominal (${NOMINAL_VOLTAGE}V).`,
      score: 10,
    };
  }
  if (voltageWarn) {
    return {
      detected: true,
      category: 'VOLTAGE_ANOMALY',
      subcategory: 'Warning deviation',
      severity: 'WARNING',
      explanation: `Voltage ${voltage.toFixed(1)}V outside normal operating band.`,
      score: 4,
    };
  }

  // 5. Frequency anomaly
  if (freqCritical) {
    return {
      detected: true,
      category: 'FREQUENCY_ANOMALY',
      subcategory: 'Critical drift',
      severity: 'CRITICAL',
      explanation: `Frequency ${frequency.toFixed(2)}Hz drifted ${fDelta.toFixed(
        2,
      )}Hz from 50Hz nominal.`,
      score: 8,
    };
  }
  if (freqWarn) {
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
/* Posture & scoring                                                          */
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

/* -------------------------------------------------------------------------- */
/* Threat log helper                                                          */
/* -------------------------------------------------------------------------- */

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
