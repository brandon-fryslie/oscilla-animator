/**
 * TriggerOnWrap Block Compiler
 *
 * Takes a Signal<number> (typically a phase signal) and generates a trigger signal
 * whenever the signal wraps from near 1 back to near 0.
 *
 * Output is Signal:Unit where 1 = triggered, 0 = not triggered.
 * This is useful for converting continuous phase clocks into discrete rhythm events.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import { registerBlockType } from '../../ir/lowerTypes';
import { isDefined } from '../../../types/helpers';

type SignalNumber = (tMs: number, ctx: RuntimeCtx) => number;

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
  const phase = inputs[0]; // Signal:number (phase)

  if (phase.k !== 'sig') {
    throw new Error(`TriggerOnWrap: expected sig input for phase, got ${phase.k}`);
  }

  const numberType: any = { world: 'signal', domain: 'number' };
  const triggerType: any = { world: 'signal', domain: 'trigger' };

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

  return {
    outputs: [{ k: 'sig', id: outputId }],
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
      type: { world: 'signal', domain: 'number' },
    },
  ],
  outputs: [
    {
      portId: 'trigger',
      label: 'Trigger',
      dir: 'out',
      type: { world: 'signal', domain: 'trigger' },
    },
  ],
  lower: lowerTriggerOnWrap,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const TriggerOnWrapBlock: BlockCompiler = {
  type: 'TriggerOnWrap',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:number' }, required: true },
  ],

  outputs: [
    { name: 'trigger', type: { kind: 'Signal:Unit' } },
  ],

  compile({ inputs }) {
    const phaseArtifact = inputs.phase;
    if (!isDefined(phaseArtifact) || phaseArtifact.kind !== 'Signal:number') {
      return {
        trigger: {
          kind: 'Error',
          message: 'TriggerOnWrap requires a Signal<number> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as SignalNumber;

    // Track previous value to detect wraps
    // Note: This uses closure state which may not be ideal for scrubbing
    // A better approach would be to compute wrap based on time directly
    let prevValue: number | null = null;
    let prevTime: number | null = null;

    const triggerSignal: SignalNumber = (tMs, ctx) => {
      const currentValue = phaseSignal(tMs, ctx);

      // Reset state if time jumps backwards (scrubbing)
      if (prevTime !== null && tMs < prevTime) {
        prevValue = null;
      }

      // Detect wrap: previous value was high (>0.8) and current is low (<0.2)
      const didWrap =
        prevValue !== null && prevValue > 0.8 && currentValue < 0.2;

      prevValue = currentValue;
      prevTime = tMs;

      return didWrap ? 1 : 0;
    };

    return {
      trigger: { kind: 'Signal:Unit', value: triggerSignal },
    };
  },
};
