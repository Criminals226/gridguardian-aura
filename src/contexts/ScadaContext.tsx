import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSocketContext } from '@/contexts/SocketContext';
import { useAttack } from '@/contexts/AttackContext';
import type { SystemState, ThreatLog } from '@/lib/api';
import {
  applyAttack,
  resetAttackEngine,
  type GridSample,
} from '@/lib/attackEngine';
import {
  detectThreat,
  postureFromScore,
  decayScore,
  buildThreatLog,
  type SecurityPostureLevel,
} from '@/lib/threatDetection';
import {
  modelSystem,
  offlineSystem,
  type ModeledSystem,
  type PowerPlantState,
  type SmartFeederState,
  type SmartMeterState,
} from '@/lib/systemModel';
import { generateSCADAData } from '@/lib/scadaSimulator';

/**
 * Centralised SCADA pipeline.
 *
 *   1. Read baseData = MQTT (preferred) || generateSCADAData() (fallback)
 *   2. modelSystem(baseData)         → Power Plant → Smart Feeder → Smart Meter
 *   3. applyAttack(modeled.sample)   → FDI / Replay / DoS transformation
 *   4. detectThreat(tampered, prev)  → score + posture + dedup'd log entry
 *   5. Expose final processed data to the UI
 *
 * UI components MUST consume `useScada()` and never recompute these values.
 */

export interface ScadaThreatSummary {
  type: string;
  level: SecurityPostureLevel;
  raw: ThreatLog;
}

export interface ScadaComponents {
  plant: PowerPlantState;
  feeder: SmartFeederState;
  meter: SmartMeterState;
}

export interface ScadaContextValue {
  /** Final processed system state for the UI (null on DoS blackout). */
  data: SystemState | null;
  prevData: SystemState | null;
  /** Modeled three-component view (plant / feeder / meter). */
  components: ScadaComponents;
  /** Origin of the current sample. */
  source: 'mqtt' | 'simulation' | 'offline';
  /** Threat / log information. */
  logs: ThreatLog[];
  threat: ScadaThreatSummary | null;
  posture: SecurityPostureLevel;
  attackScore: number;
  /** Connection flags. */
  isConnected: boolean;
  mqttConnected: boolean;
  clearLogs: () => void;
}

const ScadaContext = createContext<ScadaContextValue | null>(null);

const TICK_MS = 1000;

