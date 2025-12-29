/**
 * @file FieldHandle Evaluation
 * @description Evaluates field IR nodes into FieldHandle recipes.
 *
 * Key Principle: Returns handles (recipes), NOT arrays.
 * Arrays are only produced during materialization.
 */

import {
  FieldOp,
  FieldZipOp,
} from './types';

import type {
  FieldExprId,
  FieldExprIR,
  FieldHandle,
  FieldHandleCache,
  FieldEnv,
  FnRef,
} from './types';

// =============================================================================
// Operation Mapping
// =============================================================================

/**
 * Convert function reference to FieldOp
 */
function fnRefToFieldOp(fn: FnRef): FieldOp {
  const opMap: Record<string, FieldOp> = {
    identity: FieldOp.Identity,
    negate: FieldOp.Negate,
    abs: FieldOp.Abs,
    floor: FieldOp.Floor,
    ceil: FieldOp.Ceil,
    round: FieldOp.Round,
    sin: FieldOp.Sin,
    cos: FieldOp.Cos,
    sqrt: FieldOp.Sqrt,
    exp: FieldOp.Exp,
    log: FieldOp.Log,
  };

  const op = opMap[fn.opcode];
  if (!op) {
    throw new Error(`Unknown field operation: ${fn.opcode}`);
  }
  return op;
}

/**
 * Convert function reference to FieldZipOp
 */
function fnRefToFieldZipOp(fn: FnRef): FieldZipOp {
  const opMap: Record<string, FieldZipOp> = {
    Add: FieldZipOp.Add,
    Sub: FieldZipOp.Sub,
    Mul: FieldZipOp.Mul,
    Div: FieldZipOp.Div,
    Min: FieldZipOp.Min,
    Max: FieldZipOp.Max,
    Pow: FieldZipOp.Pow,
    Mod: FieldZipOp.Mod,
    Vec2Add: FieldZipOp.Vec2Add,
    Vec2Sub: FieldZipOp.Vec2Sub,
    Vec2Mul: FieldZipOp.Vec2Mul,
    Vec2Div: FieldZipOp.Vec2Div,
  };

  const op = opMap[fn.opcode];
  if (!op) {
    throw new Error(`Unknown field zip operation: ${fn.opcode}`);
  }
  return op;
}

// =============================================================================
// Field Handle Evaluation
// =============================================================================

/**
 * Evaluate a field expression to a FieldHandle.
 *
 * This function returns a HANDLE (recipe), not an array.
 * The handle describes how to produce an array when materialized.
 *
 * Handles are cached per-frame for efficiency.
 *
 * @param fieldId - Field expression ID to evaluate
 * @param env - Field environment with cache and slots
 * @param nodes - Array of field IR nodes
 * @returns FieldHandle recipe
 */
export function evalFieldHandle(
  fieldId: FieldExprId,
  env: FieldEnv,
  nodes: FieldExprIR[]
): FieldHandle {
  // Check cache
  if (env.cache.stamp[fieldId] === env.cache.frameId) {
    return env.cache.handles[fieldId];
  }

  const node = nodes[fieldId];
  let handle: FieldHandle;

  switch (node.kind) {
    case 'const':
      // Constant value broadcast to all elements
      handle = {
        kind: 'Const',
        constId: node.constId,
        type: node.type,
      };
      break;

    case 'map':
      // Unary operation on a field
      // Merge fn.params and node.params, with node.params taking precedence
      handle = {
        kind: 'Op',
        op: fnRefToFieldOp(node.fn),
        args: [node.src],
        type: node.type,
        params: { ...node.fn.params, ...node.params },
      };
      break;

    case 'zip':
      // Binary operation on two fields
      // Merge fn.params and node.params, with node.params taking precedence
      handle = {
        kind: 'Zip',
        op: fnRefToFieldZipOp(node.fn),
        a: node.a,
        b: node.b,
        type: node.type,
        params: { ...node.fn.params, ...node.params },
      };
      break;

    case 'select':
      // Conditional per-element selection
      handle = {
        kind: 'Select',
        cond: node.cond,
        t: node.t,
        f: node.f,
        type: node.type,
      };
      break;

    case 'transform':
      // Transform chain application
      handle = {
        kind: 'Transform',
        src: node.src,
        chain: node.chain,
        type: node.type,
      };
      break;

    case 'sampleSignal':
      // Broadcast signal to all elements
      handle = {
        kind: 'Broadcast',
        sigId: node.signalSlot,
        domainId: node.domainId,
        type: node.type,
      };
      break;

    case 'busCombine':
      // Combine multiple fields from bus
      handle = {
        kind: 'Combine',
        mode: node.combine.mode,
        terms: node.terms,
        type: node.type,
      };
      break;

    case 'inputSlot':
      // Read from input slot
      handle = env.slotHandles.read(node.slot);
      break;

    case 'source':
      // Source field from domain
      handle = {
        kind: 'Source',
        sourceTag: node.sourceTag,
        domainId: node.domainId,
        type: node.type,
      };
      break;

    default:
      throw new Error(`Unknown field kind: ${(node as any).kind}`);
  }

  // Cache the handle
  env.cache.handles[fieldId] = handle;
  env.cache.stamp[fieldId] = env.cache.frameId;

  return handle;
}

/**
 * Create a new field handle cache for a frame
 */
export function createFieldHandleCache(): FieldHandleCache {
  return {
    handles: [],
    stamp: [],
    frameId: 0,
  };
}

/**
 * Advance cache to next frame
 */
export function advanceFrameCache(cache: FieldHandleCache): void {
  cache.frameId++;
}
