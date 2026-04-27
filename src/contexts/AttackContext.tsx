import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * Supported Red Team attack simulation types.
 *
 * Realistic Smart-Grid attacks:
 *  - NONE          : No attack active.
 *  - FDI           : False Data Injection — pushes V/f outside nominal bands.
 *  - LOAD_SWITCH   : Unauthorized Load Switching — forces an Area OFF.
 *  - METER_TAMPER  : Smart Meter Tampering — biases consumption / billing.
 *  - MITM          : Man-in-the-Middle — adds jitter / inconsistencies.
 *
 * Legacy (kept for backward compatibility with prior simulation lab):
 *  - REPLAY        : Replay Attack — re-emits captured legitimate samples.
 *  - DOS           : Denial of Service — telemetry blackout.
 */
export type AttackType =
  | 'NONE'
  | 'FDI'
  | 'LOAD_SWITCH'
  | 'METER_TAMPER'
  | 'MITM'
  | 'REPLAY'
  | 'DOS';

/** Optional per-attack tuning parameters. */
export interface AttackParams {
  /** For LOAD_SWITCH: which area to force OFF. */
  area?: 'area1' | 'area2' | 'both';
  /** For METER_TAMPER: multiplicative bias on load/bill (e.g. 0.4 = under-report, 1.8 = over-report). */
  tamperFactor?: number;
  /** For MITM: jitter magnitude as fraction of value (e.g. 0.08 = ±8%). */
  jitter?: number;
}

export interface AttackState {
  type: AttackType;
  active: boolean;
  startedAt: number | null;
  params: AttackParams;
}

export interface AttackContextValue extends AttackState {
  startAttack: (type: Exclude<AttackType, 'NONE'>, params?: AttackParams) => void;
  stopAttack: () => void;
}

const initialState: AttackState = {
  type: 'NONE',
  active: false,
  startedAt: null,
  params: {},
};

const AttackContext = createContext<AttackContextValue | null>(null);

export function AttackProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AttackState>(initialState);

  const startAttack = useCallback(
    (type: Exclude<AttackType, 'NONE'>, params: AttackParams = {}) => {
      setState({
        type,
        active: true,
        startedAt: Date.now(),
        params,
      });
    },
    [],
  );

  const stopAttack = useCallback(() => {
    setState(initialState);
  }, []);

  const value = useMemo<AttackContextValue>(
    () => ({ ...state, startAttack, stopAttack }),
    [state, startAttack, stopAttack],
  );

  return <AttackContext.Provider value={value}>{children}</AttackContext.Provider>;
}

export function useAttack(): AttackContextValue {
  const ctx = useContext(AttackContext);
  if (!ctx) throw new Error('useAttack must be used within an AttackProvider');
  return ctx;
}
