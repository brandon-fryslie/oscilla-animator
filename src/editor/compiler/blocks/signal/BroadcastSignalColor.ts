/**
 * BroadcastSignalColor Block Compiler
 *
 * Broadcasts a Signal<color> to all elements in a domain, producing a Field<color>.
 * This is an adapter block for bridging signal-world to field-world.
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerBroadcastSignalColor: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const domain = inputsById?.domain ?? inputs[0];
  const signal = inputsById?.signal ?? inputs[1];

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('BroadcastSignalColor requires domain input');
  }

  if (signal.k !== 'sig') {
    throw new Error('BroadcastSignalColor requires signal input');
  }

  // Create field that broadcasts the signal to all domain elements
  const outType = { world: "field" as const, domain: "color" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.broadcastSigToField(signal.id, domain.id, outType);
  const slot = ctx.b.allocValueSlot(outType, 'BroadcastSignalColor_out');
  ctx.b.registerFieldSlot(fieldId, slot);

  return {
    outputs: [],
    outputsById: { field: { k: 'field', id: fieldId, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'BroadcastSignalColor',
  capability: 'pure',
  inputs: [
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: "config", domain: "domain", category: "internal", busEligible: false },
      defaultSource: { value: 100 },
    },
    {
      portId: 'signal',
      label: 'Signal',
      dir: 'in',
      type: { world: "signal", domain: "color", category: "core", busEligible: true },
      defaultSource: { value: '#3B82F6' },
    },
  ],
  outputs: [
    {
      portId: 'field',
      label: 'Field',
      dir: 'out',
      type: { world: "field", domain: "color", category: "core", busEligible: true },
    },
  ],
  lower: lowerBroadcastSignalColor,
});
