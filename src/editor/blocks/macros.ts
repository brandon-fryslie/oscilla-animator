import type { BlockDefinition, BlockSubcategory } from './types';

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
}): BlockDefinition {
  return {
    type: config.type,
    label: config.label,
    // Note: form is derived from type prefix 'macro:' via getBlockForm()
    subcategory: config.subcategory || 'Quick Start',
    category: 'Macros',
    description: config.description,
    inputs: [],
    outputs: [],
    defaultParams: {},
    paramSchema: [],
    color: config.color || '#fbbf24',
    laneKind: 'Program',
    priority: config.priority,
  };
}

// =============================================================================
// Quick Start Macros - Simple, reliable patterns using ONLY primitives
// =============================================================================

export const MacroSimpleGrid = createMacro({
  type: 'macro:simpleGrid',
  label: '✨ Simple Grid',
  description: 'Macro: Basic grid of dots - the simplest possible patch.',
  priority: -100,
  color: '#3B82F6',
  subcategory: 'Quick Start',
});

export const MacroAnimatedCircleRing = createMacro({
  type: 'macro:animatedCircleRing',
  label: '🔵 Animated Circle Ring',
  description: 'Macro: Circle layout with oscillating radius animation.',
  priority: -99,
  color: '#EC4899',
  subcategory: 'Quick Start',
});

export const MacroLineWave = createMacro({
  type: 'macro:lineWave',
  label: '〰️ Line Wave',
  description: 'Macro: Line of dots with phase-offset wave animation.',
  priority: -98,
  color: '#8B5CF6',
  subcategory: 'Quick Start',
});

export const MacroRainbowGrid = createMacro({
  type: 'macro:rainbowGrid',
  label: '🌈 Rainbow Grid',
  description: 'Macro: Grid with per-element color variation from ColorLFO.',
  priority: -97,
  color: '#F59E0B',
  subcategory: 'Quick Start',
});

export const MacroPulsingGrid = createMacro({
  type: 'macro:pulsingGrid',
  label: '💓 Pulsing Grid',
  description: 'Macro: Grid with pulse-driven rhythmic radius animation.',
  priority: -96,
  color: '#EF4444',
  subcategory: 'Quick Start',
});

export const MacroDriftingCircle = createMacro({
  type: 'macro:driftingCircle',
  label: '🌊 Drifting Circle',
  description: 'Macro: Circle layout with smooth jitter motion.',
  priority: -95,
  color: '#22C55E',
  subcategory: 'Quick Start',
});

export const MacroMultiRing = createMacro({
  type: 'macro:multiRing',
  label: '⭕ Multi-Ring',
  description: 'Macro: Multiple concentric circles with size variation.',
  priority: -94,
  color: '#06B6D4',
  subcategory: 'Quick Start',
});

export const MacroBreathingLine = createMacro({
  type: 'macro:breathingLine',
  label: '🫁 Breathing Line',
  description: 'Macro: Line with synchronized breathing animation.',
  priority: -93,
  color: '#14B8A6',
  subcategory: 'Quick Start',
});

export const MacroColorPulse = createMacro({
  type: 'macro:colorPulse',
  label: '🎨 Color Pulse',
  description: 'Macro: Grid with animated color from ColorLFO.',
  priority: -92,
  color: '#A855F7',
  subcategory: 'Quick Start',
});

export const MacroRhythmicDots = createMacro({
  type: 'macro:rhythmicDots',
  label: '🥁 Rhythmic Dots',
  description: 'Macro: Grid with PulseDivider envelope for rhythmic accents.',
  priority: -91,
  color: '#F59E0B',
  subcategory: 'Quick Start',
});

// =============================================================================
// Slice Demo Macros - Demonstrate new block capabilities
// =============================================================================

export const MacroBreathingWave = createMacro({
  type: 'macro:breathingWave',
  label: 'Breathing Wave',
  description: 'Macro: Demonstrates Oscillator + Shaper for smooth breathing intensity curves. (Slice 1)',
  priority: -80,
  color: '#3B82F6',
  subcategory: 'Slice Demos',
});

export const MacroRhythmicPulse = createMacro({
  type: 'macro:rhythmicPulse',
  label: 'Rhythmic Pulse',
  description: 'Macro: Demonstrates PulseDivider + EnvelopeAD for rhythmic accent triggers. (Slice 2)',
  priority: -79,
  color: '#F59E0B',
  subcategory: 'Slice Demos',
});

export const MacroColorDrift = createMacro({
  type: 'macro:colorDrift',
  label: 'Color Drift',
  description: 'Macro: Demonstrates ColorLFO for slow hue cycling color animation. (Slice 3)',
  priority: -78,
  color: '#EC4899',
  subcategory: 'Slice Demos',
});

export const MacroStableGrid = createMacro({
  type: 'macro:stableGrid',
  label: 'Stable Grid',
  description: 'Macro: Demonstrates GridDomain + StableIdHash for per-element deterministic randomness. (Slice 4)',
  priority: -77,
  color: '#8B5CF6',
  subcategory: 'Slice Demos',
});

export const MacroPhaseSpread = createMacro({
  type: 'macro:phaseSpread',
  label: 'Phase Spread',
  description: 'Macro: Demonstrates FieldZipSignal for per-element phase offset animation. (Slice 5)',
  priority: -76,
  color: '#A855F7',
  subcategory: 'Slice Demos',
});

export const MacroDriftingDots = createMacro({
  type: 'macro:driftingDots',
  label: 'Drifting Dots',
  description: 'Macro: Demonstrates JitterFieldVec2 + FieldAddVec2 for animated position drift. (Slice 6)',
  priority: -75,
  color: '#22C55E',
  subcategory: 'Slice Demos',
});

export const MacroStyledElements = createMacro({
  type: 'macro:styledElements',
  label: 'Styled Elements',
  description: 'Macro: Demonstrates FieldColorize + FieldOpacity for per-element visual variety. (Slice 7)',
  priority: -74,
  color: '#F59E0B',
  subcategory: 'Slice Demos',
});

export const MacroResponsiveGrid = createMacro({
  type: 'macro:responsiveGrid',
  label: 'Responsive Grid',
  description: 'Macro: Demonstrates ViewportInfo for viewport-centered responsive layouts. (Slice 8)',
  priority: -73,
  color: '#14B8A6',
  subcategory: 'Slice Demos',
});

export const MacroGoldenPatch = createMacro({
  type: 'macro:goldenPatch',
  label: 'Golden Patch',
  description: 'Macro: Complete "Breathing Constellation" - validates all slices working together. (Slice 9)',
  priority: -72,
  color: '#EF4444',
  subcategory: 'Slice Demos',
});

export const MacroBreathingDots = createMacro({
  type: 'macro:breathingDots',
  label: 'Breathing Dots',
  description: 'Macro: Simple grid with breathing animation using bus-driven radius. Demonstrates domain + bus integration.',
  priority: -71,
  color: '#06B6D4',
  subcategory: 'Slice Demos',
});

// Note: Composite-based macros have been removed as composites may not work reliably.
// All macros now use ONLY primitive blocks.

// Legacy macros have been archived to .agent_planning/LEGACY-BLOCKS-ARCHIVE.md
