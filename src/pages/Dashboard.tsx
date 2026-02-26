import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, SystemState, SecurityStatus } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { DataCard } from '@/components/scada/DataCard';
import { GaugeCircular } from '@/components/scada/GaugeCircular';
import { MeterBar } from '@/components/scada/MeterBar';
import { AreaSwitch } from '@/components/scada/AreaSwitch';
import { StatusIndicator } from '@/components/scada/StatusIndicator';
import { ScadaDiagram } from '@/components/scada/ScadaDiagram';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Zap, 
  Gauge, 
  Activity, 
  DollarSign, 
  Radio,
  Server,
  Cpu,
  AlertTriangle,
  RotateCcw,
  Monitor,
  LayoutGrid,
} from 'lucide-react';

export default function Dashboard() {
  const { lastState, isConnected, mqttConnected } = useSocket();
  const [loadingControl, setLoadingControl] = useState<string | null>(null);
  
  // Fetch state via polling as fallback
  const { data: apiState } = useQuery({
    queryKey: ['systemState'],
    queryFn: api.getState,
    refetchInterval: 5000,
    retry: false,
  });

  const { data: securityStatus } = useQuery({
    queryKey: ['securityStatus'],
    queryFn: api.getSecurityStatus,
    refetchInterval: 5000,
    retry: false,
  });

  // Use socket data if available, otherwise fall back to API
  const state: SystemState | undefined = lastState || apiState;

  const getStatusLevel = (level: string): 'normal' | 'warning' | 'critical' => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL': return 'critical';
      case 'WARNING': return 'warning';
      default: return 'normal';
    }
  };

  const [localOverrides, setLocalOverrides] = useState<Partial<SystemState>>({});

  const handleControl = async (action: string) => {
    setLoadingControl(action);
    
    // Optimistic local state updates
    if (action === 'toggle_area1') {
      const current = (localOverrides.area1 ?? state?.area1) === 'ON' ? 'OFF' : 'ON';
      setLocalOverrides(prev => ({ ...prev, area1: current }));
    } else if (action === 'toggle_area2') {
      const current = (localOverrides.area2 ?? state?.area2) === 'ON' ? 'OFF' : 'ON';
      setLocalOverrides(prev => ({ ...prev, area2: current }));
    } else if (action === 'simulate_attack') {
      setLocalOverrides(prev => ({ ...prev, price_rate: 50.0, security_level: 'CRITICAL', attack_score: 0.95 }));
    } else if (action === 'reset_price') {
      setLocalOverrides(prev => ({ ...prev, price_rate: 0.25, security_level: 'NORMAL', attack_score: 0, calculated_bill: 0 }));
    }

    try {
      await api.sendControl(action);
      toast.success(`Command sent: ${action.replace('_', ' ')}`);
    } catch {
      toast.info(`Local update: ${action.replace('_', ' ')}`);
    } finally {
      setLoadingControl(null);
    }
  };

  // Merge real state with local overrides
  const effectiveState: SystemState | undefined = state 
    ? { ...state, ...localOverrides } 
    : localOverrides as SystemState | undefined;

  return (
    <div className="space-y-6">
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            Grid Operations Dashboard
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Real-time power grid monitoring and control
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <StatusIndicator 
            status={isConnected ? 'normal' : 'offline'} 
            label={isConnected ? 'Socket Live' : 'Socket Offline'} 
          />
          <StatusIndicator 
            status={mqttConnected || state?.mqtt_connected ? 'normal' : 'offline'} 
            label={mqttConnected || state?.mqtt_connected ? 'MQTT Connected' : 'MQTT Offline'} 
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="overview" className="font-mono text-xs gap-2 data-[state=active]:bg-sidebar-accent">
            <LayoutGrid className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="diagram" className="font-mono text-xs gap-2 data-[state=active]:bg-sidebar-accent">
            <Monitor className="h-4 w-4" />
            SCADA Diagram
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Main metrics row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <DataCard
              title="Generation"
              value={effectiveState?.gen_mw ?? 0}
              unit="MW"
              icon={Zap}
              status={getStatusLevel(effectiveState?.security_level || 'NORMAL')}
              subtitle={`RPM: ${effectiveState?.gen_rpm ?? 0} | Status: ${effectiveState?.status ?? 'N/A'}`}
            />
            <DataCard
              title="Load Consumption"
              value={effectiveState?.load_mw ?? 0}
              unit="W"
              icon={Activity}
              status="info"
              subtitle="Active power demand"
            />
            <DataCard
              title="Current Bill"
              value={effectiveState?.calculated_bill ?? 0}
              unit="$"
              icon={DollarSign}
              status="normal"
              subtitle="Calculated usage cost"
            />
            <DataCard
              title="Security Level"
              value={effectiveState?.security_level ?? 'NORMAL'}
              icon={Server}
              status={getStatusLevel(effectiveState?.security_level || 'NORMAL')}
              subtitle={`Attack Score: ${(effectiveState?.attack_score ?? 0).toFixed(2)}`}
            />
          </div>

          {/* Gauges and meters row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-6">
                Power Quality Metrics
              </h2>
              <div className="flex justify-around">
                <GaugeCircular
                  value={effectiveState?.voltage ?? 230}
                  min={200}
                  max={260}
                  unit="V"
                  label="Voltage"
                  warningThreshold={245}
                  criticalThreshold={255}
                />
                <GaugeCircular
                  value={effectiveState?.frequency ?? 50}
                  min={48}
                  max={52}
                  unit="Hz"
                  label="Frequency"
                  warningThreshold={50.5}
                  criticalThreshold={51.5}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-6">
                Power Distribution
              </h2>
              <div className="space-y-6">
                <MeterBar
                  value={effectiveState?.gen_mw ?? 0}
                  max={100}
                  label="Generation"
                  unit="MW"
                  warningThreshold={80}
                  criticalThreshold={95}
                />
                <MeterBar
                  value={effectiveState?.load_mw ?? 0}
                  max={1000}
                  label="Load"
                  unit="W"
                  warningThreshold={800}
                  criticalThreshold={950}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-6">
                Distribution Areas
              </h2>
              <div className="space-y-4">
                <AreaSwitch
                  name="Area 1"
                  state={effectiveState?.area1 ?? 'OFF'}
                  onToggle={() => handleControl('toggle_area1')}
                  loading={loadingControl === 'toggle_area1'}
                />
                <AreaSwitch
                  name="Area 2"
                  state={effectiveState?.area2 ?? 'OFF'}
                  onToggle={() => handleControl('toggle_area2')}
                  loading={loadingControl === 'toggle_area2'}
                />
              </div>
              
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <button
                  onClick={() => handleControl('simulate_attack')}
                  disabled={loadingControl === 'simulate_attack'}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border border-destructive/50 bg-destructive/10 text-destructive text-xs font-mono hover:bg-destructive/20 transition-colors"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Simulate Attack
                </button>
                <button
                  onClick={() => handleControl('reset_price')}
                  disabled={loadingControl === 'reset_price'}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border border-scada-normal/50 bg-scada-normal/10 text-scada-normal text-xs font-mono hover:bg-scada-normal/20 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Price / Clear Attack
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm font-mono">
                  <span className="text-muted-foreground">Price Rate</span>
                  <span className="text-foreground">${effectiveState?.price_rate?.toFixed(2) ?? '0.25'}/unit</span>
                </div>
                <div className="flex items-center justify-between text-sm font-mono mt-2">
                  <span className="text-muted-foreground">Last Update</span>
                  <span className="text-foreground">{effectiveState?.last_update ?? '--:--:--'}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-mono mt-2">
                  <span className="text-muted-foreground">System Lock</span>
                  <StatusIndicator 
                    status={effectiveState?.system_locked ? 'critical' : 'normal'}
                    label={effectiveState?.system_locked ? 'LOCKED' : 'UNLOCKED'}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* SCADA Diagram Tab */}
        <TabsContent value="diagram">
          <ScadaDiagram 
            state={effectiveState} 
            isConnected={isConnected} 
            mqttConnected={mqttConnected || effectiveState?.mqtt_connected} 
          />
        </TabsContent>
      </Tabs>

      {/* System info footer */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Broker:</span>
            <span className="text-foreground">broker.hivemq.com</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Topic:</span>
            <span className="text-foreground">fyp_grid_99/#</span>
          </div>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Threat Intel:</span>
            <StatusIndicator 
              status={effectiveState?.threat_intel_active ? 'normal' : 'offline'}
              label={effectiveState?.threat_intel_active ? 'Active' : 'Inactive'}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-scada-info" />
            <span className="text-muted-foreground">Inspected:</span>
            <span className="text-foreground">{securityStatus?.stats?.total_inspected ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
