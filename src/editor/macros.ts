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
 * Legacy macros have been archived to .agent_planning/LEGACY-BLOCKS-ARCHIVE.md
 */

import type { LaneKind, LensType } from './types';

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
  // Domain-Based Macros (New System)
  // =============================================================================

  // Breathing Dots - Grid of dots with pulsing size animation
  // Uses bus routing: PhaseClock -> phaseA bus -> RenderInstances2D radius (with scale lens)
  'macro:breathingDots': {
    blocks: [
      // Domain source - creates N elements with sequential IDs
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Domain',
        params: { n: 25, seed: 42 } },

      // Position layout - arranges elements in a grid
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid Layout',
        params: { rows: 5, cols: 5, spacing: 60, originX: 400, originY: 300, order: 'row-major' } },

      // Phase clock - drives the breathing animation (0->1 over 2 seconds, looping)
      { ref: 'clock', type: 'PhaseClockLegacy', laneKind: 'Phase', label: 'Breathing Clock',
        params: { duration: 2, mode: 'pingpong', offset: 0 } },

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
    // Bus routing: phase signal -> radius animation
    publishers: [
      // Publish PhaseClock's phase output to the phaseA bus
      { fromRef: 'clock', fromSlot: 'phase', busName: 'phaseA' },
    ],
    listeners: [
      // Listen on RenderInstances2D's radius input from phaseA bus
      // Apply scale lens: phase 0-1 -> radius 3-15 (scale=12, offset=3)
      {
        busName: 'phaseA',
        toRef: 'render',
        toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 12, offset: 3 } },
      },
    ],
  },

  // =============================================================================
  // Slice Demo Macros - Demonstrate new block capabilities
  // =============================================================================

  // Slice 1: Breathing Wave - Oscillator + Shaper for smooth breathing
  'macro:breathingWave': {
    blocks: [
      // Time source
      { ref: 'timeRoot', type: 'CycleTimeRoot', laneKind: 'Phase', label: '8s Loop',
        params: { periodMs: 8000, mode: 'loop' } },
      // Oscillator generates wave from phase
      { ref: 'osc', type: 'Oscillator', laneKind: 'Phase', label: 'Breathing Osc',
        params: { shape: 'cosine', amplitude: 0.5, bias: 0.5 } },
      // Shaper smooths the curve
      { ref: 'shaper', type: 'Shaper', laneKind: 'Phase', label: 'Smooth Curve',
        params: { kind: 'smoothstep', amount: 1 } },
      // Add signals together
      { ref: 'add', type: 'AddSignal', laneKind: 'Phase', label: 'Energy Sum' },
      // Multiply for amplitude control
      { ref: 'mul', type: 'MulSignal', laneKind: 'Phase', label: 'Amplitude' },
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
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'osc', toSlot: 'phase' },
      { fromRef: 'osc', fromSlot: 'out', toRef: 'shaper', toSlot: 'in' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'grid', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'timeRoot', fromSlot: 'phase', busName: 'phaseA' },
      { fromRef: 'shaper', fromSlot: 'out', busName: 'energy' },
    ],
    listeners: [
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 10, offset: 3 } } },
    ],
  },

  // Slice 2: Rhythmic Pulse - PulseDivider + EnvelopeAD for accents
  'macro:rhythmicPulse': {
    blocks: [
      { ref: 'timeRoot', type: 'CycleTimeRoot', laneKind: 'Phase', label: '4s Loop',
        params: { periodMs: 4000, mode: 'loop' } },
      { ref: 'divider', type: 'PulseDivider', laneKind: 'Phase', label: '4 Beats',
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
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'divider', toSlot: 'phase' },
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'envelope', toSlot: 'trigger' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'grid', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'timeRoot', fromSlot: 'phase', busName: 'phaseA' },
      { fromRef: 'envelope', fromSlot: 'env', busName: 'energy' },
    ],
    listeners: [
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 15, offset: 5 } } },
    ],
  },

  // Slice 3: Color Drift - ColorLFO for slow hue cycling
  'macro:colorDrift': {
    blocks: [
      { ref: 'timeRoot', type: 'CycleTimeRoot', laneKind: 'Phase', label: '16s Phrase',
        params: { periodMs: 16000, mode: 'loop' } },
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
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'colorLfo', toSlot: 'phase' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'circle', toSlot: 'domain' },
      { fromRef: 'domain', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'circle', fromSlot: 'pos', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
  },

  // Slice 4: Stable Grid - GridDomain + StableIdHash for determinism
  'macro:stableGrid': {
    blocks: [
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
      { ref: 'timeRoot', type: 'CycleTimeRoot', laneKind: 'Phase', label: '4s Loop',
        params: { periodMs: 4000, mode: 'loop' } },
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
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'osc', toSlot: 'phase' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'hash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'broadcast', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'baseRadius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'hash', fromSlot: 'u01', toRef: 'zip', toSlot: 'field' },
      { fromRef: 'osc', fromSlot: 'out', toRef: 'zip', toSlot: 'signal' },
      { fromRef: 'baseRadius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'timeRoot', fromSlot: 'phase', busName: 'phaseA' },
    ],
  },

  // Slice 6: Drifting Dots - JitterFieldVec2 + FieldAddVec2 for position animation
  'macro:driftingDots': {
    blocks: [
      { ref: 'timeRoot', type: 'CycleTimeRoot', laneKind: 'Phase', label: '8s Loop',
        params: { periodMs: 8000, mode: 'loop' } },
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
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'jitter', toSlot: 'phase' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'timeRoot', fromSlot: 'phase', busName: 'phaseA' },
    ],
  },

  // Slice 7: Styled Elements - FieldColorize + FieldOpacity for visual variety
  'macro:styledElements': {
    blocks: [
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
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
  },

  // Slice 8: Responsive Grid - ViewportInfo for centered layouts
  'macro:responsiveGrid': {
    blocks: [
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
      // Time sources
      { ref: 'timeRoot', type: 'CycleTimeRoot', laneKind: 'Phase', label: '8s Main Loop',
        params: { periodMs: 8000, mode: 'loop' } },
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
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'breathOsc', toSlot: 'phase' },
      { fromRef: 'breathOsc', fromSlot: 'out', toRef: 'breathShape', toSlot: 'in' },
      // Rhythmic accent chain
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'divider', toSlot: 'phase' },
      { fromRef: 'divider', fromSlot: 'tick', toRef: 'accentEnv', toSlot: 'trigger' },
      // Combine energies
      { fromRef: 'breathShape', fromSlot: 'out', toRef: 'energyAdd', toSlot: 'a' },
      { fromRef: 'accentEnv', fromSlot: 'env', toRef: 'energyAdd', toSlot: 'b' },
      // Color from slow phase
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'colorLfo', toSlot: 'phase' },
      // Domain chains
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'idHash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'jitterHash', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'radius', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      // Position chain
      { fromRef: 'jitterHash', fromSlot: 'u01', toRef: 'jitter', toSlot: 'idRand' },
      { fromRef: 'timeRoot', fromSlot: 'phase', toRef: 'jitter', toSlot: 'phase' },
      { fromRef: 'grid', fromSlot: 'pos0', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },
      // Radius
      { fromRef: 'radius', fromSlot: 'out', toRef: 'render', toSlot: 'radius' },
    ],
    publishers: [
      { fromRef: 'timeRoot', fromSlot: 'phase', busName: 'phaseA' },
      { fromRef: 'timeRoot', fromSlot: 'wrap', busName: 'pulse' },
      { fromRef: 'energyAdd', fromSlot: 'out', busName: 'energy' },
      { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
    ],
  },

  // =============================================================================
  // Composite Demo Macros - Use new composites from signal-composites.ts & domain-composites.ts
  // =============================================================================

  // 1. Rotating Grid - Uses RotationScatter composite
  'macro:rotatingGrid': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: '4s Loop',
        params: { periodMs: 4000 } },
      { ref: 'grid', type: 'GridPoints', laneKind: 'Fields', label: 'Grid Points',
        params: { count: 64, seed: 42, rows: 8, cols: 8, spacing: 45, originX: 250, originY: 150 } },
      { ref: 'rotation', type: 'RotationScatter', laneKind: 'Fields', label: 'Rotation Variation',
        params: { seed: 100, amount: 1.0 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Rotating Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'rotation', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'rotation', fromSlot: 'rotation', toRef: 'render', toSlot: 'rotation' },
    ],
    publishers: [
      { fromRef: 'time', fromSlot: 'phase', busName: 'phaseA' },
    ],
  },

  // 2. Breathing Pulse - Uses BreathingScale composite (bus-driven)
  'macro:breathingPulse': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: '3s Breath',
        params: { periodMs: 3000 } },
      { ref: 'breathing', type: 'BreathingScale', laneKind: 'Phase', label: 'Breathing Energy',
        params: { curve: 'cosine', range: 10, min: 3 } },
      { ref: 'grid', type: 'GridPoints', laneKind: 'Fields', label: 'Grid',
        params: { count: 49, seed: 42, rows: 7, cols: 7, spacing: 50, originX: 300, originY: 200 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Breathing Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'time', fromSlot: 'phase', busName: 'phaseA' },
    ],
    // BreathingScale auto-subscribes to phaseA and publishes to energy
    listeners: [
      { busName: 'energy', toRef: 'render', toSlot: 'radius' },
    ],
  },

  // 3. Color Evolution - Uses PaletteDrift composite (bus-driven)
  'macro:colorEvolution': {
    blocks: [
      { ref: 'timeSlow', type: 'CycleTimeRoot', laneKind: 'Phase', label: '20s Slow Drift',
        params: { periodMs: 20000 } },
      { ref: 'palette', type: 'PaletteDrift', laneKind: 'Phase', label: 'Palette Evolution',
        params: { baseColor: '#8B5CF6', hueSpan: 240, saturation: 0.75, lightness: 0.6 } },
      { ref: 'circle', type: 'CirclePoints', laneKind: 'Fields', label: 'Circle',
        params: { count: 30, seed: 55, centerX: 400, centerY: 300, radius: 120 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Color Ring' },
    ],
    connections: [
      { fromRef: 'circle', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'circle', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'timeSlow', fromSlot: 'phase', busName: 'phaseB' },
    ],
    // PaletteDrift auto-subscribes to phaseB and publishes to palette
  },

  // 4. Colorful Dots - Uses PerElementColorScatter composite
  'macro:colorfulDots': {
    blocks: [
      { ref: 'grid', type: 'GridPoints', laneKind: 'Fields', label: 'Grid',
        params: { count: 100, seed: 42, rows: 10, cols: 10, spacing: 35, originX: 250, originY: 150 } },
      { ref: 'colorScatter', type: 'PerElementColorScatter', laneKind: 'Fields', label: 'Color Variation',
        params: { seed: 200, hueShiftAmount: 360 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Colorful Grid' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'colorScatter', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'colorScatter', fromSlot: 'fill', toRef: 'render', toSlot: 'color' },
    ],
  },

  // 5. Rhythmic Accent - Uses PulseToEnvelope + PhaseWrapPulse composites
  'macro:rhythmicAccent': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: '2s Loop',
        params: { periodMs: 2000 } },
      { ref: 'pulser', type: 'PhaseWrapPulse', laneKind: 'Phase', label: 'Subdivide 4x',
        params: { divisions: 4 } },
      { ref: 'envelope', type: 'PulseToEnvelope', laneKind: 'Phase', label: 'Envelope',
        params: { attack: 0.01, decay: 0.2, peak: 1.0 } },
      { ref: 'grid', type: 'GridPoints', laneKind: 'Fields', label: 'Grid',
        params: { count: 36, seed: 99, rows: 6, cols: 6, spacing: 60, originX: 300, originY: 200 } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Pulsing Dots' },
    ],
    connections: [
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'time', fromSlot: 'phase', busName: 'phaseA' },
    ],
    // PhaseWrapPulse subscribes to phaseA and publishes to pulse
    // PulseToEnvelope subscribes to pulse and publishes to energy
    listeners: [
      { busName: 'energy', toRef: 'render', toSlot: 'radius',
        lens: { type: 'scale', params: { scale: 12, offset: 4 } } },
    ],
  },

  // 6. Glyph Field - Uses GlyphRenderer composite
  'macro:glyphField': {
    blocks: [
      { ref: 'line', type: 'LinePoints', laneKind: 'Fields', label: 'Line Points',
        params: { count: 20, seed: 77, ax: 100, ay: 200, bx: 700, by: 400, distribution: 'uniform' } },
      { ref: 'rotation', type: 'RotationScatter', laneKind: 'Fields', label: 'Glyph Rotation',
        params: { seed: 88, amount: 0.5 } },
      { ref: 'render', type: 'GlyphRenderer', laneKind: 'Program', label: 'Glyphs',
        params: { opacity: 0.9, glow: true, glowIntensity: 1.2 } },
    ],
    connections: [
      { fromRef: 'line', fromSlot: 'domain', toRef: 'rotation', toSlot: 'domain' },
      { fromRef: 'line', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'line', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
      { fromRef: 'rotation', fromSlot: 'rotation', toRef: 'render', toSlot: 'rotation' },
    ],
  },

  // 7. Jittery Dots - Uses JitterMotion composite
  'macro:jitteryDots': {
    blocks: [
      { ref: 'time', type: 'CycleTimeRoot', laneKind: 'Phase', label: '6s Loop',
        params: { periodMs: 6000 } },
      { ref: 'grid', type: 'GridPoints', laneKind: 'Fields', label: 'Grid',
        params: { count: 81, seed: 123, rows: 9, cols: 9, spacing: 40, originX: 250, originY: 150 } },
      { ref: 'jitter', type: 'JitterMotion', laneKind: 'Fields', label: 'Position Jitter',
        params: { seed: 456, amount: 12, frequency: 1.5 } },
      { ref: 'posAdd', type: 'FieldAddVec2', laneKind: 'Fields', label: 'Add Jitter' },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Jittery Dots' },
    ],
    connections: [
      { fromRef: 'time', fromSlot: 'phase', toRef: 'jitter', toSlot: 'phase' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'jitter', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'grid', fromSlot: 'positions', toRef: 'posAdd', toSlot: 'a' },
      { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
      { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },
    ],
    publishers: [
      { fromRef: 'time', fromSlot: 'phase', busName: 'phaseA' },
    ],
  },

  // 8. SVG Path - Uses SVGSamplePoints composite
  'macro:svgPath': {
    blocks: [
      { ref: 'svgPoints', type: 'SVGSamplePoints', laneKind: 'Fields', label: 'SVG Samples',
        params: { asset: 'path://M100,200 Q300,100 500,200 T900,200', sampleCount: 50, seed: 42, distribution: 'uniform' } },
      { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'SVG Dots' },
    ],
    connections: [
      { fromRef: 'svgPoints', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
      { fromRef: 'svgPoints', fromSlot: 'positions', toRef: 'render', toSlot: 'positions' },
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
