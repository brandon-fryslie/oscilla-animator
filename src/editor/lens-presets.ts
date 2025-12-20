/**
 * Lens Presets
 *
 * Pre-configured lens definitions for common effects.
 * These make it easy for users to get pleasing motion immediately.
 */

import type { LensDefinition } from './types';

// =============================================================================
// Preset Definitions
// =============================================================================

/**
 * Breathing preset - gentle oscillation with easeInOutSine.
 * Perfect for size/opacity modulation driven by phase.
 */
export const LENS_PRESET_BREATHING: LensDefinition = {
  type: 'ease',
  params: { easing: 'easeInOutSine' },
};

/**
 * Snap preset - quantized to 4 steps for rhythmic motion.
 * Creates a "steppy" feel for rotation or position.
 */
export const LENS_PRESET_SNAP: LensDefinition = {
  type: 'quantize',
  params: { steps: 4 },
};

/**
 * Smooth preset - slew rate limiting for buttery transitions.
 * Good for energy-driven parameters that should change gradually.
 */
export const LENS_PRESET_SMOOTH: LensDefinition = {
  type: 'slew',
  params: { rate: 2.0 },
};

/**
 * Bounce preset - elastic easing for playful motion.
 */
export const LENS_PRESET_BOUNCE: LensDefinition = {
  type: 'ease',
  params: { easing: 'easeOutBounce' },
};

/**
 * Elastic preset - springy, overshoot effect.
 */
export const LENS_PRESET_ELASTIC: LensDefinition = {
  type: 'ease',
  params: { easing: 'easeOutElastic' },
};

/**
 * Slow start preset - easeInQuad for accelerating motion.
 */
export const LENS_PRESET_SLOW_START: LensDefinition = {
  type: 'ease',
  params: { easing: 'easeInQuad' },
};

/**
 * Slow end preset - easeOutQuad for decelerating motion.
 */
export const LENS_PRESET_SLOW_END: LensDefinition = {
  type: 'ease',
  params: { easing: 'easeOutQuad' },
};

/**
 * Fine steps preset - 8 steps for smoother quantization.
 */
export const LENS_PRESET_FINE_STEPS: LensDefinition = {
  type: 'quantize',
  params: { steps: 8 },
};

/**
 * Coarse steps preset - 2 steps for dramatic on/off effect.
 */
export const LENS_PRESET_COARSE_STEPS: LensDefinition = {
  type: 'quantize',
  params: { steps: 2 },
};

/**
 * Double scale preset - scales input by 2x.
 */
export const LENS_PRESET_DOUBLE: LensDefinition = {
  type: 'scale',
  params: { scale: 2, offset: 0 },
};

/**
 * Half scale preset - scales input by 0.5x.
 */
export const LENS_PRESET_HALF: LensDefinition = {
  type: 'scale',
  params: { scale: 0.5, offset: 0 },
};

/**
 * Invert preset - inverts 0-1 range.
 */
export const LENS_PRESET_INVERT: LensDefinition = {
  type: 'scale',
  params: { scale: -1, offset: 1 },
};

/**
 * Safe Unit preset - clamps values to [0, 1] range.
 */
export const LENS_PRESET_SAFE_UNIT: LensDefinition = {
  type: 'clamp',
  params: { min: 0, max: 1 },
};

/**
 * 5% Deadzone preset - zeros values below 0.05 threshold.
 */
export const LENS_PRESET_DEADZONE_5PCT: LensDefinition = {
  type: 'deadzone',
  params: { threshold: 0.05 },
};

/**
 * 10% Deadzone preset - zeros values below 0.1 threshold.
 */
export const LENS_PRESET_DEADZONE_10PCT: LensDefinition = {
  type: 'deadzone',
  params: { threshold: 0.1 },
};

/**
 * Phase to Rotation preset - maps [0,1] to [0, 360] degrees.
 */
export const LENS_PRESET_PHASE_TO_ROTATION: LensDefinition = {
  type: 'mapRange',
  params: { inMin: 0, inMax: 1, outMin: 0, outMax: 360 },
};

/**
 * Bipolar preset - maps [0,1] to [-1, 1].
 */
export const LENS_PRESET_BIPOLAR: LensDefinition = {
  type: 'mapRange',
  params: { inMin: 0, inMax: 1, outMin: -1, outMax: 1 },
};

// =============================================================================
// Preset Registry
// =============================================================================

export interface LensPreset {
  /** Unique identifier for this preset */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Short description */
  readonly description: string;

