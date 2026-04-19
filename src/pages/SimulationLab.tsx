import { useEffect, useMemo, useState } from 'react';
import { useAttack, type AttackType } from '@/contexts/AttackContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Repeat,
  WifiOff,
  ShieldOff,
  Square,
  FlaskConical,
  Activity,
  Clock,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Attack catalog                                                             */
/* -------------------------------------------------------------------------- */

interface AttackOption {
  type: Exclude<AttackType, 'NONE'>;
  label: string;
  short: string;
  description: string;
  icon: typeof AlertTriangle;
  /** Tailwind text color token used for accents (semantic SCADA palette). */
  accent: string;
  /** Tailwind border + bg tint when this attack is the active one. */
  activeRing: string;
}

const ATTACKS: AttackOption[] = [
  {
    type: 'FDI',
    label: 'False Data Injection',
    short: 'FDI',
    description:
      'Tampers with sensor readings — voltage and frequency are pushed outside safe operating bands to mislead the operator.',
    icon: AlertTriangle,
    accent: 'text-scada-warning',
    activeRing: 'border-scada-warning/60 bg-scada-warning/5 shadow-[0_0_30px_-10px_hsl(var(--scada-warning))]',
  },
  {
    type: 'REPLAY',
    label: 'Replay Attack',
    short: 'REPLAY',
    description:
      'Re-emits previously captured legitimate telemetry to mask real grid behaviour from the SCADA dashboard.',
    icon: Repeat,
    accent: 'text-scada-info',
    activeRing: 'border-scada-info/60 bg-scada-info/5 shadow-[0_0_30px_-10px_hsl(var(--scada-info))]',
  },
  {
    type: 'DOS',
    label: 'Denial of Service',
    short: 'DOS',
    description:
      'Floods the data path so no telemetry reaches the dashboard — simulates total observability loss.',
    icon: WifiOff,
    accent: 'text-scada-critical',
    activeRing: 'border-scada-critical/60 bg-scada-critical/5 shadow-[0_0_30px_-10px_hsl(var(--scada-critical))]',
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function SimulationLab() {
  const { type, active, startedAt, startAttack, stopAttack } = useAttack();

  // Tick once per second so the elapsed timer updates while an attack runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsed = useMemo(() => {
    if (!active || !startedAt) return '00:00';
    return formatElapsed(now - startedAt);
  }, [active, startedAt, now]);

  const activeAttack = ATTACKS.find((a) => a.type === type);

  return (
    <div className="space-y-8">
      {/* Header ---------------------------------------------------------- */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-scada-warning/10 border border-scada-warning/30">
            <FlaskConical className="h-6 w-6 text-scada-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground">
              SIMULATION LAB
            </h1>
            <p className="text-sm font-mono text-muted-foreground">
              Red Team attack simulator — inject controlled threats into the live SCADA pipeline.
            </p>
          </div>
        </div>

        <Badge
          variant="outline"
          className={cn(
            'font-mono tracking-wider self-start',
            active
              ? 'border-scada-critical/50 text-scada-critical bg-scada-critical/10'
              : 'border-scada-normal/40 text-scada-normal bg-scada-normal/5',
          )}
        >
          <span
            className={cn(
              'mr-2 inline-block h-2 w-2 rounded-full',
              active ? 'bg-scada-critical animate-pulse' : 'bg-scada-normal',
            )}
          />
          {active ? 'SIMULATION ACTIVE' : 'STANDBY'}
        </Badge>
      </header>

      {/* Status panel ---------------------------------------------------- */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase text-muted-foreground tracking-widest">
              Status
            </p>
            <div className="flex items-center gap-2">
              <Activity
                className={cn(
                  'h-4 w-4',
                  active ? 'text-scada-critical' : 'text-scada-normal',
                )}
              />
              <span className="text-lg font-mono font-semibold text-foreground">
                {active ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-mono uppercase text-muted-foreground tracking-widest">
              Attack Type
            </p>
            <div className="flex items-center gap-2">
              {activeAttack ? (
                <activeAttack.icon className={cn('h-4 w-4', activeAttack.accent)} />
              ) : (
                <ShieldOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span
                className={cn(
                  'text-lg font-mono font-semibold',
                  activeAttack ? activeAttack.accent : 'text-muted-foreground',
                )}
              >
                {type === 'NONE' ? 'NONE' : activeAttack?.short ?? type}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-mono uppercase text-muted-foreground tracking-widest">
              Elapsed
            </p>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-mono font-semibold text-foreground tabular-nums">
                {elapsed}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Attack grid ----------------------------------------------------- */}
      <section>
        <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-4">
          Attack Vectors
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ATTACKS.map((atk) => {
            const isActive = active && type === atk.type;
            const Icon = atk.icon;
            return (
              <Card
                key={atk.type}
                className={cn(
                  'p-5 flex flex-col gap-4 bg-card/60 backdrop-blur border-border transition-all',
                  isActive && atk.activeRing,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2 rounded-md border',
                        isActive
                          ? 'bg-background/40 border-current'
                          : 'bg-secondary/40 border-border',
                        atk.accent,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={cn('font-mono font-bold', atk.accent)}>{atk.short}</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        {atk.label}
                      </p>
                    </div>
                  </div>
                  {isActive && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] border-current bg-background/40"
                    >
                      RUNNING
                    </Badge>
                  )}
                </div>

                <p className="text-sm font-mono text-muted-foreground leading-relaxed flex-1">
                  {atk.description}
                </p>

                <Button
                  variant={isActive ? 'secondary' : 'outline'}
                  className="w-full font-mono"
                  onClick={() => (isActive ? stopAttack() : startAttack(atk.type))}
                  disabled={active && !isActive}
                >
                  {isActive ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Stop {atk.short}
                    </>
                  ) : (
                    <>
                      <Icon className="h-4 w-4 mr-2" />
                      Launch {atk.short}
                    </>
                  )}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Global stop ----------------------------------------------------- */}
      <Card className="p-6 bg-card/60 backdrop-blur border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm font-mono font-semibold text-foreground">
            Emergency Stop
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            Immediately terminate any running simulation and restore clean telemetry.
          </p>
        </div>
        <Button
          variant="destructive"
          size="lg"
          className="font-mono"
          onClick={stopAttack}
          disabled={!active}
        >
          <Square className="h-4 w-4 mr-2" />
          Stop Attack
        </Button>
      </Card>
    </div>
  );
}
