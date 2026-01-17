import { cn } from '@/lib/utils';

interface MeterBarProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  showValue?: boolean;
  className?: string;
}

export function MeterBar({
  value,
  max,
  label,
  unit,
  warningThreshold,
  criticalThreshold,
  showValue = true,
  className,
}: MeterBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const getBarColor = () => {
    if (criticalThreshold && value >= criticalThreshold) return 'bg-scada-critical';
    if (warningThreshold && value >= warningThreshold) return 'bg-scada-warning';
    return 'bg-scada-normal';
  };

  const getGlowClass = () => {
    if (criticalThreshold && value >= criticalThreshold) return 'glow-critical';
    if (warningThreshold && value >= warningThreshold) return 'glow-warning';
    return 'glow-normal';
  };

  const getTextColor = () => {
    if (criticalThreshold && value >= criticalThreshold) return 'text-scada-critical';
    if (warningThreshold && value >= warningThreshold) return 'text-scada-warning';
    return 'text-scada-normal';
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-mono text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {showValue && (
          <span className={cn('text-sm font-mono font-bold', getTextColor())}>
            {value.toFixed(1)} {unit}
          </span>
        )}
      </div>
      
      <div className="relative h-4 bg-secondary rounded overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0 flex">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-background/30 last:border-r-0"
            />
          ))}
        </div>
        
        {/* Fill bar */}
        <div
          className={cn(
            'absolute left-0 top-0 h-full transition-all duration-500 meter-fill',
            getBarColor(),
            getGlowClass()
          )}
          style={{ width: `${percentage}%` }}
        />
        
        {/* Threshold markers */}
        {warningThreshold && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-scada-warning/50"
            style={{ left: `${(warningThreshold / max) * 100}%` }}
          />
        )}
        {criticalThreshold && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-scada-critical/50"
            style={{ left: `${(criticalThreshold / max) * 100}%` }}
          />
        )}
      </div>
      
      {/* Scale labels */}
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>0</span>
        <span>{max / 2}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
