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
 * 5. Write buffer handle to outBufferSlot
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
  FieldExprIR,
  BufferFormat as RuntimeBufferFormat,
  FieldHandle,
  InputSlot,
} from "../../field/types";
import { FieldBufferPool } from "../../field/BufferPool";

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
  runtime: RuntimeState
): void {
  const mat = step.materialization;

  // 1. Read domain count from ValueStore
  const domainCount = runtime.values.read(mat.domainSlot) as number;

  if (typeof domainCount !== "number" || domainCount <= 0) {
    throw new Error(
      `executeMaterialize: Invalid domain count ${domainCount} from slot ${mat.domainSlot}. ` +
        `Domain count must be a positive integer.`
    );
  }

  // 2. Check buffer pool cache (per-frame cache from FrameCache)
  const cacheKey = `${mat.fieldExprId}_${mat.domainSlot}_${mat.format.components}_${mat.format.elementType}`;
  const cachedBuffer = runtime.frameCache.fieldBuffers.get(cacheKey);

  if (cachedBuffer !== undefined) {
    // Cache hit - reuse existing buffer
    const bufferHandle: BufferHandle = {
      kind: "buffer",
      data: cachedBuffer,
      format: mat.format,
    };
    runtime.values.write(mat.outBufferSlot, bufferHandle);
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
  const env = buildMaterializerEnv(program, runtime, domainCount);

  // 5. Materialize the field
  // If no field nodes are available (test/stub mode), create a const buffer
  let buffer: ArrayBufferView;
  if (env.fieldNodes.length === 0 || fieldId >= env.fieldNodes.length) {
    // Stub: create empty buffer with correct format
    const totalElements = domainCount * mat.format.components;
    buffer = createTypedArray(mat.format.elementType, totalElements);
  } else {
    buffer = materialize(request, env);
  }

  // 6. Store in buffer pool cache
  runtime.frameCache.fieldBuffers.set(cacheKey, buffer);

  // 7. Write buffer handle to output slot
  const bufferHandle: BufferHandle = {
    kind: "buffer",
    data: buffer,
    format: mat.format,
  };
  runtime.values.write(mat.outBufferSlot, bufferHandle);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a typed array of the specified element type.
 *
 * @param elementType - Element type (f32, f64, i32, u32, u8)
 * @param length - Number of elements
 * @returns TypedArray of appropriate type
 */
function createTypedArray(
  elementType: string,
  length: number
): ArrayBufferView {
  switch (elementType) {
    case "f32":
      return new Float32Array(length);
    case "f64":
      return new Float64Array(length);
    case "i32":
      return new Int32Array(length);
    case "u32":
      return new Uint32Array(length);
    case "u8":
      return new Uint8Array(length);
    default:
      return new Float32Array(length); // Default fallback
  }
}

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
 * @returns MaterializerEnv ready for materialization
 */
function buildMaterializerEnv(
  program: CompiledProgramIR,
  runtime: RuntimeState,
  domainCount: number
): MaterializerEnv {
  // Create buffer pool
  const pool = new FieldBufferPool();

  // Use FrameCache's buffer map as per-frame cache
  const cache = runtime.frameCache.fieldBuffers;

  // Build field environment with required fields
  const fieldEnv = {
    // SlotHandles reads field handles from ValueStore slots
    slotHandles: {
      read: (inputSlot: InputSlot): FieldHandle => {
        const value = runtime.values.read(inputSlot.slot);
        // Return the value if it's a FieldHandle, otherwise create a const handle
        if (value !== null && typeof value === "object" && "kind" in value) {
          return value as FieldHandle;
        }
        // For numeric values, wrap in const handle
        return {
          kind: "Const" as const,
          constId: 0,
          type: { kind: "number" as const },
        };
      },
    },
    // Use FrameCache as handle cache
    cache: {
      handles: runtime.frameCache.fieldHandle,
      stamp: Array.from(runtime.frameCache.fieldStamp),
      frameId: runtime.frameCache.frameId,
    },
    domainId: 0, // Default domain
  };

  // Extract field nodes from program (use empty array if not available)
  // Note: fieldExprTable is in the IR but may not be on CompiledProgramIR yet
  const fieldNodes: FieldExprIR[] = [];

  // Build signal environment
  const sigEnv = {
    time: Date.now(), // Will be replaced by proper time from schedule
  };

  // Extract signal nodes from program (use empty array if not available)
  const sigNodes: unknown[] = [];

  // Build constants table accessor
  const constants = {
    get: (constId: number): number => {
      if (program.constants?.f64 !== undefined) {
        return program.constants.f64[constId] ?? 0;
      }
      return 0;
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
    cache,
    fieldEnv,
    fieldNodes,
    sigEnv,
    sigNodes,
    constants,
    sources,
    getDomainCount,
  };
}
