import { useEffect, useState } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import type { ComponentStatus } from '@/lib/systemModel';

/**
 * Smart-grid mimic diagram.
 *
 *   Power Plant → HV line → Grid Feeder → Distribution line → Smart Meter
 *                                                     ↓ bus ↓
 *                                       CB-A1                CB-A2
 *                                         ↓                    ↓
 *                                     Industrial          Residential
 *
 * Pure presentation. Reads everything from useScada().
 */

function fmt(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A';
  return v.toFixed(d);
}

function sc(s: ComponentStatus) {
  if (s === 'CRITICAL') return '#E24B4A';
  if (s === 'WARNING') return '#EF9F27';
  if (s === 'OFFLINE') return '#888780';
  return '#1D9E75';
}
function sd(s: ComponentStatus) {
  if (s === 'CRITICAL') return '#A32D2D';
  if (s === 'WARNING') return '#854F0B';
  if (s === 'OFFLINE') return '#5F5E5A';
  return '#0F6E56';
}
function postureColor(p: string) {
  if (p === 'CRITICAL') return '#E24B4A';
  if (p === 'WARNING') return '#EF9F27';
  return '#1D9E75';
}

function useSparkline(value: number | null | undefined, size = 28): number[] {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (value != null && Number.isFinite(value)) {
      setHistory((prev) => [...prev.slice(-(size - 1)), value]);
    }
  }, [value, size]);
  return history;
}

function Pill({ x, y, status }: { x: number; y: number; status: ComponentStatus }) {
  const s = sc(status);
  return (
    <g>
      <rect x={x} y={y} width={70} height={16} rx={3} fill="#0E1417" stroke={s} />
      <circle cx={x + 9} cy={y + 8} r={3.5} fill={s}>
        {status !== 'OFFLINE' && (
          <animate attributeName="opacity" values="1;0.35;1" dur="1.4s" repeatCount="indefinite" />
        )}
      </circle>
      <text x={x + 18} y={y + 12} fill={s} fontSize={9} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
        {status}
      </text>
    </g>
  );
}

function FlowDot({ pathId, dur, begin = '0s', color }: { pathId: string; dur: string; begin?: string; color: string }) {
  return (
    <circle r={3.2} fill={color} opacity={0.95}>
      <animateMotion dur={dur} begin={begin} repeatCount="indefinite">
        <mpath href={`#${pathId}`} />
      </animateMotion>
    </circle>
  );
}

function CB({ x, y, closed, label, color }: { x: number; y: number; closed: boolean; label: string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={7} fill="#0E1417" stroke={color} strokeWidth={1.5} />
      {closed ? (
        <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={color} strokeWidth={2} />
      ) : (
        <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={color} strokeWidth={2} />
      )}
      <text x={x + 11} y={y + 3} fill="#B8B8B0" fontSize={8} fontFamily="JetBrains Mono, monospace">
        {label}
      </text>
    </g>
  );
}

