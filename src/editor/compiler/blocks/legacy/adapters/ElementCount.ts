/**
 * ElementCount Block Compiler
 *
 * Extracts the number of elements (targets) from a TargetScene.
 * Outputs a scalar number that can be used for field sizing.
 */

import type { BlockCompiler, TargetScene } from '../../../types';

export const ElementCountBlock: BlockCompiler = {
  type: 'elementCount',
  inputs: [{ name: 'targets', type: { kind: 'TargetScene' }, required: true }],
  outputs: [{ name: 'count', type: { kind: 'Scalar:number' } }],

  compile({ inputs }) {
    if (inputs.targets?.kind !== 'TargetScene') {
      return {
        count: { kind: 'Error', message: 'ElementCount: input must be TargetScene' },
      };
    }

    const scene = inputs.targets.value as TargetScene;
    const count = scene.targets?.length ?? 0;

    return { count: { kind: 'Scalar:number', value: count } };
  },
};
