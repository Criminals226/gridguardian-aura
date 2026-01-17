import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ThreatLog, AuditLog } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { format } from 'date-fns';
import { Search, RefreshCw, ShieldAlert, FileText, AlertTriangle, Info, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Logs() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedThreat, setSelectedThreat] = useState<ThreatLog | null>(null);

  const { data: threatLogs = [], refetch: refetchThreats, isLoading: loadingThreats } = useQuery({
    queryKey: ['threatLogs'],
    queryFn: () => api.getThreatLogs(100),
    retry: false,
  });

  const { data: auditLogs = [], refetch: refetchAudit, isLoading: loadingAudit } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => api.getAuditLogs(100),
    retry: false,
  });

  const filteredThreats = threatLogs.filter((log) =>
    JSON.stringify(log).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAudit = auditLogs.filter((log) =>
    JSON.stringify(log).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return <Badge className="bg-scada-critical text-white font-mono">CRITICAL</Badge>;
      case 'WARNING':
        return <Badge className="bg-scada-warning text-black font-mono">WARNING</Badge>;
      default:
        return <Badge className="bg-scada-info text-white font-mono">INFO</Badge>;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return <ShieldX className="h-4 w-4 text-scada-critical" />;
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-scada-warning" />;
      default:
        return <Info className="h-4 w-4 text-scada-info" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            System Logs
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Threat activity and audit trail
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 font-mono"
          />
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => { refetchThreats(); refetchAudit(); }}
          className="font-mono"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="threats" className="w-full">
        <TabsList className="bg-secondary">
          <TabsTrigger value="threats" className="font-mono">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Threat Logs ({filteredThreats.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="font-mono">
            <FileText className="h-4 w-4 mr-2" />
            Audit Trail ({filteredAudit.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="threats" className="mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-mono text-xs uppercase w-[180px]">Timestamp</TableHead>
                    <TableHead className="font-mono text-xs uppercase w-[100px]">Severity</TableHead>
                    <TableHead className="font-mono text-xs uppercase w-[120px]">Layer</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Category</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Explanation</TableHead>
                    <TableHead className="font-mono text-xs uppercase w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingThreats ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                        Loading threats...
                      </TableCell>
                    </TableRow>
                  ) : filteredThreats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono">
                        No threats found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredThreats.map((log) => (
                      <TableRow 
                        key={log.id} 
                        className={cn(
                          'hover:bg-secondary/30 cursor-pointer',
                          log.threat_classification?.severity === 'CRITICAL' && 'bg-scada-critical/5'
                        )}
                        onClick={() => setSelectedThreat(log)}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell>
                          {getSeverityBadge(log.threat_classification?.severity)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.layer}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-2">
                            {getSeverityIcon(log.threat_classification?.severity)}
                            <span>{log.threat_classification?.category || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[300px] truncate">
                          {log.explanation}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="font-mono text-xs">
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-mono text-xs uppercase w-[180px]">Timestamp</TableHead>
                    <TableHead className="font-mono text-xs uppercase w-[120px]">User</TableHead>
                    <TableHead className="font-mono text-xs uppercase w-[150px]">Action</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAudit ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono">
                        Loading audit logs...
                      </TableCell>
                    </TableRow>
                  ) : filteredAudit.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAudit.map((log) => (
                      <TableRow key={log.id} className="hover:bg-secondary/30">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <Badge variant="outline">{log.username}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <Badge 
                            className={cn(
                              'font-mono',
                              log.action === 'LOGIN' && 'bg-scada-normal/20 text-scada-normal border-scada-normal/30',
                              log.action === 'LOGOUT' && 'bg-scada-info/20 text-scada-info border-scada-info/30'
                            )}
                            variant="outline"
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {JSON.stringify(log.details)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>

      {/* Threat Details Dialog */}
      <Dialog open={!!selectedThreat} onOpenChange={() => setSelectedThreat(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              {selectedThreat && getSeverityIcon(selectedThreat.threat_classification?.severity)}
              Threat Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedThreat && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Decision ID</label>
                  <p className="font-mono text-sm">{selectedThreat.decision_id}</p>
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Timestamp</label>
                  <p className="font-mono text-sm">{formatTimestamp(selectedThreat.timestamp)}</p>
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Severity</label>
                  <div className="mt-1">{getSeverityBadge(selectedThreat.threat_classification?.severity)}</div>
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Action</label>
                  <Badge variant="outline" className="mt-1 font-mono">{selectedThreat.action}</Badge>
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Layer</label>
                  <p className="font-mono text-sm">{selectedThreat.layer}</p>
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Category</label>
                  <p className="font-mono text-sm">{selectedThreat.threat_classification?.category}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase">Subcategory</label>
                <p className="font-mono text-sm">{selectedThreat.threat_classification?.subcategory}</p>
              </div>

              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase">Explanation</label>
                <p className="font-mono text-sm p-3 rounded bg-secondary/50 border border-border">
                  {selectedThreat.explanation}
                </p>
              </div>

              {Object.keys(selectedThreat.metadata || {}).length > 0 && (
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase">Metadata</label>
                  <pre className="font-mono text-xs p-3 rounded bg-secondary/50 border border-border overflow-auto">
                    {JSON.stringify(selectedThreat.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
