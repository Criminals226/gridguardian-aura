import type { AttackType, AttackState } from '@/contexts/AttackContext';

/**
 * Generic shape of a SCADA telemetry sample. Kept loose so the engine
 * can operate on any grid data object (hardware_state, system_state,
 * merged_state, etc.).
 */
export interface GridSample {
  voltage?: number | null;
  frequency?: number | null;
  current?: number | null;
  power?: number | null;
  generation?: number | null;
  gen_mw?: number | null;
  load?: number | null;
  load_mw?: number | null;
  timestamp?: number | string;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Persistent replay buffer (module scope — survives across ticks)            */
/* -------------------------------------------------------------------------- */

let replayBuffer: GridSample | null = null;

/** Clear the replay buffer (call on logout / full reset). */
export function resetAttackEngine(): void {
  replayBuffer = null;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Apply a Red Team attack transformation to a telemetry sample.
 *
 *   Raw Data → applyAttack → (Detection → UI)
 *
 * Accepts either an AttackType string or the full AttackState for
 * backwards compatibility with the existing socket pipeline.
 */
export function applyAttack(
  data: GridSample,
  attack: AttackType | Pick<AttackState, 'type' | 'active'>,
): GridSample | null {
  // Normalize argument: allow caller to pass either a bare type or {type, active}.
  const type: AttackType = typeof attack === 'string' ? attack : attack.type;
  const active: boolean =
    typeof attack === 'string' ? attack !== 'NONE' : attack.active;

  // No attack → keep buffer fresh with the latest sample so a future
  // REPLAY attack can capture instantly. Pass data through unchanged.
  if (!active || type === 'NONE') {
    replayBuffer = { ...data };
    return data;
  }

  // FDI Attack — push voltage + frequency out of nominal band.
  if (type === 'FDI') {
    const baseV = typeof data.voltage === 'number' ? data.voltage : 230;
    const baseF = typeof data.frequency === 'number' ? data.frequency : 50;
    return {
      ...data,
      voltage: baseV + 30,
      frequency: Number((baseF + 1).toFixed(2)),
    };
  }

  // DoS Attack — telemetry blackout (null fields).
  if (type === 'DOS') {
    return {
      ...data,
      voltage: null,
      frequency: null,
      gen_mw: null,
      load_mw: null,
      generation: null,
      load: null,
      current: null,
      power: null,
    };
  }

  // 🔴 REPLAY — capture once, then return the SAME snapshot every tick.
  // The snapshot keeps its ORIGINAL timestamp so the detector can flag
  // "frozen telemetry" while real wall-clock time keeps moving.
  if (type === 'REPLAY') {
    if (!replayBuffer) {
      replayBuffer = { ...data };
    }
    return {
      ...replayBuffer,
      timestamp: replayBuffer.timestamp, // explicit: do NOT advance
    };
  }

  return data;
}
