import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, GridDataPoint } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, subHours, subDays } from 'date-fns';
import { CalendarIcon, Download, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

export default function Historical() {
  const [startDate, setStartDate] = useState<Date>(subHours(new Date(), 1));
  const [endDate, setEndDate] = useState<Date>(new Date());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['historicalData', startDate.toISOString(), endDate.toISOString()],
    queryFn: () => api.getHistoricalData(startDate, endDate),
    retry: false,
  });

  const handleQuickRange = (hours: number) => {
    setEndDate(new Date());
    setStartDate(subHours(new Date(), hours));
  };

  const handleQuickRangeDays = (days: number) => {
    setEndDate(new Date());
    setStartDate(subDays(new Date(), days));
  };

  const formatXAxis = (timestamp: string) => {
    const date = new Date(timestamp);
    return format(date, 'HH:mm');
  };

  const chartData = data?.data?.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), 'HH:mm'),
  })) || [];

  const exportData = () => {
    if (!data?.data) return;
    
    const csv = [
      ['Timestamp', 'Generation (MW)', 'Load (MW)', 'Voltage (V)', 'Frequency (Hz)', 'Security Level', 'Attack Score'].join(','),
      ...data.data.map((point) => 
        [point.timestamp, point.gen_mw, point.load_mw, point.voltage, point.frequency, point.security_level, point.attack_score].join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scada-data-${format(startDate, 'yyyyMMdd-HHmm')}-${format(endDate, 'yyyyMMdd-HHmm')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            Historical Analytics
          </h1>
          <p className="text-sm font-mono text-muted-foreground">
            Grid data visualization and trends
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-border bg-card">
        {/* Quick range buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase">Quick:</span>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(1)} className="font-mono text-xs">
            1H
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(6)} className="font-mono text-xs">
            6H
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRange(24)} className="font-mono text-xs">
            24H
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleQuickRangeDays(7)} className="font-mono text-xs">
            7D
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Date pickers */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(startDate, 'MMM dd, HH:mm')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">→</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-mono text-xs">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(endDate, 'MMM dd, HH:mm')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => date && setEndDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <Button variant="outline" size="sm" onClick={() => refetch()} className="font-mono">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={exportData} disabled={!data?.data?.length} className="font-mono">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Data info */}
      <div className="text-sm font-mono text-muted-foreground">
        {isLoading ? (
          <span>Loading data...</span>
        ) : (
          <span>Showing {data?.total_records ?? 0} data points from {format(startDate, 'PPpp')} to {format(endDate, 'PPpp')}</span>
        )}
      </div>

      {/* Charts */}
      {chartData.length > 0 ? (
        <div className="space-y-6">
          {/* Power Chart */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Power Generation & Load
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="time" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={12}
                  fontFamily="JetBrains Mono"
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={12}
                  fontFamily="JetBrains Mono"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="gen_mw"
                  name="Generation (MW)"
                  stroke="hsl(var(--chart-1))"
                  fillOpacity={1}
                  fill="url(#colorGen)"
                />
                <Area
                  type="monotone"
                  dataKey="load_mw"
                  name="Load (W)"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={1}
                  fill="url(#colorLoad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Voltage & Frequency Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
                Voltage Trend
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="time" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <YAxis 
                    domain={['dataMin - 5', 'dataMax + 5']}
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      fontFamily: 'JetBrains Mono',
                      fontSize: 12
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="voltage"
                    name="Voltage (V)"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
                Frequency Trend
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="time" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <YAxis 
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      fontFamily: 'JetBrains Mono',
                      fontSize: 12
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="frequency"
                    name="Frequency (Hz)"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Security Trend */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-4">
              Attack Score Timeline
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAttack" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="time" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  fontFamily="JetBrains Mono"
                />
                <YAxis 
                  domain={[0, 20]}
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={10}
                  fontFamily="JetBrains Mono"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 12
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="attack_score"
                  name="Attack Score"
                  stroke="hsl(var(--chart-5))"
                  fillOpacity={1}
                  fill="url(#colorAttack)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : !isLoading ? (
        <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-card">
          <div className="text-center">
            <p className="text-lg font-mono text-muted-foreground">No data available</p>
            <p className="text-sm font-mono text-muted-foreground/70 mt-2">
              Try selecting a different time range or check if the backend is logging data
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
