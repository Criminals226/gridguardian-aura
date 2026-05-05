import type { GridSample } from '@/lib/attackEngine';

/**
 * Deterministic SCADA simulator — used ONLY when MQTT is unavailable.
 *
 * No Math.random(): values are derived from wall-clock time so the
 * fallback stream is stable, reproducible, and free of synthetic noise.
 *
 *   gen_mw     : 2800 – 3200 MW   (slow sinusoid, daily-curve flavour)
 *   load_mw    : 2700 – 3100 MW   (tracks gen with small lag)
 *   voltage    : 220 – 240 V       (drops as load rises)
 *   frequency  : 49.5 – 50.5 Hz    (small drift around 50)
 *   area1/area2: 'ON'              (default; real values come from MQTT)
 *   calculated_bill: derived from load × price_rate
 *   price_rate : 0.25
 */

const NOMINAL_V = 230;
const NOMINAL_F = 50;
const PRICE_RATE = 0.25;

export function generateSCADAData(): GridSample {
  const t = Date.now() / 1000;

  // Slow daily-ish curve (period ~10min for visible movement)
  const phase = (t % 600) / 600; // 0..1
  const wave = Math.sin(phase * Math.PI * 2);

  const generation = Number((3000 + wave * 200).toFixed(1));        // 2800..3200
  const load = Number((2900 + wave * 200 - 50).toFixed(1));         // tracks gen
  // Voltage drops with load: at high load voltage sags
  const voltage = Number((NOMINAL_V - (load - 2900) * 0.025).toFixed(1));
  // Frequency wanders gently
  const frequency = Number((NOMINAL_F + wave * 0.3).toFixed(2));
  const calculated_bill = Number((load * PRICE_RATE * 0.001).toFixed(2));

  return {
    voltage,
    frequency,
    generation,
    gen_mw: generation,
    load_mw: load,
    load,
    gen_rpm: 3000,
    area1: 'ON',
    area2: 'ON',
    calculated_bill,
    price_rate: PRICE_RATE,
    timestamp: Date.now(),
  } as GridSample;
}
