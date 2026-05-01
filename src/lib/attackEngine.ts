import type { AttackType } from '@/contexts/AttackContext';

/**
 * Generic shape of a SCADA telemetry sample. Kept loose so the engine
 * can operate on any grid data object (hardware_state, system_state,
 * merged_state, etc.). Common fields:
 *  - voltage   (V)
 *  - frequency (Hz)
 *  - current   (A)
 *  - load / generation (W or MW)
 */
export interface GridSample {
  voltage?: number | null;
  frequency?: number | null;
  current?: number | null;
  power?: number;
  generation?: number;
  load?: number;
  timestamp?: number;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Replay buffer — single frozen snapshot                                     */
/* -------------------------------------------------------------------------- */

let replayBuffer: GridSample | null = null;
let lastAttack: AttackType = 'NONE';

/** Clear the replay buffer (call on logout / full reset). */
export function resetAttackEngine(): void {
  replayBuffer = null;
  lastAttack = 'NONE';
}

/* -------------------------------------------------------------------------- */
/* Individual attack simulators                                               */
/* -------------------------------------------------------------------------- */

/** False Data Injection — voltage + frequency pushed far out of band. */
function simulateFDI(data: GridSample): GridSample {
  const tampered: GridSample = { ...data };
  const baseV = typeof tampered.voltage === 'number' ? tampered.voltage : 230;
  const baseF = typeof tampered.frequency === 'number' ? tampered.frequency : 50;
  tampered.voltage = Math.round(baseV + 80);              // → ~310V
  tampered.frequency = Number((baseF + 5).toFixed(2));    // → ~55Hz
  if (typeof tampered.current === 'number') {
    tampered.current = Math.round(tampered.current * 1.2);
  }
  return tampered;
}

/**
 * Replay Attack — return the first sample captured when the attack
 * started, identical every tick (values "freeze").
 */
function simulateReplay(data: GridSample): GridSample {
  if (!replayBuffer) replayBuffer = { ...data };
  return { ...replayBuffer };
}

/** Denial of Service — telemetry blackout. */
function simulateDoS(): null {
  return null;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Apply a Red Team attack transformation to a telemetry sample.
 *
 *   Raw Data → applyAttack → (Detection → UI)
 *
 * @param data    Latest legitimate telemetry sample.
 * @param attack  Attack type currently active.
 * @returns       The (possibly tampered) sample, or `null` for DoS.
 */
export function applyAttack(
  data: GridSample,
  attack: AttackType,
): GridSample | null {
  // Reset replay buffer whenever the attack type changes (or stops).
  if (attack !== lastAttack) {
    if (attack !== 'REPLAY') replayBuffer = null;
    lastAttack = attack;
  }

  // While idle, continually refresh the buffer so that the moment
  // REPLAY is triggered we have a fresh snapshot to lock onto.
  if (attack === 'NONE') {
    replayBuffer = { ...data };
    return { ...data };
  }

  switch (attack) {
    case 'FDI':
      return simulateFDI(data);
    case 'REPLAY':
      return simulateReplay(data);
    case 'DOS':
      return simulateDoS();
    default:
      return { ...data };
  }
}
