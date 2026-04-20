import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SystemState, ThreatLog } from '@/lib/api';
import { useAttack } from '@/contexts/AttackContext';
import { applyAttack, resetAttackEngine, type GridSample } from '@/lib/attackEngine';
import {
  detectThreat,
  postureFromScore,
  decayScore,
  buildThreatLog,
  type SecurityPostureLevel,
} from '@/lib/threatDetection';

interface SocketEvents {
  state_update: (state: SystemState) => void;
  threat_detected: (threat: {
    id: number;
    layer: string;
    threat: {
      category: string;
      subcategory: string;
      severity: string;
    };
    explanation: string;
    timestamp: string;
  }) => void;
  mqtt_status: (status: { connected: boolean }) => void;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastState, setLastState] = useState<SystemState | null>(null);
  const [threats, setThreats] = useState<ThreatLog[]>([]);
  const [mqttConnected, setMqttConnected] = useState(false);

  // Local detection state (client-side anomaly detector).
  const [attackScore, setAttackScore] = useState(0);
  const [posture, setPosture] = useState<SecurityPostureLevel>('NORMAL');
  const scoreRef = useRef(0);

  // Pull current attack state from the global AttackContext.
  const { type: attackType, active: attackActive } = useAttack();
  const attackRef = useRef(attackType);
  useEffect(() => {
    attackRef.current = attackActive ? attackType : 'NONE';
  }, [attackType, attackActive]);

  // Helper: register a detection result into score / posture / threat log.
  const ingestDetection = useCallback((sample: GridSample | null) => {
    const result = detectThreat(sample);
    if (result.detected) {
      const next = Math.min(20, scoreRef.current + result.score);
      scoreRef.current = next;
      setAttackScore(Number(next.toFixed(2)));
      setPosture(postureFromScore(next));
      setThreats((prev) => [buildThreatLog(result), ...prev].slice(0, 100));
    } else {
      const next = decayScore(scoreRef.current);
      if (next !== scoreRef.current) {
        scoreRef.current = next;
        setAttackScore(next);
        setPosture(postureFromScore(next));
      }
    }
  }, []);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Socket.IO connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket.IO disconnected');
      setIsConnected(false);
    });

    socket.on('state_update', (state: SystemState) => {
      // 1. Raw SCADA data → 2. Red Team transform → 3. Detection pipeline.
      const tampered = applyAttack(state as unknown as GridSample, attackRef.current);

      // 3a. DoS → blackout. Run detector with null so it logs the event.
      if (tampered === null) {
        ingestDetection(null);
        return;
      }

      // 3b. Run detector on the (possibly tampered) sample.
      ingestDetection(tampered);

      // 4. Commit sample to UI state.
      setLastState(tampered as unknown as SystemState);
    });

    socket.on('threat_detected', (threat) => {
      const threatLog: ThreatLog = {
        id: threat.id,
        timestamp: threat.timestamp,
        decision_id: `DEC-${threat.id}`,
        action: 'BLOCK',
        layer: threat.layer,
        threat_classification: threat.threat,
        explanation: threat.explanation,
        metadata: {},
      };

      setThreats((prev) => [threatLog, ...prev].slice(0, 100));
    });

    socket.on('mqtt_status', (status) => {
      setMqttConnected(status.connected);
    });

    return () => {
      socket.disconnect();
      resetAttackEngine();
    };
  }, [ingestDetection]);

  const clearThreats = useCallback(() => {
    setThreats([]);
    scoreRef.current = 0;
    setAttackScore(0);
    setPosture('NORMAL');
  }, []);

  return {
    isConnected,
    lastState,
    threats,
    mqttConnected,
    clearThreats,
    attackScore,
    posture,
  };
}
