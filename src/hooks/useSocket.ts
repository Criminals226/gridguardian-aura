import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SystemState, ThreatLog } from '@/lib/api';

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

  useEffect(() => {
    // Connect to Socket.IO server
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
      setLastState(state);
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
      
      setThreats((prev) => [threatLog, ...prev].slice(0, 100)); // Keep last 100 threats
    });

    socket.on('mqtt_status', (status) => {
      setMqttConnected(status.connected);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const clearThreats = useCallback(() => {
    setThreats([]);
  }, []);

  return {
    isConnected,
    lastState,
    threats,
    mqttConnected,
    clearThreats,
  };
}
