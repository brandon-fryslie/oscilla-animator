/**
 * TriggerOnWrap Block Compiler
 *
 * Takes a Signal<float> (typically a phase signal) and generates a trigger signal
 * whenever the signal wraps from near 1 back to near 0.
 *
 * Output is Signal:Unit where 1 = triggered, 0 = not triggered.
 * This is useful for converting continuous phase clocks into discrete rhythm events.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower TriggerOnWrap block to IR.
 *
 * This is a STATEFUL block that tracks the previous phase value
 * to detect wrap events (phase goes from >0.8 to <0.2).
 *
 * State layout:
 * - prevValue: f32 (initialized to -1, indicating "no previous value")
 *
 * Logic:
 * - Read prevValue from state
 * - didWrap = (prevValue > 0.8 && currentValue < 0.2)
 * - Update state: prevValue = currentValue
 * - Return didWrap ? 1 : 0
 *
 * Uses the 'edgeDetectWrap' stateful operation.
 */
const lowerTriggerOnWrap: BlockLowerFn = ({ ctx, inputs }) => {
  const phase = inputs[0]; // Signal:float (phase)

  if (phase.k !== 'sig') {
    throw new Error(`TriggerOnWrap: expected sig input for phase, got ${phase.k}`);
  }

  const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
  const triggerType: TypeDesc = { world: "signal", domain: "trigger", category: "core", busEligible: true };

  // Allocate state for previous phase value
  const stateId = ctx.b.allocStateId(
    numberType,
    -1, // initial value (-1 indicates no previous value)
    'triggerOnWrap_prevPhase'
  );

  // Use stateful edge detection operation
  // The evaluator implements:
  // const prevValue = state[stateId]
  // const currentValue = evaluate(phase)
  // const didWrap = prevValue > 0.8 && currentValue < 0.2
  // state[stateId] = currentValue
  // return didWrap ? 1 : 0
  const outputId = ctx.b.sigStateful(
    'edgeDetectWrap', // This matches OpCode.EdgeDetectWrap
    phase.id,
    stateId,
    triggerType,
    {} // no additional params
  );

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'TriggerOnWrap_out');
  return {
    outputs: [],
    outputsById: { trigger: { k: 'sig', id: outputId, slot } },
  };
};

// Register block type
registerBlockType({
  type: 'TriggerOnWrap',
  capability: 'state',
  usesState: true,
  inputs: [
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'trigger',
      label: 'Trigger',
      dir: 'out',
      type: { world: "signal", domain: "trigger", category: "core", busEligible: true },
    },
  ],
  lower: lowerTriggerOnWrap,
});
