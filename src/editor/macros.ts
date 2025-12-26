/**
 * Macro Expansion System
 *
 * Macros are "recipe starters" that expand into multiple blocks
 * with pre-wired connections. When a macro is dropped, the user sees all
 * the individual blocks - nothing is hidden.
 *
 * Think of it like a modular synth preset: you load it and see all the
 * modules and patch cables, ready to tweak.
 *
 * Macros can use both primitives and composites - they work exactly like
 * a user dragging blocks into the patch manually.
 */

import type { LaneKind } from './types';

/**
 * A block placement in a macro expansion.
 */
export interface MacroBlock {
  /** Temporary ID for wiring (not the final block ID) */
  ref: string;
  /** Block type to create */
  type: string;
  /** Which lane kind to place in */
  laneKind: LaneKind;
  /** Optional custom label */
  label?: string;
  /** Optional params override */
  params?: Record<string, unknown>;
}

/**
 * A connection in a macro expansion.
 * Uses ref IDs that map to MacroBlock.ref
 */
export interface MacroConnection {
  fromRef: string;
  fromSlot: string;
  toRef: string;
  toSlot: string;
}

/**
 * A bus publisher definition in a macro expansion.
 * Publishes a block output to a named bus.
 */
export interface MacroPublisher {
  /** Block ref that produces the value */
  fromRef: string;
  /** Output port name on that block */
  fromSlot: string;
  /** Bus name to publish to (e.g., 'phaseA') */
  busName: string;
}

/**
 * A bus listener definition in a macro expansion.
 * Subscribes a block input to a named bus.
 */
export interface MacroListener {
  /** Bus name to listen from */
  busName: string;
  /** Block ref that receives the value */
  toRef: string;
  /** Input port name on that block */
  toSlot: string;
  /** Optional lens to transform the bus value */
  lens?: {
    type: string;
    params: Record<string, unknown>;
  };
}

/**
 * A macro expansion definition.
 */
export interface MacroExpansion {
  /** Blocks to create */
  blocks: MacroBlock[];
  /** Connections to wire */
  connections: MacroConnection[];
  /** Bus publishers (optional) */
  publishers?: MacroPublisher[];
  /** Bus listeners (optional) */
  listeners?: MacroListener[];
}

/**
 * Registry of macro expansions.
 * Key is the block type that triggers expansion.
 */
