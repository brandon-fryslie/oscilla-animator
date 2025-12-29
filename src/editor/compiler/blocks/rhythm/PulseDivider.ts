/**
 * PulseDivider Block Compiler
 *
 * Subdivides phase into discrete tick events.
 * Detects when (phase * divisions) crosses integer boundaries.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';
import { isDefined } from '../../../types/helpers';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

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

  const numberType: TypeDesc = { world: 'signal', domain: 'float' };
  const triggerType: TypeDesc = { world: 'signal', domain: 'trigger' };

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

  const slot = ctx.b.allocValueSlot();
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
      type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' },
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'tick',
      label: 'Tick',
      dir: 'out',
      type: { world: 'signal', domain: 'trigger' },
    },
  ],
  lower: lowerPulseDivider,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PulseDividerBlock: BlockCompiler = {
  type: 'PulseDivider',

  inputs: [
    { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
    { name: 'divisions', type: { kind: 'Scalar:int' }, required: false },
  ],

  outputs: [
    { name: 'tick', type: { kind: 'Signal:Unit' } },
  ],

  compile({ inputs }) {
    const phaseArtifact = inputs.phase;
    if (!isDefined(phaseArtifact) || phaseArtifact.kind !== 'Signal:phase') {
      return {
        tick: {
          kind: 'Error',
          message: 'PulseDivider requires a Signal<phase> input',
        },
      };
    }

    const phaseSignal = phaseArtifact.value as Signal<float>;
    // Read from inputs - values come from defaultSource or explicit connections
    const divisionsArtifact = inputs.divisions;
    const divisions: int = divisionsArtifact !== undefined && 'value' in divisionsArtifact
      ? Number(divisionsArtifact.value)
      : 4;

    // State for edge detection
    let lastSubPhase: int = -1;

    // Event signal: returns 1 on tick frame, 0 otherwise
    const eventSignal: Signal<float> = (t: number, ctx: RuntimeCtx): number => {
      const phase = phaseSignal(t, ctx);
      const subPhase: int = Math.floor(phase * divisions);

      // Detect crossing
      if (subPhase !== lastSubPhase) {
        lastSubPhase = subPhase;
        return 1;
      }

      return 0;
    };

    return {
      tick: { kind: 'Signal:Unit', value: eventSignal },
    };
  },
};
