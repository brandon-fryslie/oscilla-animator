/**
 * JitterFieldVec2 Block Compiler
 *
 * Creates animated per-element position drift.
 * Each element gets a unique direction (from idRand) and animated magnitude (from phase).
 *
 * Follows the same pattern as FieldZipSignal: captures both field and signal,
 * evaluates them at runtime when the field is materialized.
 */

import type { BlockCompiler, Vec2, Field, CompileCtx, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';

/**
 * Extended context interface for field evaluation at runtime.
 * The compile-time context is extended with time information during rendering.
 */
interface FieldEvalCtx extends CompileCtx {
  /** Current time in milliseconds (available at runtime) */
  t: number;
}

export const JitterFieldVec2Block: BlockCompiler = {
  type: 'JitterFieldVec2',

  inputs: [
    { name: 'idRand', type: { kind: 'Field:number' }, required: true },
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
  ],

  outputs: [
    { name: 'drift', type: { kind: 'Field:vec2' } },
  ],

  compile({ params, inputs }) {
    const idRandArtifact = inputs.idRand;
    const phaseArtifact = inputs.phase;

    if (!isDefined(idRandArtifact) || idRandArtifact.kind !== 'Field:number') {
      return {
        drift: {
          kind: 'Error',
          message: 'JitterFieldVec2 requires a Field<number> for idRand input',
        },
      };
    }

    if (!isDefined(phaseArtifact) || phaseArtifact.kind !== 'Signal:phase') {
      return {
        drift: {
          kind: 'Error',
          message: 'JitterFieldVec2 requires a Signal<phase> for phase input',
        },
      };
    }

    const idRandFn = idRandArtifact.value;
    const phaseFn = phaseArtifact.value;
    const amount = Number(params.amount ?? 10);
    const frequency = Number(params.frequency ?? 1);

    // Create drift field that combines per-element random with phase
    // The field function captures both the idRand field and phase signal.
    // At runtime, when the field is evaluated, it will compute drift for each element.
    const driftField: Field<Vec2> = (seed, n, ctx) => {
      // Evaluate the per-element random field
      const randoms = idRandFn(seed, n, ctx);

      // Evaluate the phase signal once for this frame
      // Note: ctx is expected to have a .t property at runtime (similar to FieldZipSignal)
      const runtimeCtx = ctx as FieldEvalCtx;
      const phase = phaseFn(runtimeCtx.t, runtimeCtx as unknown as RuntimeCtx);

      const out = new Array<Vec2>(randoms.length);
      for (let i = 0; i < randoms.length; i++) {
        const r = randoms[i];

        // Each element gets a unique direction from 0 to 2π
        const angle = r * Math.PI * 2;

        // Magnitude oscillates with phase, offset by random per element
        const mag = Math.sin((phase * frequency + r) * Math.PI * 2) * amount;

        out[i] = {
          x: Math.cos(angle) * mag,
          y: Math.sin(angle) * mag,
        };
      }

      return out;
    };

    return {
      drift: { kind: 'Field:vec2', value: driftField },
    };
  },
};
