/**
 * JitterFieldVec2 Block Compiler
 *
 * Creates animated per-element position drift.
 * Each element gets a unique direction (from idRand) and animated magnitude (from phase).
 *
 * Follows the same pattern as FieldZipSignal: captures both field and signal,
 * evaluates them at runtime when the field is materialized.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

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

  const cfg = config as { amount?: number; frequency?: number } | undefined;
  const amount = cfg?.amount ?? 10;
  const frequency = cfg?.frequency ?? 1;

  throw new Error(
    `JitterFieldVec2 IR lowering requires field-signal combination operations (amount: ${amount}, frequency: ${frequency}). ` +
    'This needs: (1) fieldZipSignal to combine field with runtime signal evaluation, ' +
    '(2) per-element vec2 construction from trigonometric operations, and ' +
    '(3) field-level vec2 math. ' +
    'This block is not yet supported in IR until field-signal combination operations are implemented.'
  );
};

registerBlockType({
  type: 'JitterFieldVec2',
  capability: 'pure',
  inputs: [
    { portId: 'idRand', label: 'ID Random', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 0 } },
    { portId: 'phase', label: 'Phase', dir: 'in', type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'drift', label: 'Drift', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerJitterFieldVec2,
});
