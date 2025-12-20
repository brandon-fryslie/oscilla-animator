/**
 * Macro Expansion System
 *
 * Macros are "recipe starters" that expand into multiple primitive blocks
 * with pre-wired connections. When a macro is dropped, the user sees all
 * the individual blocks - nothing is hidden.
 *
 * Think of it like a modular synth preset: you load it and see all the
 * modules and patch cables, ready to tweak.
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
  // Line Drawing macro - animates particles from random positions to scene targets
  'macro:lineDrawing': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'SVG Paths' },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample Targets' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Element Count' },

      // Fields
      { ref: 'origins', type: 'regionField', laneKind: 'Fields', label: 'Start Positions', params: { x: 0, y: 0, width: 400, height: 300 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Stagger Delays', params: { baseStagger: 0.05, jitter: 0.2 } },
      { ref: 'durations', type: 'constantFieldDuration', laneKind: 'Fields', label: 'Durations', params: { duration: 0.8 } },

      // Phase
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Animation Phases', params: { entranceDuration: 2.5, holdDuration: 1.5, exitDuration: 0.5 } },

      // Compose
      { ref: 'progress', type: 'perElementProgress', laneKind: 'Spec', label: 'Per-Element Progress' },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Lerp Positions' },

      // Render
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Glow Effect', params: { color: '#ffffff', blur: 10, intensity: 2 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Render Circles', params: { radius: 3, fill: '#ffffff', opacity: 1 } },

      // Output
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Canvas', params: { width: 400, height: 300, background: '#1a1a1a' } },
    ],
    connections: [
      // Scene flow
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },

      // Fields to compose
      { fromRef: 'origins', fromSlot: 'positions', toRef: 'lerp', toSlot: 'starts' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'progress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'progress', toSlot: 'durations' },

      // Phase to compose
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },

      // Compose chain
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },

      // Render chain
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'glow', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // Particles macro - similar to lineDrawing but with different styling
  'macro:particles': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'SVG Paths' },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample Targets' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Element Count' },

      // Fields
      { ref: 'origins', type: 'regionField', laneKind: 'Fields', label: 'Spawn Region', params: { x: -50, y: -50, width: 500, height: 400 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Stagger', params: { baseStagger: 0.02, jitter: 0.3 } },
      { ref: 'durations', type: 'constantFieldDuration', laneKind: 'Fields', label: 'Travel Time', params: { duration: 1.2 } },

      // Phase
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Phases', params: { entranceDuration: 3.0, holdDuration: 2.0, exitDuration: 0.8 } },

      // Compose
      { ref: 'progress', type: 'perElementProgress', laneKind: 'Spec', label: 'Particle Progress' },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Particle Motion' },

      // Render
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Particle Glow', params: { color: '#00ffff', blur: 15, intensity: 3 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Particles', params: { radius: 2.5, fill: '#00ffff', opacity: 0.9 } },

      // Output
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Canvas', params: { width: 400, height: 300, background: '#0a0a0a' } },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },
      { fromRef: 'origins', fromSlot: 'positions', toRef: 'lerp', toSlot: 'starts' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'progress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'progress', toSlot: 'durations' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'glow', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // Bouncing Circle macro - simple oscillating circle
  'macro:bouncingCircle': {
    blocks: [
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Timing', params: { entranceDuration: 5.0, holdDuration: 0, exitDuration: 0 } },
      { ref: 'progress', type: 'phaseProgress', laneKind: 'Phase', label: 'Progress' },
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Glow', params: { color: '#ff6600', blur: 20, intensity: 2.5 } },
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Canvas', params: { width: 400, height: 300, background: '#1a1a1a' } },
    ],
    connections: [
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },
    ],
  },

  // Oscillator macro - math-driven animation
  'macro:oscillator': {
    blocks: [
      { ref: 'speed', type: 'math.constNumber', laneKind: 'Scalars', label: 'Speed', params: { value: 2 } },
      { ref: 'amp', type: 'math.constNumber', laneKind: 'Scalars', label: 'Amplitude', params: { value: 50 } },
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Timing', params: { entranceDuration: 5.0, holdDuration: 0, exitDuration: 0 } },
      { ref: 'progress', type: 'phaseProgress', laneKind: 'Phase', label: 'Progress' },
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Glow', params: { color: '#00ff00', blur: 15, intensity: 2 } },
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Canvas', params: { width: 400, height: 300, background: '#0a0a0a' } },
    ],
    connections: [
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },
    ],
  },

  // =============================================================================
  // Animation Style Macros (Using PerElementTransport)
  // =============================================================================

  // Radial Burst - particles explode from center, then converge to form shape
  'macro:radialBurst': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Logo Paths', params: { target: 'logo' } },

      // Fields - radial origin from center
      { ref: 'positions', type: 'RadialOrigin', laneKind: 'Fields', label: 'Radial Start',
        params: { centerX: 200, centerY: 150, minRadius: 50, maxRadius: 100, spread: 0.3 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Burst Stagger',
        params: { baseStagger: 0.01, jitter: 0.1 } },

      // Phase - slower entrance, short hold, smooth exit (5s total)
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Burst Timing',
        params: { entranceDuration: 2.8, holdDuration: 1.2, exitDuration: 1.0 } },

      // Compose - per-element transport
      { ref: 'transport', type: 'PerElementTransport', laneKind: 'Spec', label: 'Particle Transport' },

      // Output
      { ref: 'output', type: 'outputProgram', laneKind: 'Output', label: 'Output' },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'transport', toSlot: 'targets' },
      { fromRef: 'positions', fromSlot: 'positions', toRef: 'transport', toSlot: 'positions' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'transport', toSlot: 'delays' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'transport', toSlot: 'phase' },
      { fromRef: 'transport', fromSlot: 'program', toRef: 'output', toSlot: 'program' },
    ],
  },

  // Cascade - particles fall from top like waterfall
  'macro:cascade': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Text Paths', params: { target: 'text' } },

      // Fields - particles start from top of screen
      { ref: 'positions', type: 'regionField', laneKind: 'Fields', label: 'Top Spawn',
        params: { x: 0, y: -100, width: 800, height: 50 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Cascade Delay',
        params: { baseStagger: 0.015, jitter: 0.25 } },

      // Phase - longer entrance for cascade effect
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Cascade Timing',
        params: { entranceDuration: 3.5, holdDuration: 1.5, exitDuration: 0.8 } },

      // Compose
      { ref: 'transport', type: 'PerElementTransport', laneKind: 'Spec', label: 'Cascade Motion' },

      // Output
      { ref: 'output', type: 'outputProgram', laneKind: 'Output', label: 'Output' },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'transport', toSlot: 'targets' },
      { fromRef: 'positions', fromSlot: 'positions', toRef: 'transport', toSlot: 'positions' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'transport', toSlot: 'delays' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'transport', toSlot: 'phase' },
      { fromRef: 'transport', fromSlot: 'program', toRef: 'output', toSlot: 'program' },
    ],
  },

  // Scatter - particles start scattered across screen, slow convergence
  'macro:scatter': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Logo Paths', params: { target: 'logo' } },

      // Fields - wide random scatter
      { ref: 'positions', type: 'regionField', laneKind: 'Fields', label: 'Scattered Start',
        params: { x: -100, y: -100, width: 1000, height: 800 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Random Stagger',
        params: { baseStagger: 0.008, jitter: 0.6 } },

      // Phase - slow, dreamy entrance
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Slow Timing',
        params: { entranceDuration: 4.0, holdDuration: 2.5, exitDuration: 1.0 } },

      // Compose
      { ref: 'transport', type: 'PerElementTransport', laneKind: 'Spec', label: 'Gather Motion' },

      // Output
      { ref: 'output', type: 'outputProgram', laneKind: 'Output', label: 'Output' },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'transport', toSlot: 'targets' },
      { fromRef: 'positions', fromSlot: 'positions', toRef: 'transport', toSlot: 'positions' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'transport', toSlot: 'delays' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'transport', toSlot: 'phase' },
      { fromRef: 'transport', fromSlot: 'program', toRef: 'output', toSlot: 'program' },
    ],
  },

  // Implosion - particles start far away on all sides, converge to center
  'macro:implosion': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Logo Paths', params: { target: 'logo' } },

      // Fields - radial origin with large radius
      { ref: 'positions', type: 'RadialOrigin', laneKind: 'Fields', label: 'Outer Ring',
        params: { centerX: 200, centerY: 150, minRadius: 300, maxRadius: 500, spread: 1.0 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Wave Stagger',
        params: { baseStagger: 0.02, jitter: 0.15 } },

      // Phase - dramatic entrance
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Implosion Timing',
        params: { entranceDuration: 2.0, holdDuration: 2.0, exitDuration: 0.5 } },

      // Compose
      { ref: 'transport', type: 'PerElementTransport', laneKind: 'Spec', label: 'Implosion' },

      // Output
      { ref: 'output', type: 'outputProgram', laneKind: 'Output', label: 'Output' },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'transport', toSlot: 'targets' },
      { fromRef: 'positions', fromSlot: 'positions', toRef: 'transport', toSlot: 'positions' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'transport', toSlot: 'delays' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'transport', toSlot: 'phase' },
      { fromRef: 'transport', fromSlot: 'program', toRef: 'output', toSlot: 'program' },
    ],
  },

  // Swarm - particles emerge from bottom corners, swarm to form shape
  'macro:swarm': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Text Paths', params: { target: 'text' } },

      // Fields - bottom corners spawn area
      { ref: 'positions', type: 'regionField', laneKind: 'Fields', label: 'Corner Spawn',
        params: { x: -50, y: 350, width: 900, height: 150 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Swarm Delay',
        params: { baseStagger: 0.005, jitter: 0.4 } },

      // Phase - quick swarm
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Swarm Timing',
        params: { entranceDuration: 2.2, holdDuration: 1.8, exitDuration: 0.6 } },

      // Compose
      { ref: 'transport', type: 'PerElementTransport', laneKind: 'Spec', label: 'Swarm Motion' },

      // Output
      { ref: 'output', type: 'outputProgram', laneKind: 'Output', label: 'Output' },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'transport', toSlot: 'targets' },
      { fromRef: 'positions', fromSlot: 'positions', toRef: 'transport', toSlot: 'positions' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'transport', toSlot: 'delays' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'transport', toSlot: 'phase' },
      { fromRef: 'transport', fromSlot: 'program', toRef: 'output', toSlot: 'program' },
    ],
  },

  // Love You Baby - particles swarm into a big heart shape
  'macro:loveYouBaby': {
    blocks: [
      // Scene - heart shape
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Heart Shape',
        params: { target: 'heart', density: 1.5 } },

      // Fields - particles spawn from all around (radial burst effect)
      { ref: 'positions', type: 'RadialOrigin', laneKind: 'Fields', label: 'Scattered Start',
        params: { centerX: 200, centerY: 150, minRadius: 250, maxRadius: 400, spread: 1.0 } },
      { ref: 'delays', type: 'LinearStagger', laneKind: 'Fields', label: 'Love Stagger',
        params: { baseStagger: 0.008, jitter: 0.5 } },

      // Phase - romantic timing: slow entrance, long hold, gentle exit
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Love Timing',
        params: { entranceDuration: 3.5, holdDuration: 3.0, exitDuration: 1.5 } },

      // Compose - per-element transport
      { ref: 'transport', type: 'PerElementTransport', laneKind: 'Spec', label: 'Love Motion' },

      // Output
      { ref: 'output', type: 'outputProgram', laneKind: 'Output', label: 'Output' },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'transport', toSlot: 'targets' },
      { fromRef: 'positions', fromSlot: 'positions', toRef: 'transport', toSlot: 'positions' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'transport', toSlot: 'delays' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'transport', toSlot: 'phase' },
      { fromRef: 'transport', fromSlot: 'program', toRef: 'output', toSlot: 'program' },
    ],
  },

  // =============================================================================
  // ✨ NEBULA - Cosmic particle effect with rainbow colors and varied sizes
  // =============================================================================
  'macro:nebula': {
    blocks: [
      // Scene - logo paths
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Shape Source',
        params: { target: 'logo' } },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample Points' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Particle Count' },

      // Fields - explosion origin for dramatic radial start
      { ref: 'origins', type: 'ExplosionOrigin', laneKind: 'Fields', label: 'Cosmic Scatter',
        params: { centerX: 200, centerY: 150, minDistance: 150, maxDistance: 350, angleSpread: 360 } },

      // Random stagger for organic timing
      { ref: 'delays', type: 'RandomStagger', laneKind: 'Fields', label: 'Stardust Timing',
        params: { minDelay: 0, maxDelay: 1.5, distribution: 'gaussian' } },

      // Duration variation - some particles arrive faster
      { ref: 'durations', type: 'DurationVariation', laneKind: 'Fields', label: 'Travel Variance',
        params: { baseDuration: 1.2, variation: 0.4, minDuration: 0.5 } },

      // Size variation - mixed particle sizes
      { ref: 'sizes', type: 'SizeVariation', laneKind: 'Fields', label: 'Star Sizes',
        params: { mode: 'random', baseSize: 1.0, variation: 0.8, minSize: 0.3, maxSize: 2.5 } },

      // Rainbow colors
      { ref: 'colors', type: 'ColorField', laneKind: 'Fields', label: 'Nebula Colors',
        params: { mode: 'rainbow', baseColor: '#ff00ff', hueRange: 180, saturation: 0.9, lightness: 0.6 } },

      // Opacity variation for depth
      { ref: 'opacities', type: 'OpacityField', laneKind: 'Fields', label: 'Depth Fade',
        params: { mode: 'random', baseOpacity: 0.9, variation: 0.3, minOpacity: 0.4 } },

      // Phase - slow, dreamy entrance
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Cosmic Timing',
        params: { entranceDuration: 4.0, holdDuration: 3.0, exitDuration: 1.5 } },

      // Compose - per-element progress and lerp
      { ref: 'progress', type: 'perElementProgress', laneKind: 'Spec', label: 'Particle Progress',
        params: { easing: 'easeOutCubic' } },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Star Paths' },

      // Render - glow filter and circles
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Nebula Glow',
        params: { color: '#ff88ff', blur: 18, intensity: 2.5 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Render Stars',
        params: { radius: 4, fill: '#ffffff', opacity: 1 } },

      // Output
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Cosmos',
        params: { width: 400, height: 300, background: '#0a0612' } },
    ],
    connections: [
      // Scene flow
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },

      // Fields to compose
      { fromRef: 'origins', fromSlot: 'positions', toRef: 'lerp', toSlot: 'starts' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'progress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'progress', toSlot: 'durations' },

      // Phase to compose
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },

      // Compose chain
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },

      // Render chain
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'glow', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // =============================================================================
  // ✨ GLITCH STORM - Chaotic particles with RGB split and jitter
  // =============================================================================
  'macro:glitchStorm': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Glitch Source',
        params: { target: 'text' } },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Count' },

      // Fields - grid start positions for digital feel
      { ref: 'origins', type: 'GridPositions', laneKind: 'Fields', label: 'Digital Grid',
        params: { startX: 50, startY: 50, cellWidth: 25, cellHeight: 25, columns: 15, jitter: 10 } },

      // Index stagger for sequential reveal
      { ref: 'delays', type: 'IndexStagger', laneKind: 'Fields', label: 'Scan Lines',
        params: { delayPerElement: 0.02, startDelay: 0.1, reverse: false } },

      // Fast durations
      { ref: 'durations', type: 'constantFieldDuration', laneKind: 'Fields', label: 'Glitch Speed',
        params: { duration: 0.3 } },

      // Phase - fast, punchy
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Glitch Timing',
        params: { entranceDuration: 1.8, holdDuration: 2.5, exitDuration: 0.4 } },

      // Compose
      { ref: 'progress', type: 'perElementProgress', laneKind: 'Spec', label: 'Progress',
        params: { easing: 'easeOutQuad' } },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Glitch Path' },

      // Render - RGB split for chromatic aberration
      { ref: 'rgbSplit', type: 'RGBSplitFilter', laneKind: 'Program', label: 'RGB Split',
        params: { redOffsetX: 4, redOffsetY: 1, blueOffsetX: -4, blueOffsetY: -1 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Glitch Pixels',
        params: { radius: 3, fill: '#00ff88', opacity: 0.95 } },

      // Output - dark background
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Terminal',
        params: { width: 400, height: 300, background: '#0d1117' } },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },
      { fromRef: 'origins', fromSlot: 'positions', toRef: 'lerp', toSlot: 'starts' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'progress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'progress', toSlot: 'durations' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'rgbSplit', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // =============================================================================
  // 🎭 REVEAL MASK - Sliding mask wipe reveal with glow edge
  // =============================================================================
  'macro:revealMask': {
    blocks: [
      // Scene - logo paths
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Shape Source',
        params: { target: 'logo' } },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample Points' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Element Count' },

      // Fields - particles at their target positions (no movement, just revealed)
      { ref: 'delays', type: 'constantFieldDuration', laneKind: 'Fields', label: 'No Delay',
        params: { duration: 0 } },
      { ref: 'durations', type: 'constantFieldDuration', laneKind: 'Fields', label: 'Instant',
        params: { duration: 0.01 } },

      // Phase - clean entrance/hold/exit timing
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Reveal Timing',
        params: { entranceDuration: 2.0, holdDuration: 2.0, exitDuration: 1.0 } },
      { ref: 'progress', type: 'phaseProgress', laneKind: 'Phase', label: 'Phase Progress' },

      // Compose - per-element (particles stay at targets)
      { ref: 'perProgress', type: 'perElementProgress', laneKind: 'Spec', label: 'Element Progress' },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Static Positions' },

      // Render - create particles, then mask them
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Glow',
        params: { color: '#ffffff', blur: 8, intensity: 1.5 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Shape Points',
        params: { radius: 3.5, fill: '#ffffff', opacity: 1 } },
      { ref: 'mask', type: 'MaskReveal', laneKind: 'Program', label: 'Wipe Mask',
        params: { direction: 'left-to-right', softEdge: 25, sceneWidth: 400, sceneHeight: 300 } },

      // Output
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Canvas',
        params: { width: 400, height: 300, background: '#0a0a12' } },
    ],
    connections: [
      // Scene flow
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },
      // Use targets as both start and end (static positions)
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'starts' },

      // Fields to compose
      { fromRef: 'delays', fromSlot: 'durations', toRef: 'perProgress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'perProgress', toSlot: 'durations' },

      // Phase to compose and mask
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'perProgress', toSlot: 'phase' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },

      // Compose chain
      { fromRef: 'perProgress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },

      // Render chain: circles → mask → canvas
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'glow', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'mask', toSlot: 'content' },
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'mask', toSlot: 'progress' },
      { fromRef: 'mask', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // =============================================================================
  // 💧 LIQUID - Gooey blob circles forming shapes (warm orange/yellow)
  // =============================================================================
  'macro:liquid': {
    blocks: [
      // Scene - logo paths as blob targets
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Blob Targets',
        params: { target: 'logo' } },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample Points' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Blob Count' },

      // Fields - blobs drop from above with randomized timing
      { ref: 'origins', type: 'TopDropOrigin', laneKind: 'Fields', label: 'Drop Origin',
        params: { sceneWidth: 400, dropHeight: -80, xSpread: 1.0, heightVariation: 60 } },
      { ref: 'delays', type: 'RandomStagger', laneKind: 'Fields', label: 'Drop Stagger',
        params: { minDelay: 0, maxDelay: 1.5, distribution: 'uniform' } },
      { ref: 'durations', type: 'DurationVariation', laneKind: 'Fields', label: 'Fall Time',
        params: { baseDuration: 1.0, variation: 0.4, minDuration: 0.5 } },

      // Phase - slower entrance for liquid drip effect
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Liquid Timing',
        params: { entranceDuration: 3.5, holdDuration: 2.0, exitDuration: 0.8 } },

      // Compose - per-element lerp for drop motion
      { ref: 'progress', type: 'perElementProgress', laneKind: 'Spec', label: 'Drop Progress',
        params: { easing: 'easeOutCubic' } },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Drop Path' },

      // Render - goo filter for metaball effect, large warm-colored blobs
      { ref: 'goo', type: 'GooFilter', laneKind: 'Program', label: 'Goo Effect',
        params: { blur: 10, threshold: 18, contrast: 35 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Blobs',
        params: { radius: 10, fill: '#ffaa22', opacity: 1 } },

      // Output - dark blue background for contrast
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Canvas',
        params: { width: 400, height: 300, background: '#1a1a2e' } },
    ],
    connections: [
      // Scene flow
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },

      // Fields to compose
      { fromRef: 'origins', fromSlot: 'positions', toRef: 'lerp', toSlot: 'starts' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'progress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'progress', toSlot: 'durations' },

      // Phase to compose
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },

      // Compose chain
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },

      // Render chain
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'goo', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // =============================================================================
  // ✨ AURORA - Wave-like motion with gradient colors
  // =============================================================================
  'macro:aurora': {
    blocks: [
      // Scene
      { ref: 'scene', type: 'SVGPathSource', laneKind: 'Scene', label: 'Aurora Shape',
        params: { target: 'logo' } },
      { ref: 'targets', type: 'SceneToTargets', laneKind: 'Scene', label: 'Sample' },
      { ref: 'count', type: 'elementCount', laneKind: 'Scene', label: 'Count' },

      // Fields - top drop for curtain effect
      { ref: 'origins', type: 'TopDropOrigin', laneKind: 'Fields', label: 'Sky Origin',
        params: { sceneWidth: 400, dropHeight: -150, xSpread: 1.2, heightVariation: 80 } },

      // Wave stagger for flowing motion
      { ref: 'delays', type: 'WaveStagger', laneKind: 'Fields', label: 'Wave Flow',
        params: { frequency: 2.0, amplitude: 0.5, baseDelay: 0.3, phase: 0, jitter: 0.15 } },

      // Duration variation
      { ref: 'durations', type: 'DurationVariation', laneKind: 'Fields', label: 'Flow Speed',
        params: { baseDuration: 1.5, variation: 0.3, minDuration: 0.8 } },

      // Gradient colors (green to cyan to purple)
      { ref: 'colors', type: 'ColorField', laneKind: 'Fields', label: 'Aurora Hues',
        params: { mode: 'gradient', baseColor: '#00ff88', endColor: '#8800ff', saturation: 0.85, lightness: 0.55 } },

      // Phase - ethereal timing
      { ref: 'phase', type: 'PhaseMachine', laneKind: 'Phase', label: 'Aurora Timing',
        params: { entranceDuration: 3.5, holdDuration: 4.0, exitDuration: 2.0 } },

      // Compose
      { ref: 'progress', type: 'perElementProgress', laneKind: 'Spec', label: 'Curtain Progress',
        params: { easing: 'easeInOutCubic' } },
      { ref: 'lerp', type: 'lerpPoints', laneKind: 'Spec', label: 'Descend' },

      // Render - soft glow
      { ref: 'glow', type: 'glowFilter', laneKind: 'Program', label: 'Aurora Glow',
        params: { color: '#00ffaa', blur: 25, intensity: 2.0 } },
      { ref: 'circles', type: 'perElementCircles', laneKind: 'Program', label: 'Light Particles',
        params: { radius: 5, fill: '#88ffcc', opacity: 0.85 } },

      // Output
      { ref: 'canvas', type: 'canvas', laneKind: 'Output', label: 'Night Sky',
        params: { width: 400, height: 300, background: '#0a0a18' } },
    ],
    connections: [
      { fromRef: 'scene', fromSlot: 'scene', toRef: 'targets', toSlot: 'scene' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'count', toSlot: 'targets' },
      { fromRef: 'targets', fromSlot: 'targets', toRef: 'lerp', toSlot: 'ends' },
      { fromRef: 'origins', fromSlot: 'positions', toRef: 'lerp', toSlot: 'starts' },
      { fromRef: 'delays', fromSlot: 'delays', toRef: 'progress', toSlot: 'delays' },
      { fromRef: 'durations', fromSlot: 'durations', toRef: 'progress', toSlot: 'durations' },
      { fromRef: 'phase', fromSlot: 'phase', toRef: 'progress', toSlot: 'phase' },
      { fromRef: 'progress', fromSlot: 'progress', toRef: 'lerp', toSlot: 'progress' },
      { fromRef: 'lerp', fromSlot: 'positions', toRef: 'circles', toSlot: 'positions' },
      { fromRef: 'count', fromSlot: 'count', toRef: 'circles', toSlot: 'count' },
      { fromRef: 'glow', fromSlot: 'filter', toRef: 'circles', toSlot: 'filter' },
      { fromRef: 'circles', fromSlot: 'tree', toRef: 'canvas', toSlot: 'render' },
    ],
  },

  // =============================================================================
  // Domain-Based Macros (New System)
  // =============================================================================

  // Breathing Dots - Grid of dots with pulsing size animation
  // Uses bus routing: PhaseClock → phaseA bus → RenderInstances2D radius (with scale lens)
  // Note: Uses primitive blocks directly (not composites) so bus listeners work correctly
  'macro:breathingDots': {
    blocks: [
      // Domain source - creates N elements with sequential IDs
      { ref: 'domain', type: 'DomainN', laneKind: 'Fields', label: 'Domain',
        params: { n: 25, seed: 42 } },

      // Position layout - arranges elements in a grid
      { ref: 'grid', type: 'PositionMapGrid', laneKind: 'Fields', label: 'Grid Layout',
        params: { rows: 5, cols: 5, spacing: 60, originX: 400, originY: 300, order: 'row-major' } },

      // Phase clock - drives the breathing animation (0→1 over 2 seconds, looping)
      // Uses legacy PhaseClock for backward compatibility with existing patches
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
    // Bus routing: phase signal → radius animation
    publishers: [
      // Publish PhaseClock's phase output to the phaseA bus
      { fromRef: 'clock', fromSlot: 'phase', busName: 'phaseA' },
    ],
    listeners: [
      // Listen on RenderInstances2D's radius input from phaseA bus
      // Apply scale lens: phase 0-1 → radius 3-15 (scale=12, offset=3)
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
};

/**
 * Check if a block type with given params should trigger macro expansion.
 * Returns the macro key if expansion should happen, null otherwise.
 *
 * Handles both:
 * - `macro:*` types from the block palette
 * - `demoProgram` with variant param from the demo menu
 */
export function getMacroKey(blockType: string, params?: Record<string, unknown>): string | null {
  // Direct macro type from palette (e.g., 'macro:lineDrawing')
  if (blockType.startsWith('macro:')) {
    if (blockType in MACRO_REGISTRY) {
      return blockType;
    }
  }

  // Legacy demoProgram with variant param (from demo menu)
  if (blockType === 'demoProgram') {
    const variant = params?.variant as string ?? 'lineDrawing';
    const key = `macro:${variant}`;
    if (key in MACRO_REGISTRY) {
      return key;
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
