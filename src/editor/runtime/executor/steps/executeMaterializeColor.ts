/**
 * Execute MaterializeColor Step
 *
 * Converts field<color> or signal<color> to 4 separate Float32Array channel buffers.
 *
 * This is an explicit, cacheable materialization step implementing the contract
 * from design-docs/13-Renderer/11-FINAL-INTEGRATION.md §B3.
 *
 * Algorithm:
 * 1. Read domain handle from domainSlot to get instance count
 * 2. Read color value(s) from colorExprSlot (field expr handle or color array)
 * 3. Allocate 4 Float32Array buffers (R, G, B, A channels)
 * 4. Write channel values to separate buffers
 * 5. Store buffers in outRSlot, outGSlot, outBSlot, outASlot
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §B3
 * - design-docs/13-Renderer/09-Materialization-Steps.md
 */

import type { StepMaterializeColor, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Color value representation (RGBA float components in [0..1] range)
 */
interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Domain handle representation
 */
interface DomainHandle {
  kind: "domain";
  count: number;
  ids?: Uint32Array;
}

/**
 * Field expression handle representation
 */
interface FieldExprHandle {
  kind: "fieldExpr";
  exprId: string;
}

/**
 * Type guard: check if value is a Domain handle
 */
function isDomainHandle(value: unknown): value is DomainHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "domain" && typeof v.count === "number";
}

/**
 * Type guard: check if value is a single Color object
 */
function isColor(value: unknown): value is Color {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.r === "number" &&
    typeof c.g === "number" &&
    typeof c.b === "number" &&
    typeof c.a === "number"
  );
}

/**
 * Type guard: check if value is an array of Colors
 */
function isColorArray(value: unknown): value is Color[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true; // Empty array is valid
  return isColor(value[0]);
}

/**
 * Type guard: check if value is a field expression handle
 */
function isFieldExprHandle(value: unknown): value is FieldExprHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "fieldExpr" && typeof v.exprId === "string";
}

/**
 * Execute MaterializeColor step.
 *
 * Converts color values to 4 separate Float32Array channel buffers (R, G, B, A).
 *
 * Supports:
 * - signal<color>: single color value → 4 single-element buffers
 * - field<color>: array of count colors → 4 count-element buffers
 * - fieldExpr handle: evaluated via FieldRuntime (future work)
 *
 * @param step - MaterializeColor step specification
 * @param _program - Compiled program (not used, included for consistency)
 * @param runtime - Runtime state containing ValueStore
 *
 * @throws Error if domainSlot contains invalid domain
 * @throws Error if colorExprSlot contains invalid color data
 */
export function executeMaterializeColor(
  step: StepMaterializeColor,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Performance tracking
  const startTime = performance.now();

  // 1. Read domain handle from domainSlot
  const domainValue = runtime.values.read(step.domainSlot);
  let instanceCount: number;

  if (isDomainHandle(domainValue)) {
    instanceCount = domainValue.count;
  } else if (typeof domainValue === "number") {
    // Direct count (fallback)
    instanceCount = domainValue;
  } else {
    throw new Error(
      `executeMaterializeColor: domainSlot contains invalid value. ` +
        `Expected Domain handle or count, got: ${typeof domainValue}`
    );
  }

  // 2. Read color value(s) from colorExprSlot
  const colorValue = runtime.values.read(step.colorExprSlot);

  // 3. Allocate 4 Float32Array buffers for channels
  const rBuffer = runtime.values.ensureF32(step.outRSlot, instanceCount);
  const gBuffer = runtime.values.ensureF32(step.outGSlot, instanceCount);
  const bBuffer = runtime.values.ensureF32(step.outBSlot, instanceCount);
  const aBuffer = runtime.values.ensureF32(step.outASlot, instanceCount);

  // 4. Populate buffers based on color value type
  if (isColor(colorValue)) {
    // signal<color> case: broadcast single color to all instances
    for (let i = 0; i < instanceCount; i++) {
      rBuffer[i] = colorValue.r;
      gBuffer[i] = colorValue.g;
      bBuffer[i] = colorValue.b;
      aBuffer[i] = colorValue.a;
    }
  } else if (isColorArray(colorValue)) {
    // field<color> case: per-instance colors
    if (colorValue.length !== instanceCount) {
      throw new Error(
        `executeMaterializeColor: color array length mismatch. ` +
          `Expected ${instanceCount}, got ${colorValue.length}.`
      );
    }

    for (let i = 0; i < instanceCount; i++) {
      const c = colorValue[i];
      rBuffer[i] = c.r;
      gBuffer[i] = c.g;
      bBuffer[i] = c.b;
      aBuffer[i] = c.a;
    }
  } else if (isFieldExprHandle(colorValue)) {
    // fieldExpr handle case: evaluate via FieldRuntime
    // Future work: call fields.evalToBuffer() for each channel
    // For now, fill with default white color
    console.warn(
      `executeMaterializeColor: fieldExpr evaluation not implemented yet. ` +
        `Using default white color for ${instanceCount} instances.`
    );
    for (let i = 0; i < instanceCount; i++) {
      rBuffer[i] = 1.0;
      gBuffer[i] = 1.0;
      bBuffer[i] = 1.0;
      aBuffer[i] = 1.0;
    }
  } else {
    throw new Error(
      `executeMaterializeColor: colorExprSlot contains invalid value. ` +
        `Expected Color, Color[], or FieldExprHandle, got: ${typeof colorValue}`
    );
  }

  // 5. Performance logging (debug mode)
  const cpuMs = performance.now() - startTime;
  if (cpuMs > 1.0) {
    console.debug(
      `MaterializeColor: ${cpuMs.toFixed(2)}ms for ${instanceCount} instances, ` +
        `${instanceCount * 4 * 4} bytes (4 x Float32Array[${instanceCount}])`
    );
  }
}
