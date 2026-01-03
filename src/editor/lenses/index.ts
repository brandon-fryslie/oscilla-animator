export * from './LensRegistry';
export * from './lensResolution';

import type { Artifact, RuntimeCtx } from '../compiler/types';
import type { LensDefinition } from '../types';

// =============================================================================
// Easing Functions
// =============================================================================

const easingFunctions: Record<string, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeInElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
  },
  easeOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) {
      return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2;
    }
    return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1;
  },
  easeInBounce: (t) => 1 - easingFunctions.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t) => {
    return t < 0.5
      ? (1 - easingFunctions.easeOutBounce(1 - 2 * t)) / 2
      : (1 + easingFunctions.easeOutBounce(2 * t - 1)) / 2;
  },
};

export function getEasingNames(): string[] {
  return Object.keys(easingFunctions);
}

// =============================================================================
// Valid Lens Types
// =============================================================================

const VALID_LENS_TYPES = [
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
  'polarity',
  'phaseOffset',
];

export function isValidLensType(type: string): boolean {
  return VALID_LENS_TYPES.includes(type);
}

// =============================================================================
// Apply Lens - Main Entry Point
// =============================================================================

type SignalArtifact = { kind: 'Signal:number' | 'Signal:Unit'; value: (t: number, ctx: RuntimeCtx) => number };

function isSignalArtifact(art: Artifact): art is SignalArtifact {
  return art.kind === 'Signal:number' || art.kind === 'Signal:Unit';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Hash function for per-element offsets
function simpleHash(seed: number, index: number): number {
  let h = seed ^ index;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export function applyLens(input: Artifact, lens: LensDefinition): Artifact {
  // Handle unknown lens types
  if (!isValidLensType(lens.type)) {
    return { kind: 'Error', message: `Unknown lens type: ${lens.type}` };
  }

  const params = lens.params || {};

  switch (lens.type) {
    case 'ease':
      return applyEaseLens(input, params);
    case 'slew':
      return applySlewLens(input, params);
    case 'quantize':
      return applyQuantizeLens(input, params);
    case 'scale':
      return applyScaleLens(input, params);
    case 'warp':
      return applyWarpLens(input, params);
    case 'broadcast':
      return applyBroadcastLens(input, params);
    case 'perElementOffset':
      return applyPerElementOffsetLens(input, params);
    case 'clamp':
      return applyClampLens(input, params);
    case 'offset':
      return applyOffsetLens(input, params);
    case 'deadzone':
      return applyDeadzoneLens(input, params);
    case 'mapRange':
      return applyMapRangeLens(input, params);
    default:
      return { kind: 'Error', message: `Unknown lens type: ${lens.type}` };
  }
}

// =============================================================================
// Individual Lens Implementations
// =============================================================================

function applyEaseLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Ease lens requires Signal input' };
  }

  const easingName = (params.easing as string) || 'easeInOutSine';
  const easingFn = easingFunctions[easingName] || easingFunctions.easeInOutSine;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      const v = sig(t, ctx);
      const clamped = clamp(v, 0, 1);
      return easingFn(clamped);
    },
  };
}

function applySlewLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Slew lens requires Signal input' };
  }

  const rate = (params.rate as number) ?? 2.0;
  const sig = input.value;

  // Stateful slew with closure
  let lastValue: number | null = null;
  let lastTime: number | null = null;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      const target = sig(t, ctx);

      if (lastValue === null || lastTime === null) {
        // Initialize to target
        lastValue = target;
        lastTime = t;
        return target;
      }

      const dt = (t - lastTime) / 1000; // Convert ms to seconds
      const maxChange = rate * dt;
      const diff = target - lastValue;
      const change = Math.max(-maxChange, Math.min(maxChange, diff));

      lastValue = lastValue + change;
      lastTime = t;

      return lastValue;
    },
  };
}

function applyQuantizeLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Quantize lens requires Signal input' };
  }

  const steps = (params.steps as number) ?? 4;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      const v = sig(t, ctx);
      // Snap to nearest step
      return Math.round(v * steps) / steps;
    },
  };
}

function applyScaleLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Scale lens requires Signal input' };
  }

  const scale = (params.scale as number) ?? 1;
  const offset = (params.offset as number) ?? 0;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      return sig(t, ctx) * scale + offset;
    },
  };
}

function applyWarpLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Warp lens requires Signal input' };
  }

  const power = (params.power as number) ?? 1;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      const v = clamp(sig(t, ctx), 0, 1);
      return Math.pow(v, power);
    },
  };
}

function applyBroadcastLens(input: Artifact, _params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Broadcast lens requires Signal input' };
  }

  const sig = input.value;

  return {
    kind: 'Field:number',
    value: (_seed: number, n: number, _ctx: unknown) => {
      // Broadcast the signal value to all elements
      // Note: We evaluate at t=0 since Field is compile-time
      const ctx: RuntimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
      const v = sig(0, ctx);
      return Array(n).fill(v);
    },
  };
}

function applyPerElementOffsetLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'PerElementOffset lens requires Signal input' };
  }

  const range = (params.range as number) ?? 1.0;
  const sig = input.value;

  return {
    kind: 'Field:number',
    value: (seed: number, n: number, _ctx: unknown) => {
      const ctx: RuntimeCtx = { viewport: { w: 800, h: 600, dpr: 1 } };
      const baseValue = sig(0, ctx);
      return Array.from({ length: n }, (_, i) => {
        const offset = simpleHash(seed, i) * range;
        return baseValue + offset;
      });
    },
  };
}

function applyClampLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Clamp lens requires Signal input' };
  }

  const min = (params.min as number) ?? 0;
  const max = (params.max as number) ?? 1;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      return clamp(sig(t, ctx), min, max);
    },
  };
}

function applyOffsetLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Offset lens requires Signal input' };
  }

  const amount = (params.amount as number) ?? 0;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      return sig(t, ctx) + amount;
    },
  };
}

function applyDeadzoneLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'Deadzone lens requires Signal input' };
  }

  const threshold = (params.threshold as number) ?? 0.05;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      const v = sig(t, ctx);
      return Math.abs(v) < threshold ? 0 : v;
    },
  };
}

function applyMapRangeLens(input: Artifact, params: Record<string, unknown>): Artifact {
  if (!isSignalArtifact(input)) {
    return { kind: 'Error', message: 'MapRange lens requires Signal input' };
  }

  const inMin = (params.inMin as number) ?? 0;
  const inMax = (params.inMax as number) ?? 1;
  const outMin = (params.outMin as number) ?? 0;
  const outMax = (params.outMax as number) ?? 1;
  const sig = input.value;

  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {
      const v = sig(t, ctx);
      // Linear interpolation from input range to output range
      const normalized = (v - inMin) / (inMax - inMin);
      return outMin + normalized * (outMax - outMin);
    },
  };
}
