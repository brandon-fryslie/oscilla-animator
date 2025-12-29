/**
 * EnvelopeAD Block Compiler
 *
 * Stateful envelope generator with attack and decay phases.
 * Triggers on rising edge of event signal, then follows AR envelope curve.
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { isDefined } from '../../../types/helpers';

type Signal<A> = (t: number, ctx: RuntimeCtx) => A;

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower EnvelopeAD block to IR.
 *
 * This is a STATEFUL block with complex state for envelope generation.
 *
 * State layout (multi-slot):
 * - triggerTime: f64 (timestamp of last trigger, initialized to -Infinity)
 * - wasTriggered: i32 (boolean flag, initialized to 0)
 *
 * Parameters:
 * - attack: attack time in seconds (converted to ms)
 * - decay: decay time in seconds (converted to ms)
 * - peak: peak amplitude (default 1.0)
 *
 * Logic:
 * - Detect trigger rising edge (trigger > 0.5 && !wasTriggered)
 * - If triggered: triggerTime = currentTime, wasTriggered = 1
 * - If !triggered: wasTriggered = 0
 * - Calculate envelope based on elapsed time since trigger
 *   - elapsed < 0: return 0
 *   - elapsed < attack: return (elapsed / attack) * peak
 *   - elapsed < attack + decay: return peak * (1 - (elapsed - attack) / decay)
 *   - else: return 0
 */
const lowerEnvelopeAD: BlockLowerFn = ({ ctx, inputs, config }) => {
  const trigger = inputs[0]; // Signal:Unit (trigger)

  if (trigger.k !== 'sig') {
    throw new Error(`EnvelopeAD: expected sig input for trigger, got ${trigger.k}`);
  }

  const attack = Number((config as any)?.attack ?? 0.05) * 1000; // Convert to ms
  const decay = Number((config as any)?.decay ?? 0.5) * 1000;
  const peak = Number((config as any)?.peak ?? 1.0);

  const numberType: TypeDesc = { world: 'signal', domain: 'number' };
  const timeType: TypeDesc = { world: 'signal', domain: 'timeMs' };

  // Allocate state for trigger time
  const triggerTimeStateId = ctx.b.allocStateId(
    timeType,
    -Infinity, // initial value
    'envelopeAD_triggerTime'
  );

  // Allocate state for wasTriggered flag
  const wasTriggeredStateId = ctx.b.allocStateId(
    numberType,
    0, // initial value (false)
    'envelopeAD_wasTriggered'
  );

  // Use stateful operation for envelope generation
  // The evaluator will handle the complex envelope logic
  const outputId = ctx.b.sigStateful(
    'envelopeAD',
    trigger.id,
    triggerTimeStateId, // Primary state ID (the evaluator will know to also use wasTriggeredStateId)
    numberType,
    {
      attack,
      decay,
      peak,
      // The evaluator needs to know about the second state slot
      // This could be encoded in the params or the evaluator could allocate it internally
      wasTriggeredStateId: wasTriggeredStateId as any,
    }
  );

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [{ k: 'sig', id: outputId, slot }],
  };
};

// Register block type
registerBlockType({
  type: 'EnvelopeAD',
  capability: 'state',
  usesState: true,
  inputs: [
    {
      portId: 'trigger',
      label: 'Trigger',
      dir: 'in',
      type: { world: 'signal', domain: 'trigger' },
      defaultSource: { value: false },
    },
  ],
  outputs: [
    {
      portId: 'env',
      label: 'Envelope',
      dir: 'out',
      type: { world: 'signal', domain: 'number' },
    },
  ],
  lower: lowerEnvelopeAD,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const EnvelopeADBlock: BlockCompiler = {
  type: 'EnvelopeAD',

  inputs: [
    { name: 'trigger', type: { kind: 'Signal:Unit' }, required: true },
    { name: 'attack', type: { kind: 'Scalar:number' }, required: false },
    { name: 'decay', type: { kind: 'Scalar:number' }, required: false },
    { name: 'peak', type: { kind: 'Scalar:number' }, required: false },
  ],

  outputs: [
    { name: 'env', type: { kind: 'Signal:number' } },
  ],

  compile({ inputs }) {
    const triggerArtifact = inputs.trigger;
    if (!isDefined(triggerArtifact) || triggerArtifact.kind !== 'Signal:Unit') {
      return {
        env: {
          kind: 'Error',
          message: 'EnvelopeAD requires a Signal<Unit> input',
        },
      };
    }

    const triggerSignal = triggerArtifact.value as Signal<number>;
    // Read from inputs - values come from defaultSource or explicit connections
    const attack = Number((inputs.attack as any)?.value) * 1000; // Convert to ms
    const decay = Number((inputs.decay as any)?.value) * 1000;
    const peak = Number((inputs.peak as any)?.value);

    // State for trigger detection and envelope timing
    let triggerTime = -Infinity;
    let wasTriggered = false;

    // Envelope signal
    const envelopeSignal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
      const trig = triggerSignal(t, ctx);

      // Detect rising edge (event fires)
      if (trig > 0.5 && !wasTriggered) {
        triggerTime = t;
        wasTriggered = true;
      } else if (trig <= 0.5) {
        wasTriggered = false;
      }

      // Calculate envelope value
      const elapsed = t - triggerTime;

      if (elapsed < 0) {
        // Before first trigger
        return 0;
      } else if (elapsed < attack) {
        // Attack phase
        return (elapsed / attack) * peak;
      } else if (elapsed < attack + decay) {
        // Decay phase
        const decayProgress = (elapsed - attack) / decay;
        return peak * (1 - decayProgress);
      } else {
        // After envelope completes
        return 0;
      }
    };

    return {
      env: { kind: 'Signal:number', value: envelopeSignal },
    };
  },
};
