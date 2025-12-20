/**
 * PhaseToTime Block Compiler
 *
 * Converts Signal:Unit (phase 0..1) to Signal:Time using a period.
 */

import type { BlockCompiler, RuntimeCtx } from '../../../types';
import { scalarNum } from '../../helpers';

export const PhaseToTimeBlock: BlockCompiler = {
  type: 'phaseToTime',
  inputs: [
    { name: 'phase', type: { kind: 'Signal:Unit' }, required: true },
    { name: 'period', type: { kind: 'Scalar:number' }, required: false },
  ],
  outputs: [{ name: 'time', type: { kind: 'Signal:Time' } }],

  compile({ inputs, params }) {
    if (inputs.phase?.kind !== 'Signal:Unit') {
      return { time: { kind: 'Error', message: 'phaseToTime: input must be Signal:Unit' } };
    }

    const period =
      inputs.period?.kind === 'Scalar:number'
        ? Math.max(1e-6, scalarNum(inputs.period, 'phaseToTime.period'))
        : Math.max(1e-6, Number((params as any)?.period ?? 1));

    const phaseSig = inputs.phase.value as (t: number, ctx: RuntimeCtx) => number;
    const timeSignal = (tMs: number, ctx: RuntimeCtx): number => {
      const u = phaseSig(tMs, ctx);
      return u * period;
    };

    return { time: { kind: 'Signal:Time', value: timeSignal } };
  },
};
