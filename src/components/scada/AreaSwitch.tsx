import { cn } from '@/lib/utils';
import { Power, Loader2 } from 'lucide-react';

interface AreaSwitchProps {
  name: string;
  state: 'ON' | 'OFF' | string;
  className?: string;
  onToggle?: () => void;
  loading?: boolean;
}

export function AreaSwitch({ name, state, className, onToggle, loading }: AreaSwitchProps) {
  const isOn = state === 'ON';

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className={cn(
        'relative flex items-center justify-between p-3 rounded border transition-all w-full text-left',
        isOn
          ? 'border-scada-normal/50 bg-scada-normal/10 glow-normal'
          : 'border-scada-offline/30 bg-secondary/50',
        onToggle && 'cursor-pointer hover:brightness-110 active:scale-[0.98]',
        loading && 'opacity-60',
        className
      )}
    >
      {/* Area name */}
      <div className="flex items-center gap-3">
        {loading ? (
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        ) : (
          <Power
            className={cn(
              'h-5 w-5 transition-colors',
              isOn ? 'text-scada-normal' : 'text-scada-offline'
            )}
          />
        )}
        <div>
          <span className="text-sm font-mono font-medium">{name}</span>
          <div className="text-xs text-muted-foreground">Distribution Zone</div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-12 h-6 rounded-full relative transition-colors',
            isOn ? 'bg-scada-normal/30' : 'bg-secondary'
          )}
        >
          <div
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full transition-all duration-300',
              isOn
                ? 'left-7 bg-scada-normal shadow-[0_0_8px_hsl(var(--scada-normal))]'
                : 'left-1 bg-scada-offline'
            )}
          />
        </div>
        <span
          className={cn(
            'text-sm font-mono font-bold uppercase',
            isOn ? 'text-scada-normal' : 'text-scada-offline'
          )}
        >
          {state}
        </span>
      </div>
    </button>
  );
}
