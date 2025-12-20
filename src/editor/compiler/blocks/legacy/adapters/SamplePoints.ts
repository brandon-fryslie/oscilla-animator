/**
 * SamplePoints Block Compiler
 *
 * Extracts point targets from scene paths.
 * This is essentially a pass-through since SVGPathSource already samples.
 */

import type { BlockCompiler, TargetScene } from '../../../types';

export const SamplePointsBlock: BlockCompiler = {
  type: 'SamplePoints',
  inputs: [{ name: 'scene', type: { kind: 'TargetScene' }, required: true }],
  outputs: [{ name: 'targets', type: { kind: 'TargetScene' } }],

  compile({ id, params, inputs }) {
    if (inputs.scene?.kind !== 'TargetScene') {
      return {
        targets: { kind: 'Error', message: 'SamplePoints: input must be TargetScene' },
      };
    }

    const inputScene = inputs.scene.value as TargetScene;
    const density = Number(params.density ?? 1.0);

    // For now, pass through the scene unchanged
    // In the future, could resample with different density
    const outputScene: TargetScene = {
      ...inputScene,
      id: `${id}-sampled`,
      meta: {
        ...inputScene.meta,
        sampleDensity: density,
      },
    };

    return { targets: { kind: 'TargetScene', value: outputScene } };
  },
};
