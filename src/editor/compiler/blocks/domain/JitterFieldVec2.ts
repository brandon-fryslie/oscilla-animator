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
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

/**
 * Extended context interface for field evaluation at runtime.
 * The compile-time context is extended with time information during rendering.
 */
interface FieldEvalCtx extends CompileCtx {
  /** Current time in milliseconds (available at runtime) */
  t: number;
}

// =============================================================================
// IR Lowering
// =============================================================================

const lowerJitterFieldVec2: BlockLowerFn = ({ inputs, config }) => {
  const idRand = inputs[0];
  const phase = inputs[1];

  if (idRand.k !== 'field') {
    throw new Error('JitterFieldVec2 requires field input for idRand');
  }
  if (phase.k !== 'sig') {
    throw new Error('JitterFieldVec2 requires signal input for phase');
  }

  // This block requires combining a field (per-element random values) with a signal (time-varying phase)
  // to produce a field of vec2 drift values.
  //
  // The computation per element is:
  // 1. angle = idRand[i] * 2π (unique direction per element)
  // 2. mag = sin((phase * frequency + idRand[i]) * 2π) * amount
  // 3. drift[i] = { x: cos(angle) * mag, y: sin(angle) * mag }
  //
  // Challenges:
  // - Requires evaluating a signal (phase) in field context
  // - Needs per-element computation combining field values with signal value
  // - Uses trigonometry and scalar math on vec2 components
  // - Requires fieldZip-like operation but with signal evaluation
  //
  // IR would need:
  // - fieldZipSignal or similar to combine field with signal
  // - Per-element vec2 construction from scalar computations
  // - Trigonometric operations in field context
  //
  // This is similar to how FieldHueGradient and FieldFromExpression work -
  // they all need to evaluate signals while iterating over field elements.

  const amount = Number((config as any)?.amount ?? 10);
  const frequency = Number((config as any)?.frequency ?? 1);

  throw new Error(
    `JitterFieldVec2 IR lowering requires field-signal combination operations (amount: ${amount}, frequency: ${frequency}). ` +
    'This needs: (1) fieldZipSignal to combine field with runtime signal evaluation, ' +
    '(2) per-element vec2 construction from trigonometric operations, and ' +
    '(3) field-level vec2 math. ' +
    'Block remains in closure mode until field-signal combination operations are implemented in IR.'
  );
};

registerBlockType({
  type: 'JitterFieldVec2',
  capability: 'pure',
  inputs: [
    { portId: 'idRand', label: 'ID Random', dir: 'in', type: { world: 'field', domain: 'number' } },
    { portId: 'phase', label: 'Phase', dir: 'in', type: { world: 'signal', domain: 'phase01' } },
  ],
  outputs: [
    { portId: 'drift', label: 'Drift', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerJitterFieldVec2,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

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
