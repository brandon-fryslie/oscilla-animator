/**
 * @file Field Materializer
 * @description Central materialization system that converts FieldHandles into typed arrays.
 *
 * Key Design:
 * - All array production happens here (centralized materialization)
 * - Buffer pooling reduces allocations
 * - Per-frame caching avoids redundant materializations
 * - Debug tracing for visibility
 */

import { evalFieldHandle } from './FieldHandle';
import type { FieldBufferPool } from './BufferPool';
import { FieldOp, FieldZipOp } from './types';
import type {
  FieldExprIR,
  FieldHandle,
  FieldEnv,
  MaterializationRequest,
  MaterializationDebug,
  SigExprId,
  CombineMode,
  TransformChainId,
} from './types';
import type { SignalBridge } from '../integration/SignalBridge';

// Phase 4 SignalExpr Runtime integration
import { evalSig as evalSigIR } from '../signal-expr/SigEvaluator';
import type { SigEnv as IRSigEnv } from '../signal-expr/SigEnv';
import type { SignalExprIR as IRSignalExprIR } from '../../compiler/ir/signalExpr';

// =============================================================================
// Materializer Environment
// =============================================================================

/**
 * Signal expression IR node (stub for now)
 */
export type SignalExprIR = unknown;

/**
 * Transform chain definition (stub for now)
 */
export interface TransformChain {
  /** Transform chain ID */
  id: TransformChainId;
  /** Transform steps (opaque for now) */
  steps: unknown[];
}

/**
 * Transform chains table
 */
export interface TransformChains {
  get(chainId: TransformChainId): TransformChain | undefined;
}

/**
 * Signal environment - contains time and signal evaluation context.
 *
 * Supports two evaluation modes:
 * 1. IR Evaluation (Phase 4): Uses irEnv + irNodes for SignalExpr DAG evaluation
 * 2. Closure Bridge (legacy): Uses signalBridge for closure-based evaluation
 *
 * IR evaluation is preferred when available. signalBridge is for backwards
 * compatibility during migration.
 */
export interface SigEnv {
  /** Current frame time in milliseconds */
  time: number;

  /**
   * Phase 4 SignalExpr IR evaluation environment.
   * When provided, IR evaluation is used (preferred path).
   */
  irEnv?: IRSigEnv;

  /**
   * Phase 4 SignalExpr IR nodes.
   * Required when irEnv is provided.
   */
  irNodes?: IRSignalExprIR[];

  /**
   * LEGACY: Signal bridge for evaluating signal closures.
   * Used when irEnv is not available (backwards compatibility).
   * Will be deprecated once all blocks are migrated to IR.
   */
  signalBridge?: SignalBridge;
}

/**
 * Constants table
 */
export interface ConstantsTable {
  get(constId: number): number;
}

/**
 * Source fields map
 */
export interface SourceFields {
  get(sourceTag: string): ArrayBufferView | undefined;
}

/**
 * MaterializerEnv contains everything needed for materialization
 */
export interface MaterializerEnv {
  /** Buffer pool for allocation */
  pool: FieldBufferPool;

  /** Per-frame buffer cache */
  cache: Map<string, ArrayBufferView>;

  /** Field environment */
  fieldEnv: FieldEnv;

  /** Field IR nodes */
  fieldNodes: FieldExprIR[];

  /** Signal environment */
  sigEnv: SigEnv;

  /** Signal IR nodes */
  sigNodes: SignalExprIR[];

  /** Constants table */
  constants: ConstantsTable;

  /** Source fields */
  sources: SourceFields;

  /** Transform chains (optional, for transform node support) */
  transforms?: TransformChains;

  /** Domain count function */
  getDomainCount: (domainId: number) => number;

  /** Debug tracer (optional) */
  debug?: MaterializationDebug;
}

// =============================================================================
// Signal Evaluation
// =============================================================================

/**
 * Evaluate a signal expression.
 *
 * Supports two evaluation modes:
 * 1. Phase 4 IR Evaluation: When env.irEnv and env.irNodes are provided,
 *    uses the SignalExpr DAG evaluator (preferred path)
 * 2. Legacy Closure Bridge: When env.signalBridge is provided,
 *    uses closure-based evaluation (backwards compatibility)
 *
 * @param sigId - Signal expression ID
 * @param env - Signal environment (contains IR env or signal bridge)
 * @param _nodes - Signal IR nodes (legacy parameter, use env.irNodes instead)
 * @returns Signal value at current time
 */
