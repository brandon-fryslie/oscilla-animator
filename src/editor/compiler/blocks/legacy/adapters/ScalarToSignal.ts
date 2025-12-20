/**
 * ScalarToSignal Block Compiler
 *
 * Lifts a Scalar<number> into a constant Signal<number>.
 */

import type { BlockCompiler, RuntimeCtx } from '../../../types';
import { scalarNum } from '../../helpers';

export const ScalarToSignalNumberBlock: BlockCompiler = {
  type: 'scalarToSignalNumber',
  inputs: [{ name: 'x', type: { kind: 'Scalar:number' }, required: false }],
  outputs: [{ name: 'signal', type: { kind: 'Signal:number' } }],

  compile({ inputs, params }) {
    let value: number;
    if (inputs.x?.kind === 'Scalar:number') {
      value = scalarNum(inputs.x, 'scalarToSignalNumber.x');
    } else {
      value = Number(params?.value ?? 0);
    }

    const signal = (_tMs: number, _ctx: RuntimeCtx): number => value;

    return { signal: { kind: 'Signal:number', value: signal } };
  },
};
