/**
 * EaseRamp Block Compiler
 *
 * Applies an easing function to a 0-1 progress signal.
 * Note: This is a placeholder - full signal support requires more infrastructure.
 */

import type { BlockCompiler } from '../../../types';
import { getEasing } from '../../helpers';

export const EaseRampBlock: BlockCompiler = {
  type: 'EaseRamp',
  inputs: [{ name: 'progress', type: { kind: 'Scalar:number' }, required: false }],
  outputs: [{ name: 'eased', type: { kind: 'Scalar:number' } }],

  compile({ params, inputs }) {
    const easingName = String(params.easing ?? 'easeOutCubic');
    const ease = getEasing(easingName);

    // Get input progress (default to 0 if not connected)
    const progress =
      inputs.progress?.kind === 'Scalar:number' ? inputs.progress.value : 0;

    const eased = ease(Math.max(0, Math.min(1, progress)));

    return { eased: { kind: 'Scalar:number', value: eased } };
  },
};
