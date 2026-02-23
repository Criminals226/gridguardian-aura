import { useEffect, useState } from 'react';
import { SystemState } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ScadaDiagramProps {
  state?: SystemState;
  isConnected?: boolean;
  mqttConnected?: boolean;
}

// Animated flowing dots along a path
function FlowingDots({ pathId, color, active, reverse = false, count = 3 }: {
  pathId: string;
  color: string;
  active: boolean;
  reverse?: boolean;
  count?: number;
}) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <circle key={i} r="3" fill={color} opacity="0.9">
          <animateMotion
            dur={`${2 + i * 0.3}s`}
            repeatCount="indefinite"
            keyPoints={reverse ? "1;0" : "0;1"}
            keyTimes="0;1"
            begin={`${i * (2 / count)}s`}
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}

// Pulsing glow filter
function GlowFilters() {
  return (
    <defs>
      <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Animated turbine pattern */}
      <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(220 15% 15%)" strokeWidth="0.5" />
      </pattern>
    </defs>
  );
}

// Spinning turbine blades
function TurbineIcon({ cx, cy, rpm }: { cx: number; cy: number; rpm: number }) {
  const speed = rpm > 0 ? Math.max(0.5, 10 / (rpm / 100)) : 0;
  return (
    <g>
      <circle cx={cx} cy={cy} r="28" fill="none" stroke="hsl(220 15% 25%)" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="5" fill="hsl(142 70% 45%)" filter="url(#glow-green)">
        {rpm > 0 && (
          <animate attributeName="opacity" values="1;0.6;1" dur="1s" repeatCount="indefinite" />
        )}
      </circle>
      {rpm > 0 ? (
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur={`${speed}s`}
            repeatCount="indefinite"
          />
          {[0, 120, 240].map((angle) => (
            <line
              key={angle}
              x1={cx}
              y1={cy}
              x2={cx + 24 * Math.cos((angle * Math.PI) / 180)}
              y2={cy + 24 * Math.sin((angle * Math.PI) / 180)}
              stroke="hsl(142 70% 45%)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
        </g>
      ) : (
        [0, 120, 240].map((angle) => (
          <line
            key={angle}
            x1={cx}
            y1={cy}
            x2={cx + 24 * Math.cos((angle * Math.PI) / 180)}
            y2={cy + 24 * Math.sin((angle * Math.PI) / 180)}
            stroke="hsl(220 10% 40%)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))
      )}
    </g>
  );
}

// Building/area block with lights
function AreaBlock({ x, y, name, state, loadLabel }: {
  x: number; y: number; name: string; state: string; loadLabel?: string;
}) {
  const isOn = state === 'ON';
  const lightColor = isOn ? 'hsl(45 90% 50%)' : 'hsl(220 10% 20%)';
  const buildingFill = isOn ? 'hsl(220 18% 14%)' : 'hsl(220 18% 8%)';

  return (
    <g>
      {/* Building */}
      <rect x={x} y={y} width="100" height="70" rx="3" fill={buildingFill}
        stroke={isOn ? 'hsl(45 90% 50%)' : 'hsl(220 15% 25%)'} strokeWidth="1.5" />
      {/* Roof */}
      <polygon points={`${x - 5},${y} ${x + 50},${y - 20} ${x + 105},${y}`}
        fill={isOn ? 'hsl(220 18% 16%)' : 'hsl(220 18% 10%)'}
        stroke={isOn ? 'hsl(45 90% 50%)' : 'hsl(220 15% 25%)'} strokeWidth="1" />

      {/* Windows/lights - 2x2 grid */}
      {[0, 1].map((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={x + 15 + col * 25}
            y={y + 12 + row * 22}
            width="15"
            height="12"
            rx="1"
            fill={lightColor}
            filter={isOn ? 'url(#glow-amber)' : undefined}
            opacity={isOn ? (0.6 + Math.random() * 0.4) : 0.3}
          >
            {isOn && (
              <animate
                attributeName="opacity"
                values={`${0.5 + Math.random() * 0.3};${0.8 + Math.random() * 0.2};${0.5 + Math.random() * 0.3}`}
                dur={`${2 + Math.random() * 2}s`}
                repeatCount="indefinite"
              />
            )}
          </rect>
        ))
      )}

      {/* Label */}
      <text x={x + 50} y={y + 88} textAnchor="middle" fill="hsl(180 5% 90%)"
        fontSize="11" fontFamily="JetBrains Mono, monospace" fontWeight="600">{name}</text>

      {/* Status light */}
      <circle cx={x + 50} cy={y - 28} r="6"
        fill={isOn ? 'hsl(142 70% 45%)' : 'hsl(0 70% 50%)'}
        filter={isOn ? 'url(#glow-green)' : 'url(#glow-red)'}
      >
        <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <text x={x + 50} y={y - 38} textAnchor="middle" fill={isOn ? 'hsl(142 70% 45%)' : 'hsl(0 70% 50%)'}
        fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
        {state}
      </text>
      {loadLabel && (
        <text x={x + 50} y={y + 100} textAnchor="middle" fill="hsl(200 80% 55%)"
          fontSize="9" fontFamily="JetBrains Mono, monospace">{loadLabel}</text>
      )}
    </g>
  );
}

export function ScadaDiagram({ state, isConnected, mqttConnected }: ScadaDiagramProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const genMW = state?.gen_mw ?? 0;
  const loadMW = state?.load_mw ?? 0;
  const voltage = state?.voltage ?? 230;
  const frequency = state?.frequency ?? 50;
  const rpm = state?.gen_rpm ?? 0;
  const area1 = state?.area1 ?? 'OFF';
  const area2 = state?.area2 ?? 'OFF';
  const secLevel = state?.security_level ?? 'NORMAL';
  const attackScore = state?.attack_score ?? 0;
  const bill = state?.calculated_bill ?? 0;
  const locked = state?.system_locked ?? false;

  const secColor = secLevel === 'CRITICAL'
    ? 'hsl(0 70% 50%)'
    : secLevel === 'WARNING'
    ? 'hsl(45 90% 50%)'
    : 'hsl(142 70% 45%)';

  return (
    <div className="w-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          ⚡ SCADA System Overview — Live Simulation
        </h2>
        <div className="flex items-center gap-3">
          <span className={cn("text-xs font-mono flex items-center gap-1.5",
            isConnected ? "text-scada-normal" : "text-scada-offline")}>
            <span className={cn("w-2 h-2 rounded-full inline-block",
              isConnected ? "bg-scada-normal" : "bg-scada-offline")} />
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span className={cn("text-xs font-mono flex items-center gap-1.5",
            mqttConnected ? "text-scada-info" : "text-scada-offline")}>
            <span className={cn("w-2 h-2 rounded-full inline-block",
              mqttConnected ? "bg-scada-info" : "bg-scada-offline")} />
            MQTT
          </span>
        </div>
      </div>

      <svg viewBox="0 0 960 520" className="w-full h-auto bg-grid" style={{ minHeight: 400 }}>
        <GlowFilters />

        {/* ===== CONNECTION PATHS ===== */}
        {/* Power Plant → Transformer */}
        <path id="path-gen-tx" d="M 195 200 L 350 200" fill="none"
          stroke="hsl(142 70% 30%)" strokeWidth="2" strokeDasharray="6 3" />

        {/* Transformer → Distribution Bus */}
        <path id="path-tx-bus" d="M 420 200 L 520 200" fill="none"
          stroke="hsl(200 80% 35%)" strokeWidth="2" strokeDasharray="6 3" />

        {/* Bus → Area 1 */}
        <path id="path-bus-a1" d="M 570 200 Q 620 200 650 280 L 700 350" fill="none"
          stroke={area1 === 'ON' ? 'hsl(45 90% 40%)' : 'hsl(220 10% 25%)'} strokeWidth="2" strokeDasharray="5 4" />

        {/* Bus → Area 2 */}
        <path id="path-bus-a2" d="M 570 200 Q 620 200 650 120 L 700 50" fill="none"
          stroke={area2 === 'ON' ? 'hsl(45 90% 40%)' : 'hsl(220 10% 25%)'} strokeWidth="2" strokeDasharray="5 4" />

        {/* Control Center → Bus (data link) */}
        <path id="path-cc-bus" d="M 420 420 L 420 340 L 540 250" fill="none"
          stroke="hsl(200 80% 30%)" strokeWidth="1.5" strokeDasharray="3 4" />

        {/* ===== FLOWING ENERGY PARTICLES ===== */}
        <FlowingDots pathId="path-gen-tx" color="hsl(142 70% 55%)" active={genMW > 0} count={4} />
        <FlowingDots pathId="path-tx-bus" color="hsl(200 80% 60%)" active={genMW > 0} count={3} />
        <FlowingDots pathId="path-bus-a1" color="hsl(45 90% 60%)" active={area1 === 'ON'} count={3} />
        <FlowingDots pathId="path-bus-a2" color="hsl(45 90% 60%)" active={area2 === 'ON'} count={3} />
        <FlowingDots pathId="path-cc-bus" color="hsl(200 80% 55%)" active={isConnected ?? false} count={2} reverse />

        {/* ===== POWER PLANT ===== */}
        <g>
          <rect x="30" y="140" width="165" height="120" rx="4"
            fill="hsl(220 18% 10%)" stroke="hsl(142 70% 30%)" strokeWidth="1.5" />
          {/* Smokestack */}
          <rect x="50" y="110" width="16" height="30" fill="hsl(220 18% 12%)"
            stroke="hsl(220 15% 25%)" strokeWidth="1" />
          <rect x="155" y="110" width="16" height="30" fill="hsl(220 18% 12%)"
            stroke="hsl(220 15% 25%)" strokeWidth="1" />
          {/* Smoke animation */}
          {genMW > 0 && [0, 1].map((i) => (
            <g key={i}>
              <circle cx={58 + i * 105} cy={100} r="4" fill="hsl(220 10% 40%)" opacity="0.4">
                <animate attributeName="cy" values="105;60;30" dur={`${3 + i}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0.2;0" dur={`${3 + i}s`} repeatCount="indefinite" />
                <animate attributeName="r" values="3;8;12" dur={`${3 + i}s`} repeatCount="indefinite" />
              </circle>
            </g>
          ))}

          {/* Turbine */}
          <TurbineIcon cx={112} cy={200} rpm={rpm} />

          {/* Labels */}
          <text x="112" y="158" textAnchor="middle" fill="hsl(142 70% 45%)"
            fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">POWER PLANT</text>
          <text x="112" y="248" textAnchor="middle" fill="hsl(180 5% 70%)"
            fontSize="9" fontFamily="JetBrains Mono, monospace">
            {genMW.toFixed(1)} MW | {rpm} RPM
          </text>
        </g>

        {/* ===== TRANSFORMER ===== */}
        <g>
          <rect x="350" y="165" width="70" height="70" rx="4"
            fill="hsl(220 18% 10%)" stroke="hsl(200 80% 40%)" strokeWidth="1.5" />
          {/* Transformer coils symbol */}
          <circle cx="375" cy="200" r="14" fill="none" stroke="hsl(200 80% 55%)" strokeWidth="2" />
          <circle cx="395" cy="200" r="14" fill="none" stroke="hsl(200 80% 55%)" strokeWidth="2" />
          <text x="385" y="250" textAnchor="middle" fill="hsl(200 80% 55%)"
            fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">TRANSFORMER</text>
          <text x="385" y="262" textAnchor="middle" fill="hsl(180 5% 60%)"
            fontSize="8" fontFamily="JetBrains Mono, monospace">
            {voltage.toFixed(1)}V | {frequency.toFixed(2)}Hz
          </text>
        </g>

        {/* ===== DISTRIBUTION BUS ===== */}
        <g>
          <rect x="520" y="175" width="50" height="50" rx="25"
            fill="hsl(220 18% 12%)" stroke="hsl(200 80% 45%)" strokeWidth="2" />
          <text x="545" y="205" textAnchor="middle" fill="hsl(200 80% 55%)"
            fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">BUS</text>
          {/* Pulsing ring */}
          <circle cx="545" cy="200" r="30" fill="none" stroke="hsl(200 80% 45%)" strokeWidth="1" opacity="0.4">
            <animate attributeName="r" values="28;35;28" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ===== AREA 2 (top) ===== */}
        <AreaBlock x={700} y={20} name="AREA 2" state={area2} loadLabel="Residential Zone" />

        {/* ===== AREA 1 (bottom) ===== */}
        <AreaBlock x={700} y={320} name="AREA 1" state={area1} loadLabel="Industrial Zone" />

        {/* ===== CONTROL CENTER ===== */}
        <g>
          <rect x="310" y="380" width="220" height="120" rx="4"
            fill="hsl(220 18% 10%)" stroke={secColor} strokeWidth="1.5" />
          {/* Screen glow */}
          <rect x="325" y="395" width="80" height="45" rx="2"
            fill="hsl(220 20% 8%)" stroke="hsl(200 80% 35%)" strokeWidth="1" />
          {/* Screen content - waveform */}
          <polyline
            points="330,420 340,410 350,425 360,408 370,418 380,405 390,420 400,412"
            fill="none" stroke="hsl(142 70% 45%)" strokeWidth="1.5">
            <animate attributeName="points"
              values="330,420 340,410 350,425 360,408 370,418 380,405 390,420 400,412;330,415 340,425 350,410 360,420 370,405 380,418 390,408 400,420;330,420 340,410 350,425 360,408 370,418 380,405 390,420 400,412"
              dur="3s" repeatCount="indefinite" />
          </polyline>

          {/* Second monitor */}
          <rect x="420" y="395" width="95" height="45" rx="2"
            fill="hsl(220 20% 8%)" stroke="hsl(200 80% 35%)" strokeWidth="1" />
          {/* Bars chart */}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={430 + i * 16} y={425 - (10 + Math.random() * 10)}
              width="10" height={10 + Math.random() * 10} rx="1"
              fill={i < 3 ? 'hsl(142 70% 45%)' : 'hsl(45 90% 50%)'} opacity="0.7">
              <animate attributeName="height" values={`${10 + i * 3};${15 + i * 2};${10 + i * 3}`}
                dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
            </rect>
          ))}

          {/* Security status indicator */}
          <circle cx="340" cy="470" r="5" fill={secColor} filter="url(#glow-green)">
            <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <text x="352" y="473" fill={secColor}
            fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
            SEC: {secLevel}
          </text>

          <text x="352" y="487" fill="hsl(180 5% 60%)"
            fontSize="8" fontFamily="JetBrains Mono, monospace">
            ATK: {attackScore.toFixed(2)} | BILL: ${bill.toFixed(2)}
          </text>

          {locked && (
            <g>
              <rect x="460" y="460" width="55" height="18" rx="2" fill="hsl(0 70% 20%)" stroke="hsl(0 70% 50%)" strokeWidth="1" />
              <text x="487" y="473" textAnchor="middle" fill="hsl(0 70% 60%)"
                fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="bold">🔒 LOCKED</text>
            </g>
          )}

          <text x="420" y="370" textAnchor="middle" fill="hsl(200 80% 55%)"
            fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
            SCADA CONTROL CENTER
          </text>
        </g>

        {/* ===== DATA LABELS ON PATHS ===== */}
        <text x="270" y="190" textAnchor="middle" fill="hsl(142 70% 50%)"
          fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
          {genMW.toFixed(1)} MW →
        </text>

        <text x="470" y="190" textAnchor="middle" fill="hsl(200 80% 55%)"
          fontSize="8" fontFamily="JetBrains Mono, monospace">
          {voltage.toFixed(0)}V AC
        </text>

        <text x="655" y="300" textAnchor="middle" fill="hsl(45 90% 50%)"
          fontSize="8" fontFamily="JetBrains Mono, monospace">
          {area1 === 'ON' ? `${(loadMW * 0.6).toFixed(0)}W` : '0W'}
        </text>

        <text x="655" y="110" textAnchor="middle" fill="hsl(45 90% 50%)"
          fontSize="8" fontFamily="JetBrains Mono, monospace">
          {area2 === 'ON' ? `${(loadMW * 0.4).toFixed(0)}W` : '0W'}
        </text>

        {/* ===== SYSTEM STATUS BAR ===== */}
        <rect x="30" y="495" width="900" height="2" fill="hsl(220 15% 15%)" />
        <rect x="30" y="495" width={`${Math.min(900, (genMW / 100) * 900)}`} height="2"
          fill="hsl(142 70% 45%)" opacity="0.6">
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
        </rect>
        <text x="480" y="515" textAnchor="middle" fill="hsl(180 5% 50%)"
          fontSize="8" fontFamily="JetBrains Mono, monospace">
          SYSTEM LOAD: {loadMW.toFixed(0)}W | GENERATION: {genMW.toFixed(1)}MW | STATUS: {state?.status ?? 'N/A'} | {new Date().toLocaleTimeString()}
        </text>
      </svg>
    </div>
  );
}
