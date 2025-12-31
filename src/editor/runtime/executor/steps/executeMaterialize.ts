/**
 * Execute Materialize Step
 *
 * Materializes a FieldExpr into a typed array buffer.
 *
 * Algorithm:
 * 1. Read domain count from domainSlot
 * 2. Check buffer pool cache (same field+domain+format → same buffer)
 * 3. If cache miss, call FieldMaterializer to produce buffer
 * 4. Store buffer in pool cache
 * 5. Write buffer to outBufferSlot
 *
 * References:
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 3
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 4
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md §5.3
 */

import type {
  StepMaterialize,
  CompiledProgramIR,
  BufferFormat as IRBufferFormat,
} from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import { materialize } from "../../field/Materializer";
import type { MaterializerEnv } from "../../field/Materializer";
import type {
  MaterializationRequest,
  BufferLayout,
  BufferFormat as RuntimeBufferFormat,
  FieldHandle,
  InputSlot,
} from "../../field/types";
import { FieldBufferPool } from "../../field/BufferPool";
import { createSigEnv } from "../../signal-expr/SigEnv";
import type { SigFrameCache } from "../../signal-expr/SigFrameCache";
import type { SlotValueReader } from "../../signal-expr/SlotValueReader";
import type { FieldExprIR as CompilerFieldExprIR } from "../../../compiler/ir/fieldExpr";
import type { FieldExprIR as RuntimeFieldExprIR } from "../../field/types";
import { compilerToRuntimeType } from "../../integration/typeAdapter";
import { OpCode } from "../../../compiler/ir/opcodes";

// =============================================================================
// Buffer Handle Type
// =============================================================================

/**
 * Buffer handle stored in ValueStore after materialization.
 */
export interface BufferHandle {
  kind: "buffer";
  data: ArrayBufferView;
  format: IRBufferFormat;
}

// =============================================================================
// Format Conversion
// =============================================================================

/**
 * Convert IR BufferFormat to runtime BufferFormat string.
 *
 * The IR uses {components, elementType} while runtime uses string identifiers.
 *
 * @param irFormat - IR buffer format specification
 * @returns Runtime buffer format string
 */
function irFormatToRuntimeFormat(irFormat: IRBufferFormat): RuntimeBufferFormat {
  const { components, elementType } = irFormat;

  // Scalar formats
  if (components === 1) {
    switch (elementType) {
      case "f32":
        return "f32";
      case "f64":
        return "f64";
      case "i32":
        return "i32";
      case "u32":
        return "u32";
      case "u8":
        return "u8";
    }
  }

  // Vector formats
  if (elementType === "f32") {
    switch (components) {
      case 2:
        return "vec2f32";
      case 3:
        return "vec3f32";
      case 4:
        return "vec4f32";
    }
  }

  // RGBA8 special case
  if (components === 4 && elementType === "u8") {
    return "rgba8";
  }

  // Default fallback
  return "f32";
}

// =============================================================================
// Execute Materialize
// =============================================================================

/**
 * Execute Materialize step.
 *
 * Materializes a field expression to a typed array buffer.
 *
 * @param step - Materialize step specification
 * @param program - Compiled program (contains field expressions, const pool)
 * @param runtime - Runtime state (contains ValueStore, FrameCache)
 *
 * @throws Error if domain count is <= 0 or domainSlot not found
 */
