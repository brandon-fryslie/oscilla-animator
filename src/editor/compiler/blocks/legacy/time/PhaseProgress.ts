/**
 * PhaseProgress Block Compiler
 *
 * Takes a PhaseMachine and outputs the eased progress (u) as a Signal<Unit>.
 * This is the primary animation driver - outputs [0,1] over each phase.
 */

import type { BlockCompiler, PhaseMachine, RuntimeCtx } from '../../../types';

export const PhaseProgressBlock: BlockCompiler = {
  type: 'phaseProgress',
  inputs: [{ name: 'phase', type: { kind: 'PhaseMachine' }, required: true }],
  outputs: [{ name: 'progress', type: { kind: 'Signal:Unit' } }],

  compile({ inputs }) {
    if (inputs.phase?.kind !== 'PhaseMachine') {
      return {
        progress: { kind: 'Error', message: 'PhaseProgress: input must be PhaseMachine' },
      };
    }

    const phaseMachine = inputs.phase.value as PhaseMachine;

    // Create a signal that samples the phase machine and returns the eased progress
    const progressSignal = (tMs: number, _ctx: RuntimeCtx): number => {
      const sample = phaseMachine.sample(tMs);
      return sample.u;
    };

    return { progress: { kind: 'Signal:Unit', value: progressSignal } };
  },
};
