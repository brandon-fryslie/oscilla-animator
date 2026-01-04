/**
 * Arithmetic Lenses
 *
 * Basic mathematical transformations: scale, offset, clamp.
 * These are type-preserving and work in signal world.
 */

import { TRANSFORM_REGISTRY } from '../../TransformRegistry';
import type { Artifact, RuntimeCtx } from '../../../compiler/types';
import { parseTypeDesc } from '../../../ir/types/TypeDesc';

type SignalFloatFn = (t: number, ctx: RuntimeCtx) => number;

// =============================================================================
// scale lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'scale',
  label: 'Scale',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    scale: {
      type: parseTypeDesc('Scalar:float'),
      default: 1,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
    offset: {
      type: parseTypeDesc('Scalar:float'),
      default: 0,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Scale lens requires Signal:float, got ${value.kind}` };
    }

    const scale = params.scale?.kind === 'Scalar:float' ? params.scale.value : 1;
    const offset = params.offset?.kind === 'Scalar:float' ? params.offset.value : 0;
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => sig(t, ctx) * scale + offset,
    };
  },
});

// =============================================================================
// offset lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'offset',
  label: 'Offset',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    amount: {
      type: parseTypeDesc('Scalar:float'),
      default: 0,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Offset lens requires Signal:float, got ${value.kind}` };
    }

    const amount = params.amount?.kind === 'Scalar:float' ? params.amount.value : 0;
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => sig(t, ctx) + amount,
    };
  },
});

// =============================================================================
// clamp lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'clamp',
  label: 'Clamp',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    min: {
      type: parseTypeDesc('Scalar:float'),
      default: 0,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
    max: {
      type: parseTypeDesc('Scalar:float'),
      default: 1,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 },
      rangeHint: { min: -10, max: 10, step: 0.1 },
    },
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Clamp lens requires Signal:float, got ${value.kind}` };
    }

    const min = params.min?.kind === 'Scalar:float' ? params.min.value : 0;
    const max = params.max?.kind === 'Scalar:float' ? params.max.value : 1;
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => {
        const v = sig(t, ctx);
        return Math.max(min, Math.min(max, v));
      },
    };
  },
});
