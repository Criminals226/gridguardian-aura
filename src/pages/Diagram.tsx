import { ScadaDiagram } from '@/components/scada/ScadaDiagram';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Monitor, Network } from 'lucide-react';

export default function Diagram() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-mono font-bold text-foreground">SCADA Diagram</h1>
        <p className="text-sm font-mono text-muted-foreground">
          Live mimic of the smart-grid topology and control centre
        </p>
      </div>

      <Tabs defaultValue="topology" className="w-full">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="topology" className="font-mono text-xs gap-2 data-[state=active]:bg-sidebar-accent">
            <Network className="h-4 w-4" />
            Topology
          </TabsTrigger>
          <TabsTrigger value="control" className="font-mono text-xs gap-2 data-[state=active]:bg-sidebar-accent">
            <Monitor className="h-4 w-4" />
            Control Centre
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topology">
          <ScadaDiagram />
        </TabsContent>

        <TabsContent value="control">
          <ScadaDiagram />
        </TabsContent>
      </Tabs>
    </div>
  );
}
