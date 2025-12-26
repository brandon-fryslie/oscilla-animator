/**
 * DebugDisplay Block Compiler
 *
 * Captures input values and sends them to the DebugStore for overlay rendering.
 * Accepts multiple input types: Signal, Phase, Domain, Field.
 *
 * The block outputs an empty group (no visual effect on the render tree)
 * but updates the debug store each frame with current values.
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
 * DebugDisplay is a side-effect block that updates MobX stores (DebugStore).
 * This does NOT fit the pure IR model where all effects are explicit.
 *
 * Options for future IR support:
 * 1. Create a special "debug sink" IR node (like render sinks)
 * 2. Use a closureBridge for the debug side-effect
 * 3. Implement debug tracing at the IR evaluator level
 *
 * For now, we throw an error and rely on the legacy closure compiler.
 */
const lowerDebugDisplay: BlockLowerFn = ({ ctx }) => {
  throw new Error(
    `DebugDisplay block (${ctx.instanceId}) cannot be lowered to IR yet.\n` +
    `Reason: DebugDisplay has side-effects (updates DebugStore) that don't fit the pure IR model.\n` +
    `Workaround: DebugDisplay continues to use the legacy closure compiler.\n` +
    `Future: Will be implemented as a debug sink or closure bridge.`
  );
};

// Register block type (marks as not yet fully supported in IR mode)
registerBlockType({
  type: 'DebugDisplay',
  capability: 'io', // I/O operation (side-effects on debug store)
  inputs: [
    {
      portId: 'signal',
      label: 'Signal',
      dir: 'in',
      type: { world: 'signal', domain: 'number' },
      optional: true,
    },
    {
      portId: 'phase',
      label: 'Phase',
      dir: 'in',
      type: { world: 'signal', domain: 'phase01' },
      optional: true,
    },
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: 'special', domain: 'domain' },
      optional: true,
    },
    {
      portId: 'field',
      label: 'Field',
      dir: 'in',
      type: { world: 'field', domain: 'number' },
      optional: true,
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
    { name: 'signal', type: { kind: 'Signal:number' }, required: false },
    { name: 'phase', type: { kind: 'Signal:phase' }, required: false },
    { name: 'domain', type: { kind: 'Domain' }, required: false },
    { name: 'field', type: { kind: 'Field:number' }, required: false },
  ],

  outputs: [
    { name: 'debug', type: { kind: 'RenderTree' } },
  ],

  compile({ id, params, inputs }) {
    const label = typeof params.label === 'string' ? params.label : 'Debug';
    const posX = Number(params.posX ?? 20);
    const posY = Number(params.posY ?? 20);

    // Extract input artifacts
    const signalArtifact = inputs.signal;
    const phaseArtifact = inputs.phase;
    const domainArtifact = inputs.domain;
    const fieldArtifact = inputs.field;

    // Get signal function if connected
    const signalFn = (signalArtifact?.kind === 'Signal:number')
      ? signalArtifact.value as (t: number, ctx: RuntimeCtx) => number
      : undefined;

    // Get phase function if connected
    const phaseFn = (phaseArtifact?.kind === 'Signal:phase' || phaseArtifact?.kind === 'Signal:number')
      ? phaseArtifact.value as (t: number, ctx: RuntimeCtx) => number
      : undefined;

    // Get domain if connected
    const domain = (domainArtifact?.kind === 'Domain')
      ? domainArtifact.value
      : undefined;

    // Get field function if connected
    const fieldFn = (fieldArtifact?.kind === 'Field:number')
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
          fieldSample?: number[];
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
