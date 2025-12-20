/**
 * WrapPhase Block Compiler
 *
 * Wraps Signal:Unit into [0,1) by taking fractional part.
 */

import type { BlockCompiler, RuntimeCtx } from '../../../types';

export const WrapPhaseBlock: BlockCompiler = {
  type: 'wrapPhase',
  inputs: [{ name: 'phase', type: { kind: 'Signal:Unit' }, required: true }],
  outputs: [{ name: 'wrapped', type: { kind: 'Signal:Unit' } }],

  compile({ inputs }) {
    if (inputs.phase?.kind !== 'Signal:Unit') {
      return { wrapped: { kind: 'Error', message: 'wrapPhase: input must be Signal:Unit' } };
    }

    const phaseSig = inputs.phase.value as (t: number, ctx: RuntimeCtx) => number;
    const wrappedSig = (tMs: number, ctx: RuntimeCtx): number => {
      const u = phaseSig(tMs, ctx);
      return u - Math.floor(u);
    };

    return { wrapped: { kind: 'Signal:Unit', value: wrappedSig } };
  },
};
