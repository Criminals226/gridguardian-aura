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
  | 'REPLAY_SUSPECTED'
  | 'LOAD_SWITCHING'
  | 'METER_TAMPERING'
  | 'MITM_SUSPECTED';

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
/* Stateful detectors (MITM jitter, meter delta, area transitions)            */
/* -------------------------------------------------------------------------- */

interface DetectorMemory {
  lastLoad?: number;
  lastBill?: number;
  lastArea1?: string;
  lastArea2?: string;
  lastVoltage?: number;
  lastFrequency?: number;
  jitterStreak: number;
}

const memory: DetectorMemory = { jitterStreak: 0 };

export function resetDetectorMemory(): void {
  memory.lastLoad = undefined;
  memory.lastBill = undefined;
  memory.lastArea1 = undefined;
  memory.lastArea2 = undefined;
  memory.lastVoltage = undefined;
  memory.lastFrequency = undefined;
  memory.jitterStreak = 0;
}

/* -------------------------------------------------------------------------- */
/* Core detection                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Inspect a single SCADA telemetry sample and decide whether it
 * represents a security-relevant anomaly.
 *
 * Detects:
 *  - DoS              → null/undefined sample
 *  - FDI              → V & f simultaneously out of band
 *  - Voltage anomaly  → V outside warn/critical thresholds
 *  - Frequency anomaly → f outside warn/critical thresholds
 *  - Load switching   → unexpected area OFF transition with load drop
 *  - Meter tampering  → load/bill jumps inconsistent with prior reading
 *  - MITM             → repeated jitter streak on V/f
 */
