import { cn } from '@/lib/utils';
import { AlertTriangle, ShieldX, Siren } from 'lucide-react';
import type { ThreatLog } from '@/lib/api';

interface ThreatAlertBannerProps {
  threat: ThreatLog | null;
  posture: 'NORMAL' | 'WARNING' | 'CRITICAL' | string;
  className?: string;
}

/**
 * SCADA-style alert banner. Renders only when posture is WARNING/CRITICAL
 * and a threat is present. Uses semantic SCADA tokens + glow utilities.
 */
export function ThreatAlertBanner({ threat, posture, className }: ThreatAlertBannerProps) {
  if (!threat || posture === 'NORMAL') return null;

  const isCritical = posture === 'CRITICAL';

  const config = isCritical
    ? {
        Icon: Siren,
        color: 'text-scada-critical',
        border: 'border-scada-critical',
        bg: 'bg-scada-critical/10',
        glow: 'glow-critical',
        badge: 'bg-scada-critical text-white',
        label: '⚠ CRITICAL THREAT DETECTED',
      }
    : {
        Icon: AlertTriangle,
        color: 'text-scada-warning',
        border: 'border-scada-warning',
        bg: 'bg-scada-warning/10',
        glow: 'glow-warning',
        badge: 'bg-scada-warning text-black',
        label: '⚠ SECURITY WARNING',
      };

  const { Icon } = config;
  const t = threat.threat_classification;

  return (
    <div
      role="alert"
      className={cn(
        'relative rounded-lg border-2 p-4 font-mono animate-fade-in',
        config.border,
        config.bg,
        config.glow,
        isCritical && 'animate-pulse-glow',
        className,
      )}
    >
      {/* Scanline accent strip */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l',
          isCritical ? 'bg-scada-critical' : 'bg-scada-warning',
        )}
      />

      <div className="flex items-start gap-4 pl-2">
        <div
          className={cn(
            'p-3 rounded-full flex-shrink-0',
            config.bg,
            isCritical && 'animate-pulse',
          )}
        >
          <Icon className={cn('h-7 w-7', config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn('text-xs font-bold uppercase tracking-widest', config.color)}>
              {config.label}
            </span>
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', config.badge)}>
              {t?.severity || 'INFO'}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase">
              {threat.layer}
            </span>
          </div>

          <div className={cn('text-lg font-bold uppercase', config.color)}>
            {t?.category?.replace(/_/g, ' ') || 'UNKNOWN THREAT'}
            {t?.subcategory && (
              <span className="text-foreground/80 font-normal normal-case text-sm">
                {' — '}
                {t.subcategory}
              </span>
            )}
          </div>

          {threat.explanation && (
            <p className="text-xs text-foreground/70 mt-1 truncate">
              {threat.explanation}
            </p>
          )}
        </div>

        {/* Live indicator */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-2 rounded-full animate-pulse',
                isCritical ? 'bg-scada-critical' : 'bg-scada-warning',
              )}
            />
            <span className={cn('text-[10px] font-bold uppercase', config.color)}>
              Live
            </span>
          </div>
          <ShieldX className={cn('h-4 w-4', config.color)} />
        </div>
      </div>
    </div>
  );
}
