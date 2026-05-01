import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThreatFeed } from '@/components/scada/ThreatFeed';
import { useAttack, type AttackType } from '@/contexts/AttackContext';
import { useScada } from '@/contexts/ScadaContext';
import { cn } from '@/lib/utils';
import { FlaskConical, Play, Square } from 'lucide-react';

type LaunchableAttack = Exclude<AttackType, 'NONE'>;
type Severity = 'CRITICAL' | 'WARNING';

interface AttackDefinition {
  type: LaunchableAttack;
  name: string;
  description: string;
  severity: Severity;
}

const ATTACKS: AttackDefinition[] = [
  { type: 'FDI', name: 'FDI', description: 'Inject false voltage & frequency readings', severity: 'CRITICAL' },
  { type: 'REPLAY', name: 'Replay', description: 'Re-emit captured legitimate traffic — values freeze', severity: 'WARNING' },
  { type: 'DOS', name: 'DoS', description: 'Simulate telemetry blackout — system goes offline', severity: 'CRITICAL' },
];

const NOMINAL_VOLTAGE = 230;
const NOMINAL_FREQUENCY = 50;

function severityBadgeClass(sev: Severity): string {
  return sev === 'CRITICAL'
    ? 'bg-scada-critical text-white'
    : 'bg-scada-warning text-black';
}

function statusOf(value: number, nominal: number): 'normal' | 'anomaly' {
  if (!nominal) return 'normal';
  return Math.abs(value - nominal) / nominal <= 0.05 ? 'normal' : 'anomaly';
}

export default function AttackLab() {
  const { type: activeType, active, startedAt, startAttack, stopAttack } = useAttack();
  const { data: lastState, logs } = useScada();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || !startedAt) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, startedAt]);

  const state = (lastState ?? {}) as Record<string, unknown>;
  const voltage = typeof state.voltage === 'number' ? state.voltage : 0;
  const frequency = typeof state.frequency === 'number' ? state.frequency : 0;
  const load =
    typeof state.load_mw === 'number'
      ? state.load_mw
      : typeof state.load === 'number'
        ? state.load
        : 0;
  const generation =
    typeof state.gen_mw === 'number'
      ? state.gen_mw
      : typeof state.generation === 'number'
        ? state.generation
        : 0;

  const activeName = ATTACKS.find((a) => a.type === activeType)?.name ?? activeType;

  const rows: Array<{ metric: string; expected: string; current: string; status: 'normal' | 'anomaly' | 'info' }> = [
    {
      metric: 'Voltage',
      expected: `${NOMINAL_VOLTAGE} V`,
      current: `${voltage.toFixed(1)} V`,
      status: statusOf(voltage, NOMINAL_VOLTAGE),
    },
    {
      metric: 'Frequency',
      expected: `${NOMINAL_FREQUENCY} Hz`,
      current: `${frequency.toFixed(2)} Hz`,
      status: statusOf(frequency, NOMINAL_FREQUENCY),
    },
    { metric: 'Load', expected: '—', current: `${Math.round(load)} W`, status: 'info' },
    { metric: 'Generation', expected: '—', current: `${Math.round(generation)} W`, status: 'info' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-scada-critical/10 border border-scada-critical/30">
          <FlaskConical className="h-6 w-6 text-scada-critical" />
        </div>
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Attack Simulation Lab</h1>
          <p className="text-sm font-mono text-muted-foreground">
            Red Team Exercise — Controlled Environment
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Attack control panel */}
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ATTACKS.map((atk) => {
              const isActive = active && activeType === atk.type;
              return (
                <div
                  key={atk.type}
                  className={cn(
                    'rounded border p-4 space-y-3 transition-all',
                    isActive
                      ? 'border-scada-critical animate-pulse-glow bg-scada-critical/5'
                      : 'border-border bg-card'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-bold text-foreground">{atk.name}</span>
                    <Badge className={cn('text-xs font-mono', severityBadgeClass(atk.severity))}>
                      {atk.severity}
                    </Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground min-h-[2.5rem]">
                    {atk.description}
                  </p>
                  <Button
                    size="sm"
                    variant={isActive ? 'outline' : 'destructive'}
                    className="w-full font-mono"
                    onClick={() => (isActive ? stopAttack() : startAttack(atk.type))}
                  >
                    {isActive ? (
                      <>
                        <Square className="h-3 w-3 mr-2" />
                        Stop Attack
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-2" />
                        Launch
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          <div
            className={cn(
              'rounded border px-4 py-3 font-mono text-sm',
              active
                ? 'border-scada-critical/40 bg-scada-critical/10 text-scada-critical'
                : 'border-scada-normal/40 bg-scada-normal/10 text-scada-normal'
            )}
          >
            {active
              ? `ACTIVE: ${activeName} — running for ${elapsed}s`
              : 'No attack running — system nominal'}
          </div>
        </Card>

        {/* Right: Live effects */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-mono font-bold text-foreground">Live Telemetry Impact</h2>
            <p className="text-xs font-mono text-muted-foreground">
              Real-time effect of active attack on grid metrics
            </p>
          </div>

          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm font-mono">
              <thead className="bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Metric</th>
                  <th className="text-left px-3 py-2">Expected</th>
                  <th className="text-left px-3 py-2">Current</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.metric}>
                    <td className="px-3 py-2 text-foreground">{row.metric}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.expected}</td>
                    <td className="px-3 py-2 text-foreground">{row.current}</td>
                    <td
                      className={cn(
                        'px-3 py-2 uppercase text-xs',
                        row.status === 'normal' && 'text-scada-normal',
                        row.status === 'anomaly' && 'text-scada-critical',
                        row.status === 'info' && 'text-muted-foreground'
                      )}
                    >
                      {row.status === 'info' ? '—' : row.status === 'normal' ? 'Normal' : 'Anomaly'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ThreatFeed threats={threats ?? []} maxItems={10} />
        </Card>
      </div>
    </div>
  );
}