export function executeMaterialize(
  step: StepMaterialize,
  program: CompiledProgramIR,
  runtime: RuntimeState,
  effectiveTime: { tAbsMs: number; tModelMs?: number; phase01?: number; wrapEvent?: number },
): void {
  const mat = step.materialization;

  // 1. Read domain count and element IDs from ValueStore
  const domainValue = runtime.values.read(mat.domainSlot);
  let domainCount: number | undefined;
  let domainElements: readonly string[] | undefined;

  if (typeof domainValue === "number") {
    domainCount = domainValue;
  } else if (
    typeof domainValue === "object" &&
    domainValue !== null &&
    (domainValue as { kind?: string; count?: number }).kind === "domain"
  ) {
    const dv = domainValue as { count: number; elementIds?: readonly string[] };
    domainCount = dv.count;
    domainElements = dv.elementIds;
  }

  if (typeof domainCount !== "number" || domainCount <= 0) {
    throw new Error(
      `executeMaterialize: Invalid domain count ${String(domainValue)} from slot ${mat.domainSlot}. ` +
        `Domain count must be a positive integer.`
    );
  }

  // 2. Check buffer pool cache (per-frame cache from FrameCache)
  const cacheKey = `${mat.fieldExprId}_${mat.domainSlot}_${mat.format.components}_${mat.format.elementType}`;
  const cachedHandle = runtime.frameCache.fieldBuffers.get(cacheKey);

  if (cachedHandle !== undefined) {
    // Cache hit - reuse existing buffer handle
    runtime.values.write(mat.outBufferSlot, cachedHandle);
    return;
  }

  // 3. Construct MaterializationRequest
  // Parse fieldExprId - it may be a string like "field-1" or a numeric index
  const fieldId = parseFieldId(mat.fieldExprId);

  // Convert IR format to runtime format
  const runtimeFormat = irFormatToRuntimeFormat(mat.format);

  const request: MaterializationRequest = {
    fieldId,
    domainId: mat.domainSlot, // Use slot as domain ID for now
    format: runtimeFormat,
    layout: "interleaved" as BufferLayout, // Default layout
    usageTag: mat.id,
  };

  // 4. Build MaterializerEnv from program and runtime
  const env = buildMaterializerEnv(program, runtime, domainCount, effectiveTime, domainElements);
  env.fieldEnv.domainId = mat.domainSlot;

  // 5. Materialize the field
  const buffer = materialize(request, env);

  // 6. Create buffer handle
  const bufferHandle: BufferHandle = {
    kind: "buffer",
    data: buffer,
    format: mat.format,
  };

  // 7. Store in buffer pool cache
  runtime.frameCache.fieldBuffers.set(cacheKey, bufferHandle);

  // 8. Write buffer handle to output slot
  runtime.values.write(mat.outBufferSlot, bufferHandle);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse field expression ID from string format.
 *
 * Handles both numeric strings ("123") and prefixed strings ("field-123").
 *
 * @param fieldExprId - Field expression ID as string
 * @returns Numeric field ID
 */
function parseFieldId(fieldExprId: string): number {
  // Try direct numeric parse
  const direct = parseInt(fieldExprId, 10);
  if (!isNaN(direct)) {
    return direct;
  }

  // Try extracting number from "field-N" format
  const match = fieldExprId.match(/(\d+)$/);
  if (match !== null) {
    return parseInt(match[1], 10);
  }

  // Fallback: hash the string to get a stable ID
  // This ensures consistent behavior even with arbitrary string IDs
  let hash = 0;
  for (let i = 0; i < fieldExprId.length; i++) {
    hash = (hash << 5) - hash + fieldExprId.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Build MaterializerEnv from program and runtime state.
 *
 * Constructs the environment needed by the FieldMaterializer,
 * wiring up the buffer pool, caches, and evaluation contexts.
 *
 * @param program - Compiled program
 * @param runtime - Runtime state
 * @param domainCount - Number of elements in the domain
 * @param domainElements - Stable element IDs for hash-based operations
 * @returns MaterializerEnv ready for materialization
 */
function buildMaterializerEnv(
  program: CompiledProgramIR,
  runtime: RuntimeState,
  domainCount: number,
  effectiveTime: { tAbsMs: number; tModelMs?: number; phase01?: number; wrapEvent?: number },
  domainElements?: readonly string[],
): MaterializerEnv {
  // Create buffer pool
  const pool = new FieldBufferPool();

  // Use FrameCache's buffer map as per-frame cache
  const fieldBufferCache = new Map<string, ArrayBufferView>();

  // Build field environment with required fields
  const fieldEnv = {
    // SlotHandles reads field handles from ValueStore slots
    slotHandles: {
      read: (inputSlot: InputSlot): FieldHandle => {
        const value = runtime.values.read(inputSlot.slot);
        if (value !== null && typeof value === "object" && "kind" in value) {
          return value as FieldHandle;
        }
        throw new Error(
          `executeMaterialize: slot ${inputSlot.slot} does not contain a FieldHandle`
        );
      },
    },
    // Use FrameCache as handle cache
    cache: {
      handles: runtime.frameCache.fieldHandle,
      stamp: runtime.frameCache.fieldStamp,
      frameId: runtime.frameCache.frameId,
    },
    domainId: 0, // Default domain
  };

  const fieldNodes = convertFieldNodes(program.fields.nodes);

  const signalTable = program.signalTable?.nodes;
  if (signalTable === undefined) {
    throw new Error("executeMaterialize: program.signalTable is missing");
  }

  const constPool = program.constants?.json ?? [];
  const numbers = constPool.map((value) => (typeof value === "number" ? value : NaN));

  const sigFrameCache: SigFrameCache = {
    frameId: runtime.frameCache.frameId,
    value: runtime.frameCache.sigValue,
    stamp: runtime.frameCache.sigStamp,
    validMask: runtime.frameCache.sigValidMask,
  };

  const slotValues: SlotValueReader = {
    readNumber(slot) {
      const value = runtime.values.read(slot);
      if (typeof value !== "number") {
        throw new Error(`executeMaterialize: slot ${slot} is not a number`);
      }
      return value;
    },
    hasValue(slot) {
      try {
        const value = runtime.values.read(slot);
        return typeof value === "number";
      } catch {
        return false;
      }
    },
  };

  const irEnv = createSigEnv({
    tAbsMs: effectiveTime.tAbsMs,
    tModelMs: effectiveTime.tModelMs,
    phase01: effectiveTime.phase01,
    wrapOccurred: effectiveTime.wrapEvent === 1,
    constPool: { numbers },
    cache: sigFrameCache,
    slotValues,
  });

  const sigEnv = {
    time: effectiveTime.tAbsMs,
    irEnv,
    irNodes: signalTable,
  };

  // Build constants table accessor
  const constants = {
    get: (constId: number): unknown => {
      return program.constants?.json?.[constId];
    },
  };

  // Build source fields accessor (for source field nodes)
  const sources = {
    get: (_sourceTag: string): ArrayBufferView | undefined => {
      // Source fields are external inputs - not yet wired
      return undefined;
    },
  };

  // Domain count resolver
  const getDomainCount = (_domainId: number): number => {
    return domainCount;
  };

  return {
    pool,
    cache: fieldBufferCache,
    fieldEnv,
    fieldNodes,
    sigEnv,
    sigNodes: [],
    constants,
    sources,
    getDomainCount,
    domainElements,
  };
}

function opcodeToName(opcode: OpCode): string {
  switch (opcode) {
    case OpCode.Abs:
      return "abs";
    case OpCode.Floor:
      return "floor";
    case OpCode.Ceil:
      return "ceil";
    case OpCode.Round:
      return "round";
    case OpCode.Sin:
      return "sin";
    case OpCode.Cos:
      return "cos";
    case OpCode.Add:
      return "Add";
    case OpCode.Sub:
      return "Sub";
    case OpCode.Mul:
      return "Mul";
    case OpCode.Div:
      return "Div";
    case OpCode.Min:
      return "Min";
    case OpCode.Max:
      return "Max";
    case OpCode.Pow:
      return "Pow";
    case OpCode.Mod:
      return "Mod";
    case OpCode.Vec2Add:
      return "Vec2Add";
    case OpCode.Vec2Sub:
      return "Vec2Sub";
    case OpCode.Vec2Mul:
      return "Vec2Mul";
    case OpCode.Vec2Div:
      return "Vec2Div";
    default:
      // OpCode is a const object, not an enum, so we can't do reverse lookup
      return String(opcode);
  }
}

function convertFieldNodes(nodes: CompilerFieldExprIR[]): RuntimeFieldExprIR[] {
  return nodes.map((node) => {
    const type = compilerToRuntimeType(node.type);

    switch (node.kind) {
      case "const":
        return { kind: "const", type, constId: node.constId };
      case "broadcastSig":
        return {
          kind: "sampleSignal",
          type,
          signalSlot: node.sig,
          domainId: node.domainSlot,
        };
      case "map":
        if (node.fn.kind !== "opcode") {
          throw new Error(`executeMaterialize: field map kernel ${node.fn.kind} not supported`);
        }
        return {
          kind: "map",
          type,
          src: node.src,
          fn: { opcode: opcodeToName(node.fn.opcode) },
        };
      case "zip":
        if (node.fn.kind !== "opcode") {
          throw new Error(`executeMaterialize: field zip kernel ${node.fn.kind} not supported`);
        }
        return {
          kind: "zip",
          type,
          a: node.a,
          b: node.b,
          fn: { opcode: opcodeToName(node.fn.opcode) },
        };
      case "select":
        return { kind: "select", type, cond: node.cond, t: node.t, f: node.f };
      case "transform":
        return { kind: "transform", type, src: node.src, chain: node.chain };
      case "busCombine":
        return {
          kind: "busCombine",
          type,
          combine: { mode: node.combine.mode },
          terms: node.terms,
        };
      case "mapIndexed": {
        const fnRef = node.fn.kind === "opcode"
          ? { opcode: opcodeToName(node.fn.opcode) }
          : { opcode: node.fn.kind === "kernel" ? node.fn.kernelId : "identity" };
        return {
          kind: "mapIndexed",
          type,
          domainSlot: node.domainSlot,
          fn: fnRef,
          signals: node.signals,
        };
      }
      case "zipSig": {
        const fnRef = node.fn.kind === "opcode"
          ? { opcode: opcodeToName(node.fn.opcode) }
          : { opcode: node.fn.kind === "kernel" ? node.fn.kernelId : "identity" };
        return {
          kind: "zipSig",
          type,
          field: node.field,
          fn: fnRef,
          signals: node.signals,
        };
      }
      default: {
        // Exhaustiveness check - compiler will error if a case is missing
        const _exhaustive: never = node;
        throw new Error(`Unknown field node kind: ${(_exhaustive as { kind: string }).kind}`);
      }
    }
  });
}
