/**
 * Bus Lenses
 *
 * Lenses are transformations applied on the listener side of bus subscriptions.
 * They enable "binding phase/energy produces pleasing motion immediately".
 *
 * Example use cases:
 * - A `signal:phase` bus value drives an `opacity` parameter via EaseLens
 * - An `energy` bus modulates `size` with SlewLens for smooth transitions
 * - A `phaseA` bus drives rotation with QuantizeLens for "steppy" motion
 */

import type { LensDefinition, LensType } from './types';
import type { Artifact, RuntimeCtx, Field, CompileCtx, Seed } from './compiler/types';

// =============================================================================
// Easing Functions
// =============================================================================

type EasingFn = (t: number) => number;

const EASING_FUNCTIONS: Record<string, EasingFn> = {
  // Linear (identity)
  linear: (t) => t,

  // Sine
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Quad
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),

  // Cubic
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Expo
  easeInExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2,

  // Elastic
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
        ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  // Bounce
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  },
};

// =============================================================================
// Lens Evaluators
// =============================================================================

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

/**
 * Apply ease lens to a Signal:number artifact.
 * Input is expected to be in [0,1] range.
 */
function applyEaseLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `EaseLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const easingName = (params.easing as string) ?? 'easeInOutSine';
  const easingFn = EASING_FUNCTIONS[easingName] ?? EASING_FUNCTIONS.linear;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const value = inputSignal(tMs, ctx);
    // Clamp to [0,1] before applying easing
    const clamped = Math.max(0, Math.min(1, value));
    return easingFn(clamped);
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply slew lens to a Signal:number artifact.
 * Provides rate-limited smoothing for gradual transitions.
 */
function applySlewLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `SlewLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const rate = (params.rate as number) ?? 0.1; // Units per second
  const inputSignal = artifact.value as SignalNumber;

  // Track state across frames
  let prevTime: number | null = null;
  let currentValue: number | null = null;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const target = inputSignal(tMs, ctx);

    // Initialize on first call
    if (currentValue === null || prevTime === null) {
      currentValue = target;
      prevTime = tMs;
      return target;
    }

    // Handle time jump backwards (scrubbing)
    if (tMs < prevTime) {
      currentValue = target;
      prevTime = tMs;
      return target;
    }

    // Calculate dt in seconds
    const dt = (tMs - prevTime) / 1000;
    prevTime = tMs;

    // Slew toward target
    const maxChange = rate * dt;
    const diff = target - currentValue;

    if (Math.abs(diff) <= maxChange) {
      currentValue = target;
    } else {
      currentValue += Math.sign(diff) * maxChange;
    }

    return currentValue;
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply quantize lens to a Signal:number artifact.
 * Snaps values to discrete steps for "steppy" motion.
 */
function applyQuantizeLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `QuantizeLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const steps = Math.max(1, (params.steps as number) ?? 4);
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const value = inputSignal(tMs, ctx);
    // Quantize to nearest step
    return Math.round(value * steps) / steps;
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply scale lens to a Signal:number artifact.
 * Linear transform: output = input * scale + offset
 */
function applyScaleLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `ScaleLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const scale = (params.scale as number) ?? 1;
  const offset = (params.offset as number) ?? 0;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    return inputSignal(tMs, ctx) * scale + offset;
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply warp lens to a Signal:number artifact.
 * Phase warping - speeds up or slows down parts of the cycle.
 */
function applyWarpLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `WarpLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  // Power warp: output = input^power (where power > 1 slows start, < 1 slows end)
  const power = (params.power as number) ?? 1;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const value = inputSignal(tMs, ctx);
    const clamped = Math.max(0, Math.min(1, value));
    return Math.pow(clamped, power);
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply broadcast lens - lift a scalar signal to a constant field.
 */
function applyBroadcastLens(
  artifact: Artifact,
  _params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `BroadcastLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  // For broadcast, we need to create a Field that samples the signal at compile time
  // This is a compile-time to runtime bridge - the signal value at t=0 becomes the constant
  // Note: This is a simplified implementation. Full implementation would need RuntimeCtx at Field evaluation.
  const inputSignal = artifact.value as SignalNumber;

  // We return a Field that, when evaluated, returns constant values
  // The signal is sampled at t=0 to get the constant
  const broadcastField: Field<number> = (_seed: Seed, n: number, _ctx: CompileCtx) => {
    // Sample signal at t=0 with minimal context
    const sampleCtx: RuntimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
    const constantValue = inputSignal(0, sampleCtx);

    const result: number[] = [];
    for (let i = 0; i < n; i++) {
      result.push(constantValue);
    }
    return result;
  };

  return { kind: 'Field:number', value: broadcastField };
}

