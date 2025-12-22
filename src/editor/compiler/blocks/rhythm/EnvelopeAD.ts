/**
 * EnvelopeAD Block Compiler
 *
 * Stateful envelope generator with attack and decay phases.
 * Triggers on rising edge of event signal, then follows AR envelope curve.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

export const EnvelopeADBlock: BlockCompiler = {
  type: 'EnvelopeAD',

  inputs: [
    { name: 'trigger', type: { kind: 'Signal:Unit' }, required: true },
  ],

  outputs: [
    { name: 'env', type: { kind: 'Signal:number' } },
  ],

  compile({ params, inputs }) {
    const triggerArtifact = inputs.trigger;
    if (!isDefined(triggerArtifact) || triggerArtifact.kind !== 'Signal:Unit') {
      return {
        env: {
          kind: 'Error',
          message: 'EnvelopeAD requires a Signal<Unit> input',
        },
      };
    }

    const triggerSignal = triggerArtifact.value as Signal<number>;
    const attack = Number(params.attack ?? 0.05) * 1000; // Convert to ms
    const decay = Number(params.decay ?? 0.5) * 1000;
    const peak = Number(params.peak ?? 1.0);

    // State for trigger detection and envelope timing
    let triggerTime = -Infinity;
    let wasTriggered = false;

    // Envelope signal
    const envelopeSignal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const trig = triggerSignal(t, ctx);

      // Detect rising edge (event fires)
      if (trig > 0.5 && !wasTriggered) {
        triggerTime = t;
        wasTriggered = true;
      } else if (trig <= 0.5) {
        wasTriggered = false;
      }

      // Calculate envelope value
      const elapsed = t - triggerTime;

      if (elapsed < 0) {
        // Before first trigger
        return 0;
      } else if (elapsed < attack) {
        // Attack phase
        return (elapsed / attack) * peak;
      } else if (elapsed < attack + decay) {
        // Decay phase
        const decayProgress = (elapsed - attack) / decay;
        return peak * (1 - decayProgress);
      } else {
        // After envelope completes
        return 0;
      }
    };

    return {
      env: { kind: 'Signal:number', value: envelopeSignal },
    };
  },
};
