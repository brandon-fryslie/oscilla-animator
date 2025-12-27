import type { BlockSubcategory, PureBlockDefinition } from './types';
import { isNonEmptyString } from '../types/helpers';

// =============================================================================
// Macro Factory Function
// =============================================================================

/**
 * Create a macro block definition with common configuration
 */
function createMacro(config: {
  type: string;
  label: string;
  description: string;
  priority: number;
  color?: string;
  subcategory?: BlockSubcategory;
}): PureBlockDefinition {
  return {
    type: config.type,
    label: config.label,
    // Note: form is derived from type prefix 'macro:' via getBlockForm()
    subcategory: isNonEmptyString(config.subcategory) ? config.subcategory : 'Quick Start',
    description: config.description,
    capability: 'pure',
    compileKind: 'spec', // Macros are spec-level (expand to blocks)
    inputs: [],
    outputs: [],
    defaultParams: {},
    color: isNonEmptyString(config.color) ? config.color : '#fbbf24',
    laneKind: 'Program',
    priority: config.priority,
  };
}

// =============================================================================
// Test Macros - For testing new features
// =============================================================================

export const MacroTestIR = createMacro({
  type: 'macro:testIR',
  label: '🧪 Test IR',
  description: 'Macro: Minimal setup for testing IR rendering pipeline. Drops a grid of circles.',
  priority: -150, // Show near top for easy access during development
  color: '#EF4444',
  subcategory: 'Quick Start',
});

// =============================================================================
// Quick Start Macros - Simple, reliable patterns using ONLY primitives
// =============================================================================

export const MacroBreathing = createMacro({
  type: 'macro:breathing',
  label: 'Breathing',
  description: 'Macro: Simple breathing animation using phaseA bus',
  priority: -100,
  color: '#10B981',
  subcategory: 'Quick Start',
});

export const MacroWave = createMacro({
  type: 'macro:wave',
  label: 'Wave',
  description: 'Macro: Ripple wave effect with phase delay',
  priority: -90,
  color: '#3B82F6',
  subcategory: 'Quick Start',
});

export const MacroOrbit = createMacro({
  type: 'macro:orbit',
  label: 'Orbit',
  description: 'Macro: Circular orbit motion',
  priority: -80,
  color: '#8B5CF6',
  subcategory: 'Quick Start',
});

export const MacroRainbow = createMacro({
  type: 'macro:rainbow',
  label: 'Rainbow',
  description: 'Macro: Color spectrum based on element position',
  priority: -70,
  color: '#EC4899',
  subcategory: 'Quick Start',
});

// =============================================================================
// Animation Style Macros - Common motion patterns
// =============================================================================

export const MacroFlicker = createMacro({
  type: 'macro:flicker',
  label: 'Flicker',
  description: 'Macro: Random per-element opacity flicker',
  priority: -60,
  color: '#F59E0B',
  subcategory: 'Animation Styles',
});

export const MacroStagger = createMacro({
  type: 'macro:stagger',
  label: 'Stagger',
  description: 'Macro: Delayed animation cascade',
  priority: -50,
  color: '#14B8A6',
  subcategory: 'Animation Styles',
});

export const MacroSpiral = createMacro({
  type: 'macro:spiral',
  label: 'Spiral',
  description: 'Macro: Expanding spiral motion',
  priority: -40,
  color: '#A855F7',
  subcategory: 'Animation Styles',
});

export const MacroElastic = createMacro({
  type: 'macro:elastic',
  label: 'Elastic',
  description: 'Macro: Bouncy elastic motion',
  priority: -30,
  color: '#EF4444',
  subcategory: 'Animation Styles',
});

// =============================================================================
// Effect Macros - Visual effects and compositing
// =============================================================================

export const MacroBloom = createMacro({
  type: 'macro:bloom',
  label: 'Bloom',
  description: 'Macro: Glow/bloom effect on particles',
  priority: -20,
  color: '#FBBF24',
  subcategory: 'Effects',
});

export const MacroTrails = createMacro({
  type: 'macro:trails',
  label: 'Trails',
  description: 'Macro: Motion trails effect',
  priority: -10,
  color: '#06B6D4',
  subcategory: 'Effects',
});

// =============================================================================
// Slice Demo Macros - Demonstrate specific slices
// =============================================================================

export const MacroSlice1Demo = createMacro({
  type: 'macro:slice1Demo',
  label: 'Slice 1: Energy',
  description: 'Macro: Demonstrates Slice 1 - Breathing Energy System',
  priority: 100,
  color: '#10B981',
  subcategory: 'Slice Demos',
});

export const MacroSlice2Demo = createMacro({
  type: 'macro:slice2Demo',
  label: 'Slice 2: Rhythm',
  description: 'Macro: Demonstrates Slice 2 - Rhythmic Accent System',
  priority: 101,
  color: '#3B82F6',
  subcategory: 'Slice Demos',
});

export const MacroSlice3Demo = createMacro({
  type: 'macro:slice3Demo',
  label: 'Slice 3: Wobble',
  description: 'Macro: Demonstrates Slice 3 - Wobble Modulator',
  priority: 102,
  color: '#8B5CF6',
  subcategory: 'Slice Demos',
});

export const MacroSlice4Demo = createMacro({
  type: 'macro:slice4Demo',
  label: 'Slice 4: Spiral',
  description: 'Macro: Demonstrates Slice 4 - Spiral Modulator',
  priority: 103,
  color: '#EC4899',
  subcategory: 'Slice Demos',
});

export const MacroSlice5Demo = createMacro({
  type: 'macro:slice5Demo',
  label: 'Slice 5: Jitter',
  description: 'Macro: Demonstrates Slice 5 - Jitter Displacement',
  priority: 104,
  color: '#F59E0B',
  subcategory: 'Slice Demos',
});

export const MacroSlice6Demo = createMacro({
  type: 'macro:slice6Demo',
  label: 'Slice 6: Wave',
  description: 'Macro: Demonstrates Slice 6 - Wave Deformation',
  priority: 105,
  color: '#14B8A6',
  subcategory: 'Slice Demos',
});

export const MacroSlice7Demo = createMacro({
  type: 'macro:slice7Demo',
  label: 'Slice 7: Element Index',
  description: 'Macro: Demonstrates Slice 7 - Element Index Usage',
  priority: 106,
  color: '#A855F7',
  subcategory: 'Slice Demos',
});

export const MacroSlice8Demo = createMacro({
  type: 'macro:slice8Demo',
  label: 'Slice 8: Hash Variation',
  description: 'Macro: Demonstrates Slice 8 - Hash-based Per-Element Variation',
  priority: 107,
  color: '#EF4444',
  subcategory: 'Slice Demos',
});

// =============================================================================
// Complex Macros - Advanced compositions
// =============================================================================

export const MacroConstellation = createMacro({
  type: 'macro:constellation',
  label: 'Constellation',
  description: 'Macro: Starfield with twinkling and connections',
  priority: 200,
  color: '#1E40AF',
  subcategory: 'Animation Styles',
});

export const MacroFlocking = createMacro({
  type: 'macro:flocking',
  label: 'Flocking',
  description: 'Macro: Boid-like flocking behavior',
  priority: 201,
  color: '#7C3AED',
  subcategory: 'Animation Styles',
});

export const MacroParticleSystem = createMacro({
  type: 'macro:particleSystem',
  label: 'Particle System',
  description: 'Macro: Full particle system with emission, forces, and lifecycle',
  priority: 202,
  color: '#DC2626',
  subcategory: 'Effects',
});