function evalSig(
  sigId: SigExprId,
  env: SigEnv,
  _nodes: SignalExprIR[]
): number {
  // Phase 4: Prefer IR evaluation when available
  if (env.irEnv !== undefined && env.irNodes !== undefined) {
    return evalSigIR(sigId, env.irEnv, env.irNodes);
  }

  // Legacy: Use SignalBridge if available
  if (env.signalBridge !== undefined) {
    return env.signalBridge.evalSig(sigId, env);
  }

  // Fallback to 0 if no evaluator available (for backward compatibility)
  return 0;
}

// =============================================================================
// Operation Application
// =============================================================================

/**
 * Apply a FieldOp to a scalar value
 */
function applyFieldOp(op: FieldOp, value: number): number {
  switch (op) {
    case FieldOp.Identity:
      return value;
    case FieldOp.Negate:
      return -value;
    case FieldOp.Abs:
      return Math.abs(value);
    case FieldOp.Floor:
      return Math.floor(value);
    case FieldOp.Ceil:
      return Math.ceil(value);
    case FieldOp.Round:
      return Math.round(value);
    case FieldOp.Sin:
      return Math.sin(value);
    case FieldOp.Cos:
      return Math.cos(value);
    case FieldOp.Sqrt:
      return Math.sqrt(value);
    case FieldOp.Exp:
      return Math.exp(value);
    case FieldOp.Log:
      return Math.log(value);
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown field operation: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Apply a FieldZipOp to two scalar values
 */
function applyFieldZipOp(op: FieldZipOp, a: number, b: number): number {
  switch (op) {
    case FieldZipOp.Add:
      return a + b;
    case FieldZipOp.Sub:
      return a - b;
    case FieldZipOp.Mul:
      return a * b;
    case FieldZipOp.Div:
      return a / b;
    case FieldZipOp.Min:
      return Math.min(a, b);
    case FieldZipOp.Max:
      return Math.max(a, b);
    case FieldZipOp.Pow:
      return Math.pow(a, b);
    case FieldZipOp.Mod:
      return a % b;
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown field zip operation: ${String(_exhaustive)}`);
    }
  }
}

// =============================================================================
// Materialization
// =============================================================================

/**
 * Materialize a field expression to a typed array.
 *
 * Algorithm (HANDOFF.md:236-272):
 * 1. Check cache
 * 2. Get handle via evalFieldHandle
 * 3. Get domain count
 * 4. Allocate buffer from pool
 * 5. Fill buffer based on handle kind
 * 6. Cache result
 * 7. Debug trace (optional)
 *
 * @param request - Materialization request
 * @param env - Materializer environment
 * @returns Typed array with materialized data
 */
export function materialize(
  request: MaterializationRequest,
  env: MaterializerEnv
): ArrayBufferView {
  // 1. Check cache
  const cacheKey = `${request.fieldId}:${request.domainId}:${request.format}`;
  const cached = env.cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // 2. Get handle
  const handle = evalFieldHandle(request.fieldId, env.fieldEnv, env.fieldNodes);

  // 3. Get domain count
  const N = env.getDomainCount(request.domainId);

  // 4. Allocate buffer
  const out = env.pool.alloc(request.format, N);

  // 5. Fill buffer based on handle kind
  fillBuffer(handle, out, N, env);

  // 6. Cache result
  env.cache.set(cacheKey, out);

  // 7. Debug trace (optional)
  if (env.debug !== undefined) {
    env.debug.traceMaterialization({
      fieldId: request.fieldId,
      domainId: request.domainId,
      count: N,
      format: request.format,
      usage: request.usageTag,
    });
  }

  return out;
}

// =============================================================================
// Fill Buffer Dispatcher
// =============================================================================

/**
 * Fill a buffer based on the handle kind.
 *
 * Dispatches to specific fill functions for each handle type.
 *
 * @param handle - Field handle (recipe)
 * @param out - Output buffer to fill
 * @param N - Number of elements
 * @param env - Materializer environment
 */
function fillBuffer(
  handle: FieldHandle,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  switch (handle.kind) {
    case 'Const':
      fillBufferConst(handle, out, N, env);
      break;

    case 'Broadcast':
      fillBufferBroadcast(handle, out, N, env);
      break;

    case 'Op':
      fillBufferOp(handle, out, N, env);
      break;

    case 'Zip':
      fillBufferZip(handle, out, N, env);
      break;

    case 'Select':
      fillBufferSelect(handle, out, N, env);
      break;

    case 'Transform':
      fillBufferTransform(handle, out, N, env);
      break;

    case 'Combine':
      fillBufferCombine(handle, out, N, env);
      break;

    case 'Source':
      fillBufferSource(handle, out, env);
      break;

    default: {
      const _exhaustive: never = handle;
      throw new Error(`Unknown handle kind: ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

// =============================================================================
// Fill Buffer Implementations
// =============================================================================

/**
 * Fill buffer with constant value (broadcast to all elements)
 */
function fillBufferConst(
  handle: Extract<FieldHandle, { kind: 'Const' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  const value = env.constants.get(handle.constId);
  const arr = out as Float32Array;

  for (let i = 0; i < N; i++) {
    arr[i] = value;
  }
}

/**
 * Fill buffer by broadcasting signal value to all elements
 */
function fillBufferBroadcast(
  handle: Extract<FieldHandle, { kind: 'Broadcast' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  const value = evalSig(handle.sigId, env.sigEnv, env.sigNodes);
  const arr = out as Float32Array;

  for (let i = 0; i < N; i++) {
    arr[i] = value;
  }
}

/**
 * Fill buffer from source field
 */
function fillBufferSource(
  handle: Extract<FieldHandle, { kind: 'Source' }>,
  out: ArrayBufferView,
  env: MaterializerEnv
): void {
  const source = env.sources.get(handle.sourceTag);
  if (source === undefined) {
    throw new Error(`Source field not found: ${handle.sourceTag}`);
  }

  if (source.byteLength !== out.byteLength) {
    throw new Error(
      `Source field size mismatch: expected ${out.byteLength} bytes, got ${source.byteLength}`
    );
  }

  // Copy source data to output
  const outArr = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  const srcArr = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  outArr.set(srcArr);
}

/**
 * Fill buffer with operation (map operation)
 *
 * Algorithm:
 * 1. Materialize input field
 * 2. Apply operation element-wise
 */
function fillBufferOp(
  handle: Extract<FieldHandle, { kind: 'Op' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  // For now, only support single-arg operations
  if (handle.args.length !== 1) {
    throw new Error(`Expected 1 argument for Op, got ${handle.args.length}`);
  }

  // Materialize input field
  const srcBuffer = materialize(
    {
      fieldId: handle.args[0],
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'op-input',
    },
    env
  ) as Float32Array;

  const outArr = out as Float32Array;

  // Apply operation element-wise
  for (let i = 0; i < N; i++) {
    outArr[i] = applyFieldOp(handle.op, srcBuffer[i]);
  }
}

/**
 * Fill buffer with zip operation (element-wise binary operation)
 *
 * Algorithm:
 * 1. Materialize both input fields
 * 2. Apply zip operation element-wise
 */
function fillBufferZip(
  handle: Extract<FieldHandle, { kind: 'Zip' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  // Materialize input fields
  const aBuffer = materialize(
    {
      fieldId: handle.a,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'zip-a',
    },
    env
  ) as Float32Array;

  const bBuffer = materialize(
    {
      fieldId: handle.b,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'zip-b',
    },
    env
  ) as Float32Array;

  const outArr = out as Float32Array;

  // Apply zip operation element-wise
  for (let i = 0; i < N; i++) {
    outArr[i] = applyFieldZipOp(handle.op, aBuffer[i], bBuffer[i]);
  }
}

/**
 * Fill buffer with select operation (conditional per-element)
 *
 * Algorithm:
 * 1. Materialize condition field
 * 2. Materialize true/false fields
 * 3. Select element-wise based on condition (nonzero = true)
 */
function fillBufferSelect(
  handle: Extract<FieldHandle, { kind: 'Select' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  // Materialize condition field
  const condBuffer = materialize(
    {
      fieldId: handle.cond,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'select-cond',
    },
    env
  ) as Float32Array;

  // Materialize true branch field
  const tBuffer = materialize(
    {
      fieldId: handle.t,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'select-true',
    },
    env
  ) as Float32Array;

  // Materialize false branch field
  const fBuffer = materialize(
    {
      fieldId: handle.f,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'select-false',
    },
    env
  ) as Float32Array;

  const outArr = out as Float32Array;

  // Select element-wise (nonzero condition = true)
  for (let i = 0; i < N; i++) {
    outArr[i] = condBuffer[i] !== 0 ? tBuffer[i] : fBuffer[i];
  }
}

/**
 * Fill buffer with transform operation (transform chain application)
 *
 * Algorithm:
 * 1. Materialize source field
 * 2. Apply transform chain to produce output
 *
 * NOTE: Transform chain application is a placeholder for now.
 * Full transform semantics will be implemented in Phase 6.
 */
function fillBufferTransform(
  handle: Extract<FieldHandle, { kind: 'Transform' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  // Materialize source field
  const srcBuffer = materialize(
    {
      fieldId: handle.src,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'transform-src',
    },
    env
  ) as Float32Array;

  // Get transform chain
  const chain = env.transforms?.get(handle.chain);
  if (!chain) {
    // Fallback: identity transform (copy source to output)
    // This allows the system to work even without transform chain support
    const outArr = out as Float32Array;
    for (let i = 0; i < N; i++) {
      outArr[i] = srcBuffer[i];
    }
    return;
  }

  // TODO: Apply transform chain steps
  // For now, use identity transform as placeholder
  const outArr = out as Float32Array;
  for (let i = 0; i < N; i++) {
    outArr[i] = srcBuffer[i];
  }
}

/**
 * Fill buffer with combine operation (bus combine)
 *
 * Algorithm (HANDOFF.md:436-476):
 * 1. Materialize all term fields
 * 2. Combine element-wise by mode (sum, average, min, max, last)
 */
function fillBufferCombine(
  handle: Extract<FieldHandle, { kind: 'Combine' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  const outArr = out as Float32Array;
  const { terms, mode } = handle;

  // Handle empty terms case
  if (terms.length === 0) {
    // Fill with zeros
    for (let i = 0; i < N; i++) {
      outArr[i] = 0;
    }
    return;
  }

  // Materialize all term fields
  const termBuffers = terms.map((termId) =>
    materialize(
      {
        fieldId: termId,
        domainId: env.fieldEnv.domainId,
        format: 'f32',
        layout: 'scalar',
        usageTag: 'combine-term',
      },
      env
    ) as Float32Array
  );

  // Combine element-wise based on mode
  for (let i = 0; i < N; i++) {
    outArr[i] = combineElement(mode, termBuffers, i);
  }
}

/**
 * Combine a single element from multiple term buffers
 */
function combineElement(
  mode: CombineMode,
  termBuffers: Float32Array[],
  index: number
): number {
  switch (mode) {
    case 'sum': {
      let sum = 0;
      for (const buffer of termBuffers) {
        sum += buffer[index];
      }
      return sum;
    }

    case 'average': {
      let sum = 0;
      for (const buffer of termBuffers) {
        sum += buffer[index];
      }
      return termBuffers.length > 0 ? sum / termBuffers.length : 0;
    }

    case 'min': {
      let min = Infinity;
      for (const buffer of termBuffers) {
        if (buffer[index] < min) {
          min = buffer[index];
        }
      }
      return min;
    }

    case 'max': {
      let max = -Infinity;
      for (const buffer of termBuffers) {
        if (buffer[index] > max) {
          max = buffer[index];
        }
      }
      return max;
    }

    case 'last': {
      // Last term wins
      return termBuffers[termBuffers.length - 1][index];
    }

    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown combine mode: ${String(_exhaustive)}`);
    }
  }
}

// =============================================================================
// Materializer Interface
// =============================================================================

/**
 * FieldMaterializer provides a high-level interface to materialization.
 */
export class FieldMaterializer {
  private readonly env: MaterializerEnv;

  constructor(env: MaterializerEnv) {
    this.env = env;
  }

  /**
   * Materialize a field to a typed array
   */
  materialize(request: MaterializationRequest): ArrayBufferView {
    return materialize(request, this.env);
  }

  /**
   * Release buffers back to pool at frame end
   */
  releaseFrame(): void {
    this.env.pool.releaseAll();
    this.env.cache.clear();
  }
}
