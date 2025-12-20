/**
 * PulseDivider Block Compiler
 *
 * Subdivides phase into discrete tick events.
 * Detects when (phase * divisions) crosses integer boundaries.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

export const PulseDividerBlock: BlockCompiler = {
  type: 'PulseDivider',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
  ],

  outputs: [
    { name: 'tick', type: { kind: 'Signal:Unit' } },
  ],

  compile({ params, inputs }) {
    const phaseArtifact = inputs.phase;
    if (!phaseArtifact || phaseArtifact.kind !== 'Signal:phase') {
      return {
        tick: {
          kind: 'Error',
          message: 'PulseDivider requires a Signal<phase> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as Signal<number>;
    const divisions = Number(params.divisions ?? 4);

    // State for edge detection
    let lastSubPhase = -1;

    // Event signal: returns 1 on tick frame, 0 otherwise
    const eventSignal: Signal<number> = (t: number, ctx: RuntimeCtx) => {
      const phase = phaseSignal(t, ctx);
      const subPhase = Math.floor(phase * divisions);

      // Detect crossing
      if (subPhase !== lastSubPhase) {
        lastSubPhase = subPhase;
        return 1;
      }

      return 0;
    };

    return {
      tick: { kind: 'Signal:Unit', value: eventSignal },
    };
  },
};
