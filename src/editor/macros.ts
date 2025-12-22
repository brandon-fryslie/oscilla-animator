/**
 * Macro Expansion System
 *
 * Macros are "recipe starters" that expand into multiple primitive blocks
 * with pre-wired connections. When a macro is dropped, the user sees all
 * the individual blocks - nothing is hidden.
 *
 * Think of it like a modular synth preset: you load it and see all the
 * modules and patch cables, ready to tweak.
 *
 * ALL MACROS USE ONLY PRIMITIVE BLOCKS - no composites.
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
    type: LensType;
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

  // 1. Simple Grid - Just GridDomain + RenderInstances2D
  'macro:simpleGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 3000 } }, // Default 3s cycle
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid Domain',
        params: { rows: 10, cols: 10, spacing: 30, originX: 250, originY: 150 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
  },

  // 2. Animated Circle Ring - Circle layout with oscillating radius
  'macro:animatedCircleRing': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Size Wave',
        params: { shape: 'sine', amplitude: 0.5, bias: 0.5 } },
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
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 4 } } },
    ],
  },

  // 3. Line Wave - Line of dots with phase-offset oscillation
  'macro:lineWave': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Wave',
        params: { shape: 'sine', amplitude: 20, bias: 0 } },
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 20, seed: 99 } },
      { ref: 'line', type: 'PositionMapLine', laneKind: 'Fields', label: 'Line',
        params: { ax: 100, ay: 300, bx: 700, by: 300 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Phase Offset',
        params: { salt: 123 } },
      { ref: 'offsetField', type: 'FieldMapNumber', laneKind: 'Fields', label: 'Scale Offset',
        params: { fn: 'scale', k: 6.28 } }, // 2*PI for full wave
      { ref: 'broadcast', type: 'FieldFromSignalBroadcast', laneKind: 'Fields', label: 'Broadcast Phase' },
      { ref: 'zip', type: 'FieldZipNumber', laneKind: 'Fields', label: 'Add Offset',
        params: { op: 'add' } },
      { ref: 'toVec', type: 'FieldMapNumber', laneKind: 'Fields', label: 'Sin Wave',
        params: { fn: 'sin' } },
      { ref: 'vecScale', type: 'FieldMapNumber', laneKind: 'Fields', label: 'Scale Y',
        params: { fn: 'scale', k: 30 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'line', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'broadcast', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'line', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'offsetField', toSlot: 'x' },
      { fromRef: 'osc', fromSlot: 'out', toRef: 'broadcast', toSlot: 'signal' },
      { fromRef: 'broadcast', fromSlot: 'field', toRef: 'zip', toSlot: 'a' },
      { fromRef: 'offsetField', fromSlot: 'y', toRef: 'zip', toSlot: 'b' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
    ],
  },

  // 4. Rainbow Grid - Grid with per-element color variation
  'macro:rainbowGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Rainbow',
        params: { base: '#FF0000', hueSpan: 360, sat: 0.9, light: 0.6 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 12, cols: 12, spacing: 25, originX: 200, originY: 100 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
    ],
  },

  // 5. Pulsing Grid - Grid with pulse-driven radius
  'macro:pulsingGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '4 Pulses',
        params: { divisions: 4 } },
      { ref: 'envelope', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Pulse Env',
        params: { attack: 0.01, decay: 0.25, peak: 1.0 } },
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
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 8, offset: 3 } } },
    ],
  },

  // 6. Drifting Circle - Circle layout with jitter motion
  'macro:driftingCircle': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
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
    listeners: [
      { busName: 'phaseA', toRef: 'jitter', toSlot: 'phase' },
    ],
  },

  // 7. Multi-Ring - Multiple concentric circles
  'macro:multiRing': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 48, seed: 321 } },
      { ref: 'circleInner', type: 'PositionMapCircle', laneKind: 'Fields', label: 'Inner Ring',
        params: { centerX: 400, centerY: 300, radius: 80 } },
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
  },

  // 8. Breathing Line - Line with breathing animation
  'macro:breathingLine': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breath',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5 } },
      { ref: 'shaper', type: 'Shaper', laneKind: 'Phase', label: 'Smooth',
        params: { kind: 'smoothstep', amount: 1.0 } },
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
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 12, offset: 3 } } },
    ],
  },

  // 9. Color Pulse - Grid with animated color from ColorLFO
  'macro:colorPulse': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Color Cycle',
        params: { base: '#00FFFF', hueSpan: 180, sat: 0.85, light: 0.55 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 9, cols: 9, spacing: 32, originX: 220, originY: 120 } },
      { ref: 'radius', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Size',
        params: { value: 7 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render',
        params: { opacity: 0.9 } },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'radius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
    ],
  },

  // 10. Rhythmic Dots - Grid with PulseDivider envelope
  'macro:rhythmicDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '8 Beats',
        params: { divisions: 8 } },
      { ref: 'envelope', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Accent',
        params: { attack: 0.02, decay: 0.2, peak: 0.8 } },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid',
        params: { rows: 10, cols: 10, spacing: 28, originX: 200, originY: 100 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'Per-Element Random',
        params: { salt: 999 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render' },
    ],
    connections: [
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'envelope', toSlot: 'trigger' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'envelope', fromSlot: 'env', busName: 'energy' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 5, offset: 2 } } },
    ],
  },

  // =============================================================================
  // Slice Demo Macros - Existing macros (fixed and verified)
  // =============================================================================

  // Breathing Dots - Grid of dots with pulsing size animation
  // Uses bus routing: phaseA bus -> RenderInstances2D radius (with mapRange lens)
  'macro:breathingDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
      // Domain source - creates N elements with sequential IDs
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Domain',
        params: { n: 25, seed: 42 } },

      // Position layout - arranges elements in a grid
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid Layout',
        params: { rows: 5, cols: 5, spacing: 60, originX: 400, originY: 300, order: 'rowMajor' } },

      // Renderer - turns domain + positions into circles (radius driven by bus)
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render Dots',
        params: { opacity: 0.9, glow: true, glowIntensity: 1.5 } },
    ],
    connections: [
      // Wire domain to grid layout
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'grid', toSlot: 'domain' },
      // Wire domain and positions to renderer
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    listeners: [
      // Listen on RenderInstances2D's radius input from phaseA bus
      // Apply mapRange lens: explicit mapping of phase [0,1] to radius [3,15]px
      {
        busName: 'phaseA',
        toRef: 'render',
        toSlot: 'radius',
        lens: { type: 'mapRange', params: { inMin: 0, inMax: 1, outMin: 3, outMax: 15 } },
      },
    ],
  },

  // Slice 1: Breathing Wave - Oscillator + Shaper for smooth breathing
  'macro:breathingWave': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      // Oscillator generates wave from phase
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathing Osc',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5 } },
      // Shaper smooths the curve
      { ref: 'shaper', type: 'Shaper', laneKind: 'Phase', label: 'Smooth Curve',
        params: { kind: 'smoothstep', amount: 1 } },
      // Domain for dots
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Elements',
        params: { n: 100, seed: 42 } },
      // Grid layout
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid',
        params: { rows: 10, cols: 10, spacing: 30, originX: 250, originY: 150 } },
      // Renderer
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
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 3 } } },
    ],
  },

  // Slice 2: Rhythmic Pulse - PulseDivider + EnvelopeAD for accents
  'macro:rhythmicPulse': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '8 Beats',
        params: { divisions: 4 } },
      { ref: 'envelope', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Accent Env',
        params: { attack: 0.02, decay: 0.3, peak: 1.0 } },
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
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'divider', toSlot: 'phase' },
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 2 } } },
    ],
  },

  // Slice 3: Color Drift - ColorLFO for slow hue cycling
  'macro:colorDrift': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
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
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
    listeners: [
      { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
      { busName: 'palette', toRef: 'render', toSlot: 'color' },
    ],
  },

  // Slice 4: Stable Grid - GridDomain + StableIdHash for determinism
  'macro:stableGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Grid Domain',
        params: { rows: 10, cols: 10, spacing: 30, originX: 200, originY: 100 } },
      { ref: 'hash', type: 'StableIdHash', laneKind: 'Fields', label: 'ID Hash',
        params: { salt: 42 } },
      { ref: 'sizeConst', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Base Size',
        params: { value: 5 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Stable Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'sizeConst', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'sizeConst', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
  },

  // Slice 5: Phase Spread - FieldZipSignal for per-element phase offsets
  'macro:phaseSpread': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Wave',
        params: { shape: 'sine', amplitude: 1, bias: 0 } },
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
    listeners: [
      { busName: 'phaseA', toRef: 'osc', toSlot: 'phase' },
      {
        busName: 'phaseA',
        toRef: 'render',
        toSlot: 'opacity',
        lens: { type: 'offset', params: { amount: 0.3 } },
      },
    ],
  },

  // Slice 6: Drifting Dots - JitterFieldVec2 + FieldAddVec2 for position animation
  'macro:driftingDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 8000 } }, // Default 8s cycle
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
    listeners: [
      { busName: 'phaseA', toRef: 'jitter', toSlot: 'phase' },
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

  // Slice 8: Responsive Grid - ViewportInfo for centered layouts
  'macro:responsiveGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: 'Time',
        params: { periodMs: 5000 } }, // Default 5s cycle
      { ref: 'viewport', type: 'ViewportInfo', laneKind: 'Scene', label: 'Viewport' },
      { ref: 'grid', type: 'GridDomain', laneKind: 'Fields', label: 'Centered Grid',
        params: { rows: 6, cols: 6, spacing: 50, originX: 400, originY: 300 } },
      { ref: 'radius', type: 'FieldConstNumber', laneKind: 'Fields', label: 'Radius',
        params: { value: 12 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Centered Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'radius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
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