function prettifyCategory(cat: string): string {
  return cat
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert a raw backend SystemState into the loose GridSample shape. */
function asGridSample(s: SystemState | null): GridSample | null {
  if (!s) return null;
  return {
    ...s,
    timestamp: s.last_update ?? Date.now(),
  };
}

/** Project the modeled system back into the SystemState shape the UI expects. */
function toSystemState(
  base: SystemState | null,
  modeled: ModeledSystem,
  attackScore: number,
  posture: SecurityPostureLevel,
  mqttConnected: boolean,
): SystemState {
  return {
    gen_mw: modeled.plant.generation ?? 0,
    gen_rpm: modeled.plant.rpm ?? 0,
    status: modeled.plant.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
    load_mw: modeled.meter.load ?? 0,
    voltage: modeled.plant.voltage ?? 0,
    frequency: modeled.plant.frequency ?? 0,
    area1: base?.area1 ?? 'ON',
    area2: base?.area2 ?? 'ON',
    calculated_bill: base?.calculated_bill ?? 0,
    security_level: posture,
    system_locked: base?.system_locked ?? false,
    mqtt_connected: mqttConnected,
    attack_score: Number(attackScore.toFixed(2)),
    threat_intel_active: base?.threat_intel_active ?? false,
    price_rate: base?.price_rate ?? 0.25,
    last_update:
      typeof modeled.sample.timestamp === 'string'
        ? modeled.sample.timestamp
        : new Date(modeled.sample.timestamp ?? Date.now()).toISOString(),
    data_source: base?.data_source,
  };
}

export function ScadaProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, mqttConnected, rawState } = useSocketContext();
  const { type: attackType, active: attackActive } = useAttack();

  // Keep latest attack + raw inputs in refs so the tick interval stays stable.
  const attackRef = useRef({ type: attackType, active: attackActive });
  useEffect(() => {
    attackRef.current = { type: attackType, active: attackActive };
    if (!attackActive) resetAttackEngine();
  }, [attackType, attackActive]);

  const rawStateRef = useRef<SystemState | null>(rawState);
  useEffect(() => {
    rawStateRef.current = rawState;
  }, [rawState]);

  const mqttConnectedRef = useRef(mqttConnected);
  useEffect(() => {
    mqttConnectedRef.current = mqttConnected;
  }, [mqttConnected]);

  // Detection state.
  const scoreRef = useRef(0);
  const postureRef = useRef<SecurityPostureLevel>('NORMAL');
  const lastLoggedCategoryRef = useRef<string | null>(null);
  // Reset dedup key when attack changes so each new attack logs once.
  useEffect(() => {
    lastLoggedCategoryRef.current = null;
  }, [attackType, attackActive]);

  // Pipeline outputs.
  const prevSampleRef = useRef<GridSample | null>(null);
  const [data, setData] = useState<SystemState | null>(null);
  const [prevData, setPrevData] = useState<SystemState | null>(null);
  const [components, setComponents] = useState<ScadaComponents>(() => {
    const off = offlineSystem();
    return { plant: off.plant, feeder: off.feeder, meter: off.meter };
  });
  const [source, setSource] = useState<'mqtt' | 'simulation' | 'offline'>('simulation');
  const [logs, setLogs] = useState<ThreatLog[]>([]);
  const [posture, setPosture] = useState<SecurityPostureLevel>('NORMAL');
  const [attackScore, setAttackScore] = useState(0);

  // Main pipeline tick.
  useEffect(() => {
    const tick = () => {
      // 1. baseData = MQTT (preferred) || simulator
      const mqttSample = mqttConnectedRef.current
        ? asGridSample(rawStateRef.current)
        : null;
      const baseSample: GridSample = mqttSample ?? generateSCADAData();
      const currentSource: 'mqtt' | 'simulation' = mqttSample ? 'mqtt' : 'simulation';

      // 2. System modelling (Plant → Feeder → Meter)
      const modeled = modelSystem(baseSample);

      // 3. Attack transformation
      const tampered = applyAttack(modeled.sample, attackRef.current);

      // 3a. DoS blackout
      if (tampered === null) {
        const off = offlineSystem();
        // Run detector with null sample so DoS gets logged.
        const result = detectThreat(null, prevSampleRef.current);
        if (result.detected) {
          const next = Math.min(20, scoreRef.current + result.score);
          scoreRef.current = next;
          postureRef.current = postureFromScore(next);
          setAttackScore(Number(next.toFixed(2)));
          setPosture(postureRef.current);
          const cat = result.category ?? 'UNKNOWN';
          if (lastLoggedCategoryRef.current !== cat) {
            lastLoggedCategoryRef.current = cat;
            setLogs((prev) => [buildThreatLog(result), ...prev].slice(0, 100));
          }
        }
        prevSampleRef.current = null;
        setComponents({ plant: off.plant, feeder: off.feeder, meter: off.meter });
        setSource('offline');
        setPrevData((prev) => prev);
        setData(null);
        return;
      }

      // For non-DoS attacks the tampered sample may differ from modeled.sample
      // (FDI injects, REPLAY freezes). Re-model so feeder/meter reflect it.
      const finalModeled = modelSystem(tampered);

      // 4. Detection
      const result = detectThreat(finalModeled.sample, prevSampleRef.current);
      if (result.detected) {
        const next = Math.min(20, scoreRef.current + result.score);
        scoreRef.current = next;
        postureRef.current = postureFromScore(next);
        setAttackScore(Number(next.toFixed(2)));
        setPosture(postureRef.current);
        const cat = result.category ?? 'UNKNOWN';
        if (lastLoggedCategoryRef.current !== cat) {
          lastLoggedCategoryRef.current = cat;
          setLogs((prev) => [buildThreatLog(result), ...prev].slice(0, 100));
        }
      } else {
        lastLoggedCategoryRef.current = null;
        const next = decayScore(scoreRef.current);
        if (next !== scoreRef.current) {
          scoreRef.current = next;
          postureRef.current = postureFromScore(next);
          setAttackScore(next);
          setPosture(postureRef.current);
        }
      }
      prevSampleRef.current = finalModeled.sample;

      // 5. Commit to UI.
      const finalState = toSystemState(
        rawStateRef.current,
        finalModeled,
        scoreRef.current,
        postureRef.current,
        mqttConnectedRef.current,
      );
      setPrevData((prev) => prev ?? null);
      setData((prev) => {
        setPrevData(prev);
        return finalState;
      });
      setComponents({
        plant: finalModeled.plant,
        feeder: finalModeled.feeder,
        meter: finalModeled.meter,
      });
      setSource(currentSource);
    };

    // Run once immediately so UI doesn't wait a full second on mount.
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const threat = useMemo<ScadaThreatSummary | null>(() => {
    if (!logs.length || posture === 'NORMAL') return null;
    const top = logs[0];
    const sev = (top.threat_classification?.severity ?? 'INFO').toUpperCase();
    const level: SecurityPostureLevel =
      sev === 'CRITICAL' ? 'CRITICAL' : sev === 'WARNING' ? 'WARNING' : 'NORMAL';
    return {
      type: prettifyCategory(top.threat_classification?.category ?? 'UNKNOWN'),
      level,
      raw: top,
    };
  }, [logs, posture]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    scoreRef.current = 0;
    postureRef.current = 'NORMAL';
    setAttackScore(0);
    setPosture('NORMAL');
  }, []);

  const value = useMemo<ScadaContextValue>(
    () => ({
      data,
      prevData,
      components,
      source,
      logs,
      threat,
      posture,
      attackScore,
      isConnected,
      mqttConnected,
      clearLogs,
    }),
    [data, prevData, components, source, logs, threat, posture, attackScore, isConnected, mqttConnected, clearLogs],
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
