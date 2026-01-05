/**
 * PulseDivider Block Compiler
 *
 * Subdivides phase into discrete tick events.
 * Detects when (phase * divisions) crosses integer boundaries.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower PulseDivider block to IR.
 *
 * This is a STATEFUL block that tracks the previous subPhase value
 * to detect integer crossings.
 *
 * State layout:
 * - lastSubPhase: i32 (initialized to -1)
 *
 * Logic:
 * - subPhase = floor(phase * divisions)
 * - if subPhase !== lastSubPhase then emit 1 else emit 0
 * - update lastSubPhase = subPhase
 */
const lowerPulseDivider: BlockLowerFn = ({ ctx, inputs, config }) => {
  const phase = inputs[0]; // Signal:phase

  if (phase.k !== 'sig') {
    throw new Error(`PulseDivider: expected sig input for phase, got ${phase.k}`);
  }

  const divisions: int = (config != null && typeof config === 'object' && 'divisions' in config)
    ? Number(config.divisions)
    : 4;

  const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
  const triggerType: TypeDesc = { world: "signal", domain: "trigger", category: "core", busEligible: true };

  // Allocate state for previous subPhase
  const stateId = ctx.b.allocStateId(
    numberType,
    -1, // initial value
    'pulseDivider_lastSubPhase'
  );

  // Calculate subPhase = floor(phase * divisions)
  const divisionsSig = ctx.b.sigConst(divisions, numberType);
  const scaled = ctx.b.sigZip(
    phase.id,
    divisionsSig,
    { kind: 'opcode', opcode: 100 }, // OpCode.Mul
    numberType
  );
  const subPhase = ctx.b.sigMap(
    scaled,
    { kind: 'opcode', opcode: 121 }, // OpCode.Floor
    numberType
  );

  // Use stateful operation for edge detection
  // The evaluator will handle: if (subPhase !== state) { state = subPhase; return 1 } else return 0
  const outputId = ctx.b.sigStateful(
    'pulseDivider',
    subPhase,
    stateId,
    triggerType,
    { divisions }
  );

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'PulseDivider_out');
  return {
    outputs: [{ k: 'sig', id: outputId, slot }],
  };
};

// Register block type
registerBlockType({
  type: 'PulseDivider',
  capability: 'state',
  usesState: true,
  inputs: [
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'tick',
      label: 'Tick',
      dir: 'out',
      type: { world: "signal", domain: "trigger", category: "core", busEligible: true },
    },
  ],
  lower: lowerPulseDivider,
});
