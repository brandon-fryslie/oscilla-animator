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
    form: 'macro',
    subcategory: config.subcategory || 'Slice Demos',
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

// =============================================================================
// Composite Demo Macros - Use new composites
// =============================================================================

export const MacroRotatingGrid = createMacro({
  type: 'macro:rotatingGrid',
  label: 'Rotating Grid',
  description: 'Macro: Uses RotationScatter composite for per-element rotation variation.',
  priority: -60,
  color: '#EC4899',
  subcategory: 'Effects',
});

export const MacroBreathingPulse = createMacro({
  type: 'macro:breathingPulse',
  label: 'Breathing Pulse',
  description: 'Macro: Uses BreathingScale composite (bus-driven breathing energy).',
  priority: -59,
  color: '#3B82F6',
  subcategory: 'Effects',
});

export const MacroColorEvolution = createMacro({
  type: 'macro:colorEvolution',
  label: 'Color Evolution',
  description: 'Macro: Uses PaletteDrift composite for slow color evolution via ColorLFO.',
  priority: -58,
  color: '#F59E0B',
  subcategory: 'Effects',
});

export const MacroColorfulDots = createMacro({
  type: 'macro:colorfulDots',
  label: 'Colorful Dots',
  description: 'Macro: Uses PerElementColorScatter composite for hue variation.',
  priority: -57,
  color: '#EC4899',
  subcategory: 'Effects',
});

export const MacroRhythmicAccent = createMacro({
  type: 'macro:rhythmicAccent',
  label: 'Rhythmic Accent',
  description: 'Macro: Uses PulseToEnvelope + PhaseWrapPulse composites for rhythmic pulsing.',
  priority: -56,
  color: '#F59E0B',
  subcategory: 'Effects',
});

export const MacroGlyphField = createMacro({
  type: 'macro:glyphField',
  label: 'Glyph Field',
  description: 'Macro: Uses GlyphRenderer composite for path/glyph rendering.',
  priority: -55,
  color: '#EF4444',
  subcategory: 'Effects',
});

export const MacroJitteryDots = createMacro({
  type: 'macro:jitteryDots',
  label: 'Jittery Dots',
  description: 'Macro: Uses JitterMotion composite for phase-driven position jitter.',
  priority: -54,
  color: '#A855F7',
  subcategory: 'Effects',
});

export const MacroSvgPath = createMacro({
  type: 'macro:svgPath',
  label: 'SVG Path',
  description: 'Macro: Uses SVGSamplePoints composite to sample points from SVG path.',
  priority: -53,
  color: '#8B5CF6',
  subcategory: 'Effects',
});

// Legacy macros have been archived to .agent_planning/LEGACY-BLOCKS-ARCHIVE.md
