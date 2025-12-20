/**
 * PerElementProgress Block Compiler
 *
 * Takes phase machine, delays, and durations, outputs per-element progress.
 * This is the core "staggered animation" primitive.
 *
 * For each element i:
 *   localT[i] = globalT - delays[i]
 *   progress[i] = clamp01(localT[i] / durations[i])
 *   easedProgress[i] = easing(progress[i])
 */

import type {
  BlockCompiler,
  CompiledOutputs,
  Field,
  PhaseMachine,
  RuntimeCtx,
} from '../../../types';
import { clamp01, getEasing } from '../../helpers';

// Per-element progress array at runtime
type ProgressArray = readonly number[];

export const PerElementProgressBlock: BlockCompiler = {
  type: 'perElementProgress',
  inputs: [
    { name: 'phase', type: { kind: 'PhaseMachine' }, required: true },
    { name: 'delays', type: { kind: 'Field:number' }, required: true },
    { name: 'durations', type: { kind: 'Field:number' }, required: true },
  ],
  outputs: [
    { name: 'progress', type: { kind: 'Signal:Unit' } }, // Actually outputs array, but typed as Unit for now
  ],

  compile({ inputs, ctx, params }) {
    // Validate inputs
    if (inputs.phase?.kind !== 'PhaseMachine') {
      return {
        progress: { kind: 'Error', message: 'PerElementProgress: phase must be PhaseMachine' },
      };
    }
    if (inputs.delays?.kind !== 'Field:number') {
      return {
        progress: { kind: 'Error', message: 'PerElementProgress: delays must be Field:number' },
      };
    }
    if (inputs.durations?.kind !== 'Field:number') {
      return {
        progress: { kind: 'Error', message: 'PerElementProgress: durations must be Field:number' },
      };
    }

    const phaseMachine: PhaseMachine = inputs.phase.value;
    const delaysField: Field<number> = inputs.delays.value;
    const durationsField: Field<number> = inputs.durations.value;

    const easingName = (params.easing as string) ?? 'easeOutCubic';
    const easing = getEasing(easingName);

    const seed = 42; // Could be parameterized
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (ctx as any).elementCount ?? 10; // Get from context or default

    // Evaluate fields at compile time (BULK form)
    const delays = delaysField(seed, n, ctx);
    const durations = durationsField(seed, n, ctx);

    // Create signal that computes per-element progress at runtime
    const progressSignal = (tMs: number, _rt: RuntimeCtx): ProgressArray => {
      const phaseSample = phaseMachine.sample(tMs);
      const progressArray: number[] = new Array(n);

      for (let i = 0; i < n; i++) {
        const delay = (delays[i] ?? 0) * 1000; // Convert to ms
        const duration = (durations[i] ?? 1) * 1000;

        // Compute local time for this element
        const localT = phaseSample.tLocal - delay;

        // Compute raw progress
        const uRaw = duration <= 0 ? 1 : localT / duration;
        const uClamped = clamp01(uRaw);

        // Apply easing
        progressArray[i] = easing(uClamped);
      }

      return progressArray;
    };

    // Note: This returns a function that produces an array, not a single number.
    // The type system doesn't fully capture this yet.
    return { progress: { kind: 'Signal:Unit', value: progressSignal } } as unknown as CompiledOutputs;
  },
};
