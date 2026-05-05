import type { GridSample } from '@/lib/attackEngine';

/**
 * Fallback SCADA telemetry generator.
 *
 * Used by ScadaContext ONLY when MQTT / backend telemetry is unavailable,
 * so the digital-twin keeps producing realistic raw readings for the
 * Power Plant.
 *
 *   voltage    : 220 – 240 V
 *   frequency  : 49.5 – 50.5 Hz
 *   generation : 2800 – 3200 MW
 */

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateSCADAData(): GridSample {
  const voltage = Number(rand(220, 240).toFixed(1));
  const frequency = Number(rand(49.5, 50.5).toFixed(2));
  const generation = Number(rand(2800, 3200).toFixed(1));

  return {
    voltage,
    frequency,
    generation,
    gen_mw: generation,
    gen_rpm: Math.round(rand(2950, 3050)),
    timestamp: Date.now(),
  };
}
