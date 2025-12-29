/**
 * Debug System Types
 *
 * Core type definitions for runtime debugging and value inspection.
 *
 * Aligned with design-docs/11-Debugger/3-NonTech-LowLevel.md
 *
 * Key concepts:
 * - ValueSummary: Uniform, low-allocation representation of runtime values
 * - Probe: A debug attachment point (block, bus, binding)
 * - Sample: A timestamped value snapshot from a probe
 */

// =============================================================================
// Value Summary Types
// =============================================================================

/**
 * ValueSummary is a tagged union for efficient, uniform value representation.
 * Uses number-based storage for minimal allocation during sampling.
 */
export type ValueSummary =
  | { t: 'num'; v: number }
  | { t: 'phase'; v: number }           // 0..1 normalized
  | { t: 'bool'; v: boolean }
  | { t: 'color'; v: number }           // Packed RGBA as u32
  | { t: 'vec2'; x: number; y: number }
  | { t: 'trigger'; fired: boolean }
  | { t: 'none' }                       // Field or unknown type
  | { t: 'err'; code: 'nan' | 'inf' | 'unknown' };

/**
 * Create a ValueSummary from a runtime value based on artifact kind.
 */
export function summarize(kind: string, value: unknown): ValueSummary {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return { t: 'none' };
  }

  // Phase signals
  if (kind === 'Signal:phase') {
    const num = typeof value === 'number' ? value : 0;
    if (Number.isNaN(num)) return { t: 'err', code: 'nan' };
    if (!Number.isFinite(num)) return { t: 'err', code: 'inf' };
    return { t: 'phase', v: num };
  }

  // Number signals
  if (kind === 'Signal:float' || kind === 'Signal:Time') {
    const num = typeof value === 'number' ? value : 0;
    if (Number.isNaN(num)) return { t: 'err', code: 'nan' };
    if (!Number.isFinite(num)) return { t: 'err', code: 'inf' };
    return { t: 'num', v: num };
  }

  // Boolean
  if (kind === 'Signal:bool') {
    return { t: 'bool', v: Boolean(value) };
  }

  // Events/triggers
  if (kind === 'Event') {
    return { t: 'trigger', fired: Boolean(value) };
  }

  // Fields always summarize as none (can't snapshot efficiently)
  if (kind.startsWith('Field:')) {
    return { t: 'none' };
  }

  // Color - pack as u32
  if (kind === 'Signal:color' && Array.isArray(value)) {
    const [r, g, b, a = 1] = value as number[];
    const packed = (
      ((Math.round((r ?? 0) * 255) & 0xff) << 24) |
      ((Math.round((g ?? 0) * 255) & 0xff) << 16) |
      ((Math.round((b ?? 0) * 255) & 0xff) << 8) |
      (Math.round((a ?? 1) * 255) & 0xff)
    ) >>> 0;
    return { t: 'color', v: packed };
  }

  // Vec2
  if (kind === 'Signal:vec2' && typeof value === 'object' && value !== null) {
    const vec = value as { x?: number; y?: number };
    return { t: 'vec2', x: vec.x ?? 0, y: vec.y ?? 0 };
  }

  // Default: try to extract a number
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { t: 'err', code: 'nan' };
    if (!Number.isFinite(value)) return { t: 'err', code: 'inf' };
    return { t: 'num', v: value };
  }

  return { t: 'none' };
}

/**
 * Format a ValueSummary for display.
 */
export function formatValueSummary(summary: ValueSummary): string {
  switch (summary.t) {
    case 'num':
      return summary.v.toFixed(4);
    case 'phase':
      return `${(summary.v * 100).toFixed(1)}%`;
    case 'bool':
      return summary.v ? 'true' : 'false';
    case 'color': {
      const r = (summary.v >>> 24) & 0xff;
      const g = (summary.v >>> 16) & 0xff;
      const b = (summary.v >>> 8) & 0xff;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    case 'vec2':
      return `(${summary.x.toFixed(2)}, ${summary.y.toFixed(2)})`;
    case 'trigger':
      return summary.fired ? 'fired' : 'idle';
    case 'none':
      return '—';
    case 'err':
      return summary.code === 'nan' ? 'NaN' : summary.code === 'inf' ? '∞' : '?';
  }
}

/**
 * Get a numeric value from a summary for visualization (meters, sparklines).
 * Returns null for non-numeric types.
 */
export function getNumericValue(summary: ValueSummary): number | null {
  switch (summary.t) {
    case 'num':
    case 'phase':
      return summary.v;
    case 'bool':
      return summary.v ? 1 : 0;
    case 'trigger':
      return summary.fired ? 1 : 0;
    default:
      return null;
  }
}

// =============================================================================
// Probe Types
// =============================================================================

/**
 * ProbeTarget identifies what is being probed.
 */
export type ProbeTarget =
  | { kind: 'block'; blockId: string }
  | { kind: 'bus'; busId: string }
  | { kind: 'binding'; bindingId: string; direction: 'publish' | 'subscribe' };

/**
 * A Sample is a timestamped value snapshot.
 */
export interface Sample {
  /** Real timestamp (Date.now()) */
  timestamp: number;
  /** Animation time when sampled */
  tMs: number;
  /** The sampled value */
  value: ValueSummary;
}

/**
 * A Probe represents an active debug attachment.
 */
export interface Probe {
  /** Unique probe ID */
  id: string;
  /** What we're probing */
  target: ProbeTarget;
  /** Human-readable label */
  label: string;
  /** Artifact kind (e.g., 'Signal:phase') */
  artifactKind: string;
  /** Block type if probing a block */
  blockType?: string;
  /** Most recent sample */
  currentSample?: Sample;
  /** Historical samples (ring buffer) */
  history: Sample[];
  /** Max history length */
  historyCapacity: number;
  /** Whether this probe is active */
  active: boolean;
  /** Auto-assigned position for overlay display */
  position: { x: number; y: number };
}

/**
 * Create a probe ID from a target.
 */
export function createProbeId(target: ProbeTarget): string {
  switch (target.kind) {
    case 'block':
      return `probe:block:${target.blockId}`;
    case 'bus':
      return `probe:bus:${target.busId}`;
    case 'binding':
      return `probe:binding:${target.bindingId}:${target.direction}`;
  }
}

// =============================================================================
// Debug State Types
// =============================================================================

/**
 * DebugLevel controls what gets sampled.
 */
export type DebugLevel = 'off' | 'basic' | 'trace' | 'full';

/**
 * Overview status for the Debug HUD.
 */
export interface DebugOverview {
  /** Time mode: finite/cyclic/infinite */
  timeMode: 'finite' | 'cyclic' | 'infinite' | 'unknown';
  /** TimeRoot period if cyclic */
  period?: number;
  /** Current health status */
  health: 'ok' | 'warn' | 'error';
  /** Active probe count */
  probeCount: number;
  /** Blocks being debugged */
  debuggedBlockIds: string[];
}