/**
 * Apply perElementOffset lens - add per-element offset to a signal.
 * Creates a Field by adding hash-based offset to each element.
 */
function applyPerElementOffsetLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `PerElementOffsetLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const offsetRange = (params.range as number) ?? 1.0;
  const inputSignal = artifact.value as SignalNumber;

  // This lens needs to return a Field, but Fields are compile-time evaluated
  // We'll create a Field that captures the signal and adds random offsets
  const offsetField: Field<number> = (seed: Seed, n: number, _ctx: CompileCtx) => {
    // Generate per-element offsets using simple hash
    const offsets: number[] = [];
    for (let i = 0; i < n; i++) {
      // Simple hash based on seed and index
      const hash = ((seed * 31337) ^ (i * 73856093)) >>> 0;
      const normalized = (hash % 10000) / 10000;
      offsets.push(normalized * offsetRange);
    }

    // Sample signal at t=0 and add offsets
    const sampleCtx: RuntimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
    const baseValue = inputSignal(0, sampleCtx);

    return offsets.map((offset) => baseValue + offset);
  };

  return { kind: 'Field:number', value: offsetField };
}

/**
 * Apply clamp lens to a Signal:number artifact.
 * Bounds values to [min, max] range.
 */
function applyClampLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `ClampLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const min = (params.min as number) ?? 0;
  const max = (params.max as number) ?? 1;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const value = inputSignal(tMs, ctx);
    return Math.max(min, Math.min(max, value));
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply offset lens to a Signal:number artifact.
 * Adds a constant offset to the value.
 */
function applyOffsetLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `OffsetLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const amount = (params.amount as number) ?? 0;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    return inputSignal(tMs, ctx) + amount;
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply deadzone lens to a Signal:number artifact.
 * Zeros out values below the threshold.
 */
function applyDeadzoneLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `DeadzoneLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const threshold = (params.threshold as number) ?? 0.05;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const value = inputSignal(tMs, ctx);
    return Math.abs(value) < threshold ? 0 : value;
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

/**
 * Apply mapRange lens to a Signal:number artifact.
 * Maps input range to output range linearly.
 */
function applyMapRangeLens(
  artifact: Artifact,
  params: Record<string, unknown>
): Artifact {
  if (artifact.kind !== 'Signal:number' && artifact.kind !== 'Signal:Unit') {
    return {
      kind: 'Error',
      message: `MapRangeLens requires Signal:number or Signal:Unit input, got ${artifact.kind}`,
    };
  }

  const inMin = (params.inMin as number) ?? 0;
  const inMax = (params.inMax as number) ?? 1;
  const outMin = (params.outMin as number) ?? 0;
  const outMax = (params.outMax as number) ?? 1;
  const inputSignal = artifact.value as SignalNumber;

  const lensedSignal: SignalNumber = (tMs, ctx) => {
    const value = inputSignal(tMs, ctx);
    const normalized = (value - inMin) / (inMax - inMin);
    return outMin + normalized * (outMax - outMin);
  };

  return { kind: 'Signal:number', value: lensedSignal };
}

// =============================================================================
// Main Lens Application
// =============================================================================

/**
 * Apply a lens to an artifact, transforming the bus value.
 */
export function applyLens(
  artifact: Artifact,
  lens: LensDefinition
): Artifact {
  switch (lens.type) {
    case 'ease':
      return applyEaseLens(artifact, lens.params);
    case 'slew':
      return applySlewLens(artifact, lens.params);
    case 'quantize':
      return applyQuantizeLens(artifact, lens.params);
    case 'scale':
      return applyScaleLens(artifact, lens.params);
    case 'warp':
      return applyWarpLens(artifact, lens.params);
    case 'broadcast':
      return applyBroadcastLens(artifact, lens.params);
    case 'perElementOffset':
      return applyPerElementOffsetLens(artifact, lens.params);
    case 'clamp':
      return applyClampLens(artifact, lens.params);
    case 'offset':
      return applyOffsetLens(artifact, lens.params);
    case 'deadzone':
      return applyDeadzoneLens(artifact, lens.params);
    case 'mapRange':
      return applyMapRangeLens(artifact, lens.params);
    default:
      return {
        kind: 'Error',
        message: `Unknown lens type: ${lens.type}`,
      };
  }
}

/**
 * Get available easing function names for UI.
 */
export function getEasingNames(): string[] {
  return Object.keys(EASING_FUNCTIONS);
}

/**
 * Type guard for lens types.
 */
export function isValidLensType(type: string): type is LensType {
  return [
    'ease',
    'slew',
    'quantize',
    'scale',
    'warp',
    'broadcast',
    'perElementOffset',
    'clamp',
    'offset',
    'deadzone',
    'mapRange',
  ].includes(type);
}
