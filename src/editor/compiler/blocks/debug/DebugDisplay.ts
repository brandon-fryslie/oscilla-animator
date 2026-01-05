/**
 * DebugDisplay Block Compiler
 *
 * Captures input values and sends them to the TraceController for debugging.
 * Accepts multiple input types: Signal, Phase, Domain, Field.
 *
 * The block outputs an empty group (no visual effect on the render tree)
 * but records debug values via StepDebugProbe steps.
 */

import type { BlockLowerFn } from '../../ir/lowerTypes';
import { registerBlockType } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

/**
 * Lower DebugDisplay block to IR.
 *
 * DebugDisplay in IR mode works by registering debug probes with the IRBuilder.
 * The probe IDs follow the pattern: `${instanceId}:${portId}`
 *
 * The schedule builder (buildSchedule.ts) collects these probes and inserts
 * StepDebugProbe steps after signal evaluation steps.
 *
 * Unlike legacy mode (which directly updates DebugStore via closures), IR mode
 * writes values to TraceController ring buffers via StepDebugProbe execution.
 */
const lowerDebugDisplay: BlockLowerFn = ({ ctx, inputsById }) => {
  if (inputsById == null) {
    throw new Error(`DebugDisplay: inputsById required for IR lowering`);
  }

  // Check signal input
  const signalInput = inputsById.signal;
  if (signalInput?.k === 'sig') {
    ctx.b.registerDebugProbe({
      id: `${ctx.instanceId}:signal`,
      instanceId: ctx.instanceId,
      portId: 'signal',
      slot: signalInput.slot,
      mode: 'value',
      label: ctx.label ?? 'signal',
    });
  }

  // Check phase input
  const phaseInput = inputsById.phase;
  if (phaseInput?.k === 'sig') {
    ctx.b.registerDebugProbe({
      id: `${ctx.instanceId}:phase`,
      instanceId: ctx.instanceId,
      portId: 'phase',
      slot: phaseInput.slot,
      mode: 'value',
      label: ctx.label ?? 'phase',
    });
  }

  // Check field input
  const fieldInput = inputsById.field;
  if (fieldInput?.k === 'field') {
    ctx.b.registerDebugProbe({
      id: `${ctx.instanceId}:field`,
      instanceId: ctx.instanceId,
      portId: 'field',
      slot: fieldInput.slot,
      mode: 'value',
      label: ctx.label ?? 'field',
    });
  }

  // Note: domain input is a special value, not a signal or field, so we don't probe it directly
  // Future enhancement: create a signal from domain size and probe that

  // Return empty render tree output (DebugDisplay has no visual output)
  // The actual debugging happens via StepDebugProbe steps inserted by buildSchedule.ts
  return {
    outputs: [],
    outputsById: {
      debug: {
        k: 'special',
        tag: 'renderTree',
        id: 0, // Empty render tree (no visual output)
      },
    },
  };
};

// Register block type
registerBlockType({
  type: 'DebugDisplay',
  capability: 'io', // I/O operation (side-effects on TraceController)
  inputs: [
    {
      portId: 'signal',
      label: 'Signal',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      optional: true,
      defaultSource: { value: 0 },
    },
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: "signal", domain: "float", semantics: 'phase(0..1)', category: "core", busEligible: true },
      optional: true,
      defaultSource: { value: 0 },
    },
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: "config", domain: "domain", category: "internal", busEligible: false },
      optional: true,
      defaultSource: { value: 100 },
    },
    {
      portId: 'field',
      label: 'Field',
      dir: 'in',
      type: { world: "field", domain: "float", category: "core", busEligible: true },
      optional: true,
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'debug',
      label: 'Debug',
      dir: 'out',
      type: { world: "config", domain: "renderTree", category: "internal", busEligible: false },
    },
  ],
  lower: lowerDebugDisplay,
});
