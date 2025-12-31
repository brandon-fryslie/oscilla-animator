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
import { parseColor } from '../renderCmd';
import { quantizeColorRGBA } from '../kernels/ColorQuantize';

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
  get(constId: number): unknown;
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

  /** Optional domain element IDs for per-element identity ops */
  domainElements?: readonly string[];

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

  // No evaluator available - this is a bug in the compiler or runtime setup
  throw new Error(
    `[Materializer] Cannot evaluate signal ${sigId}: ` +
    `No signal evaluation context available. ` +
    `Fix: Compiler must emit signal IR with proper wiring, ` +
    `or signalBridge must be provided for legacy execution.`
  );
}

// =============================================================================
// Operation Application
// =============================================================================

/**
 * Apply a FieldOp to a scalar value
 */
function readParamNumber(
  params: Record<string, unknown> | undefined,
  key: string,
  opLabel: string,
  env: MaterializerEnv
): number {
  if (params === undefined || params === null || !(key in params)) {
    throw new Error(`Missing param "${key}" for field op ${opLabel}`);
  }
  const raw = params[key];
  if (
    typeof raw === "object" &&
    raw !== null &&
    "signalSlot" in raw &&
    typeof (raw as { signalSlot?: unknown }).signalSlot === "number"
  ) {
    return evalSig(
      (raw as { signalSlot: number }).signalSlot,
      env.sigEnv,
      env.sigNodes
    );
  }
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid param "${key}" for field op ${opLabel}: ${String(raw)}`);
  }
  return num;
}

function hash01ById(elementId: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < elementId.length; i++) {
    h = ((h << 5) - h + elementId.charCodeAt(i)) | 0;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  const t = (h * 12.9898 + 78.233) * 43758.5453;
  return t - Math.floor(t);
}

function applyFieldOp(
  op: FieldOp,
  value: number,
  params: Record<string, unknown> | undefined,
  index: number,
  env: MaterializerEnv
): number {
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
      return Math.sin(value * readParamNumber(params, 'k', 'sin', env));
    case FieldOp.Cos:
      return Math.cos(value * readParamNumber(params, 'k', 'cos', env));
    case FieldOp.Tanh:
      return Math.tanh(value * readParamNumber(params, 'k', 'tanh', env));
    case FieldOp.Sqrt:
      return Math.sqrt(value);
    case FieldOp.Exp:
      return Math.exp(value);
    case FieldOp.Log:
      return Math.log(value);
    case FieldOp.Smoothstep: {
      const a = readParamNumber(params, 'a', 'smoothstep', env);
      const b = readParamNumber(params, 'b', 'smoothstep', env);
      const t = (value - a) / (b - a);
      const u = Math.max(0, Math.min(1, t));
      return u * u * (3 - 2 * u);
    }
    case FieldOp.Clamp: {
      const a = readParamNumber(params, 'a', 'clamp', env);
      const b = readParamNumber(params, 'b', 'clamp', env);
      return Math.max(a, Math.min(b, value));
    }
    case FieldOp.Scale:
      return value * readParamNumber(params, 'k', 'scale', env);
    case FieldOp.Offset:
      return value + readParamNumber(params, 'k', 'offset', env);
    case FieldOp.Hash01ById: {
      const seed = readParamNumber(params, 'seed', 'hash01ById', env);
      const elementId = env.domainElements?.[index] ?? String(index);
      return hash01ById(elementId, seed);
    }
    case FieldOp.ZipSignal: {
      const signalValue = readParamNumber(params, 'signal', 'zipSignal', env);
      const op = params?.op;
      if (typeof op !== 'string') {
        throw new Error(`Missing param "op" for field op zipSignal`);
      }
      switch (op) {
        case 'add':
          return value + signalValue;
        case 'sub':
          return value - signalValue;
        case 'mul':
          return value * signalValue;
        case 'min':
          return Math.min(value, signalValue);
        case 'max':
          return Math.max(value, signalValue);
        default:
          throw new Error(`zipSignal unsupported op "${op}"`);
      }
    }
    case FieldOp.Vec2Rotate:
    case FieldOp.Vec2Scale:
    case FieldOp.Vec2Translate:
    case FieldOp.Vec2Reflect:
    case FieldOp.JitterVec2:
      throw new Error(`applyFieldOp: vec2 op ${op} requires vec2 materialization`);
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
    // Vec2 operations are handled separately in fillBufferZip for vec2 types
    case FieldZipOp.Vec2Add:
    case FieldZipOp.Vec2Sub:
    case FieldZipOp.Vec2Mul:
    case FieldZipOp.Vec2Div:
      throw new Error(`Vec2 operations must be handled in fillBufferZip, not applyFieldZipOp`);
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

    case 'MapIndexed':
      fillBufferMapIndexed(handle, out, N, env);
      break;

    case 'ZipSig':
      fillBufferZipSig(handle, out, N, env);
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

  switch (handle.type.kind) {
    case 'number': {
      if (typeof value === 'number') {
        const arr = out as Float32Array;
        for (let i = 0; i < N; i++) {
          arr[i] = value;
        }
        return;
      }

      if (Array.isArray(value)) {
        if (value.length !== N) {
          throw new Error(
            `fillBufferConst: number array length mismatch (expected ${N}, got ${value.length})`
          );
        }
        const arr = out as Float32Array;
        for (let i = 0; i < N; i++) {
          arr[i] = Number(value[i]);
        }
        return;
      }

      if (typeof value === 'boolean') {
        const arr = out as Float32Array;
        const numeric = (value !== undefined && value !== null && value !== false) ? 1 : 0;
        for (let i = 0; i < N; i++) {
          arr[i] = numeric;
        }
        return;
      }
      break;
    }

    case 'vec2': {
      const arr = out as Float32Array;
      if (Array.isArray(value)) {
        if (value.length !== N) {
          throw new Error(
            `fillBufferConst: vec2 array length mismatch (expected ${N}, got ${value.length})`
          );
        }
        for (let i = 0; i < N; i++) {
          const v = value[i] as { x: number; y: number };
          arr[i * 2 + 0] = Number(v?.x ?? 0);
          arr[i * 2 + 1] = Number(v?.y ?? 0);
        }
        return;
      }

      if (value !== undefined && value !== null && typeof value === 'object') {
        const v = value as { x?: number; y?: number };
        const x = Number(v.x ?? 0);
        const y = Number(v.y ?? 0);
        for (let i = 0; i < N; i++) {
          arr[i * 2 + 0] = x;
          arr[i * 2 + 1] = y;
        }
        return;
      }

      // Scalar number broadcasts to both x and y
      if (typeof value === 'number') {
        for (let i = 0; i < N; i++) {
          arr[i * 2 + 0] = value;
          arr[i * 2 + 1] = value;
        }
        return;
      }
      break;
    }


    case 'vec3': {
      const arr = out as Float32Array;
      
      // Scalar broadcast: single number → (cv, cv, cv)
      if (typeof value === 'number') {
        for (let i = 0; i < N; i++) {
          arr[i * 3 + 0] = value;
          arr[i * 3 + 1] = value;
          arr[i * 3 + 2] = value;
        }
        return;
      }

      // Object constant: {x, y, z}
      if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as { x?: number; y?: number; z?: number };
        const x = Number(v.x ?? 0);
        const y = Number(v.y ?? 0);
        const z = Number(v.z ?? 0);
        for (let i = 0; i < N; i++) {
          arr[i * 3 + 0] = x;
          arr[i * 3 + 1] = y;
          arr[i * 3 + 2] = z;
        }
        return;
      }

      throw new Error(`fillBufferConst: invalid vec3 constant (${typeof value})`);
    }

    case 'vec4': {
      const arr = out as Float32Array;
      
      // Scalar broadcast: single number → (cv, cv, cv, cv)
      if (typeof value === 'number') {
        for (let i = 0; i < N; i++) {
          arr[i * 4 + 0] = value;
          arr[i * 4 + 1] = value;
          arr[i * 4 + 2] = value;
          arr[i * 4 + 3] = value;
        }
        return;
      }

      // Object constant: {x, y, z, w}
      if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as { x?: number; y?: number; z?: number; w?: number };
        const x = Number(v.x ?? 0);
        const y = Number(v.y ?? 0);
        const z = Number(v.z ?? 0);
        const w = Number(v.w ?? 0);
        for (let i = 0; i < N; i++) {
          arr[i * 4 + 0] = x;
          arr[i * 4 + 1] = y;
          arr[i * 4 + 2] = z;
          arr[i * 4 + 3] = w;
        }
        return;
      }

      throw new Error(`fillBufferConst: invalid vec4 constant (${typeof value})`);
    }

    case 'quat': {
      const arr = out as Float32Array;
      
      // Quaternion constant: {x, y, z, w}
      // CRITICAL: Must be normalized (unit quaternion)
      if (value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as { x?: number; y?: number; z?: number; w?: number };
        const x = Number(v.x ?? 0);
        const y = Number(v.y ?? 0);
        const z = Number(v.z ?? 0);
        const w = Number(v.w ?? 0);

        // Validate unit quaternion: |q| ≈ 1.0 (tolerance: 0.001)
        const len = Math.sqrt(x * x + y * y + z * z + w * w);
        if (Math.abs(len - 1.0) > 0.001) {
          throw new Error(
            `Quaternion must be normalized (length ${len.toFixed(6)}, expected 1.0)`
          );
        }

        // Fill buffer with normalized quaternion
        for (let i = 0; i < N; i++) {
          arr[i * 4 + 0] = x;
          arr[i * 4 + 1] = y;
          arr[i * 4 + 2] = z;
          arr[i * 4 + 3] = w;
        }
        return;
      }

      throw new Error(`fillBufferConst: invalid quat constant (${typeof value})`);
    }

    case 'mat4': {
      const arr = out as Float32Array;
      
      // Matrix constant: 16-element array
      // Layout: COLUMN-MAJOR (WebGL convention)
      // Column 0: elements 0-3   (m00, m10, m20, m30)
      // Column 1: elements 4-7   (m01, m11, m21, m31)
      // Column 2: elements 8-11  (m02, m12, m22, m32)
      // Column 3: elements 12-15 (m03, m13, m23, m33)
      if (Array.isArray(value)) {
        if (value.length !== 16) {
          throw new Error(
            `fillBufferConst: mat4 requires exactly 16 elements, got ${value.length}`
          );
        }

        // Fill buffer with matrix elements
        for (let i = 0; i < N; i++) {
          const off = i * 16;
          for (let j = 0; j < 16; j++) {
            arr[off + j] = Number(value[j]);
          }
        }
        return;
      }

      throw new Error(`fillBufferConst: mat4 constant must be a 16-element array`);
    }

    case 'color': {
      const outArr = out as Uint8Array;
      if (!(outArr instanceof Uint8Array)) {
        throw new Error('fillBufferConst: color output must be a Uint8Array');
      }

      if (Array.isArray(value)) {
        if (value.length !== N) {
          throw new Error(
            `fillBufferConst: color array length mismatch (expected ${N}, got ${value.length})`
          );
        }
        for (let i = 0; i < N; i++) {
          const rgba = toColorRGBA(value[i]);
          const q = quantizeColorRGBA(rgba.r, rgba.g, rgba.b, rgba.a);
          outArr[i * 4 + 0] = q[0];
          outArr[i * 4 + 1] = q[1];
          outArr[i * 4 + 2] = q[2];
          outArr[i * 4 + 3] = q[3];
        }
        return;
      }

      const rgba = toColorRGBA(value);
      const q = quantizeColorRGBA(rgba.r, rgba.g, rgba.b, rgba.a);
      for (let i = 0; i < N; i++) {
        outArr[i * 4 + 0] = q[0];
        outArr[i * 4 + 1] = q[1];
        outArr[i * 4 + 2] = q[2];
        outArr[i * 4 + 3] = q[3];
      }
      return;
    }

    case 'boolean': {
      const numeric = (value !== undefined && value !== null && value !== false) ? 1 : 0;
      const arr = out as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = numeric;
      }
      return;
    }

    default:
      break;
  }

  throw new Error(
    `fillBufferConst: unsupported const for type ${handle.type.kind} (${typeof value})`
  );
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
 * Fill buffer with MapIndexed operation.
 *
 * Evaluates fn(i, n, ...sigValues) for each element index i.
 * Signals are evaluated once and passed to each element.
 */
function fillBufferMapIndexed(
  handle: Extract<FieldHandle, { kind: 'MapIndexed' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  // Evaluate signals once (they're uniform across elements)
  const sigValues: number[] = [];
  if (handle.signals !== undefined) {
    for (const sigId of handle.signals) {
      sigValues.push(evalSig(sigId, env.sigEnv, env.sigNodes));
    }
  }

  const outArr = out as Float32Array;

  // Apply indexed kernel based on function name
  switch (handle.fn) {
    case 'linearInterp':
      // Linear interpolation: lerp(start, end, i/(n-1))
      {
        const start = sigValues[0] ?? 0;
        const end = sigValues[1] ?? 1;
        for (let i = 0; i < N; i++) {
          const t = N > 1 ? i / (N - 1) : 0;
          outArr[i] = start + (end - start) * t;
        }
      }
      break;

    case 'normalizedIndex':
      // Normalized index: i / (n - 1)
      for (let i = 0; i < N; i++) {
        outArr[i] = N > 1 ? i / (N - 1) : 0;
      }
      break;

    case 'hueGradient':
      // Hue gradient: (hueOffset + (i/n) * spread) mod 1
      {
        const hueOffset = sigValues[0] ?? 0;
        const spread = sigValues[1] ?? 1;
        for (let i = 0; i < N; i++) {
          const t = N > 0 ? i / N : 0;
          const hue = (hueOffset + t * spread) % 1;
          outArr[i] = hue < 0 ? hue + 1 : hue;
        }
      }
      break;

    default:
      // Generic fallback - just return normalized index
      for (let i = 0; i < N; i++) {
        outArr[i] = N > 1 ? i / (N - 1) : 0;
      }
      break;
  }
}

/**
 * Fill buffer with ZipSig operation.
 *
 * Evaluates fn(field[i], sig1, sig2, ...) for each element.
 * Field is materialized; signals are evaluated once.
 */
function fillBufferZipSig(
  handle: Extract<FieldHandle, { kind: 'ZipSig' }>,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  // Evaluate signals once (they're uniform across elements)
  const sigValues: number[] = [];
  for (const sigId of handle.signals) {
    sigValues.push(evalSig(sigId, env.sigEnv, env.sigNodes));
  }

  // Materialize the field input
  const fieldBuffer = materialize(
    {
      fieldId: handle.field,
      domainId: env.fieldEnv.domainId,
      format: handle.type.kind === 'vec2' ? 'vec2f32' : 'f32',
      layout: handle.type.kind === 'vec2' ? 'vec2' : 'scalar',
      usageTag: 'zipSig-input',
    },
    env
  ) as Float32Array;

  const outArr = out as Float32Array;

  // Apply kernel based on function name and type
  if (handle.type.kind === 'vec2') {
    applyZipSigVec2(handle.fn, fieldBuffer, sigValues, outArr, N, env);
  } else {
    applyZipSigScalar(handle.fn, fieldBuffer, sigValues, outArr, N);
  }
}

/**
 * Apply ZipSig kernel for scalar values
 */
function applyZipSigScalar(
  fn: string,
  field: Float32Array,
  signals: number[],
  out: Float32Array,
  N: number
): void {
  switch (fn) {
    case 'Add':
      for (let i = 0; i < N; i++) {
        out[i] = field[i] + (signals[0] ?? 0);
      }
      break;

    case 'Mul':
      for (let i = 0; i < N; i++) {
        out[i] = field[i] * (signals[0] ?? 1);
      }
      break;

    case 'Sub':
      for (let i = 0; i < N; i++) {
        out[i] = field[i] - (signals[0] ?? 0);
      }
      break;

    case 'Div':
      for (let i = 0; i < N; i++) {
        out[i] = field[i] / (signals[0] ?? 1);
      }
      break;

    default:
      // Identity fallback
      for (let i = 0; i < N; i++) {
        out[i] = field[i];
      }
      break;
  }
}

/**
 * Apply ZipSig kernel for vec2 values
 */
function applyZipSigVec2(
  fn: string,
  field: Float32Array,
  signals: number[],
  out: Float32Array,
  N: number,
  env: MaterializerEnv
): void {
  switch (fn) {
    case 'jitterVec2':
      // jitter(pos, time, amplitudeX, amplitudeY)
      {
        const time = signals[0] ?? 0;
        const ampX = signals[1] ?? 1;
        const ampY = signals[2] ?? ampX;
        for (let i = 0; i < N; i++) {
          const x = field[i * 2];
          const y = field[i * 2 + 1];
          // Use element ID for stable random offset
          const elementId = env.domainElements?.[i] ?? String(i);
          const randX = hash01ById(elementId + '-x', Math.floor(time));
          const randY = hash01ById(elementId + '-y', Math.floor(time));
          out[i * 2] = x + (randX - 0.5) * ampX;
          out[i * 2 + 1] = y + (randY - 0.5) * ampY;
        }
      }
      break;

    case 'vec2Rotate':
      // rotate(pos, angle, centerX, centerY)
      {
        const angle = signals[0] ?? 0;
        const cx = signals[1] ?? 0;
        const cy = signals[2] ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < N; i++) {
          const x = field[i * 2] - cx;
          const y = field[i * 2 + 1] - cy;
          out[i * 2] = x * cos - y * sin + cx;
          out[i * 2 + 1] = x * sin + y * cos + cy;
        }
      }
      break;

    case 'vec2Scale':
      // scale(pos, scaleX, scaleY, centerX, centerY)
      {
        const sx = signals[0] ?? 1;
        const sy = signals[1] ?? sx;
        const cx = signals[2] ?? 0;
        const cy = signals[3] ?? 0;
        for (let i = 0; i < N; i++) {
          out[i * 2] = (field[i * 2] - cx) * sx + cx;
          out[i * 2 + 1] = (field[i * 2 + 1] - cy) * sy + cy;
        }
      }
      break;

    case 'vec2Translate':
      // translate(pos, dx, dy)
      {
        const dx = signals[0] ?? 0;
        const dy = signals[1] ?? 0;
        for (let i = 0; i < N; i++) {
          out[i * 2] = field[i * 2] + dx;
          out[i * 2 + 1] = field[i * 2 + 1] + dy;
        }
      }
      break;

    default:
      // Identity fallback
      for (let i = 0; i < N * 2; i++) {
        out[i] = field[i];
      }
      break;
  }
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

  if (handle.type.kind === 'number') {
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

    for (let i = 0; i < N; i++) {
      outArr[i] = applyFieldOp(handle.op, srcBuffer[i], handle.params, i, env);
    }
    return;
  }

  if (handle.type.kind === 'vec2') {
    if (handle.op === FieldOp.Vec2Rotate) {
      const srcBuffer = materialize(
        {
          fieldId: handle.args[0],
          domainId: env.fieldEnv.domainId,
          format: 'vec2f32',
          layout: 'vec2',
          usageTag: 'op-input',
        },
        env
      ) as Float32Array;

      const outArr = out as Float32Array;
      const centerX = readParamNumber(handle.params, 'centerX', 'vec2Rotate', env);
      const centerY = readParamNumber(handle.params, 'centerY', 'vec2Rotate', env);
      const angleDeg = readParamNumber(handle.params, 'angle', 'vec2Rotate', env);
      const angleRad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);

      for (let i = 0; i < N; i++) {
        const x = srcBuffer[i * 2];
        const y = srcBuffer[i * 2 + 1];
        const dx = x - centerX;
        const dy = y - centerY;
        outArr[i * 2] = centerX + dx * cos - dy * sin;
        outArr[i * 2 + 1] = centerY + dx * sin + dy * cos;
      }
      return;
    }

    if (handle.op === FieldOp.Vec2Scale) {
      const srcBuffer = materialize(
        {
          fieldId: handle.args[0],
          domainId: env.fieldEnv.domainId,
          format: 'vec2f32',
          layout: 'vec2',
          usageTag: 'op-input',
        },
        env
      ) as Float32Array;

      const outArr = out as Float32Array;
      const centerX = readParamNumber(handle.params, 'centerX', 'vec2Scale', env);
      const centerY = readParamNumber(handle.params, 'centerY', 'vec2Scale', env);
      const scaleX = readParamNumber(handle.params, 'scaleX', 'vec2Scale', env);
      const scaleY = readParamNumber(handle.params, 'scaleY', 'vec2Scale', env);

      for (let i = 0; i < N; i++) {
        const x = srcBuffer[i * 2];
        const y = srcBuffer[i * 2 + 1];
        const dx = x - centerX;
        const dy = y - centerY;
        outArr[i * 2] = centerX + dx * scaleX;
        outArr[i * 2 + 1] = centerY + dy * scaleY;
      }
      return;
    }

    if (handle.op === FieldOp.Vec2Translate) {
      const srcBuffer = materialize(
        {
          fieldId: handle.args[0],
          domainId: env.fieldEnv.domainId,
          format: 'vec2f32',
          layout: 'vec2',
          usageTag: 'op-input',
        },
        env
      ) as Float32Array;

      const outArr = out as Float32Array;
      const offsetX = readParamNumber(handle.params, 'offsetX', 'vec2Translate', env);
      const offsetY = readParamNumber(handle.params, 'offsetY', 'vec2Translate', env);

      for (let i = 0; i < N; i++) {
        outArr[i * 2] = srcBuffer[i * 2] + offsetX;
        outArr[i * 2 + 1] = srcBuffer[i * 2 + 1] + offsetY;
      }
      return;
    }

    if (handle.op === FieldOp.Vec2Reflect) {
      const srcBuffer = materialize(
        {
          fieldId: handle.args[0],
          domainId: env.fieldEnv.domainId,
          format: 'vec2f32',
          layout: 'vec2',
          usageTag: 'op-input',
        },
        env
      ) as Float32Array;

      const outArr = out as Float32Array;
      const centerX = readParamNumber(handle.params, 'centerX', 'vec2Reflect', env);
      const centerY = readParamNumber(handle.params, 'centerY', 'vec2Reflect', env);

      for (let i = 0; i < N; i++) {
        const x = srcBuffer[i * 2];
        const y = srcBuffer[i * 2 + 1];
        outArr[i * 2] = centerX - (x - centerX);
        outArr[i * 2 + 1] = centerY - (y - centerY);
      }
      return;
    }

    if (handle.op === FieldOp.JitterVec2) {
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
      const phase = readParamNumber(handle.params, 'phase', 'jitterVec2', env);
      const amount = readParamNumber(handle.params, 'amount', 'jitterVec2', env);
      const frequency = readParamNumber(handle.params, 'frequency', 'jitterVec2', env);
      const twoPi = Math.PI * 2;

      for (let i = 0; i < N; i++) {
        const r = srcBuffer[i];
        const angle = r * twoPi;
        const mag = Math.sin((phase * frequency + r) * twoPi) * amount;
        outArr[i * 2] = Math.cos(angle) * mag;
        outArr[i * 2 + 1] = Math.sin(angle) * mag;
      }
      return;
    }

    throw new Error(`fillBufferOp: unsupported vec2 op ${handle.op}`);
  }

  throw new Error(`fillBufferOp: unsupported type ${handle.type.kind}`);
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
  if (handle.type.kind === 'vec2') {
    if (
      handle.op !== FieldZipOp.Vec2Add &&
      handle.op !== FieldZipOp.Vec2Sub &&
      handle.op !== FieldZipOp.Vec2Mul &&
      handle.op !== FieldZipOp.Vec2Div
    ) {
      throw new Error(`fillBufferZip: unsupported vec2 op ${String(handle.op)}`);
    }

    const aBuffer = materialize(
      {
        fieldId: handle.a,
        domainId: env.fieldEnv.domainId,
        format: 'vec2f32',
        layout: 'vec2',
        usageTag: 'zip-a',
      },
      env
    ) as Float32Array;

    const bBuffer = materialize(
      {
        fieldId: handle.b,
        domainId: env.fieldEnv.domainId,
        format: 'vec2f32',
        layout: 'vec2',
        usageTag: 'zip-b',
      },
      env
    ) as Float32Array;

    const outArr = out as Float32Array;

    for (let i = 0; i < N; i++) {
      const idx = i * 2;
      const ax = aBuffer[idx];
      const ay = aBuffer[idx + 1];
      const bx = bBuffer[idx];
      const by = bBuffer[idx + 1];

      switch (handle.op) {
        case FieldZipOp.Vec2Add:
          outArr[idx] = ax + bx;
          outArr[idx + 1] = ay + by;
          break;
        case FieldZipOp.Vec2Sub:
          outArr[idx] = ax - bx;
          outArr[idx + 1] = ay - by;
          break;
        case FieldZipOp.Vec2Mul:
          outArr[idx] = ax * bx;
          outArr[idx + 1] = ay * by;
          break;
        case FieldZipOp.Vec2Div:
          outArr[idx] = ax / bx;
          outArr[idx + 1] = ay / by;
          break;
        default:
          throw new Error(`fillBufferZip: unsupported vec2 op ${String(handle.op)}`);
      }
    }

    return;
  }

  if (handle.type.kind !== 'number') {
    throw new Error(`fillBufferZip: unsupported type ${handle.type.kind}`);
  }

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
  if (handle.type.kind !== 'number') {
    throw new Error(`fillBufferSelect: unsupported type ${handle.type.kind}`);
  }
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
  _out: ArrayBufferView,
  _N: number,
  env: MaterializerEnv
): void {
  if (handle.type.kind !== 'number') {
    throw new Error(`fillBufferTransform: unsupported type ${handle.type.kind}`);
  }

  // Get transform chain
  const chain = env.transforms?.get(handle.chain);
  if (chain === undefined || chain === null) {
    throw new Error(`fillBufferTransform: missing transform chain ${handle.chain}`);
  }

  // TODO: Phase 6 - actually apply transform chain to source field
  // For now, just materialize source and throw (placeholder)
  materialize(
    {
      fieldId: handle.src,
      domainId: env.fieldEnv.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'transform-src',
    },
    env
  );

  throw new Error(`fillBufferTransform: transform chain evaluation not implemented`);
}

function toColorRGBA(value: unknown): { r: number; g: number; b: number; a: number } {
  if (typeof value === 'string') {
    return parseColor(value);
  }

  if (value !== undefined && value !== null && typeof value === 'object') {
    const v = value as { r?: number; g?: number; b?: number; a?: number };
    if (
      typeof v.r === 'number' &&
      typeof v.g === 'number' &&
      typeof v.b === 'number'
    ) {
      return {
        r: v.r,
        g: v.g,
        b: v.b,
        a: typeof v.a === 'number' ? v.a : 1,
      };
    }
  }

  throw new Error(`toColorRGBA: unsupported color value ${String(value)}`);
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
  if (handle.type.kind !== 'number') {
    throw new Error(`fillBufferCombine: unsupported type ${handle.type.kind}`);
  }
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

    case 'product': {
      let product = 1;
      for (const buffer of termBuffers) {
        product *= buffer[index];
      }
      return product;
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
