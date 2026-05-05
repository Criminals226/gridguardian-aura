import { cn } from '@/lib/utils';
import { useScada } from '@/contexts/ScadaContext';
import type { ComponentStatus } from '@/lib/systemModel';

/**
 * SCADA system diagram.
 *
 *   Power Plant  →  Smart Feeder  →  Smart Meter
 *
 * Pure presentation: every value comes from `useScada()` (single source
 * of truth). Reacts to attacks automatically:
 *   • FDI    — abnormal voltage / frequency spikes (status → CRITICAL)
 *   • REPLAY — values frozen (status → WARNING via posture)
 *   • DoS    — components show OFFLINE / N/A
 */

function statusColor(status: ComponentStatus): string {
  switch (status) {
    case 'NORMAL': return 'hsl(142 70% 45%)';
    case 'WARNING': return 'hsl(45 90% 50%)';
    case 'CRITICAL': return 'hsl(0 70% 50%)';
    case 'OFFLINE':
    default: return 'hsl(220 10% 40%)';
  }
}

function statusGlow(status: ComponentStatus): string | undefined {
  switch (status) {
    case 'NORMAL': return 'url(#glow-green)';
    case 'WARNING': return 'url(#glow-amber)';
    case 'CRITICAL': return 'url(#glow-red)';
    default: return undefined;
  }
}

function fmt(value: number | null | undefined, digits = 1, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(digits)}${suffix}`;
}

function FlowDots({ pathId, color, active }: { pathId: string; color: string; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <circle key={i} r="3.5" fill={color} opacity="0.95">
          <animateMotion
            dur={`${2 + i * 0.4}s`}
            repeatCount="indefinite"
            begin={`${i * 0.6}s`}
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}

function GlowFilters() {
  return (
    <defs>
      {(['green', 'amber', 'red'] as const).map((c, i) => (
        <filter key={c} id={`glow-${c}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={i === 2 ? 6 : 4} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      ))}
    </defs>
  );
}

function ComponentNode({
  x, y, label, status, lines,
}: {
  x: number; y: number; label: string; status: ComponentStatus; lines: string[];
}) {
  const color = statusColor(status);
  const glow = statusGlow(status);
  return (
    <g>
      <rect
        x={x} y={y} width="200" height="130" rx="8"
        fill="hsl(220 18% 10%)" stroke={color} strokeWidth="2"
        filter={glow}
      />
      {/* status pill */}
      <rect x={x + 10} y={y + 10} width="80" height="20" rx="3"
        fill="hsl(220 20% 8%)" stroke={color} strokeWidth="1" />
      <circle cx={x + 22} cy={y + 20} r="4" fill={color} filter={glow}>
        {status !== 'OFFLINE' && (
          <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
        )}
      </circle>
      <text x={x + 32} y={y + 24} fill={color}
        fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
        {status}
      </text>

      <text x={x + 100} y={y + 56} textAnchor="middle" fill="hsl(180 5% 92%)"
        fontSize="13" fontFamily="JetBrains Mono, monospace" fontWeight="700">
        {label}
      </text>

      {lines.map((l, i) => (
        <text
          key={i}
          x={x + 100}
          y={y + 82 + i * 16}
          textAnchor="middle"
          fill="hsl(180 5% 70%)"
          fontSize="11"
          fontFamily="JetBrains Mono, monospace"
        >
          {l}
        </text>
      ))}
    </g>
  );
}

interface ScadaDiagramProps {
  /** Optional override; defaults to context. */
  isConnected?: boolean;
  mqttConnected?: boolean;
}

