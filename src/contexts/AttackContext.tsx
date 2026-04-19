import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * Supported Red Team attack simulation types.
 * - NONE:   No attack is currently active.
 * - FDI:    False Data Injection — manipulates sensor/measurement values.
 * - REPLAY: Replay Attack — re-sends previously captured legitimate traffic.
 * - DOS:    Denial of Service — floods the system to disrupt availability.
 */
export type AttackType = 'NONE' | 'FDI' | 'REPLAY' | 'DOS';

export interface AttackState {
  /** Current attack type being simulated. */
  type: AttackType;
  /** Whether an attack is currently active. */
  active: boolean;
  /** Timestamp (ms) when the current attack was started, or null. */
  startedAt: number | null;
}

export interface AttackContextValue extends AttackState {
  /** Start a new Red Team attack simulation. */
  startAttack: (type: Exclude<AttackType, 'NONE'>) => void;
  /** Stop the currently running attack and reset to NONE. */
  stopAttack: () => void;
}

const initialState: AttackState = {
  type: 'NONE',
  active: false,
  startedAt: null,
};

const AttackContext = createContext<AttackContextValue | null>(null);

export function AttackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AttackState>(initialState);

  const startAttack = useCallback((type: Exclude<AttackType, 'NONE'>) => {
    setState({
      type,
      active: true,
      startedAt: Date.now(),
    });
  }, []);

  const stopAttack = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<AttackContextValue>(
    () => ({
      ...state,
      startAttack,
      stopAttack,
    }),
    [state, startAttack, stopAttack],
  );

  return <AttackContext.Provider value={value}>{children}</AttackContext.Provider>;
}

/**
 * Access the global Attack simulation context.
 * Must be used within an <AttackProvider>.
 */
export function useAttack(): AttackContextValue {
  const ctx = useContext(AttackContext);
  if (!ctx) {
    throw new Error('useAttack must be used within an AttackProvider');
  }
  return ctx;
}
