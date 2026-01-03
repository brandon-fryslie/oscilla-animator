/**
 * BroadcastSignal Adapters
 *
 * Broadcast a signal value to all elements in a field.
 * Lifts Signal world to Field world by replicating the signal value.
 *
 * Pattern: The Field is evaluated at render time (sink evaluation).
 * At that point, the CompileCtx is extended with runtime info including `t`.
 * We capture the signal closure and evaluate it when the Field is called.
 */

import { TRANSFORM_REGISTRY } from '../../TransformRegistry';
import type { Artifact, CompileCtx, RuntimeCtx, Field } from '../../../compiler/types';
import type { ValueRefPacked } from '../../../compiler/ir/lowerTypes';

/**
 * Extended context for field evaluation at runtime.
 * CompileCtx is extended with time information during rendering.
 */
interface FieldEvalCtx extends CompileCtx {
  t: number;
}

// =============================================================================
// BroadcastSignal:float
// =============================================================================

TRANSFORM_REGISTRY.registerAdapter({
  id: 'BroadcastSignal:float',
  label: 'Broadcast Signal (float)',
  inputType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
  outputType: { world: 'field', domain: 'float', category: 'core', busEligible: true },
  policy: 'AUTO',
  cost: 1.0,
  apply: (artifact: Artifact, _params: Record<string, unknown>, _ctx: CompileCtx): Artifact => {
    if (artifact.kind !== 'Signal:float' && artifact.kind !== 'Signal:Unit') {
      return { kind: 'Error', message: `BroadcastSignal:float expects Signal:float, got ${artifact.kind}` };
    }
    const signalFn = artifact.value as (t: number, ctx: RuntimeCtx) => number;

    // Field is evaluated at render time - ctx is extended with .t at runtime
    const field: Field<number> = (_seed, n, ctx) => {
      const runtimeCtx = ctx as FieldEvalCtx;
      const val = signalFn(runtimeCtx.t, runtimeCtx as unknown as RuntimeCtx);
      return Array<number>(n).fill(val);
    };

    return { kind: 'Field:float', value: field };
  },
  compileToIR: (_input: ValueRefPacked, _params: Record<string, ValueRefPacked>, _ctx): ValueRefPacked | null => {
    // BroadcastSignal adapters cannot be compiled in isolation because they need
    // domain information which is only available at the consumption site (render sinks).
    // In IR mode, signal→field broadcasting is handled explicitly by blocks like
    // FieldFromSignalBroadcast which have access to the domain context.
    return null;
  },
});

// =============================================================================
// BroadcastSignal:color
// =============================================================================

TRANSFORM_REGISTRY.registerAdapter({
  id: 'BroadcastSignal:color',
  label: 'Broadcast Signal (color)',
  inputType: { world: 'signal', domain: 'color', category: 'core', busEligible: true },
  outputType: { world: 'field', domain: 'color', category: 'core', busEligible: true },
  policy: 'AUTO',
  cost: 1.0,
  apply: (artifact: Artifact, _params: Record<string, unknown>, _ctx: CompileCtx): Artifact => {
    if (artifact.kind !== 'Signal:color') {
      return { kind: 'Error', message: `BroadcastSignal:color expects Signal:color, got ${artifact.kind}` };
    }
    const signalFn = artifact.value as (t: number, ctx: RuntimeCtx) => string;

    // Field is evaluated at render time - ctx is extended with .t at runtime
    const field: Field<unknown> = (_seed, n, ctx) => {
      const runtimeCtx = ctx as FieldEvalCtx;
      const val = signalFn(runtimeCtx.t, runtimeCtx as unknown as RuntimeCtx);
      return Array(n).fill(val);
    };

    return { kind: 'Field:color', value: field };
  },
  compileToIR: (_input: ValueRefPacked, _params: Record<string, ValueRefPacked>, _ctx): ValueRefPacked | null => {
    // BroadcastSignal adapters cannot be compiled in isolation because they need
    // domain information which is only available at the consumption site (render sinks).
    // In IR mode, signal→field broadcasting is handled explicitly by blocks like
    // FieldFromSignalBroadcast which have access to the domain context.
    return null;
  },
});
