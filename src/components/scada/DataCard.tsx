import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface DataCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'stable';
  status?: 'normal' | 'warning' | 'critical' | 'info';
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}

export function DataCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  status = 'normal',
  subtitle,
  className,
  children,
}: DataCardProps) {
  const statusColors = {
    normal: 'border-scada-normal/30 bg-scada-normal/5',
    warning: 'border-scada-warning/30 bg-scada-warning/5',
    critical: 'border-scada-critical/30 bg-scada-critical/5',
    info: 'border-scada-info/30 bg-scada-info/5',
  };

  const textColors = {
    normal: 'text-scada-normal',
    warning: 'text-scada-warning',
    critical: 'text-scada-critical',
    info: 'text-scada-info',
  };

  const glowClasses = {
    normal: 'glow-normal',
    warning: 'glow-warning',
    critical: 'glow-critical',
    info: '',
  };

  return (
    <div
      className={cn(
        'relative rounded border p-4 transition-all',
        statusColors[status],
        status !== 'info' && glowClasses[status],
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <Icon className={cn('h-4 w-4', textColors[status])} />
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1">
        <span className={cn('text-3xl font-mono font-bold', textColors[status])}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        {unit && (
          <span className="text-sm font-mono text-muted-foreground">{unit}</span>
        )}
        {trend && (
          <span className={cn(
            'ml-2 text-xs',
            trend === 'up' && 'text-scada-normal',
            trend === 'down' && 'text-scada-critical',
            trend === 'stable' && 'text-muted-foreground'
          )}>
            {trend === 'up' && '▲'}
            {trend === 'down' && '▼'}
            {trend === 'stable' && '—'}
          </span>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground font-mono">{subtitle}</p>
      )}

      {/* Children (for additional content) */}
      {children && <div className="mt-3">{children}</div>}

      {/* Decorative corner */}
      <div className={cn(
        'absolute top-0 right-0 w-8 h-8 border-t border-r rounded-tr opacity-50',
        `border-${status === 'info' ? 'border' : `scada-${status}`}`
      )} />
    </div>
  );
}
