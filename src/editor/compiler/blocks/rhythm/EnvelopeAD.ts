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

  const attack = (config != null && typeof config === 'object' && 'attack' in config)
    ? Number(config.attack) * 1000  // Convert to ms
    : 50;
  const decay = (config != null && typeof config === 'object' && 'decay' in config)
    ? Number(config.decay) * 1000
    : 500;
  const peak = (config != null && typeof config === 'object' && 'peak' in config)
    ? Number(config.peak)
    : 1.0;

  const numberType: TypeDesc = { world: 'signal', domain: 'float' };
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
  // Note: wasTriggeredStateId is stored as related state - the evaluator knows
  // to look for a second state slot allocated immediately after triggerTimeStateId
  const outputId = ctx.b.sigStateful(
    'envelopeAD',
    trigger.id,
    triggerTimeStateId, // Primary state ID
    numberType,
    {
      attack,
      decay,
      peak,
      // Encode secondary state ID index as offset from primary (evaluator convention)
      secondaryStateOffset: 1,
    }
  );
  // Keep reference to avoid unused variable warning
  void wasTriggeredStateId;

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
      type: { world: 'signal', domain: 'float' },
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
    { name: 'attack', type: { kind: 'Scalar:float' }, required: false },
    { name: 'decay', type: { kind: 'Scalar:float' }, required: false },
    { name: 'peak', type: { kind: 'Scalar:float' }, required: false },
  ],

  outputs: [
    { name: 'env', type: { kind: 'Signal:float' } },
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

    const triggerSignal = triggerArtifact.value as Signal<float>;
    // Read from inputs - values come from defaultSource or explicit connections
    const attackArtifact = inputs.attack;
    const attack = (attackArtifact !== undefined && 'value' in attackArtifact ? Number(attackArtifact.value) : 0.05) * 1000; // Convert to ms
    const decayArtifact = inputs.decay;
    const decay = (decayArtifact !== undefined && 'value' in decayArtifact ? Number(decayArtifact.value) : 0.5) * 1000;
    const peakArtifact = inputs.peak;
    const peak = peakArtifact !== undefined && 'value' in peakArtifact ? Number(peakArtifact.value) : 1.0;

    // State for trigger detection and envelope timing
    let triggerTime = -Infinity;
    let wasTriggered = false;

    // Envelope signal
    const envelopeSignal: Signal<float> = (t: number, ctx: RuntimeCtx): number => {
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
      env: { kind: 'Signal:float', value: envelopeSignal },
    };
  },
};
