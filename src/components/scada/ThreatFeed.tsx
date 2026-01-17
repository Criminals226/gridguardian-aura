import { cn } from '@/lib/utils';
import { AlertTriangle, ShieldX, Info } from 'lucide-react';
import { ThreatLog } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface ThreatFeedProps {
  threats: ThreatLog[];
  maxItems?: number;
  className?: string;
}

export function ThreatFeed({ threats, maxItems = 10, className }: ThreatFeedProps) {
  const displayThreats = threats.slice(0, maxItems);

  const getSeverityConfig = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return {
          icon: ShieldX,
          color: 'text-scada-critical',
          bg: 'bg-scada-critical/10',
          badge: 'bg-scada-critical text-white',
        };
      case 'WARNING':
        return {
          icon: AlertTriangle,
          color: 'text-scada-warning',
          bg: 'bg-scada-warning/10',
          badge: 'bg-scada-warning text-black',
        };
      default:
        return {
          icon: Info,
          color: 'text-scada-info',
          bg: 'bg-scada-info/10',
          badge: 'bg-scada-info text-white',
        };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  if (displayThreats.length === 0) {
    return (
      <div className={cn('rounded border border-border p-6', className)}>
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Info className="h-5 w-5" />
          <span className="text-sm font-mono">No threats detected</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded border border-border overflow-hidden', className)}>
      <div className="bg-secondary/50 px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Live Threat Feed
          </span>
          <Badge variant="outline" className="text-xs font-mono">
            {threats.length} events
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-[300px]">
        <div className="divide-y divide-border">
          {displayThreats.map((threat, index) => {
            const config = getSeverityConfig(threat.threat_classification?.severity);
            const Icon = config.icon;

            return (
              <div
                key={threat.id || index}
                className={cn(
                  'p-3 transition-colors hover:bg-secondary/30',
                  config.bg
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', config.color)} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn('text-xs font-mono', config.badge)}>
                        {threat.threat_classification?.severity || 'INFO'}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatTime(threat.timestamp)}
                      </span>
                    </div>
                    
                    <div className="text-sm font-mono text-foreground">
                      {threat.threat_classification?.category || 'Unknown'}: {threat.threat_classification?.subcategory || ''}
                    </div>
                    
                    <div className="text-xs text-muted-foreground font-mono mt-1 truncate">
                      {threat.explanation}
                    </div>
                    
                    <div className="text-xs text-muted-foreground/50 font-mono mt-1">
                      Layer: {threat.layer} | ID: {threat.decision_id}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
