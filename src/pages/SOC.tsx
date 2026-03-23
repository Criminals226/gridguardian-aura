import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { socApi, SocAlert, AlertAnalysis } from '@/lib/soc-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Search,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Target,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const severityConfig = {
  critical: { class: 'bg-scada-critical text-white', label: 'CRITICAL' },
  high: { class: 'bg-destructive text-destructive-foreground', label: 'HIGH' },
  medium: { class: 'bg-scada-warning text-black', label: 'MEDIUM' },
  low: { class: 'bg-scada-info text-white', label: 'LOW' },
};

export default function SOC() {
  const [selectedAnalysis, setSelectedAnalysis] = useState<AlertAnalysis | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: alerts = [], refetch, isLoading } = useQuery({
    queryKey: ['socAlerts'],
    queryFn: socApi.getAlerts,
    refetchInterval: 30000,
    retry: false,
  });

  const handleAnalyze = async (alert: SocAlert) => {
    setAnalyzingId(alert.id);
    try {
      const result = await socApi.analyzeAlert(alert);
      setSelectedAnalysis(result);
      setDialogOpen(true);
    } catch {
      toast.error('Failed to analyze alert');
    } finally {
      setAnalyzingId(null);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + ' ' +
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            SOC Dashboard
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Security Operations Center — Wazuh Alert Monitoring
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="font-mono"
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <div className="p-3 rounded-full bg-secondary">
            <Shield className="h-6 w-6 text-scada-info" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-foreground">{alerts.length}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase">Total Alerts</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <div className="p-3 rounded-full bg-scada-critical/10">
            <ShieldAlert className="h-6 w-6 text-scada-critical" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-scada-critical">{criticalCount}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase">Critical</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <div className="p-3 rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <div className="text-2xl font-mono font-bold text-destructive">{highCount}</div>
            <div className="text-xs font-mono text-muted-foreground uppercase">High</div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
          <div className="p-3 rounded-full bg-scada-normal/10">
            <ShieldCheck className="h-6 w-6 text-scada-normal" />
          </div>
          <div>
            <div className="text-xs font-mono text-muted-foreground uppercase">Source</div>
            <div className="text-sm font-mono font-bold text-foreground">
              {alerts[0]?.source === 'wazuh' ? 'Wazuh Live' : 'Simulation'}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="bg-secondary/50 px-4 py-3 border-b border-border">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            Alert Feed — MITRE ATT&CK Mapped
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono text-xs">Time</TableHead>
              <TableHead className="font-mono text-xs">Message</TableHead>
              <TableHead className="font-mono text-xs">Severity</TableHead>
              <TableHead className="font-mono text-xs">ATT&CK Technique</TableHead>
              <TableHead className="font-mono text-xs">Tactic</TableHead>
              <TableHead className="font-mono text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground font-mono py-8">
                  {isLoading ? 'Loading alerts...' : 'No alerts detected'}
                </TableCell>
              </TableRow>
            )}
            {alerts.map((alert) => {
              const sev = severityConfig[alert.severity] || severityConfig.low;
              return (
                <TableRow key={alert.id} className="hover:bg-secondary/30">
                  <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(alert.timestamp)}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-foreground max-w-xs truncate">
                    {alert.message}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('font-mono text-xs', sev.class)}>
                      {sev.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-scada-warning" />
                      <span className="text-scada-warning">{alert.mitre_id}</span>
                      <span className="text-muted-foreground">— {alert.mitre_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {alert.mitre_tactic}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-mono text-xs"
                      onClick={() => handleAnalyze(alert)}
                      disabled={analyzingId === alert.id}
                    >
                      {analyzingId === alert.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Analyze
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Analysis Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-lg flex items-center gap-2">
              <Search className="h-5 w-5 text-scada-info" />
              Threat Analysis Report
            </DialogTitle>
          </DialogHeader>

          {selectedAnalysis && (
            <div className="space-y-4 font-mono text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-border p-3 bg-secondary/30">
                  <div className="text-xs text-muted-foreground uppercase">Attack Type</div>
                  <div className="text-foreground font-bold mt-1">{selectedAnalysis.attack_type}</div>
                </div>
                <div className="rounded border border-border p-3 bg-secondary/30">
                  <div className="text-xs text-muted-foreground uppercase">Technique</div>
                  <div className="text-scada-warning font-bold mt-1">{selectedAnalysis.technique}</div>
                </div>
                <div className="rounded border border-border p-3 bg-secondary/30">
                  <div className="text-xs text-muted-foreground uppercase">Tactic</div>
                  <div className="text-foreground mt-1">{selectedAnalysis.tactic}</div>
                </div>
                <div className="rounded border border-border p-3 bg-secondary/30">
                  <div className="text-xs text-muted-foreground uppercase">Severity</div>
                  <Badge className={cn(
                    'mt-1 font-mono',
                    severityConfig[selectedAnalysis.severity as keyof typeof severityConfig]?.class || 'bg-scada-info text-white'
                  )}>
                    {selectedAnalysis.severity.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="rounded border border-border p-3 bg-secondary/30">
                <div className="text-xs text-muted-foreground uppercase mb-1">Confidence</div>
                <div className="text-scada-normal font-bold">{selectedAnalysis.confidence}</div>
              </div>

              <div className="rounded border border-border p-3 bg-secondary/30">
                <div className="text-xs text-muted-foreground uppercase mb-1">Summary</div>
                <div className="text-foreground leading-relaxed">{selectedAnalysis.ioc_summary}</div>
              </div>

              <div className="rounded border border-scada-warning/30 p-3 bg-scada-warning/5">
                <div className="text-xs text-scada-warning uppercase mb-1 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Recommended Action
                </div>
                <div className="text-foreground leading-relaxed">{selectedAnalysis.recommended_action}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