export function detectThreat(data: GridSample | null | undefined): DetectionResult {
  // 1. DoS — telemetry blackout
  if (data === null || data === undefined) {
    return {
      detected: true,
      category: 'DOS_ATTACK',
      subcategory: 'Telemetry blackout',
      severity: 'CRITICAL',
      explanation: 'No telemetry received — possible Denial-of-Service against SCADA link.',
      score: 15,
    };
  }

  const voltage = typeof data.voltage === 'number' ? data.voltage : NOMINAL_VOLTAGE;
  const frequency = typeof data.frequency === 'number' ? data.frequency : NOMINAL_FREQUENCY;
  const loadMw = typeof data.load_mw === 'number' ? data.load_mw : undefined;
  const bill = typeof data.calculated_bill === 'number' ? data.calculated_bill : undefined;
  const area1 = typeof data.area1 === 'string' ? data.area1 : undefined;
  const area2 = typeof data.area2 === 'string' ? data.area2 : undefined;

  const vDelta = Math.abs(voltage - NOMINAL_VOLTAGE);
  const fDelta = Math.abs(frequency - NOMINAL_FREQUENCY);

  const voltageCritical = vDelta >= VOLTAGE_CRIT_DELTA;
  const voltageWarn = vDelta >= VOLTAGE_WARN_DELTA;
  const freqCritical = fDelta >= FREQ_CRIT_DELTA;
  const freqWarn = fDelta >= FREQ_WARN_DELTA;

  /* ---- 2. FDI — correlated V + f drift (CRITICAL) ----------------------- */
  if (voltageCritical && freqCritical) {
    updateMemory(voltage, frequency, loadMw, bill, area1, area2);
    return {
      detected: true,
      category: 'FDI_ATTACK',
      subcategory: 'Correlated V/F injection',
      severity: 'CRITICAL',
      explanation: `False Data Injection suspected: V=${voltage.toFixed(1)}V, f=${frequency.toFixed(
        2,
      )}Hz simultaneously out of nominal band.`,
      score: 18,
    };
  }

  /* ---- 3. Load Switching — area transitioned OFF with load drop --------- */
  const a1Off = memory.lastArea1 === 'ON' && area1 === 'OFF';
  const a2Off = memory.lastArea2 === 'ON' && area2 === 'OFF';
  if (a1Off || a2Off) {
    const both = a1Off && a2Off;
    updateMemory(voltage, frequency, loadMw, bill, area1, area2);
    return {
      detected: true,
      category: 'LOAD_SWITCHING',
      subcategory: both ? 'Both areas de-energised' : a1Off ? 'Area 1 OFF' : 'Area 2 OFF',
      severity: both ? 'CRITICAL' : 'WARNING',
      explanation: `Unauthorized load switching detected — ${
        both ? 'Area 1 + Area 2' : a1Off ? 'Area 1' : 'Area 2'
      } transitioned OFF.`,
      score: both ? 14 : 7,
    };
  }

  /* ---- 4. Meter Tampering — sudden inconsistent load/bill jump ---------- */
  if (
    typeof loadMw === 'number' &&
    typeof memory.lastLoad === 'number' &&
    memory.lastLoad > 100
  ) {
    const ratio = loadMw / memory.lastLoad;
    if (ratio < 0.55 || ratio > 1.8) {
      updateMemory(voltage, frequency, loadMw, bill, area1, area2);
      return {
        detected: true,
        category: 'METER_TAMPERING',
        subcategory: ratio < 0.55 ? 'Under-reporting' : 'Over-reporting',
        severity: 'WARNING',
        explanation: `Smart meter tampering suspected — load changed by ${(
          (ratio - 1) *
          100
        ).toFixed(0)}% in one tick (${memory.lastLoad}W → ${loadMw}W).`,
        score: 6,
      };
    }
  }

  /* ---- 5. MITM — small but repeated V/f jitter --------------------------- */
  if (
    typeof memory.lastVoltage === 'number' &&
    typeof memory.lastFrequency === 'number'
  ) {
    const vJitter = Math.abs(voltage - memory.lastVoltage);
    const fJitter = Math.abs(frequency - memory.lastFrequency);
    const isJittery =
      vJitter > 4 && vJitter < VOLTAGE_WARN_DELTA &&
      fJitter > 0.15 && fJitter < FREQ_WARN_DELTA;

    if (isJittery) {
      memory.jitterStreak += 1;
    } else {
      memory.jitterStreak = Math.max(0, memory.jitterStreak - 1);
    }

    if (memory.jitterStreak >= 3) {
      updateMemory(voltage, frequency, loadMw, bill, area1, area2);
      return {
        detected: true,
        category: 'MITM_SUSPECTED',
        subcategory: 'Packet jitter / inconsistency',
        severity: 'WARNING',
        explanation: `Man-in-the-Middle suspected — sustained V/f jitter (ΔV=${vJitter.toFixed(
          1,
        )}V, Δf=${fJitter.toFixed(2)}Hz) over ${memory.jitterStreak} ticks.`,
        score: 5,
      };
    }
  }

  /* ---- 6. Standalone voltage anomaly ------------------------------------ */
  if (voltageCritical) {
    updateMemory(voltage, frequency, loadMw, bill, area1, area2);
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
    updateMemory(voltage, frequency, loadMw, bill, area1, area2);
    return {
      detected: true,
      category: 'VOLTAGE_ANOMALY',
      subcategory: 'Warning deviation',
      severity: 'WARNING',
      explanation: `Voltage ${voltage.toFixed(1)}V outside normal operating band.`,
      score: 4,
    };
  }

  /* ---- 7. Standalone frequency anomaly ---------------------------------- */
  if (freqCritical) {
    updateMemory(voltage, frequency, loadMw, bill, area1, area2);
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
    updateMemory(voltage, frequency, loadMw, bill, area1, area2);
    return {
      detected: true,
      category: 'FREQUENCY_ANOMALY',
      subcategory: 'Warning drift',
      severity: 'WARNING',
      explanation: `Frequency ${frequency.toFixed(2)}Hz outside normal band.`,
      score: 3,
    };
  }

  // No anomaly — refresh memory and return clean.
  updateMemory(voltage, frequency, loadMw, bill, area1, area2);
  return { detected: false, score: 0 };
}

function updateMemory(
  voltage: number,
  frequency: number,
  loadMw: number | undefined,
  bill: number | undefined,
  area1: string | undefined,
  area2: string | undefined,
): void {
  memory.lastVoltage = voltage;
  memory.lastFrequency = frequency;
  if (typeof loadMw === 'number') memory.lastLoad = loadMw;
  if (typeof bill === 'number') memory.lastBill = bill;
  if (typeof area1 === 'string') memory.lastArea1 = area1;
  if (typeof area2 === 'string') memory.lastArea2 = area2;
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
