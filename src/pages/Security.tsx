import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSocketContext } from '@/contexts/SocketContext';
import { SecurityPosture } from '@/components/scada/SecurityPosture';
import { ThreatFeed } from '@/components/scada/ThreatFeed';
import { ThreatAlertBanner } from '@/components/scada/ThreatAlertBanner';
import { DataCard } from '@/components/scada/DataCard';
import { StatusIndicator } from '@/components/scada/StatusIndicator';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Eye, 
  Ban, 
  Database,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Security() {
  const { threats, clearThreats, attackScore: liveScore, posture: livePosture } = useSocketContext();

  const { data: securityStatus, refetch } = useQuery({
    queryKey: ['securityStatus'],
    queryFn: api.getSecurityStatus,
    refetchInterval: 5000,
    retry: false,
  });

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 10000,
    retry: false,
  });

  const { data: threatLogs = [] } = useQuery({
    queryKey: ['threatLogs'],
    queryFn: () => api.getThreatLogs(100),
    refetchInterval: 10000,
    retry: false,
  });

  // Live client-detected values take precedence; fall back to backend.
  const effectivePosture = liveScore > 0 ? livePosture : (securityStatus?.security_posture || 'NORMAL');
  const effectiveScore = liveScore > 0 ? liveScore : (securityStatus?.attack_score || 0);

  // Merge live socket/detector threats with API logs:
  //  - dedupe by decision_id (or id+timestamp fallback)
  //  - sort newest-first by timestamp
  //  - cap at 100 entries
  const allThreats = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...threats, ...threatLogs].filter((t) => {
      const key = t.decision_id || `${t.id}-${t.timestamp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    merged.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return merged.slice(0, 100);
  }, [threats, threatLogs]);

  const formatLastRefresh = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            Security Command Center
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Real-time threat monitoring and analysis
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="font-mono"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Active threat alert banner (renders only on WARNING/CRITICAL) */}
      <ThreatAlertBanner threat={allThreats[0] ?? null} posture={effectivePosture} />

      {/* Main security posture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SecurityPosture
            level={effectivePosture}
            attackScore={effectiveScore}
          />
        </div>

        {/* Quick stats */}
        <div className="space-y-4">
          <DataCard
            title="Messages Inspected"
            value={securityStatus?.stats?.total_inspected ?? 0}
            icon={Eye}
            status="info"
          />
          <DataCard
            title="Threats Blocked"
            value={securityStatus?.stats?.total_blocked ?? 0}
            icon={Ban}
            status={securityStatus?.stats?.total_blocked ? 'warning' : 'normal'}
          />
        </div>
      </div>

      {/* Statistics row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DataCard
          title="Total Threats"
          value={stats?.total_threats ?? 0}
          icon={ShieldAlert}
          status={(stats?.total_threats ?? 0) > 0 ? 'warning' : 'normal'}
        />
        <DataCard
          title="Critical Threats"
          value={stats?.critical_threats ?? 0}
          icon={Shield}
          status={(stats?.critical_threats ?? 0) > 0 ? 'critical' : 'normal'}
        />
        <DataCard
          title="Threat Intel Blocks"
          value={securityStatus?.stats?.threat_intel_blocks ?? 0}
          icon={Database}
          status="info"
        />
        <DataCard
          title="Active Indicators"
          value={securityStatus?.threat_intel?.total_indicators ?? 0}
          icon={ShieldCheck}
          status={securityStatus?.threat_intel?.enabled ? 'normal' : 'warning'}
        />
      </div>

      {/* Threat Intelligence Status */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
          Threat Intelligence Feed
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-secondary">
              <Database className="h-6 w-6 text-scada-info" />
            </div>
            <div>
              <div className="text-sm font-mono text-muted-foreground">Feed Status</div>
              <StatusIndicator
                status={securityStatus?.threat_intel?.enabled ? 'normal' : 'warning'}
                label={securityStatus?.threat_intel?.enabled ? 'Enabled' : 'Disabled'}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-secondary">
              <Shield className="h-6 w-6 text-scada-info" />
            </div>
            <div>
              <div className="text-sm font-mono text-muted-foreground">IP Indicators</div>
              <div className="text-lg font-mono font-bold text-scada-normal">
                {securityStatus?.threat_intel?.total_indicators ?? 0}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-secondary">
              <Clock className="h-6 w-6 text-scada-info" />
            </div>
            <div>
              <div className="text-sm font-mono text-muted-foreground">Last Refresh</div>
              <div className="text-sm font-mono text-foreground">
                {formatLastRefresh(securityStatus?.threat_intel?.last_refresh || null)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Threat categories */}
      {stats?.threats_by_category && Object.keys(stats.threats_by_category).length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
            Threats by Category
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.threats_by_category).map(([category, count]) => (
              <div 
                key={category}
                className="p-4 rounded border border-border bg-secondary/30"
              >
                <div className="text-2xl font-mono font-bold text-scada-warning">
                  {count}
                </div>
                <div className="text-xs font-mono text-muted-foreground uppercase">
                  {category || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live threat feed */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Threat Activity Log
          </h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearThreats}
            className="font-mono text-xs"
          >
            Clear Feed
          </Button>
        </div>
        <ThreatFeed threats={allThreats} maxItems={20} />
      </div>
    </div>
  );
}
