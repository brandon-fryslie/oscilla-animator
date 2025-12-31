/**
 * DebugDisplay Block Compiler
 *
 * Captures input values and sends them to the TraceController for debugging.
 * Accepts multiple input types: Signal, Phase, Domain, Field.
 *
 * The block outputs an empty group (no visual effect on the render tree)
 * but records debug values via StepDebugProbe steps.
 */

import type { BlockCompiler, RuntimeCtx, DrawNode } from '../../types';
import type { BlockLowerFn } from '../../ir/lowerTypes';
import { registerBlockType } from '../../ir/lowerTypes';
import { debugStore } from '../../../stores/DebugStore';

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
      type: { world: 'signal', domain: 'float' },
      optional: true,
      defaultSource: { value: 0 },
    },
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: 'signal', domain: 'float', semantics: 'phase(0..1)' },
      optional: true,
      defaultSource: { value: 0 },
    },
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: 'special', domain: 'domain' },
      optional: true,
      defaultSource: { value: 100 },
    },
    {
      portId: 'field',
      label: 'Field',
      dir: 'in',
      type: { world: 'field', domain: 'float' },
      optional: true,
      defaultSource: { value: 0 },
    },
  ],
  outputs: [
    {
      portId: 'debug',
      label: 'Debug',
      dir: 'out',
      type: { world: 'special', domain: 'renderTree' },
    },
  ],
  lower: lowerDebugDisplay,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

// Throttle updates to ~3x per second (every 333ms)
const UPDATE_INTERVAL_MS = 333;
const lastUpdateTime = new Map<string, number>();

// Default compile context for field evaluation
const DEFAULT_CTX = {
  env: {},
  geom: {
    get<K extends object, V>(_key: K, compute: () => V): V {
      return compute();
    },
    invalidate() {},
  },
};

export const DebugDisplayBlock: BlockCompiler = {
  type: 'DebugDisplay',

  inputs: [
    { name: 'signal', type: { kind: 'Signal:float' }, required: false },
    { name: 'phase', type: { kind: 'Signal:phase' }, required: false },
    { name: 'domain', type: { kind: 'Domain' }, required: false },
    { name: 'field', type: { kind: 'Field:float' }, required: false },
    { name: 'label', type: { kind: 'Scalar:string' }, required: false },
    { name: 'posX', type: { kind: 'Scalar:float' }, required: false },
    { name: 'posY', type: { kind: 'Scalar:float' }, required: false },
  ],

  outputs: [
    { name: 'debug', type: { kind: 'RenderTree' } },
  ],

  compile({ id, inputs }) {
    // Read from inputs - values come from defaultSource or explicit connections
    const labelArtifact = inputs.label;
    const label = labelArtifact !== undefined && 'value' in labelArtifact ? String(labelArtifact.value) : '';
    const posXArtifact = inputs.posX;
    const posX = posXArtifact !== undefined && 'value' in posXArtifact ? Number(posXArtifact.value) : 0;
    const posYArtifact = inputs.posY;
    const posY = posYArtifact !== undefined && 'value' in posYArtifact ? Number(posYArtifact.value) : 0;

    // Extract input artifacts
    const signalArtifact = inputs.signal;
    const phaseArtifact = inputs.phase;
    const domainArtifact = inputs.domain;
    const fieldArtifact = inputs.field;

    // Get signal function if connected
    const signalFn = (signalArtifact?.kind === 'Signal:float')
      ? signalArtifact.value as (t: number, ctx: RuntimeCtx) => number
      : undefined;

    // Get phase function if connected
    const phaseFn = (phaseArtifact?.kind === 'Signal:phase' || phaseArtifact?.kind === 'Signal:float')
      ? phaseArtifact.value as (t: number, ctx: RuntimeCtx) => number
      : undefined;

    // Get domain if connected
    const domain = (domainArtifact?.kind === 'Domain')
      ? domainArtifact.value
      : undefined;

    // Get field function if connected
    const fieldFn = (fieldArtifact?.kind === 'Field:float')
      ? fieldArtifact.value
      : undefined;

    // Create render function that updates debug store (throttled)
    const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
      // Throttle updates to ~3x per second
      const lastUpdate = lastUpdateTime.get(id) ?? 0;
      const shouldUpdate = tMs - lastUpdate >= UPDATE_INTERVAL_MS;

      if (shouldUpdate) {
        lastUpdateTime.set(id, tMs);

        // Sample current values
        const values: {
          signal?: number;
          phase?: number;
          domainCount?: number;
          fieldSample?: float[];
        } = {};

        if (signalFn !== undefined) {
          values.signal = signalFn(tMs, ctx);
        }

        if (phaseFn !== undefined) {
          values.phase = phaseFn(tMs, ctx);
        }

        if (domain !== undefined) {
          values.domainCount = domain.elements.length;
        }

        if (fieldFn !== undefined && domain !== undefined) {
          // Sample first few field values with proper context
          const fieldCtx = {
            ...DEFAULT_CTX,
            ...ctx,
            t: tMs,
          };
          const fieldValues = fieldFn(0, Math.min(5, domain.elements.length), fieldCtx);
          values.fieldSample = [...fieldValues];
        }

        // Update debug store
        debugStore.setEntry({
          id,
          label,
          posX,
          posY,
          values,
          timestamp: tMs,
        });
      }

      // Return empty group (no visual output)
      return {
        kind: 'group',
        id: `debug-${id}`,
        children: [],
        meta: { debug: true },
      };
    };

    return {
      debug: { kind: 'RenderTree', value: renderFn },
    };
  },
};
