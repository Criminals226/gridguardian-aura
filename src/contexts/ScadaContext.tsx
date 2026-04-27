import React, { createContext, useContext, useMemo } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAttack } from '@/contexts/AttackContext';
import type { SystemState, ThreatLog } from '@/lib/api';
import type { SecurityPostureLevel } from '@/lib/threatDetection';

/**
 * Global SCADA pipeline state.
 *
 * Pipeline:
 *   Raw socket data → applyAttack() (engine) → detectThreat() → ScadaContext → UI
 *
 * Every page (Dashboard, Security, Logs, Diagram) reads from this single
 * source of truth via `useScada()` so the entire app stays in sync.
 */
export interface ScadaContextValue {
  /** Latest (post-pipeline) telemetry sample. */
  data: SystemState | null;
  /** Merged live + detected threat log feed. */
  logs: ThreatLog[];
  /** Most recent threat (or null). */
  threat: ThreatLog | null;
  /** Current posture derived from running attack score. */
  posture: SecurityPostureLevel;
  /** Running attack score (0..20). */
  attackScore: number;
  /** Socket connectivity. */
  isConnected: boolean;
  /** MQTT broker connectivity. */
  mqttConnected: boolean;

  /** Re-exported attack controls so any page can trigger / stop attacks. */
  attackType: ReturnType<typeof useAttack>['type'];
  attackActive: boolean;
  startAttack: ReturnType<typeof useAttack>['startAttack'];
  stopAttack: ReturnType<typeof useAttack>['stopAttack'];

  /** Clear local detector state and threat feed. */
  clearThreats: () => void;
}

const ScadaContext = createContext<ScadaContextValue | null>(null);

export function ScadaProvider({ children }: { children: React.ReactNode }) {
  const {
    isConnected,
    lastState,
    threats,
    mqttConnected,
    clearThreats,
    attackScore,
    posture,
  } = useSocket();

  const { type: attackType, active: attackActive, startAttack, stopAttack } = useAttack();

  const value = useMemo<ScadaContextValue>(
    () => ({
      data: lastState,
      logs: threats,
      threat: threats[0] ?? null,
      posture,
      attackScore,
      isConnected,
      mqttConnected,
      attackType,
      attackActive,
      startAttack,
      stopAttack,
      clearThreats,
    }),
    [
      lastState,
      threats,
      posture,
      attackScore,
      isConnected,
      mqttConnected,
      attackType,
      attackActive,
      startAttack,
      stopAttack,
      clearThreats,
    ],
  );

  return <ScadaContext.Provider value={value}>{children}</ScadaContext.Provider>;
}

export function useScada(): ScadaContextValue {
  const ctx = useContext(ScadaContext);
  if (!ctx) throw new Error('useScada must be used within a ScadaProvider');
  return ctx;
}
