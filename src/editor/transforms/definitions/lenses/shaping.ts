/**
 * Shaping Lenses
 *
 * Value transformations: deadzone, quantize, mapRange, polarity.
 * These modify signal values in non-linear ways.
 */

import { TRANSFORM_REGISTRY } from '../../TransformRegistry';
import type { Artifact, RuntimeCtx } from '../../../compiler/types';

type SignalFloatFn = (t: number, ctx: RuntimeCtx) => number;

// =============================================================================
// deadzone lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'deadzone',
  label: 'Deadzone',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    threshold: {
      type: 'Scalar:float',
      default: 0.05,
      uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      rangeHint: { min: 0, max: 1, step: 0.01 },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Deadzone lens requires Signal:float, got ${value.kind}` };
    }

    const threshold = params.threshold?.kind === 'Scalar:float' ? params.threshold.value : 0.05;
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => {
        const v = sig(t, ctx);
        return Math.abs(v) < threshold ? 0 : v;
      },
    };
  },
});

// =============================================================================
// quantize lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'quantize',
  label: 'Quantize',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    steps: {
      type: 'Scalar:int',
      default: 4,
      uiHint: { kind: 'slider', min: 2, max: 32, step: 1 },
      rangeHint: { min: 2, max: 32, step: 1 },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Quantize lens requires Signal:float, got ${value.kind}` };
    }

    const steps = params.steps?.kind === 'Scalar:int' ? params.steps.value : 4;
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => {
        const v = sig(t, ctx);
        return Math.round(v * steps) / steps;
      },
    };
  },
});

// =============================================================================
// mapRange lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'mapRange',
  label: 'Map Range',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    inMin: {
      type: 'Scalar:float',
      default: 0,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
    inMax: {
      type: 'Scalar:float',
      default: 1,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
    outMin: {
      type: 'Scalar:float',
      default: 0,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
    outMax: {
      type: 'Scalar:float',
      default: 1,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `MapRange lens requires Signal:float, got ${value.kind}` };
    }

    const inMin = params.inMin?.kind === 'Scalar:float' ? params.inMin.value : 0;
    const inMax = params.inMax?.kind === 'Scalar:float' ? params.inMax.value : 1;
    const outMin = params.outMin?.kind === 'Scalar:float' ? params.outMin.value : 0;
    const outMax = params.outMax?.kind === 'Scalar:float' ? params.outMax.value : 1;
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => {
        const v = sig(t, ctx);
        const normalized = (v - inMin) / (inMax - inMin);
        return outMin + normalized * (outMax - outMin);
      },
    };
  },
});

// =============================================================================
// polarity lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'polarity',
  label: 'Polarity',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    invert: {
      type: 'Scalar:boolean',
      default: false,
      uiHint: { kind: 'boolean' },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Polarity lens requires Signal:float, got ${value.kind}` };
    }

    const invert = params.invert?.kind === 'Scalar:boolean' ? params.invert.value : false;
    const sig = value.value as SignalFloatFn;

    if (!invert) {
      // No-op if not inverting
      return value;
    }

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => -sig(t, ctx),
    };
  },
});
