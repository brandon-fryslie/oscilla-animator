/**
 * EnvelopeAD Block Compiler
 *
 * Stateful envelope generator with attack and decay phases.
 * Triggers on rising edge of event signal, then follows AR envelope curve.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import type { TypeDesc } from '../../ir/types';
import { registerBlockType } from '../../ir/lowerTypes';

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

  const numberType: TypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
  const timeType: TypeDesc = { world: "signal", domain: "timeMs", category: "internal", busEligible: false };

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

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'EnvelopeAD_out');
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
      type: { world: "signal", domain: "trigger", category: "core", busEligible: true },
      defaultSource: { value: false },
    },
  ],
  outputs: [
    {
      portId: 'env',
      label: 'Envelope',
      dir: 'out',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
    },
  ],
  lower: lowerEnvelopeAD,
});
