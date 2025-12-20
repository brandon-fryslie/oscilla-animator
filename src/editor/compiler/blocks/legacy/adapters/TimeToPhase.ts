/**
 * TimeToPhase Block Compiler
 *
 * Converts Signal:Time (seconds) into a cyclic Signal:Unit (0..1) using a period.
 */

import type { BlockCompiler, RuntimeCtx } from '../../../types';
import { scalarNum } from '../../helpers';

export const TimeToPhaseBlock: BlockCompiler = {
  type: 'timeToPhase',
  inputs: [
    { name: 'time', type: { kind: 'Signal:Time' }, required: true },
    { name: 'period', type: { kind: 'Scalar:number' }, required: false },
  ],
  outputs: [{ name: 'phase', type: { kind: 'Signal:Unit' } }],

  compile({ inputs, params }) {
    if (inputs.time?.kind !== 'Signal:Time') {
      return { phase: { kind: 'Error', message: 'timeToPhase: input must be Signal:Time' } };
    }

    const period =
      inputs.period?.kind === 'Scalar:number'
        ? Math.max(1e-6, scalarNum(inputs.period, 'timeToPhase.period'))
        : Math.max(1e-6, Number((params as any)?.period ?? 1));

    const timeSig = inputs.time.value as (t: number, ctx: RuntimeCtx) => number;
    const phaseSignal = (tMs: number, ctx: RuntimeCtx): number => {
      const t = timeSig(tMs, ctx);
      const p = period;
      const u = t / p;
      return u - Math.floor(u);
    };

    return { phase: { kind: 'Signal:Unit', value: phaseSignal } };
  },
};
