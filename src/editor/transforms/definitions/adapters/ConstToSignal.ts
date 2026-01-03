/**
 * ConstToSignal Adapters
 *
 * Convert scalar (compile-time constant) values to signals (runtime functions).
 * These are fundamental type-lifting adapters used throughout the system.
 */

import { TRANSFORM_REGISTRY } from '../../TransformRegistry';
import type { Artifact, CompileCtx } from '../../../compiler/types';
import type { ValueRefPacked } from '../../../compiler/ir/lowerTypes';
import type { IRBuilder } from '../../../compiler/ir/IRBuilder';

// =============================================================================
// ConstToSignal:float
// =============================================================================

TRANSFORM_REGISTRY.registerAdapter({
  id: 'ConstToSignal:float',
  label: 'Const to Signal (float)',
  inputType: 'Scalar:float',
  outputType: 'Signal:float',
  policy: 'AUTO',
  cost: 0.1,
  apply: (artifact: Artifact, _params: Record<string, unknown>, _ctx: CompileCtx): Artifact => {
    if (artifact.kind !== 'Scalar:float') {
      return { kind: 'Error', message: `ConstToSignal:float expects Scalar:float, got ${artifact.kind}` };
    }
    const value = artifact.value;
    return {
      kind: 'Signal:float',
      value: () => value,
    };
  },
  compileToIR: (input: ValueRefPacked, _params: Record<string, ValueRefPacked>, ctx: { builder: IRBuilder }): ValueRefPacked | null => {
    if (input.k !== 'scalarConst') {
      return null; // Only scalar constants can be converted
    }

    const builder = ctx.builder;
    const constPool = builder.getConstPool();
    const constValue = constPool[input.constId];

    if (typeof constValue !== 'number') {
      return null; // ConstToSignal:float only works with numeric values
    }

    // Create a signal constant with the same value
    const outputType = { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };
    const sigId = builder.sigConst(constValue, outputType);

    // Allocate a slot for the signal and register it
    const slot = builder.allocValueSlot(outputType);
    builder.registerSigSlot(sigId, slot);

    return { k: 'sig', id: sigId, slot };
  },
});

// =============================================================================
// ConstToSignal:int
// =============================================================================

TRANSFORM_REGISTRY.registerAdapter({
  id: 'ConstToSignal:int',
  label: 'Const to Signal (int)',
  inputType: 'Scalar:int',
  outputType: 'Signal:int',
  policy: 'AUTO',
  cost: 0.1,
  apply: (artifact: Artifact, _params: Record<string, unknown>, _ctx: CompileCtx): Artifact => {
    if (artifact.kind !== 'Scalar:int') {
      return { kind: 'Error', message: `ConstToSignal:int expects Scalar:int, got ${artifact.kind}` };
    }
    const value = artifact.value;
    return {
      kind: 'Signal:int',
      value: () => value,
    };
  },
  compileToIR: (input: ValueRefPacked, _params: Record<string, ValueRefPacked>, ctx: { builder: IRBuilder }): ValueRefPacked | null => {
    if (input.k !== 'scalarConst') {
      return null;
    }

    const builder = ctx.builder;
    const constPool = builder.getConstPool();
    const constValue = constPool[input.constId];

    if (typeof constValue !== 'number') {
      return null;
    }

    const outputType = { world: 'signal' as const, domain: 'int' as const, category: 'core' as const, busEligible: true };
    const sigId = builder.sigConst(constValue, outputType);

    const slot = builder.allocValueSlot(outputType);
    builder.registerSigSlot(sigId, slot);

    return { k: 'sig', id: sigId, slot };
  },
});

// =============================================================================
// ConstToSignal:bool
// NOTE: Signal:boolean doesn't exist in the Artifact union type.
// This adapter is kept for backwards compatibility but returns an error.
// =============================================================================

TRANSFORM_REGISTRY.registerAdapter({
  id: 'ConstToSignal:bool',
  label: 'Const to Signal (bool)',
  inputType: 'Scalar:boolean',
  outputType: 'Signal:boolean',
  policy: 'AUTO',
  cost: 0.1,
  apply: (artifact: Artifact, _params: Record<string, unknown>, _ctx: CompileCtx): Artifact => {
    if (artifact.kind !== 'Scalar:boolean') {
      return { kind: 'Error', message: `ConstToSignal:bool expects Scalar:boolean, got ${artifact.kind}` };
    }
    // Signal:boolean is not a valid Artifact type - boolean signals are not supported
    return {
      kind: 'Error',
      message: 'Boolean signals are not supported. Use scalar booleans or field booleans instead.',
    };
  },
  compileToIR: (_input: ValueRefPacked, _params: Record<string, ValueRefPacked>, _ctx: { builder: IRBuilder }): ValueRefPacked | null => {
    // Boolean signals are not supported in the IR system
    return null;
  },
});

// =============================================================================
// ConstToSignal:color
// =============================================================================

TRANSFORM_REGISTRY.registerAdapter({
  id: 'ConstToSignal:color',
  label: 'Const to Signal (color)',
  inputType: 'Scalar:color',
  outputType: 'Signal:color',
  policy: 'AUTO',
  cost: 0.1,
  apply: (artifact: Artifact, _params: Record<string, unknown>, _ctx: CompileCtx): Artifact => {
    if (artifact.kind !== 'Scalar:color') {
      return { kind: 'Error', message: `ConstToSignal:color expects Scalar:color, got ${artifact.kind}` };
    }
    const value = artifact.value as string;
    return {
      kind: 'Signal:color',
      value: () => value,
    };
  },
  compileToIR: (input: ValueRefPacked, _params: Record<string, ValueRefPacked>, ctx: { builder: IRBuilder }): ValueRefPacked | null => {
    if (input.k !== 'scalarConst') {
      return null;
    }

    const builder = ctx.builder;
    const constPool = builder.getConstPool();
    const constValue = constPool[input.constId];

    if (typeof constValue !== 'string') {
      return null; // Color values should be strings
    }

    // For non-numeric signal constants, we keep them in the const pool
    // and create a signal expression that references the constant
    // Currently sigConst only handles numbers, so this is not yet supported in IR
    // The runtime will need to handle color signal constants differently

    // TODO: Add support for non-numeric signal constants in IR
    // For now, return null to indicate this transform is not supported in IR mode
    return null;
  },
});
