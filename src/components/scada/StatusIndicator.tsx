import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: 'normal' | 'warning' | 'critical' | 'offline' | 'info';
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusIndicator({
  status,
  label,
  pulse = false,
  size = 'md',
  className,
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const colorClasses = {
    normal: 'bg-scada-normal',
    warning: 'bg-scada-warning',
    critical: 'bg-scada-critical',
    offline: 'bg-scada-offline',
    info: 'bg-scada-info',
  };

  const glowClasses = {
    normal: 'shadow-[0_0_8px_hsl(var(--scada-normal))]',
    warning: 'shadow-[0_0_8px_hsl(var(--scada-warning))]',
    critical: 'shadow-[0_0_8px_hsl(var(--scada-critical))]',
    offline: '',
    info: 'shadow-[0_0_8px_hsl(var(--scada-info))]',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'rounded-full',
          sizeClasses[size],
          colorClasses[status],
          glowClasses[status],
          pulse && status === 'critical' && 'animate-pulse-glow'
        )}
      />
      {label && (
        <span className={cn(
          'text-sm font-mono uppercase tracking-wide',
          status === 'normal' && 'text-scada-normal',
          status === 'warning' && 'text-scada-warning',
          status === 'critical' && 'text-scada-critical',
          status === 'offline' && 'text-scada-offline',
          status === 'info' && 'text-scada-info'
        )}>
          {label}
        </span>
      )}
    </div>
  );
}
