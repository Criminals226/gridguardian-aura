import { Card } from '@/components/ui/card';
import { SecurityPosture } from '@/components/scada/SecurityPosture';
import { ThreatFeed } from '@/components/scada/ThreatFeed';
import { useScada } from '@/contexts/ScadaContext';
import { ShieldCheck } from 'lucide-react';

export default function Security() {
  const { posture, attackScore, logs, threat } = useScada();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-scada-normal/10 border border-scada-normal/30">
          <ShieldCheck className="h-6 w-6 text-scada-normal" />
        </div>
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Security Posture</h1>
          <p className="text-sm font-mono text-muted-foreground">
            Live threat detection — driven by global SCADA pipeline
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SecurityPosture level={posture} attackScore={attackScore} />

        <Card className="p-6 space-y-3">
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Active Threat
          </h2>
          {threat ? (
            <div className="space-y-2 font-mono text-sm">
              <div>
                <span className="text-muted-foreground">Type: </span>
                <span className="text-foreground font-bold">{threat.type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Severity: </span>
                <span
                  className={
                    threat.level === 'CRITICAL'
                      ? 'text-scada-critical font-bold'
                      : 'text-scada-warning font-bold'
                  }
                >
                  {threat.level}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Layer: </span>
                <span className="text-foreground">{threat.raw.layer}</span>
              </div>
              <p className="text-xs text-foreground/70 pt-2 border-t border-border">
                {threat.raw.explanation}
              </p>
            </div>
          ) : (
            <p className="text-sm font-mono text-scada-normal">
              ✓ No active threats — system nominal.
            </p>
          )}
        </Card>
      </div>

      <ThreatFeed threats={logs} maxItems={20} />
    </div>
  );
}
