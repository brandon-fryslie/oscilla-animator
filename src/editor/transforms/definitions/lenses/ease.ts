/**
 * Ease Lens
 *
 * Apply easing functions to signal values.
 * Clamps input to [0,1] and applies the selected easing curve.
 */

import { TRANSFORM_REGISTRY } from '../../TransformRegistry';
import type { Artifact, RuntimeCtx } from '../../../compiler/types';
import { getEasingFunction } from '../../../lenses/easing';
import { parseTypeDesc } from '../../../ir/types/TypeDesc';

type SignalFloatFn = (t: number, ctx: RuntimeCtx) => number;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// =============================================================================
// ease lens
// =============================================================================

TRANSFORM_REGISTRY.registerLens({
  id: 'ease',
  label: 'Ease',
  inputType: 'same',
  outputType: 'same',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'],
  params: {
    easing: {
      type: parseTypeDesc('Scalar:string'),
      default: 'easeInOutSine',
      uiHint: {
        kind: 'select',
        options: [
          { value: 'linear', label: 'Linear' },
          { value: 'easeInQuad', label: 'Ease In Quad' },
          { value: 'easeOutQuad', label: 'Ease Out Quad' },
          { value: 'easeInOutQuad', label: 'Ease In-Out Quad' },
          { value: 'easeInSine', label: 'Ease In Sine' },
          { value: 'easeOutSine', label: 'Ease Out Sine' },
          { value: 'easeInOutSine', label: 'Ease In-Out Sine' },
          { value: 'easeInExpo', label: 'Ease In Expo' },
          { value: 'easeOutExpo', label: 'Ease Out Expo' },
          { value: 'easeInOutExpo', label: 'Ease In-Out Expo' },
          { value: 'easeInElastic', label: 'Ease In Elastic' },
          { value: 'easeOutElastic', label: 'Ease Out Elastic' },
          { value: 'easeInOutElastic', label: 'Ease In-Out Elastic' },
          { value: 'easeInBounce', label: 'Ease In Bounce' },
          { value: 'easeOutBounce', label: 'Ease Out Bounce' },
          { value: 'easeInOutBounce', label: 'Ease In-Out Bounce' },
        ],
      },
    },
  },
  costHint: 'medium',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params: Record<string, Artifact>, _ctx: RuntimeCtx): Artifact => {
    if (value.kind !== 'Signal:float' && value.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `Ease lens requires Signal:float, got ${value.kind}` };
    }

    const easingName = params.easing?.kind === 'Scalar:string'
      ? params.easing.value
      : 'easeInOutSine';
    const easingFn = getEasingFunction(easingName);
    const sig = value.value as SignalFloatFn;

    return {
      kind: 'Signal:float',
      value: (t: number, ctx: RuntimeCtx) => {
        const v = sig(t, ctx);
        const clamped = clamp(v, 0, 1);
        return easingFn(clamped);
      },
    };
  },
});