  /** The lens definition */
  readonly lens: LensDefinition;

  /** Category for grouping in UI */
  readonly category: 'easing' | 'timing' | 'scaling' | 'quantize' | 'shaping';
}

/**
 * All available lens presets.
 */
export const LENS_PRESETS: readonly LensPreset[] = [
  // Easing presets
  {
    id: 'breathing',
    name: 'Breathing',
    description: 'Gentle oscillation for size/opacity',
    lens: LENS_PRESET_BREATHING,
    category: 'easing',
  },
  {
    id: 'bounce',
    name: 'Bounce',
    description: 'Playful bouncing motion',
    lens: LENS_PRESET_BOUNCE,
    category: 'easing',
  },
  {
    id: 'elastic',
    name: 'Elastic',
    description: 'Springy overshoot effect',
    lens: LENS_PRESET_ELASTIC,
    category: 'easing',
  },
  {
    id: 'slow-start',
    name: 'Slow Start',
    description: 'Accelerating motion',
    lens: LENS_PRESET_SLOW_START,
    category: 'easing',
  },
  {
    id: 'slow-end',
    name: 'Slow End',
    description: 'Decelerating motion',
    lens: LENS_PRESET_SLOW_END,
    category: 'easing',
  },

  // Timing presets
  {
    id: 'smooth',
    name: 'Smooth',
    description: 'Buttery gradual transitions',
    lens: LENS_PRESET_SMOOTH,
    category: 'timing',
  },

  // Quantize presets
  {
    id: 'snap',
    name: 'Snap',
    description: 'Rhythmic 4-step motion',
    lens: LENS_PRESET_SNAP,
    category: 'quantize',
  },
  {
    id: 'fine-steps',
    name: 'Fine Steps',
    description: 'Smoother 8-step quantization',
    lens: LENS_PRESET_FINE_STEPS,
    category: 'quantize',
  },
  {
    id: 'coarse-steps',
    name: 'On/Off',
    description: 'Dramatic 2-step on/off',
    lens: LENS_PRESET_COARSE_STEPS,
    category: 'quantize',
  },

  // Scaling presets
  {
    id: 'double',
    name: 'Double',
    description: 'Scale by 2x',
    lens: LENS_PRESET_DOUBLE,
    category: 'scaling',
  },
  {
    id: 'half',
    name: 'Half',
    description: 'Scale by 0.5x',
    lens: LENS_PRESET_HALF,
    category: 'scaling',
  },
  {
    id: 'invert',
    name: 'Invert',
    description: 'Invert 0-1 range',
    lens: LENS_PRESET_INVERT,
    category: 'scaling',
  },

  // Shaping presets
  {
    id: 'safe-unit',
    name: 'Safe Unit',
    description: 'Clamp to [0,1] range',
    lens: LENS_PRESET_SAFE_UNIT,
    category: 'shaping',
  },
  {
    id: 'deadzone-5pct',
    name: '5% Deadzone',
    description: 'Zero values below 0.05',
    lens: LENS_PRESET_DEADZONE_5PCT,
    category: 'shaping',
  },
  {
    id: 'deadzone-10pct',
    name: '10% Deadzone',
    description: 'Zero values below 0.1',
    lens: LENS_PRESET_DEADZONE_10PCT,
    category: 'shaping',
  },
  {
    id: 'phase-to-rotation',
    name: 'Phase → Rotation',
    description: 'Map [0,1] to [0,360] degrees',
    lens: LENS_PRESET_PHASE_TO_ROTATION,
    category: 'shaping',
  },
  {
    id: 'bipolar',
    name: 'Bipolar',
    description: 'Map [0,1] to [-1,1]',
    lens: LENS_PRESET_BIPOLAR,
    category: 'shaping',
  },
] as const;

/**
 * Get a preset by ID.
 */
export function getLensPreset(id: string): LensPreset | undefined {
  return LENS_PRESETS.find((p) => p.id === id);
}

/**
 * Get presets by category.
 */
export function getLensPresetsByCategory(
  category: LensPreset['category']
): LensPreset[] {
  return LENS_PRESETS.filter((p) => p.category === category);
}

/**
 * Create a lens definition from a preset ID.
 */
export function createLensFromPreset(presetId: string): LensDefinition | null {
  const preset = getLensPreset(presetId);
  if (!preset) return null;
  // Return a copy to prevent accidental mutation
  return {
    type: preset.lens.type,
    params: { ...preset.lens.params },
  };
}