export function ScadaDiagram() {
  const { components, source, isConnected, mqttConnected, posture, attackScore, data } = useScada();
  const { plant, feeder, meter } = components;

  const ps = plant.status;
  const fs = feeder.status;
  const ms = meter.status;
  const a1On = meter.area1 === 'ON';
  const a2On = meter.area2 === 'ON';
  const a1s: ComponentStatus = a1On && ms !== 'OFFLINE' ? ms : 'OFFLINE';
  const a2s: ComponentStatus = a2On && ms !== 'OFFLINE' ? ms : 'OFFLINE';

  const pc = postureColor(posture);
  const voltHist = useSparkline(plant.voltage);

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          ⚡ Smart grid — plant → feeder → meter → areas
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase">
          <span className="text-muted-foreground">
            Source: <span className="text-foreground">{source}</span>
          </span>
          <span className={isConnected ? 'text-scada-normal' : 'text-scada-offline'}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${isConnected ? 'bg-scada-normal' : 'bg-scada-offline'}`} />
            {isConnected ? 'Live' : 'Offline'}
          </span>
          <span className={mqttConnected ? 'text-scada-info' : 'text-scada-offline'}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 align-middle ${mqttConnected ? 'bg-scada-info' : 'bg-scada-offline'}`} />
            MQTT
          </span>
          <span style={{ color: pc }}>{posture}</span>
        </div>
      </div>

      <svg viewBox="0 0 980 460" className="w-full h-auto" style={{ background: '#0A0F12' }}>
        <defs>
          <filter id="g-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={3} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="grid-bg" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#152025" strokeWidth="0.5" />
          </pattern>
          {/* paths */}
          <path id="p-hv" d="M 200 110 L 350 110" />
          <path id="p-dist" d="M 540 110 L 690 110" />
          <path id="p-bus-a1" d="M 800 200 L 800 280 L 730 280" />
          <path id="p-bus-a2" d="M 800 200 L 800 280 L 870 280" />
        </defs>

        <rect x={0} y={0} width={980} height={460} fill="url(#grid-bg)" />

        {/* ── POWER PLANT ── */}
        <g>
          <rect x={40} y={50} width={160} height={140} rx={6} fill="#0E1417" stroke={sc(ps)} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={120} y={70} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            POWER PLANT
          </text>
          {/* turbine icon */}
          <circle cx={120} cy={115} r={22} fill="none" stroke={sc(ps)} strokeWidth={1.5} />
          <circle cx={120} cy={115} r={4} fill={sc(ps)} />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line
              key={a}
              x1={120}
              y1={115}
              x2={120 + Math.cos((a * Math.PI) / 180) * 20}
              y2={115 + Math.sin((a * Math.PI) / 180) * 20}
              stroke={sc(ps)}
              strokeWidth={1.5}
            >
              {ps !== 'OFFLINE' && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 120 115`}
                  to={`360 120 115`}
                  dur="3s"
                  repeatCount="indefinite"
                />
              )}
            </line>
          ))}
          <Pill x={45} y={55} status={ps} />
          <text x={120} y={155} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            {fmt(plant.generation, 1)} MW · {fmt(plant.rpm, 0)} RPM
          </text>
          <text x={120} y={172} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            {fmt(plant.voltage, 1)} V · {fmt(plant.frequency, 2)} Hz
          </text>
        </g>

        {/* ── HV LINE ── */}
        <use href="#p-hv" stroke={sc(fs)} strokeWidth={2.5} fill="none" strokeDasharray="6 4" opacity={0.85} />
        <text x={275} y={102} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
          HV line
        </text>
        {ps !== 'OFFLINE' && <FlowDot pathId="p-hv" dur="2.2s" color={sc(fs)} />}
        {ps !== 'OFFLINE' && <FlowDot pathId="p-hv" dur="2.2s" begin="0.7s" color={sc(fs)} />}

        {/* ── GRID FEEDER ── */}
        <g>
          <rect x={350} y={50} width={190} height={140} rx={6} fill="#0E1417" stroke={sc(fs)} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={445} y={70} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            GRID FEEDER
          </text>
          <text x={445} y={84} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Distribution centre
          </text>
          {/* feeder bars */}
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={385 + i * 30} y={100} width={18} height={40} rx={2} fill={sd(fs)} stroke={sc(fs)} />
          ))}
          <Pill x={355} y={55} status={fs} />
          <text x={445} y={158} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            {fmt(feeder.voltage, 1)} V · CB1
          </text>
          <text x={445} y={174} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            {fmt(feeder.feederLoad, 1)} MW · {fmt(feeder.frequency, 2)} Hz
          </text>
        </g>

        {/* ── DIST LINE ── */}
        <use href="#p-dist" stroke={sc(ms)} strokeWidth={2.5} fill="none" strokeDasharray="6 4" opacity={0.85} />
        <text x={615} y={102} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
          dist. line
        </text>
        {fs !== 'OFFLINE' && <FlowDot pathId="p-dist" dur="2s" color={sc(ms)} />}
        {fs !== 'OFFLINE' && <FlowDot pathId="p-dist" dur="2s" begin="0.6s" color={sc(ms)} />}

        {/* ── SMART METER ── */}
        <g>
          <rect x={690} y={50} width={220} height={140} rx={6} fill="#0E1417" stroke={sc(ms)} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={800} y={70} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            SMART METER
          </text>
          {/* LCD display */}
          <rect x={720} y={88} width={160} height={42} rx={3} fill="#06120A" stroke={sc(ms)} />
          <text x={800} y={115} textAnchor="middle" fill={sc(ms)} fontSize={18} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {fmt(meter.load, 1)} MW
          </text>
          <text x={870} y={126} textAnchor="end" fill={sc(ms)} fontSize={8} fontFamily="JetBrains Mono, monospace">
            kWh
          </text>
          <Pill x={695} y={55} status={ms} />
          <text x={800} y={150} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            η {meter.efficiency == null ? 'N/A' : `${(meter.efficiency * 100).toFixed(0)}%`} · {fmt(meter.voltage, 1)} V
          </text>
          <text x={800} y={172} textAnchor="middle" fill="#B8B8B0" fontSize={10} fontFamily="JetBrains Mono, monospace">
            ${fmt(meter.calculatedBill, 2)} · $0.25/unit
          </text>
        </g>

        {/* ── DISTRIBUTION BUS to areas ── */}
        <line x1={800} y1={190} x2={800} y2={280} stroke={sc(ms)} strokeWidth={2} />
        <line x1={730} y1={280} x2={870} y2={280} stroke={sc(ms)} strokeWidth={2} />
        <text x={800} y={205} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
          distribution bus
        </text>

        {/* CBs */}
        <CB x={760} y={280} closed={a1On} label="CB-A1" color={sc(a1s)} />
        <CB x={840} y={280} closed={a2On} label="CB-A2" color={sc(a2s)} />

        {/* flow to areas */}
        {a1On && ms !== 'OFFLINE' && <FlowDot pathId="p-bus-a1" dur="1.8s" color={sc(a1s)} />}
        {a2On && ms !== 'OFFLINE' && <FlowDot pathId="p-bus-a2" dur="1.8s" color={sc(a2s)} />}

        {/* ── AREA 1 — INDUSTRIAL ── */}
        <g>
          <rect x={580} y={310} width={200} height={120} rx={6} fill="#0E1417" stroke={sc(a1s)} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={680} y={328} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            AREA 1
          </text>
          <text x={680} y={342} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Industrial zone
          </text>
          <rect x={585} y={314} width={36} height={14} rx={3} fill={a1On ? '#0F6E56' : '#5F5E5A'} stroke={sc(a1s)} />
          <text x={603} y={324} textAnchor="middle" fill="#0A0F12" fontSize={8} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {meter.area1}
          </text>
          {/* factory icon */}
          <rect x={620} y={372} width={22} height={28} fill="none" stroke={sc(a1s)} />
          <rect x={642} y={365} width={22} height={35} fill="none" stroke={sc(a1s)} />
          <rect x={664} y={378} width={22} height={22} fill="none" stroke={sc(a1s)} />
          <line x1={628} y1={372} x2={628} y2={355} stroke={sc(a1s)} />
          <line x1={650} y1={365} x2={650} y2={345} stroke={sc(a1s)} />
          <text x={680} y={418} textAnchor="middle" fill={sc(a1s)} fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {fmt(meter.area1Load, 2)} MW
          </text>
        </g>

        {/* ── AREA 2 — RESIDENTIAL ── */}
        <g>
          <rect x={820} y={310} width={140} height={120} rx={6} fill="#0E1417" stroke={sc(a2s)} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={890} y={328} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            AREA 2
          </text>
          <text x={890} y={342} textAnchor="middle" fill="#888780" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Residential zone
          </text>
          <rect x={825} y={314} width={36} height={14} rx={3} fill={a2On ? '#0F6E56' : '#5F5E5A'} stroke={sc(a2s)} />
          <text x={843} y={324} textAnchor="middle" fill="#0A0F12" fontSize={8} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {meter.area2}
          </text>
          {/* house icon */}
          <polygon points="870,370 890,355 910,370" fill="none" stroke={sc(a2s)} />
          <rect x={870} y={370} width={40} height={28} fill="none" stroke={sc(a2s)} />
          {[0, 1, 2].flatMap((c) =>
            [0, 1].map((r) => (
              <rect
                key={`${c}-${r}`}
                x={874 + c * 11}
                y={374 + r * 11}
                width={7}
                height={7}
                fill={a2On ? sc(a2s) : 'none'}
                stroke={sc(a2s)}
              />
            ))
          )}
          <text x={890} y={418} textAnchor="middle" fill={sc(a2s)} fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            {fmt(meter.area2Load, 2)} MW
          </text>
        </g>

        {/* ── TELEMETRY WIRE (meter → SCADA) ── */}
        <path
          id="p-tel"
          d="M 690 130 Q 500 250 320 320"
          fill="none"
          stroke="#3B7E9C"
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={0.7}
        />
        <text x={500} y={245} fill="#5DA0BC" fontSize={9} fontFamily="JetBrains Mono, monospace">
          telemetry · MQTT
        </text>

        {/* ── SCADA CONTROL CENTRE ── */}
        <g>
          <rect x={30} y={310} width={290} height={130} rx={6} fill="#0E1417" stroke={pc} strokeWidth={1.5} filter="url(#g-glow)" />
          <text x={175} y={328} textAnchor="middle" fill="#E5E5DA" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
            SCADA CONTROL CENTRE
          </text>
          {/* sparkline */}
          <rect x={38} y={345} width={130} height={50} rx={3} fill="#06120A" stroke="#1F2A30" />
          <text x={42} y={357} fill="#888780" fontSize={8} fontFamily="JetBrains Mono, monospace">
            V trend
          </text>
          {voltHist.length > 1 &&
            (() => {
              const min = Math.min(...voltHist);
              const max = Math.max(...voltHist) || min + 1;
              const pts = voltHist
                .map((v, i) => {
                  const x = 42 + (i / (voltHist.length - 1)) * 122;
                  const y = 390 - ((v - min) / (max - min || 1)) * 30;
                  return `${x},${y}`;
                })
                .join(' ');
              return <polyline points={pts} fill="none" stroke={sc(ps)} strokeWidth={1.5} />;
            })()}
          {/* load bars */}
          <text x={180} y={357} fill="#888780" fontSize={8} fontFamily="JetBrains Mono, monospace">
            Load MW
          </text>
          {[12, 18, 14, 22, 16, 10].map((h, i) => (
            <rect key={i} x={180 + i * 18} y={395 - h} width={12} height={h} fill={pc} opacity={0.8} />
          ))}
          {/* status block */}
          <line x1={38} y1={405} x2={310} y2={405} stroke="#1F2A30" />
          <text x={42} y={420} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            SEC: <tspan fill={pc}>{posture}</tspan>
          </text>
          <text x={130} y={420} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            ATK: {attackScore.toFixed(2)}/20
          </text>
          <text x={42} y={433} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Bill: ${fmt(meter.calculatedBill, 2)}
          </text>
          <text x={150} y={433} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
            Broker: hivemq.com
          </text>
        </g>

        {/* ── BOTTOM STATUS BAR ── */}
        <rect x={0} y={444} width={980} height={16} fill="#06120A" />
        <text x={10} y={456} fill="#B8B8B0" fontSize={9} fontFamily="JetBrains Mono, monospace">
          {`Load: ${fmt(data?.load_mw, 1)} MW  ·  Gen: ${fmt(data?.gen_mw, 1)} MW  ·  ${fmt(data?.voltage, 1)} V  ·  ${fmt(data?.frequency, 2)} Hz  ·  ${data?.status ?? 'OFFLINE'}`}
        </text>
      </svg>
    </div>
  );
}
