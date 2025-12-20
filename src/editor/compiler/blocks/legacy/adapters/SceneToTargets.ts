/**
 * SceneToTargets Block Compiler
 *
 * Converts Scene to SceneTargets (sample points from paths).
 * Pass-through adapter since SVGPathSource already produces TargetScene.
 */

import type { BlockCompiler, TargetScene } from '../../../types';

export const SceneToTargetsBlock: BlockCompiler = {
  type: 'SceneToTargets',
  inputs: [{ name: 'scene', type: { kind: 'TargetScene' }, required: true }],
  outputs: [{ name: 'targets', type: { kind: 'TargetScene' } }],

  compile({ id, inputs }) {
    if (inputs.scene?.kind !== 'TargetScene') {
      return {
        targets: { kind: 'Error', message: 'SceneToTargets: input must be TargetScene' },
      };
    }

    const inputScene = inputs.scene.value as TargetScene;

    // Pass through unchanged - scene already contains targets
    const outputScene: TargetScene = {
      ...inputScene,
      id: `${id}-targets`,
    };

    return { targets: { kind: 'TargetScene', value: outputScene } };
  },
};
