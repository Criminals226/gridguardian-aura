import { cn } from '@/lib/utils';
import { AlertTriangle, Siren } from 'lucide-react';
import { useScada } from '@/contexts/ScadaContext';

/**
 * Global SCADA threat banner. Mounted once in MainLayout so it shows
 * on every authenticated page. Driven entirely by the shared
 * ScadaContext threat summary — never holds local state.
 */
export function GlobalAlert({ className }: { className?: string }) {
  const { threat } = useScada();
  if (!threat) return null;

  const isCritical = threat.level === 'CRITICAL';
  const Icon = isCritical ? Siren : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-lg border-2 px-4 py-3 font-mono animate-fade-in',
        isCritical
          ? 'border-scada-critical bg-scada-critical/10 text-scada-critical glow-critical animate-pulse-glow'
          : 'border-scada-warning bg-scada-warning/10 text-scada-warning glow-warning',
        className,
      )}
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', isCritical && 'animate-pulse')} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-widest">
          ⚠ ATTACK DETECTED: {threat.type}
        </div>
        {threat.raw.explanation && (
          <div className="text-xs text-foreground/70 truncate mt-0.5">
            {threat.raw.explanation}
          </div>
        )}
      </div>
      <span
        className={cn(
          'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
          isCritical ? 'bg-scada-critical text-white' : 'bg-scada-warning text-black',
        )}
      >
        {threat.level}
      </span>
    </div>
  );
}
