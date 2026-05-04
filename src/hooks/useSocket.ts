import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SystemState } from '@/lib/api';

/**
 * Thin Socket.IO transport hook.
 *
 * IMPORTANT: This hook deliberately does NOT run the attack engine or
 * the threat detector. The full pipeline now lives inside ScadaContext:
 *
 *   raw (MQTT or sim) → systemModel → attackEngine → detection → UI
 *
 * Here we only surface raw connection state and the latest backend
 * `SystemState` snapshot.
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [rawState, setRawState] = useState<SystemState | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('state_update', (state: SystemState) => {
      setRawState(state);
      setLastUpdateAt(Date.now());
    });

    socket.on('mqtt_status', (status: { connected: boolean }) => {
      setMqttConnected(Boolean(status?.connected));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return {
    isConnected,
    mqttConnected,
    rawState,
    lastUpdateAt,
  };
}
