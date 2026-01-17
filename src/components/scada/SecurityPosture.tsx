import { cn } from '@/lib/utils';
import { Shield, ShieldAlert, ShieldOff } from 'lucide-react';

interface SecurityPostureProps {
  level: 'NORMAL' | 'WARNING' | 'CRITICAL' | string;
  attackScore: number;
  className?: string;
}

export function SecurityPosture({ level, attackScore, className }: SecurityPostureProps) {
  const getConfig = () => {
    switch (level) {
      case 'CRITICAL':
        return {
          icon: ShieldOff,
          color: 'text-scada-critical',
          bg: 'bg-scada-critical/10',
          border: 'border-scada-critical/50',
          glow: 'glow-critical',
          pulse: true,
        };
      case 'WARNING':
        return {
          icon: ShieldAlert,
          color: 'text-scada-warning',
          bg: 'bg-scada-warning/10',
          border: 'border-scada-warning/50',
          glow: 'glow-warning',
          pulse: false,
        };
      default:
        return {
          icon: Shield,
          color: 'text-scada-normal',
          bg: 'bg-scada-normal/10',
          border: 'border-scada-normal/50',
          glow: 'glow-normal',
          pulse: false,
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  // Attack score gauge (0-20 scale)
  const scorePercentage = Math.min((attackScore / 20) * 100, 100);

  return (
    <div
      className={cn(
        'relative rounded-lg border p-6 transition-all',
        config.bg,
        config.border,
        config.glow,
        className
      )}
    >
      {/* Main display */}
      <div className="flex items-center gap-6">
        <div className={cn('p-4 rounded-full', config.bg, config.pulse && 'animate-pulse-glow')}>
          <Icon className={cn('h-12 w-12', config.color)} />
        </div>

        <div className="flex-1">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
            Security Posture
          </div>
          <div className={cn('text-3xl font-mono font-bold uppercase', config.color)}>
            {level}
          </div>
        </div>
      </div>

      {/* Attack Score Meter */}
      <div className="mt-6">
        <div className="flex justify-between text-xs font-mono text-muted-foreground mb-2">
          <span>Attack Score</span>
          <span className={config.color}>{attackScore.toFixed(2)} / 20</span>
        </div>
        
        <div className="relative h-3 bg-secondary rounded overflow-hidden">
          {/* Gradient background showing zones */}
          <div className="absolute inset-0 flex">
            <div className="flex-[5] bg-scada-normal/20" />
            <div className="flex-[10] bg-scada-warning/20" />
            <div className="flex-[5] bg-scada-critical/20" />
          </div>
          
          {/* Score indicator */}
          <div
            className={cn(
              'absolute left-0 top-0 h-full transition-all duration-500',
              attackScore >= 15 ? 'bg-scada-critical' : attackScore >= 5 ? 'bg-scada-warning' : 'bg-scada-normal'
            )}
            style={{ 
              width: `${scorePercentage}%`,
              boxShadow: '0 0 10px currentColor',
            }}
          />

          {/* Threshold markers */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-scada-warning" style={{ left: '25%' }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-scada-critical" style={{ left: '75%' }} />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
          <span>0</span>
          <span className="text-scada-warning">5</span>
          <span className="text-scada-critical">15</span>
          <span>20</span>
        </div>
      </div>

      {/* Zone labels */}
      <div className="flex justify-around mt-4 text-xs font-mono">
        <span className="text-scada-normal">NORMAL</span>
        <span className="text-scada-warning">WARNING</span>
        <span className="text-scada-critical">CRITICAL</span>
      </div>
    </div>
  );
}
