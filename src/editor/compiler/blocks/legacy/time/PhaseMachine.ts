/**
 * PhaseMachine Block Compiler
 *
 * Creates a three-phase animation structure: entrance, hold, exit.
 * Outputs: PhaseMachine that can sample phase at any time.
 */

import type { BlockCompiler, PhaseMachine, PhaseSample } from '../../../types';
import { getEasing } from '../../helpers';

export const PhaseMachineBlock: BlockCompiler = {
  type: 'PhaseMachine',
  inputs: [],
  outputs: [{ name: 'phase', type: { kind: 'PhaseMachine' } }],

  compile({ params }) {
    const entranceDuration = Number(params.entranceDuration ?? 2.5) * 1000; // Convert to ms
    const holdDuration = Number(params.holdDuration ?? 2.0) * 1000;
    const exitDuration = Number(params.exitDuration ?? 0.5) * 1000;

    const entranceEase = getEasing('easeOutCubic');
    const exitEase = getEasing('easeInCubic');

    const totalDuration = entranceDuration + holdDuration + exitDuration;

    const phaseMachine: PhaseMachine = {
      sample(tMs: number): PhaseSample {
        // Clamp time to valid range
        const t = Math.max(0, Math.min(tMs, totalDuration));

        if (t < entranceDuration) {
          // Entrance phase
          const uRaw = entranceDuration > 0 ? t / entranceDuration : 1;
          const u = entranceEase(uRaw);
          return {
            phase: 'entrance',
            u,
            uRaw,
            tLocal: t,
          };
        } else if (t < entranceDuration + holdDuration) {
          // Hold phase
          const tLocal = t - entranceDuration;
          const uRaw = holdDuration > 0 ? tLocal / holdDuration : 1;
          return {
            phase: 'hold',
            u: uRaw,
            uRaw,
            tLocal,
          };
        } else {
          // Exit phase
          const tLocal = t - entranceDuration - holdDuration;
          const uRaw = exitDuration > 0 ? tLocal / exitDuration : 1;
          const u = exitEase(uRaw);
          return {
            phase: 'exit',
            u,
            uRaw,
            tLocal,
          };
        }
      },
    };

    return { phase: { kind: 'PhaseMachine', value: phaseMachine } };
  },
};
