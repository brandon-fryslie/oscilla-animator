/**
 * BusViz Component
 *
 * Domain-specific visualizations for bus channels.
 * Phase 3: Static placeholders showing default value.
 * Phase 4+: Live sampling from compiled program.
 */

import type { CoreDomain } from './types';
import './BusViz.css';

export interface BusVizProps {
  /** Domain type (number, vec2, color, etc.) */
  domain: CoreDomain;
  /** Default value for the bus */
  defaultValue: unknown;
  /** Size in pixels (default: 20) */
  size?: number;
}

/**
 * Main bus visualization component.
 * Renders domain-appropriate static placeholder.
 */
export function BusViz({ domain, defaultValue, size = 20 }: BusVizProps) {
  switch (domain) {
    case 'number':
      return <NumberViz value={defaultValue as number} size={size} />;
    case 'vec2':
      return <Vec2Viz value={defaultValue as { x: number; y: number }} size={size} />;
    case 'color':
      return <ColorViz value={defaultValue as { r: number; g: number; b: number; a: number }} size={size} />;
    case 'phase':
      return <PhaseViz value={defaultValue as number} size={size} />;
    case 'time':
      return <TimeViz size={size} />;
    case 'rate':
      return <RateViz size={size} />;
    case 'trigger':
      return <TriggerViz size={size} />;
    case 'boolean':
      return <BooleanViz value={defaultValue as boolean} size={size} />;
    default:
      return <DefaultViz domain={domain} size={size} />;
  }
}

/**
 * Number: Horizontal bar (empty/placeholder at 0).
 */
function NumberViz({ value, size }: { value: number; size: number }) {
  // Static placeholder - always shows empty bar
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-number"
      aria-label={`Number visualization (default: ${value})`}
    >
      {/* Background bar */}
      <rect x="2" y="8" width="16" height="4" fill="#1f1f1f" stroke="#333" strokeWidth="0.5" rx="1" />
      {/* Placeholder indicator at 0 */}
      <line x1="2" y1="6" x2="2" y2="14" stroke="#4a9eff" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/**
 * Vec2: XY crosshair icon (static at center).
 */
function Vec2Viz({ value, size }: { value: { x: number; y: number }; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-vec2"
      aria-label={`Vec2 visualization (default: ${value.x}, ${value.y})`}
    >
      {/* Crosshair */}
      <line x1="10" y1="4" x2="10" y2="16" stroke="#4a9eff" strokeWidth="1" opacity="0.6" />
      <line x1="4" y1="10" x2="16" y2="10" stroke="#4a9eff" strokeWidth="1" opacity="0.6" />
      {/* Center dot */}
      <circle cx="10" cy="10" r="2" fill="#4a9eff" opacity="0.8" />
    </svg>
  );
}

/**
 * Color: Color swatch (shows default color).
 */
function ColorViz({ value, size }: { value: { r: number; g: number; b: number; a: number }; size: number }) {
  // Convert to CSS rgba
  const { r, g, b, a } = value;
  const rgba = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-color"
      aria-label={`Color visualization (default: ${rgba})`}
    >
      {/* Checkerboard background for transparency */}
      <defs>
        <pattern id="checkerboard" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="4" height="4" fill="#222" />
          <rect x="4" y="0" width="4" height="4" fill="#333" />
          <rect x="0" y="4" width="4" height="4" fill="#333" />
          <rect x="4" y="4" width="4" height="4" fill="#222" />
        </pattern>
      </defs>

      {/* Background */}
      <rect x="2" y="2" width="16" height="16" fill="url(#checkerboard)" rx="2" />

      {/* Color swatch */}
      <rect x="2" y="2" width="16" height="16" fill={rgba} stroke="#333" strokeWidth="0.5" rx="2" />
    </svg>
  );
}

/**
 * Phase: Circular ring (static at 0°).
 */
function PhaseViz({ value, size }: { value: number; size: number }) {
  // Phase is [0, 1] - convert to angle
  const angle = value * 360;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-phase"
      aria-label={`Phase visualization (default: ${value.toFixed(3)})`}
    >
      {/* Outer ring */}
      <circle cx="10" cy="10" r="7" fill="none" stroke="#333" strokeWidth="1.5" />

      {/* Phase indicator (marker at 0° = top) */}
      <circle
        cx="10"
        cy="3"
        r="2"
        fill="#4a9eff"
        opacity="0.8"
        transform={`rotate(${angle} 10 10)`}
      />
    </svg>
  );
}

/**
 * Time: Clock icon (static).
 */
function TimeViz({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-time"
      aria-label="Time visualization"
    >
      {/* Clock face */}
      <circle cx="10" cy="10" r="7" fill="none" stroke="#4a9eff" strokeWidth="1.5" opacity="0.6" />

      {/* Hour hand (pointing to 12) */}
      <line x1="10" y1="10" x2="10" y2="6" stroke="#4a9eff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

      {/* Minute hand (pointing to 3) */}
      <line x1="10" y1="10" x2="14" y2="10" stroke="#4a9eff" strokeWidth="1" strokeLinecap="round" opacity="0.8" />

      {/* Center dot */}
      <circle cx="10" cy="10" r="1" fill="#4a9eff" />
    </svg>
  );
}

/**
 * Rate: Speed gauge icon (static).
 */
function RateViz({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-rate"
      aria-label="Rate visualization"
    >
      {/* Gauge arc */}
      <path
        d="M 4 14 A 6 6 0 0 1 16 14"
        fill="none"
        stroke="#333"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Needle (pointing to center/1x) */}
      <line
        x1="10"
        y1="14"
        x2="10"
        y2="8"
        stroke="#4a9eff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Center pivot */}
      <circle cx="10" cy="14" r="1.5" fill="#4a9eff" />
    </svg>
  );
}

/**
 * Trigger: Pulse LED (static, not blinking).
 */
function TriggerViz({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-trigger"
      aria-label="Trigger visualization"
    >
      {/* LED housing */}
      <circle cx="10" cy="10" r="6" fill="#1f1f1f" stroke="#333" strokeWidth="1" />

      {/* LED off state */}
      <circle cx="10" cy="10" r="3" fill="#444" opacity="0.5" />
    </svg>
  );
}

/**
 * Boolean: On/off indicator (static at default).
 */
function BooleanViz({ value, size }: { value: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-boolean"
      aria-label={`Boolean visualization (default: ${value})`}
    >
      {/* Toggle switch background */}
      <rect
        x="5"
        y="8"
        width="10"
        height="4"
        fill={value ? '#4a9eff' : '#333'}
        rx="2"
        opacity={value ? 0.8 : 0.5}
      />

      {/* Toggle knob */}
      <circle
        cx={value ? 13 : 7}
        cy="10"
        r="2.5"
        fill={value ? '#fff' : '#666'}
      />
    </svg>
  );
}

/**
 * Default fallback visualization.
 */
function DefaultViz({ domain, size }: { domain: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="bus-viz bus-viz-default"
      aria-label={`${domain} visualization`}
    >
      <rect x="4" y="4" width="12" height="12" fill="none" stroke="#4a9eff" strokeWidth="1" opacity="0.5" rx="2" />
      <text
        x="10"
        y="12"
        textAnchor="middle"
        fill="#4a9eff"
        fontSize="8"
        fontFamily="monospace"
        opacity="0.6"
      >
        ?
      </text>
    </svg>
  );
}
