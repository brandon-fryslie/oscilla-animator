/**
 * TriggerOnWrap Block Compiler
 *
 * Takes a Signal<number> (typically a phase signal) and generates a trigger signal
 * whenever the signal wraps from near 1 back to near 0.
 *
 * Output is Signal:Unit where 1 = triggered, 0 = not triggered.
 * This is useful for converting continuous phase clocks into discrete rhythm events.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

export const TriggerOnWrapBlock: BlockCompiler = {
  type: 'TriggerOnWrap',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'trigger', type: { kind: 'Signal:Unit' } },
  ],

  compile({ inputs }) {
    const phaseArtifact = inputs.phase;
    if (!isDefined(phaseArtifact) || phaseArtifact.kind !== 'Signal:number') {
      return {
        trigger: {
          kind: 'Error',
          message: 'TriggerOnWrap requires a Signal<number> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as SignalNumber;

    // Track previous value to detect wraps
    // Note: This uses closure state which may not be ideal for scrubbing
    // A better approach would be to compute wrap based on time directly
    let prevValue: number | null = null;
    let prevTime: number | null = null;

    const triggerSignal: SignalNumber = (tMs, ctx) => {
      const currentValue = phaseSignal(tMs, ctx);

      // Reset state if time jumps backwards (scrubbing)
      if (prevTime !== null && tMs < prevTime) {
        prevValue = null;
      }

      // Detect wrap: previous value was high (>0.8) and current is low (<0.2)
      const didWrap =
        prevValue !== null && prevValue > 0.8 && currentValue < 0.2;

      prevValue = currentValue;
      prevTime = tMs;

      return didWrap ? 1 : 0;
    };

    return {
      trigger: { kind: 'Signal:Unit', value: triggerSignal },
    };
  },
};
