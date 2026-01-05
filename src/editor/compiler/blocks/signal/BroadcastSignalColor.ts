/**
 * BroadcastSignalColor Block Compiler
 *
 * Broadcasts a Signal<color> to all elements in a domain, producing a Field<color>.
 * This is an adapter block for bridging signal-world to field-world.
 */

import type { BlockCompiler, RuntimeCtx, Field } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerBroadcastSignalColor: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const signal = inputsById?.signal ?? inputs[1]; // Second input is the signal

  if (signal.k !== 'sig') {
    throw new Error('BroadcastSignalColor requires signal input');
  }

  // Create field that broadcasts the signal to all domain elements
  const outType = { world: "field" as const, domain: "color" as const, category: "core" as const, busEligible: true };
  const fieldId = ctx.b.fieldFromSignal(signal.id, outType);
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

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const BroadcastSignalColorBlock: BlockCompiler = {
  type: 'BroadcastSignalColor',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'signal', type: { kind: 'Signal:color' }, required: true },
  ],

  outputs: [
    { name: 'field', type: { kind: 'Field:color' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    const signalArtifact = inputs.signal;

    if (domainArtifact === undefined || domainArtifact.kind !== 'Domain') {
      return {
        field: {
          kind: 'Error',
          message: 'BroadcastSignalColor requires a Domain input',
        },
      };
    }

    if (signalArtifact === undefined || signalArtifact.kind !== 'Signal:color') {
      return {
        field: {
          kind: 'Error',
          message: 'BroadcastSignalColor requires a Signal<color> input',
        },
      };
    }

    const domain = domainArtifact.value;
    const signal = signalArtifact.value as (t: number, ctx: RuntimeCtx) => string;

    // Create field that broadcasts signal value to all elements
    const field: Field<string> = {
      domain,
      expr: (t: number, ctx: RuntimeCtx, _elementId: string) => {
        return signal(t, ctx);
      },
    };

    return {
      field: { kind: 'Field:color', value: field },
    };
  },
};
