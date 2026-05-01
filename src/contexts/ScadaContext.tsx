import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSocketContext } from '@/contexts/SocketContext';
import type { SystemState, ThreatLog } from '@/lib/api';
import type { SecurityPostureLevel } from '@/lib/threatDetection';

/**
 * Global SCADA pipeline context.
 *
 *   Raw Data (socket) → Attack Engine (in useSocket) → Detection → ScadaContext → UI
 *
 * Every page consumes the same `useScada()` snapshot, so Dashboard,
 * Diagram, Logs, Security and the global alert banner stay perfectly
 * synchronized whether or not an attack is active.
 *
 * `data` is `null` during a DoS blackout. UI consumers MUST tolerate
 * this and render fallbacks like "N/A" / "SYSTEM OFFLINE".
 */
export interface ScadaThreatSummary {
  type: string;          // human-friendly category (e.g. "FDI Attack")
  level: SecurityPostureLevel;
  raw: ThreatLog;        // full underlying log entry
}

export interface ScadaContextValue {
  data: SystemState | null;
  prevData: SystemState | null;
  logs: ThreatLog[];
  threat: ScadaThreatSummary | null;
  posture: SecurityPostureLevel;
  attackScore: number;
  isConnected: boolean;
  mqttConnected: boolean;
  clearLogs: () => void;
}

const ScadaContext = createContext<ScadaContextValue | null>(null);

function prettifyCategory(cat: string): string {
  return cat
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ScadaProvider({ children }: { children: React.ReactNode }) {
  const {
    lastState,
    threats,
    posture,
    attackScore,
    isConnected,
    mqttConnected,
    clearThreats,
  } = useSocketContext();

  const prevRef = useRef<SystemState | null>(null);
  const [prevData, setPrevData] = useState<SystemState | null>(null);

  // Track the previous committed sample so consumers (e.g. diff views)
  // can compare against the latest one.
  useEffect(() => {
    setPrevData(prevRef.current);
    prevRef.current = lastState;
  }, [lastState]);

  // Latest threat log → high-level threat summary used by GlobalAlert.
  const threat = useMemo<ScadaThreatSummary | null>(() => {
    if (!threats || threats.length === 0 || posture === 'NORMAL') return null;
    const top = threats[0];
    const sev = (top.threat_classification?.severity ?? 'INFO').toUpperCase();
    const level: SecurityPostureLevel =
      sev === 'CRITICAL' ? 'CRITICAL' : sev === 'WARNING' ? 'WARNING' : 'NORMAL';
    return {
      type: prettifyCategory(top.threat_classification?.category ?? 'UNKNOWN'),
      level,
      raw: top,
    };
  }, [threats, posture]);

  const value = useMemo<ScadaContextValue>(
    () => ({
      data: lastState,
      prevData,
      logs: threats,
      threat,
      posture,
      attackScore,
      isConnected,
      mqttConnected,
      clearLogs: clearThreats,
    }),
    [lastState, prevData, threats, threat, posture, attackScore, isConnected, mqttConnected, clearThreats],
  );

  return <ScadaContext.Provider value={value}>{children}</ScadaContext.Provider>;
}

export function useScada(): ScadaContextValue {
  const ctx = useContext(ScadaContext);
  if (!ctx) {
    throw new Error('useScada must be used within a ScadaProvider');
  }
  return ctx;
}
