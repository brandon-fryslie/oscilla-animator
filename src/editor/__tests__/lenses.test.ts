/**
 * Bus Lenses Tests
 *
 * Tests for lens transformations applied on the listener side of bus subscriptions.
 */

import { describe, it, expect } from 'vitest';
import { applyLens, getEasingNames, isValidLensType } from '../lenses';
import {
  LENS_PRESETS,
  getLensPreset,
  getLensPresetsByCategory,
  createLensFromPreset,
  LENS_PRESET_BREATHING,
  LENS_PRESET_SNAP,
  LENS_PRESET_SMOOTH,
} from '../lens-presets';
import type { Artifact, RuntimeCtx } from '../compiler/types';
import type { LensDefinition } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

function createSignalArtifact(fn: (t: number) => number): Artifact {
  return {
    kind: 'Signal:number',
    value: (tMs: number, _ctx: RuntimeCtx) => fn(tMs),
  };
}

function evalSignal(artifact: Artifact, tMs: number): number {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    throw new Error(`Expected Signal:number, got ${artifact.kind}`);
  }
  const ctx: RuntimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
  return (artifact.value as (t: number, ctx: RuntimeCtx) => number)(tMs, ctx);
}

// =============================================================================
// Ease Lens Tests
// =============================================================================

describe('EaseLens', () => {
  it('applies easeInOutSine by default', () => {
    const input = createSignalArtifact((t) => t / 1000); // Linear 0-1 over 1 second
    const lens: LensDefinition = { type: 'ease', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Signal:number');

    // easeInOutSine: at t=0.5, should be 0.5
    const midValue = evalSignal(result, 500);
    expect(midValue).toBeCloseTo(0.5, 2);

    // At t=0, should be 0
    expect(evalSignal(result, 0)).toBeCloseTo(0, 5);

    // At t=1000, should be 1 (clamped input)
    expect(evalSignal(result, 1000)).toBeCloseTo(1, 5);
  });

  it('applies specified easing function', () => {
    const input = createSignalArtifact((t) => t / 1000);
    const lens: LensDefinition = { type: 'ease', params: { easing: 'easeInQuad' } };

    const result = applyLens(input, lens) as Artifact;

    // easeInQuad: at t=0.5, should be 0.25 (0.5^2)
    const midValue = evalSignal(result, 500);
    expect(midValue).toBeCloseTo(0.25, 2);
  });

  it('clamps input to 0-1 range', () => {
    const input = createSignalArtifact(() => 1.5); // Always > 1
    const lens: LensDefinition = { type: 'ease', params: { easing: 'linear' } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(1); // Clamped to 1

    const negativeInput = createSignalArtifact(() => -0.5);
    const negResult = applyLens(negativeInput, lens) as Artifact;
    expect(evalSignal(negResult, 0)).toBe(0); // Clamped to 0
  });

  it('returns error for non-Signal input', () => {
    const input: Artifact = { kind: 'Scalar:number', value: 0.5 };
    const lens: LensDefinition = { type: 'ease', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Error');
  });
});

// =============================================================================
// Slew Lens Tests
// =============================================================================

describe('SlewLens', () => {
  it('rate-limits rapid changes', () => {
    // Jump from 0 to 1 instantly
    const input = createSignalArtifact((t) => (t >= 100 ? 1 : 0));
    const lens: LensDefinition = { type: 'slew', params: { rate: 2.0 } };

    const result = applyLens(input, lens) as Artifact;

    // At t=0, value is 0 (initialized to input)
    expect(evalSignal(result, 0)).toBe(0);

    // At t=100, input jumps to 1 but slew limits change
    // With rate=2, after 100ms from t=0 we can change by rate * dt = 2 * 0.1 = 0.2
    const afterJump = evalSignal(result, 100);
    expect(afterJump).toBeCloseTo(0.2, 2); // Slewed from 0 toward 1

    // At t=200, another 100ms passed, so we can change by another 0.2
    const later = evalSignal(result, 200);
    expect(later).toBeCloseTo(0.4, 2);
  });

  it('reaches target eventually', () => {
    const input = createSignalArtifact(() => 1.0);
    const lens: LensDefinition = { type: 'slew', params: { rate: 10.0 } };

    const result = applyLens(input, lens) as Artifact;

    // Initialize at target
    evalSignal(result, 0);
    // After enough time, should stay at target
    const final = evalSignal(result, 1000);
    expect(final).toBe(1);
  });
});

// =============================================================================
// Quantize Lens Tests
// =============================================================================

describe('QuantizeLens', () => {
  it('snaps to discrete steps', () => {
    const input = createSignalArtifact((t) => t / 1000);
    const lens: LensDefinition = { type: 'quantize', params: { steps: 4 } };

    const result = applyLens(input, lens) as Artifact;

    // With 4 steps: values snap to 0, 0.25, 0.5, 0.75, 1
    expect(evalSignal(result, 0)).toBe(0);
    expect(evalSignal(result, 125)).toBe(0.25); // 0.125 rounds to 0.25
    expect(evalSignal(result, 250)).toBe(0.25);
    expect(evalSignal(result, 375)).toBe(0.5);
    expect(evalSignal(result, 500)).toBe(0.5);
    expect(evalSignal(result, 625)).toBe(0.75);
    expect(evalSignal(result, 875)).toBe(1);
    expect(evalSignal(result, 1000)).toBe(1);
  });

  it('defaults to 4 steps', () => {
    const input = createSignalArtifact(() => 0.125);
    const lens: LensDefinition = { type: 'quantize', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0.25); // Rounds to nearest 0.25
  });

  it('handles edge case of 1 step', () => {
    const input = createSignalArtifact(() => 0.7);
    const lens: LensDefinition = { type: 'quantize', params: { steps: 1 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(1); // Rounds to nearest: 0 or 1
  });
});

// =============================================================================
// Scale Lens Tests
// =============================================================================

describe('ScaleLens', () => {
  it('applies linear scale and offset', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = { type: 'scale', params: { scale: 2, offset: 0.1 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(1.1, 5); // 0.5 * 2 + 0.1
  });

  it('defaults to identity transform', () => {
    const input = createSignalArtifact(() => 0.7);
    const lens: LensDefinition = { type: 'scale', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.7, 5);
  });

  it('can invert signal', () => {
    const input = createSignalArtifact(() => 0.3);
    const lens: LensDefinition = { type: 'scale', params: { scale: -1, offset: 1 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.7, 5); // 1 - 0.3
  });
});

// =============================================================================
// Warp Lens Tests
// =============================================================================

describe('WarpLens', () => {
  it('applies power curve', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = { type: 'warp', params: { power: 2 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.25, 5); // 0.5^2
  });

  it('defaults to linear (power=1)', () => {
    const input = createSignalArtifact(() => 0.7);
    const lens: LensDefinition = { type: 'warp', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.7, 5);
  });

  it('clamps input to 0-1', () => {
    const input = createSignalArtifact(() => 1.5);
    const lens: LensDefinition = { type: 'warp', params: { power: 2 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(1); // Clamped then squared
  });
});

// =============================================================================
// Broadcast Lens Tests
// =============================================================================

describe('BroadcastLens', () => {
  it('converts signal to constant field', () => {
    const input = createSignalArtifact(() => 0.75);
    const lens: LensDefinition = { type: 'broadcast', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Field:number');

    // Evaluate the field - need to narrow type first
    if (result.kind !== 'Field:number') throw new Error('Expected Field:number');
    const field = result.value as (seed: number, n: number, ctx: unknown) => number[];
    const values = field(0, 5, {});

    expect(values).toHaveLength(5);
    values.forEach((v) => expect(v).toBe(0.75));
  });
});

// =============================================================================
// PerElementOffset Lens Tests
// =============================================================================

describe('PerElementOffsetLens', () => {
  it('creates field with per-element offsets', () => {
    const input = createSignalArtifact(() => 0);
    const lens: LensDefinition = { type: 'perElementOffset', params: { range: 1.0 } };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Field:number');

    // Need to narrow type first
    if (result.kind !== 'Field:number') throw new Error('Expected Field:number');
    const field = result.value as (seed: number, n: number, ctx: unknown) => number[];
    const values = field(42, 5, {});

    expect(values).toHaveLength(5);
    // Values should be different (hash-based offsets)
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBeGreaterThan(1);
    // All values should be in range [0, 1]
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Lens Utilities', () => {
  it('getEasingNames returns available easings', () => {
    const names = getEasingNames();
    expect(names).toContain('linear');
    expect(names).toContain('easeInOutSine');
    expect(names).toContain('easeOutBounce');
    expect(names.length).toBeGreaterThan(10);
  });

  it('isValidLensType validates lens types', () => {
    expect(isValidLensType('ease')).toBe(true);
    expect(isValidLensType('slew')).toBe(true);
    expect(isValidLensType('quantize')).toBe(true);
    expect(isValidLensType('scale')).toBe(true);
    expect(isValidLensType('warp')).toBe(true);
    expect(isValidLensType('broadcast')).toBe(true);
    expect(isValidLensType('perElementOffset')).toBe(true);
    expect(isValidLensType('invalid')).toBe(false);
    expect(isValidLensType('')).toBe(false);
  });
});

// =============================================================================
// Preset Tests
// =============================================================================

describe('Lens Presets', () => {
  it('has expected presets defined', () => {
    expect(LENS_PRESETS.length).toBeGreaterThanOrEqual(10);

    // Check key presets exist
    expect(getLensPreset('breathing')).toBeDefined();
    expect(getLensPreset('snap')).toBeDefined();
    expect(getLensPreset('smooth')).toBeDefined();
    expect(getLensPreset('bounce')).toBeDefined();
    expect(getLensPreset('elastic')).toBeDefined();
  });

  it('getLensPresetsByCategory filters correctly', () => {
    const easingPresets = getLensPresetsByCategory('easing');
    expect(easingPresets.length).toBeGreaterThan(0);
    easingPresets.forEach((p) => expect(p.category).toBe('easing'));

    const quantizePresets = getLensPresetsByCategory('quantize');
    expect(quantizePresets.length).toBeGreaterThan(0);
    quantizePresets.forEach((p) => expect(p.category).toBe('quantize'));
  });

  it('createLensFromPreset returns copy of preset', () => {
    const lens = createLensFromPreset('breathing');
    expect(lens).toBeDefined();
    expect(lens!.type).toBe('ease');

    // Verify it's a copy, not the same object
    expect(lens).not.toBe(LENS_PRESET_BREATHING);
    expect(lens!.params).not.toBe(LENS_PRESET_BREATHING.params);
  });

  it('createLensFromPreset returns null for unknown preset', () => {
    expect(createLensFromPreset('nonexistent')).toBeNull();
  });

  it('breathing preset applies easeInOutSine', () => {
    const input = createSignalArtifact((t) => t / 1000);
    const result = applyLens(input, LENS_PRESET_BREATHING) as Artifact;

    expect(result.kind).toBe('Signal:number');
    // Mid-point should be exactly 0.5 for easeInOutSine
    expect(evalSignal(result, 500)).toBeCloseTo(0.5, 2);
  });

  it('snap preset quantizes to 4 steps', () => {
    const input = createSignalArtifact(() => 0.6);
    const result = applyLens(input, LENS_PRESET_SNAP) as Artifact;

    expect(evalSignal(result, 0)).toBe(0.5); // 0.6 rounds to 0.5 with 4 steps
  });

  it('smooth preset applies slew', () => {
    const input = createSignalArtifact(() => 1.0);
    const result = applyLens(input, LENS_PRESET_SMOOTH) as Artifact;

    expect(result.kind).toBe('Signal:number');
    // First evaluation initializes
    evalSignal(result, 0);
    // Rate limiting should be in effect - verify signal is callable
    expect(typeof evalSignal(result, 100)).toBe('number');
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Lens Error Handling', () => {
  it('returns error for unknown lens type', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens = { type: 'unknown' as any, params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Error');
    expect((result as any).message).toContain('Unknown lens type');
  });

  it('handles Signal:Unit input for ease lens', () => {
    const input: Artifact = {
      kind: 'Signal:Unit',
      value: () => 0.5,
    };
    const lens: LensDefinition = { type: 'ease', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Signal:number');
  });
});

// =============================================================================
// Clamp Lens Tests
// =============================================================================

describe('ClampLens', () => {
  it('clamps values to specified range', () => {
    const input = createSignalArtifact(() => 1.5);
    const lens: LensDefinition = { type: 'clamp', params: { min: 0, max: 1 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(1);
  });

  it('clamps negative values', () => {
    const input = createSignalArtifact(() => -0.5);
    const lens: LensDefinition = { type: 'clamp', params: { min: 0, max: 1 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0);
  });

  it('preserves values within range', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = { type: 'clamp', params: { min: 0, max: 1 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0.5);
  });

  it('works with custom ranges', () => {
    const input = createSignalArtifact(() => 50);
    const lens: LensDefinition = { type: 'clamp', params: { min: 0, max: 100 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(50);
  });
});

// =============================================================================
// Offset Lens Tests
// =============================================================================

describe('OffsetLens', () => {
  it('adds constant offset', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = { type: 'offset', params: { amount: 0.3 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.8, 5);
  });

  it('handles negative offsets', () => {
    const input = createSignalArtifact(() => 0.8);
    const lens: LensDefinition = { type: 'offset', params: { amount: -0.3 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.5, 5);
  });

  it('defaults to zero offset', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = { type: 'offset', params: {} };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0.5);
  });
});

// =============================================================================
// Deadzone Lens Tests
// =============================================================================

describe('DeadzoneLens', () => {
  it('zeros values below threshold', () => {
    const input = createSignalArtifact(() => 0.03);
    const lens: LensDefinition = { type: 'deadzone', params: { threshold: 0.05 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0);
  });

  it('preserves values above threshold', () => {
    const input = createSignalArtifact(() => 0.8);
    const lens: LensDefinition = { type: 'deadzone', params: { threshold: 0.05 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0.8);
  });

  it('handles negative values', () => {
    const input = createSignalArtifact(() => -0.03);
    const lens: LensDefinition = { type: 'deadzone', params: { threshold: 0.05 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(0);
  });

  it('uses absolute value for threshold comparison', () => {
    const input = createSignalArtifact(() => -0.1);
    const lens: LensDefinition = { type: 'deadzone', params: { threshold: 0.05 } };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBe(-0.1); // Preserved because abs(-0.1) >= 0.05
  });
});

// =============================================================================
// MapRange Lens Tests
// =============================================================================

describe('MapRangeLens', () => {
  it('maps input range to output range', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = {
      type: 'mapRange',
      params: { inMin: 0, inMax: 1, outMin: 0, outMax: 360 }
    };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(180, 5);
  });

  it('creates bipolar mapping', () => {
    const input = createSignalArtifact(() => 0.5);
    const lens: LensDefinition = {
      type: 'mapRange',
      params: { inMin: 0, inMax: 1, outMin: -1, outMax: 1 }
    };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0, 5);
  });

  it('handles inverted mappings', () => {
    const input = createSignalArtifact(() => 0.25);
    const lens: LensDefinition = {
      type: 'mapRange',
      params: { inMin: 0, inMax: 1, outMin: 1, outMax: 0 }
    };

    const result = applyLens(input, lens) as Artifact;
    expect(evalSignal(result, 0)).toBeCloseTo(0.75, 5);
  });
});

// =============================================================================
// Lens Stack Tests
// =============================================================================

describe('Lens Stacks', () => {
  it('applies multiple lenses in sequence', () => {
    const input = createSignalArtifact(() => 0.5);

    // First scale by 2, then offset by 0.1
    const lens1: LensDefinition = { type: 'scale', params: { scale: 2, offset: 0 } };
    const lens2: LensDefinition = { type: 'offset', params: { amount: 0.1 } };

    let result = applyLens(input, lens1) as Artifact;
    result = applyLens(result, lens2) as Artifact;

    expect(evalSignal(result, 0)).toBeCloseTo(1.1, 5); // (0.5 * 2) + 0.1
  });

  it('order matters in stacks', () => {
    const input = createSignalArtifact(() => 0.5);

    // Offset first, then scale
    const lens1: LensDefinition = { type: 'offset', params: { amount: 0.1 } };
    const lens2: LensDefinition = { type: 'scale', params: { scale: 2, offset: 0 } };

    let result = applyLens(input, lens1) as Artifact;
    result = applyLens(result, lens2) as Artifact;

    expect(evalSignal(result, 0)).toBeCloseTo(1.2, 5); // (0.5 + 0.1) * 2
  });

  it('clamp after mapRange prevents overflow', () => {
    const input = createSignalArtifact(() => 0.8);

    // Map to [0, 360] then clamp to [0, 180]
    const lens1: LensDefinition = {
      type: 'mapRange',
      params: { inMin: 0, inMax: 1, outMin: 0, outMax: 360 }
    };
    const lens2: LensDefinition = { type: 'clamp', params: { min: 0, max: 180 } };

    let result = applyLens(input, lens1) as Artifact;
    result = applyLens(result, lens2) as Artifact;

    expect(evalSignal(result, 0)).toBe(180); // 288 clamped to 180
  });

  it('deadzone before ease filters noise', () => {
    const input = createSignalArtifact(() => 0.02);

    // Remove small values, then apply easing
    const lens1: LensDefinition = { type: 'deadzone', params: { threshold: 0.05 } };
    const lens2: LensDefinition = { type: 'ease', params: { easing: 'easeInOutSine' } };

    let result = applyLens(input, lens1) as Artifact;
    result = applyLens(result, lens2) as Artifact;

    expect(evalSignal(result, 0)).toBeCloseTo(0, 5); // Deadzone zeroed it out
  });

  it('propagates errors through stack', () => {
    const input: Artifact = { kind: 'Scalar:number', value: 0.5 };
    const lens: LensDefinition = { type: 'scale', params: { scale: 2, offset: 0 } };

    const result = applyLens(input, lens) as Artifact;
    expect(result.kind).toBe('Error');
  });
});

// =============================================================================
// Lens Preset Tests
// =============================================================================

describe('New Lens Presets', () => {
  it('safe-unit preset clamps to [0,1]', () => {
    const preset = getLensPreset('safe-unit');
    expect(preset).toBeDefined();
    expect(preset?.lens.type).toBe('clamp');
    expect(preset?.lens.params.min).toBe(0);
    expect(preset?.lens.params.max).toBe(1);
  });

  it('deadzone-5pct preset zeros small values', () => {
    const preset = getLensPreset('deadzone-5pct');
    expect(preset).toBeDefined();
    expect(preset?.lens.type).toBe('deadzone');
    expect(preset?.lens.params.threshold).toBe(0.05);
  });

  it('phase-to-rotation preset maps [0,1] to [0,360]', () => {
    const preset = getLensPreset('phase-to-rotation');
    expect(preset).toBeDefined();
    expect(preset?.lens.type).toBe('mapRange');
    expect(preset?.lens.params.outMax).toBe(360);
  });

  it('bipolar preset creates [-1,1] range', () => {
    const preset = getLensPreset('bipolar');
    expect(preset).toBeDefined();
    expect(preset?.lens.type).toBe('mapRange');
    expect(preset?.lens.params.outMin).toBe(-1);
    expect(preset?.lens.params.outMax).toBe(1);
  });

  it('shaping category includes new lenses', () => {
    const shaping = getLensPresetsByCategory('shaping');
    expect(shaping.length).toBeGreaterThanOrEqual(5);
    expect(shaping.some(p => p.id === 'safe-unit')).toBe(true);
    expect(shaping.some(p => p.id === 'bipolar')).toBe(true);
  });
});

// =============================================================================
// Lens Type Validation Tests
// =============================================================================

describe('Extended Lens Type Validation', () => {
  it('validates new lens types', () => {
    expect(isValidLensType('clamp')).toBe(true);
    expect(isValidLensType('offset')).toBe(true);
    expect(isValidLensType('deadzone')).toBe(true);
    expect(isValidLensType('mapRange')).toBe(true);
  });

  it('still validates existing lens types', () => {
    expect(isValidLensType('ease')).toBe(true);
    expect(isValidLensType('slew')).toBe(true);
    expect(isValidLensType('quantize')).toBe(true);
    expect(isValidLensType('scale')).toBe(true);
    expect(isValidLensType('warp')).toBe(true);
    expect(isValidLensType('broadcast')).toBe(true);
    expect(isValidLensType('perElementOffset')).toBe(true);
  });

  it('rejects invalid lens types', () => {
    expect(isValidLensType('invalid')).toBe(false);
    expect(isValidLensType('CLAMP')).toBe(false);
    expect(isValidLensType('')).toBe(false);
  });
});
