import type { BlockDefinition, BlockSubcategory } from '../types';

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
    subcategory: config.subcategory || 'Animation Styles',
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
// Animation Style Macros
// =============================================================================

export const MacroLineDrawing = createMacro({
  type: 'macro:lineDrawing',
  label: '✨ Line Drawing',
  description: 'Macro: Particles animate from random positions to form a shape. Expands into ~12 primitive blocks.',
  priority: -100,
});

export const MacroParticles = createMacro({
  type: 'macro:particles',
  label: '✨ Particles',
  description: 'Macro: Glowing particles converge to form a shape. Expands into ~12 primitive blocks.',
  priority: -99,
});

export const MacroBouncingCircle = createMacro({
  type: 'macro:bouncingCircle',
  label: '✨ Bouncing Circle',
  description: 'Macro: Simple oscillating circle animation. Expands into primitive blocks.',
  priority: -98,
});

export const MacroOscillator = createMacro({
  type: 'macro:oscillator',
  label: '✨ Oscillator',
  description: 'Macro: Math-driven oscillating animation. Expands into primitive blocks.',
  priority: -97,
});

export const MacroRadialBurst = createMacro({
  type: 'macro:radialBurst',
  label: '✨ Radial Burst',
  description: 'Macro: Particles burst from center, then converge to form shape.',
  priority: -96,
});

export const MacroCascade = createMacro({
  type: 'macro:cascade',
  label: '✨ Cascade',
  description: 'Macro: Particles fall from top like a waterfall.',
  priority: -95,
});

export const MacroScatter = createMacro({
  type: 'macro:scatter',
  label: '✨ Scatter',
  description: 'Macro: Particles start scattered, slowly converge to form shape.',
  priority: -94,
});

export const MacroImplosion = createMacro({
  type: 'macro:implosion',
  label: '✨ Implosion',
  description: 'Macro: Particles rush in from all sides to form shape.',
  priority: -93,
});

export const MacroSwarm = createMacro({
  type: 'macro:swarm',
  label: '✨ Swarm',
  description: 'Macro: Particles swarm up from bottom to form shape.',
  priority: -92,
});

export const MacroLoveYouBaby = createMacro({
  type: 'macro:loveYouBaby',
  label: '💖 Love You Baby',
  description: 'Macro: Particles swarm into a big heart shape.',
  priority: -91,
  color: '#ff2d75',
});

export const MacroNebula = createMacro({
  type: 'macro:nebula',
  label: '🌌 Nebula',
  description: 'Macro: Cosmic particles with rainbow colors, varied sizes, and dreamy motion. Uses 16 blocks!',
  priority: -90,
  color: '#a855f7',
});

// =============================================================================
// Effect Macros
// =============================================================================

export const MacroGlitchStorm = createMacro({
  type: 'macro:glitchStorm',
  label: '⚡ Glitch Storm',
  description: 'Macro: Digital chaos with grid positions, scan-line timing, and RGB chromatic aberration.',
  priority: -89,
  color: '#22c55e',
  subcategory: 'Effects',
});

export const MacroAurora = createMacro({
  type: 'macro:aurora',
  label: '🌊 Aurora',
  description: 'Macro: Ethereal curtain of light descending with wave-based flow and gradient colors.',
  priority: -88,
  color: '#06b6d4',
  subcategory: 'Effects',
});

export const MacroRevealMask = createMacro({
  type: 'macro:revealMask',
  label: '🎭 Reveal Mask',
  description: 'Macro: Sliding mask reveal transition. Content is progressively revealed with wipe effect.',
  priority: -87,
  color: '#14b8a6',
  subcategory: 'Effects',
});

export const MacroLiquid = createMacro({
  type: 'macro:liquid',
  label: '💧 Liquid',
  description: 'Macro: Gooey blob circles drop and merge to form shapes. Uses goo filter for liquid effect.',
  priority: -86,
  color: '#10b981',
  subcategory: 'Effects',
});