export const MACRO_REGISTRY: Record<string, MacroExpansion> = {
  // =============================================================================
  // Quick Start Macros - Simple, guaranteed-to-work patterns
  // =============================================================================

  // 1. Simple Grid - Breathing grid with color cycling
  'macro:simpleGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 3000 } }, // Default 3s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathe',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Color Cycle',
        params: { base: '#3B82F6', hueSpan: 120, sat: 0.8, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid Domain',
        params: { rows: 10, cols: 10, spacing: 30, originX: 250, originY: 150 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 3 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 2. Animated Circle Ring - Circle layout with oscillating radius and rainbow colors
  'macro:animatedCircleRing': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Size Wave',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Rainbow',
        params: { base: '#FF0000', hueSpan: 360, sat: 0.9, light: 0.55 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 24, seed: 42 } },
      { ref: 'circle', type: 'PositionMapCircle', laneKind: 'Fields', label: 'Circle',
        params: { centerX: 400, centerY: 300, radius: 120 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'circle', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'circle', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 4 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 3. Line Wave - Line of dots with breathing size and color shift
  'macro:lineWave': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 4000 } },
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Wave',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Gradient',
        params: { base: '#00FFFF', hueSpan: 90, sat: 0.85, light: 0.5 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 20, seed: 99 } },
      { ref: 'line', type: 'PositionMapLine', laneKind: 'Fields', label: 'Line',
        params: { ax: 100, ay: 300, bx: 700, by: 300 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'line', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'line', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 12, offset: 4 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 4. Rainbow Grid - Grid with rainbow cycling and pulsing size
  // Uses FieldFromExpression + FieldStringToColor chain for per-element rainbow colors
  'macro:rainbowGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Pulse',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 12, cols: 12, spacing: 25, originX: 200, originY: 100 } },
      // Color generation: Expression → StringToColor → Render
      { ref: 'colorExpr', type: 'FieldFromExpression', laneKind: 'Fields', label: 'Rainbow Colors',
        params: { expression: 'hsl(i / n * 360 + signal * 360, 90, 60)' } },
      { ref: 'toColor', type: 'FieldStringToColor', laneKind: 'Fields', label: 'To Color' },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'colorExpr', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      // Color chain
      { fromRef: 'colorExpr', fromSlot: 'field', toRef: 'toColor', toSlot: 'strings' },
      { fromRef: 'toColor', fromSlot: 'colors', toRef: 'render', toSlot: 'color' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorExpr', toSlot: 'signal' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 8, offset: 3 } } },
    ],
  },

  // 5. Pulsing Grid - Grid with pulse-driven radius and warm colors
  'macro:pulsingGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '4 Pulses',
        params: { divisions: 4 } },
      { ref: 'envelope', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Pulse Env',
        params: { attack: 0.01, decay: 0.25, peak: 1.0 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Warm',
        params: { base: '#FF6B00', hueSpan: 60, sat: 0.9, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 8, cols: 8, spacing: 35, originX: 250, originY: 150 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'envelope', toSlot: 'trigger' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'envelope', fromSlot: 'env', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 8, offset: 3 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 6. Drifting Circle - Circle layout with jitter motion and cool colors
  'macro:driftingCircle': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathe',
        params: { shape: 'sine', amplitude: 0.4, bias: 0.6 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Cool Shift',
        params: { base: '#00AAFF', hueSpan: 90, sat: 0.8, light: 0.55 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 30, seed: 789 } },
      { ref: 'circle', type: 'PositionMapCircle', laneKind: 'Fields', label: 'Circle',
        params: { centerX: 400, centerY: 300, radius: 140 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Jitter Seed',
        params: { salt: 456 } },
      { ref: 'jitter', type: 'JitterFieldVec2', laneKind: 'Fields', label: 'Drift',
        params: { amount: 10, frequency: 1.2 } },
      { ref: 'posAdd', type: 'FieldAddVec2', laneKind: 'Fields', label: 'Add Drift' },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'circle', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'jitter', toSlot: 'idRand' },
      { fromRef: 'circle', fromSlot: 'pos', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'jitter', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 8, offset: 4 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 7. Multi-Ring - Multiple concentric circles with purple gradient
  'macro:multiRing': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Purple Shift',
        params: { base: '#9933FF', hueSpan: 60, sat: 0.85, light: 0.55 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 48, seed: 321 } },
      { ref: 'circleOuter', type: 'PositionMapCircle', laneKind: 'Fields', label: 'Outer Ring',
        params: { centerX: 400, centerY: 300, radius: 160 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Size Variation',
        params: { salt: 654 } },
      { ref: 'sizeField', type: 'FieldMapNumber', laneKind: 'Fields', label: 'Map Size',
        params: { fn: 'scale', k: 6, a: 3, b: 9 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'circleOuter', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'circleOuter', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'sizeField', toSlot: 'x' },
      { fromRef: 'sizeField', fromSlot: 'y', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 8. Breathing Line - Line with breathing animation and green tones
  'macro:breathingLine': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breath',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'shaper', type: 'Shaper', laneKind: 'Phase', label: 'Smooth',
        params: { kind: 'smoothstep', amount: 1.0 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Green Shift',
        params: { base: '#22C55E', hueSpan: 45, sat: 0.8, light: 0.5 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 25, seed: 111 } },
      { ref: 'line', type: 'PositionMapLine', laneKind: 'Fields', label: 'Line',
        params: { ax: 150, ay: 300, bx: 650, by: 300 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'osc', fromSlot: 'out', toRef: 'shaper', toSlot: 'in' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'line', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'line', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'shaper', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 12, offset: 3 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 9. Color Pulse - Grid with animated color and breathing size
  'macro:colorPulse': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathe',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Color Cycle',
        params: { base: '#00FFFF', hueSpan: 180, sat: 0.85, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 9, cols: 9, spacing: 32, originX: 220, originY: 120 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render',
        params: { opacity: 0.9 } },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 4 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 10. Rhythmic Dots - Grid with PulseDivider envelope and electric colors
  'macro:rhythmicDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '8 Beats',
        params: { divisions: 8 } },
      { ref: 'envelope', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Accent',
        params: { attack: 0.02, decay: 0.2, peak: 0.8 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Electric',
        params: { base: '#FF00FF', hueSpan: 120, sat: 0.9, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 10, cols: 10, spacing: 28, originX: 200, originY: 100 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'envelope', toSlot: 'trigger' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'envelope', fromSlot: 'env', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 5, offset: 2 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // =============================================================================
  // Slice Demo Macros - Existing macros (fixed and verified)
  // =============================================================================

  // Breathing Dots - Grid of dots with pulsing size and per-element rainbow colors
  // Uses FieldFromExpression + FieldStringToColor chain for Field<color> generation
  'macro:breathingDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Domain',
        params: { n: 25, seed: 42 } },
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid Layout',
        params: { rows: 5, cols: 5, spacing: 60, originX: 400, originY: 300, order: 'rowMajor' } },
      // Color generation chain: Expression → StringToColor → Render
      { ref: 'colorExpr', type: 'FieldFromExpression', laneKind: 'Fields', label: 'Rainbow Colors',
        params: { expression: 'hsl(i / n * 360 + signal * 360, 85, 55)' } },
      { ref: 'toColor', type: 'FieldStringToColor', laneKind: 'Fields', label: 'To Color' },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render Dots',
        params: { opacity: 0.9, glow: true, glowIntensity: 1.5 } },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'grid', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'colorExpr', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
      // Color chain
      { fromRef: 'colorExpr', fromSlot: 'field', toRef: 'toColor', toSlot: 'strings' },
      { fromRef: 'toColor', fromSlot: 'colors', toRef: 'render', toSlot: 'color' },
    ],
    publishers: [],
    listeners: [
      // FieldFromExpression auto-connects to phaseA via defaultBus
      { busName: 'phaseA', toRef: 'render', toSlot: 'radius',
        lens: { type: 'mapRange', params: { inMin: 0, inMax: 1, outMin: 3, outMax: 15 } } },
    ],
  },

  // Slice 1: Breathing Wave - Oscillator + Shaper for smooth breathing with teal color
  'macro:breathingWave': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathing Osc',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'shaper', type: 'Shaper', laneKind: 'Phase', label: 'Smooth Curve',
        params: { kind: 'smoothstep', amount: 1 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Teal Shift',
        params: { base: '#14B8A6', hueSpan: 45, sat: 0.8, light: 0.5 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 100, seed: 42 } },
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid',
        params: { rows: 10, cols: 10, spacing: 30, originX: 250, originY: 150 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Dots',
        params: { opacity: 0.9 } },
    ],
    connections: [
      { fromRef: 'osc', fromSlot: 'out', toRef: 'shaper', toSlot: 'in' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'grid', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'shaper', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 3 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 2: Rhythmic Pulse - PulseDivider + EnvelopeAD with red accent
  'macro:rhythmicPulse': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '4 Beats',
        params: { divisions: 4 } },
      { ref: 'envelope', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Accent Env',
        params: { attack: 0.02, decay: 0.3, peak: 1.0 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Red Pulse',
        params: { base: '#EF4444', hueSpan: 30, sat: 0.9, light: 0.55 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 64, seed: 123 } },
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid',
        params: { rows: 8, cols: 8, spacing: 40, originX: 200, originY: 100 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Pulses' },
    ],
    connections: [
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'envelope', toSlot: 'trigger' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'grid', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'envelope', fromSlot: 'env', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 2 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 3: Color Drift - ColorLFO for slow hue cycling with breathing radius
  'macro:colorDrift': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathe',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Color Cycle',
        params: { base: '#3B82F6', hueSpan: 180, sat: 0.8, light: 0.5 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 36, seed: 42 } },
      { ref: 'circle', type: 'PositionMapCircle', laneKind: 'Fields', label: 'Ring',
        params: { centerX: 400, centerY: 300, radius: 150 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Ring Dots',
        params: { opacity: 0.85 } },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'circle', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'circle', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 8, offset: 4 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 4: Stable Grid - GridDomain + StableIdHash with per-element color gradient
  'macro:stableGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathe',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid Domain',
        params: { rows: 10, cols: 10, spacing: 30, originX: 200, originY: 100 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'ID Hash',
        params: { salt: 42 } },
      { ref: 'colorize', type: 'FieldColorize', laneKind: 'Fields', label: 'Gradient',
        params: { colorA: '#3B82F6', colorB: '#EC4899', mode: 'lerp' } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Stable Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'colorize', toSlot: 'values' },
      { fromRef: 'colorize', fromSlot: 'colors', toRef: 'render', toSlot: 'color' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 8, offset: 3 } } },
    ],
  },

  // Slice 5: Phase Spread - FieldZipSignal for per-element phase offsets with gradient
  'macro:phaseSpread': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Wave',
        params: { shape: 'sine', amplitude: 1, bias: 0 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Sunset',
        params: { base: '#F59E0B', hueSpan: 60, sat: 0.9, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 8, cols: 8, spacing: 40, originX: 200, originY: 100 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Per-Element Random',
        params: { salt: 123 } },
      { ref: 'broadcast', type: 'FieldFromSignalBroadcast', laneKind: 'Fields', label: 'Broadcast Phase' },
      { ref: 'zip', type: 'FieldZipSignal', laneKind: 'Fields', label: 'Phase + Offset',
        params: { fn: 'add' } },
      { ref: 'baseRadius', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Base Radius',
        params: { value: 8 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Spread Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'broadcast', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'baseRadius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'zip', toSlot: 'field' },
      { fromRef: 'osc', fromSlot: 'out', toRef: 'broadcast', toSlot: 'signal' },
      { fromRef: 'broadcast', fromSlot: 'field', toRef: 'zip', toSlot: 'signal' },
      { fromRef: 'baseRadius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'render', toSlot: 'opacity',
        lens: { type: 'scale', params: { scale: 1, offset: 0.3 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 6: Drifting Dots - JitterFieldVec2 + FieldAddVec2 with indigo colors
  'macro:driftingDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Indigo Drift',
        params: { base: '#6366F1', hueSpan: 45, sat: 0.8, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 10, cols: 10, spacing: 35, originX: 200, originY: 100 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Jitter Seed',
        params: { salt: 789 } },
      { ref: 'jitter', type: 'JitterFieldVec2', laneKind: 'Fields', label: 'Position Drift',
        params: { amount: 8, frequency: 1 } },
      { ref: 'posAdd', type: 'FieldAddVec2', laneKind: 'Fields', label: 'Combined Position' },
      { ref: 'radius', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Radius',
        params: { value: 6 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Drifting Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'radius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'jitter', toSlot: 'idRand' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'jitter', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 7: Styled Elements - FieldColorize + FieldOpacity for visual variety
  'macro:styledElements': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 8, cols: 8, spacing: 45, originX: 200, originY: 100 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Random Values',
        params: { salt: 456 } },
      { ref: 'colorize', type: 'FieldColorize', laneKind: 'Fields', label: 'Color Gradient',
        params: { colorA: '#3B82F6', colorB: '#EF4444', mode: 'lerp' } },
      { ref: 'opacity', type: 'FieldOpacity', laneKind: 'Fields', label: 'Opacity Fade',
        params: { min: 0.3, max: 1.0, curve: 'smoothstep' } },
      { ref: 'radius', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Radius',
        params: { value: 10 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Styled Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'radius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'colorize', toSlot: 'values' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'opacity', toSlot: 'values' },
      { fromRef: 'colorize', fromSlot: 'colors', toRef: 'render', toSlot: 'color' },
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
  },

  // Slice 8: Responsive Grid - ViewportInfo with breathing animation and cyan colors
  'macro:responsiveGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathe',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Cyan Shift',
        params: { base: '#06B6D4', hueSpan: 45, sat: 0.85, light: 0.5 } },
      { ref: 'viewport', type: 'ViewportInfo', laneKind: 'Scene', label: 'Viewport' },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Centered Grid',
        params: { rows: 6, cols: 6, spacing: 50, originX: 400, originY: 300 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Centered Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'osc', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 5 } } },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 9: Golden Patch - Complete Breathing Constellation
  'macro:goldenPatch': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
      // Breathing energy (Slice 1)
      { ref: 'breathOsc', type: 'Oscillator', laneKind: 'Phase', label: 'Breath Osc',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'breathShape', type: 'Shaper', laneKind: 'Phase', label: 'Breath Curve',
        params: { kind: 'smoothstep', amount: 1 } },
      // Rhythmic accents (Slice 2)
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '8 Beats',
        params: { divisions: 8 } },
      { ref: 'accentEnv', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Accent',
        params: { attack: 0.01, decay: 0.18, peak: 0.65 } },
      // Energy combination
      { ref: 'energyAdd', type: 'AddSignal', laneKind: 'Phase', label: 'Total Energy' },
      // Color (Slice 3)
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Palette',
        params: { base: '#3B82F6', hueSpan: 120, sat: 0.7, light: 0.5 } },
      // Grid domain (Slice 4)
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: '20x20 Grid',
        params: { rows: 20, cols: 20, spacing: 22, originX: 200, originY: 100 } },
      { ref: 'idHash', type: 'StableIdHash', laneKind: 'Fields', label: 'Phase Offset Hash',
        params: { salt: 42 } },
      { ref: 'jitterHash', type: 'StableIdHash', laneKind: 'Fields', label: 'Jitter Hash',
        params: { salt: 12345 } },
      // Position drift (Slice 6)
      { ref: 'jitter', type: 'JitterFieldVec2', laneKind: 'Fields', label: 'Drift',
        params: { amount: 3, frequency: 0.5 } },
      { ref: 'posAdd', type: 'FieldAddVec2', laneKind: 'Fields', label: 'Final Position' },
      // Radius field
      { ref: 'radius', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Base Radius',
        params: { value: 4 } },
      // Render
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Breathing Dots',
        params: { opacity: 0.85 } },
    ],
    connections: [
      // Breathing energy chain
      { fromRef: 'breathOsc', fromSlot: 'out', toRef: 'breathShape', toSlot: 'in' },
      // Rhythmic accent chain
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'accentEnv', toSlot: 'trigger' },
      // Combine energies
      { fromRef: 'breathShape', fromSlot: 'out', toRef: 'energyAdd', toSlot: 'a' },
      { fromRef: 'accentEnv', fromSlot: 'env', toRef: 'energyAdd', toSlot: 'b' },
      // Domain chains
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'idHash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'jitterHash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'radius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      // Position chain
      { fromRef: 'jitterHash', fromSlot: 'u01', toRef: 'jitter', toSlot: 'idRand' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },
      // Radius
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'energyAdd', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'breathOsc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'jitter', toSlot: 'phase' },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 11. Full Showcase - Demonstrates multiple animated properties
  'macro:fullShowcase': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle for golden patch
      // Domain
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 15, cols: 15, spacing: 30, originX: 120, originY: 50 } },
      { ref: 'idHash', type: 'StableIdHash', laneKind: 'Fields', label: 'Per-Element ID',
        params: { salt: 42 } },

      // Color Animation
      { ref: 'colorOsc', type: 'Oscillator', laneKind: 'Phase', label: 'Color Wave',
        params: { shape: 'sine', frequency: 0.1 } },
      { ref: 'broadcastPhase', type: 'FieldFromSignalBroadcast', laneKind: 'Fields', label: 'Broadcast Color Phase'},
      { ref: 'colorPhase', type: 'FieldZipNumber', laneKind: 'Fields', label: 'Add Color Offset', params: { op: 'add' } },
      { ref: 'colorize', type: 'FieldColorize', laneKind: 'Fields', label: 'Gradient',
        params: { colorA: '#ff00ff', colorB: '#00ffff' } },

      // Position Animation (Swirl)
      { ref: 'swirlJitter', type: 'JitterFieldVec2', laneKind: 'Fields', label: 'Swirl Motion',
        params: { amount: 25, frequency: 0.25 } },
      { ref: 'posAdd', type: 'FieldAddVec2', laneKind: 'Fields', label: 'Add Swirl' },

      // Size Animation
      { ref: 'sizeOsc', type: 'Oscillator', laneKind: 'Phase', label: 'Size Wave',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5, frequency: 0.3 } },

      // Opacity Animation
      { ref: 'opacityOsc', type: 'Oscillator', laneKind: 'Phase', label: 'Opacity Wave',
        params: { shape: 'triangle', frequency: 0.5, amplitude: 0.4, bias: 0.5 } },

      // Renderer
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Showcase Render' },
    ],
    connections: [
      // Domain plumbing
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'idHash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'broadcastPhase', toSlot: 'domain' },
      // { fromRef: 'grid', fromSlot: 'domain', toRef: 'swirlJitter', toSlot: 'domain' }, // Removed invalid connection
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },

      // Color chain
      { fromRef: 'colorOsc', fromSlot: 'out', toRef: 'broadcastPhase', toSlot: 'signal' },
      { fromRef: 'broadcastPhase', fromSlot: 'field', toRef: 'colorPhase', toSlot: 'a' },
      { fromRef: 'idHash', fromSlot: 'u01', toRef: 'colorPhase', toSlot: 'b' },
      { fromRef: 'colorPhase', fromSlot: 'out', toRef: 'colorize', toSlot: 'values' },
      { fromRef: 'colorize', fromSlot: 'colors', toRef: 'render', toSlot: 'color' },

      // Position chain
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'idHash', fromSlot: 'u01', toRef: 'swirlJitter', toSlot: 'idRand' }, // THIS IS THE ORIGINAL WRITER
      { fromRef: 'swirlJitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },

      // Opacity (direct wire)
      { fromRef: 'opacityOsc', fromSlot: 'out', toRef: 'render', toSlot: 'opacity' },
    ],
    publishers: [
      // Use energy bus for size
      { fromRef: 'sizeOsc', fromSlot: 'out', busName: 'energy' },
    ],
    listeners: [
      // PhaseA drives all oscillators
      { busName: 'phaseA', toRef: 'colorOsc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'swirlJitter', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'sizeOsc', toSlot: 'phase' },
      { busName: 'phaseA', toRef: 'opacityOsc', toSlot: 'phase' },

      // Connect render radius to energy bus
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 2 } } },
    ],
  },
};

/**
 * Check if a block type with given params should trigger macro expansion.
 * Returns the macro key if expansion should happen, null otherwise.
 */
export function getMacroKey(blockType: string, _params?: Record<string, unknown>): string | null {
  // Direct macro type from palette (e.g., 'macro:breathingDots')
  if (blockType.startsWith('macro:')) {
    if (blockType in MACRO_REGISTRY) {
      return blockType;
    }
  }

  return null;
}

/**
 * Get macro expansion for a given key.
 */
export function getMacroExpansion(key: string): MacroExpansion | null {
  return MACRO_REGISTRY[key] ?? null;
}

/**
 * Get all registered macro keys.
 */
export function getAllMacroKeys(): string[] {
  return Object.keys(MACRO_REGISTRY);
}

/**
 * Get a display name for a macro key.
 * Converts 'macro:breathingDots' to 'Breathing Dots'.
 */
export function getMacroDisplayName(key: string): string {
  // Remove 'macro:' prefix
  const name = key.replace(/^macro:/, '');
  // Convert camelCase to Title Case with spaces
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