export function ScadaDiagram({
  isConnected: isConnectedProp,
  mqttConnected: mqttConnectedProp,
}: ScadaDiagramProps = {}) {
  const {
    components,
    source,
    isConnected: isConnectedCtx,
    mqttConnected: mqttConnectedCtx,
    posture,
  } = useScada();

  const isConnected = isConnectedProp ?? isConnectedCtx;
  const mqttConnected = mqttConnectedProp ?? mqttConnectedCtx;

  const { plant, feeder, meter } = components;
  const offline = source === 'offline';

  // Flow is active only when system is producing power.
  const flowActive = !offline && plant.generation !== null && (plant.generation ?? 0) > 0;

  const plantToFeederColor = statusColor(feeder.status);
  const feederToMeterColor = statusColor(meter.status);

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          ⚡ SCADA Topology — Plant → Feeder → Meter
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Source: <span className="text-foreground">{source}</span>
          </span>
          <span className={cn('text-xs font-mono flex items-center gap-1.5',
            isConnected ? 'text-scada-normal' : 'text-scada-offline')}>
            <span className={cn('w-2 h-2 rounded-full inline-block',
              isConnected ? 'bg-scada-normal' : 'bg-scada-offline')} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span className={cn('text-xs font-mono flex items-center gap-1.5',
            mqttConnected ? 'text-scada-info' : 'text-scada-offline')}>
            <span className={cn('w-2 h-2 rounded-full inline-block',
              mqttConnected ? 'bg-scada-info' : 'bg-scada-offline')} />
            MQTT
          </span>
          <span className={cn('text-xs font-mono uppercase',
            posture === 'CRITICAL' ? 'text-scada-critical'
              : posture === 'WARNING' ? 'text-scada-warning'
              : 'text-scada-normal')}>
            {posture}
          </span>
        </div>
      </div>

      <svg viewBox="0 0 900 280" className="w-full h-auto" style={{ minHeight: 280 }}>
        <GlowFilters />

        {/* Connection paths */}
        <path id="path-plant-feeder" d="M 240 145 L 360 145" fill="none"
          stroke={plantToFeederColor} strokeWidth="2.5" strokeDasharray="6 4" opacity="0.85" />
        <path id="path-feeder-meter" d="M 580 145 L 700 145" fill="none"
          stroke={feederToMeterColor} strokeWidth="2.5" strokeDasharray="6 4" opacity="0.85" />

        <FlowDots pathId="path-plant-feeder" color={plantToFeederColor} active={flowActive} />
        <FlowDots pathId="path-feeder-meter" color={feederToMeterColor} active={flowActive && meter.status !== 'OFFLINE'} />

        {/* Power Plant */}
        <ComponentNode
          x={40} y={80}
          label="POWER PLANT"
          status={plant.status}
          lines={[
            `V: ${fmt(plant.voltage, 1, ' V')}`,
            `f: ${fmt(plant.frequency, 2, ' Hz')}`,
            `Gen: ${fmt(plant.generation, 1, ' MW')}`,
          ]}
        />

        {/* Smart Feeder */}
        <ComponentNode
          x={360} y={80}
          label="SMART FEEDER"
          status={feeder.status}
          lines={[
            `V: ${fmt(feeder.voltage, 1, ' V')}`,
            `Loss: ${fmt(feeder.transmissionLoss, 2, ' V')}`,
            `f: ${fmt(feeder.frequency, 2, ' Hz')}`,
          ]}
        />

        {/* Smart Meter */}
        <ComponentNode
          x={700} y={80}
          label="SMART METER"
          status={meter.status}
          lines={[
            `Load: ${fmt(meter.load, 2, ' MW')}`,
            `η: ${meter.efficiency === null ? 'N/A' : (meter.efficiency * 100).toFixed(1) + '%'}`,
            `V: ${fmt(meter.voltage, 1, ' V')}`,
          ]}
        />

        {/* Path labels */}
        <text x={300} y={135} textAnchor="middle" fill="hsl(180 5% 60%)"
          fontSize="10" fontFamily="JetBrains Mono, monospace">
          Transmission
        </text>
        <text x={640} y={135} textAnchor="middle" fill="hsl(180 5% 60%)"
          fontSize="10" fontFamily="JetBrains Mono, monospace">
          Distribution
        </text>

        {offline && (
          <g>
            <rect x={300} y={220} width={300} height={36} rx={4}
              fill="hsl(0 70% 12%)" stroke="hsl(0 70% 50%)" strokeWidth="1.5" />
            <text x={450} y={244} textAnchor="middle" fill="hsl(0 70% 70%)"
              fontSize="13" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
              ⚠ SYSTEM OFFLINE — TELEMETRY BLACKOUT
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
