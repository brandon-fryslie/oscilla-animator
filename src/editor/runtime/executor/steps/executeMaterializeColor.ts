/**
 * Execute MaterializeColor Step
 *
 * Converts field<color> or signal<color> to u8x4 premultiplied linear RGBA buffer.
 *
 * This is an explicit, cacheable materialization step implementing the contract
 * from design-docs/13-Renderer/09-Materialization-Steps.md.
 *
 * Algorithm:
 * 1. Read source value from sourceSlot (color or color array)
 * 2. Quantize using ColorQuantize kernel (quantizeColorRGBA or quantizeColorRGBABatch)
 * 3. Write Uint8Array to bufferSlot in ValueStore
 * 4. Emit performance counters (deferred to Phase E)
 *
 * References:
 * - design-docs/13-Renderer/09-Materialization-Steps.md §MaterializeColor
 * - design-docs/13-Renderer/04-Decision-to-IR.md §ColorBufferDesc
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.C1
 */

import type { StepMaterializeColor, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import { quantizeColorRGBA, quantizeColorRGBABatch } from "../../kernels/ColorQuantize";

/**
 * Color value representation (RGBA float components)
 */
interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Type guard: check if value is a single Color object
 */
function isColor(value: unknown): value is Color {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.r === 'number' &&
    typeof c.g === 'number' &&
    typeof c.b === 'number' &&
    typeof c.a === 'number'
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
 * Execute MaterializeColor step.
 *
 * Converts color values to u8x4 premultiplied linear RGBA buffers using the
 * canonical color quantization algorithm from Phase B.
 *
 * Supports both:
 * - signal<color>: single color value → 4 bytes
 * - field<color>: array of instanceCount colors → instanceCount*4 bytes
 *
 * @param step - MaterializeColor step specification
 * @param _program - Compiled program (not used, included for consistency)
 * @param runtime - Runtime state containing ValueStore
 *
 * @throws Error if sourceSlot contains invalid color data
 * @throws Error if instanceCount mismatch (field size ≠ instanceCount)
 */
export function executeMaterializeColor(
  step: StepMaterializeColor,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Performance tracking (Phase E will use this)
  const startTime = performance.now();

  // 1. Read source value from sourceSlot
  const sourceValue = runtime.values.read(step.sourceSlot);

  // 2. Determine if signal or field and quantize accordingly
  let buffer: Uint8Array;

  if (isColor(sourceValue)) {
    // Signal<color> case: single color → 4 bytes
    if (step.instanceCount !== undefined) {
      throw new Error(
        `executeMaterializeColor: instanceCount specified (${step.instanceCount}) ` +
        `but sourceSlot contains single color (signal<color>). ` +
        `Remove instanceCount for signal materialization.`
      );
    }

    buffer = quantizeColorRGBA(
      sourceValue.r,
      sourceValue.g,
      sourceValue.b,
      sourceValue.a
    );
  } else if (isColorArray(sourceValue)) {
    // Field<color> case: array of colors → instanceCount*4 bytes
    const actualCount = sourceValue.length;

    // Validate instanceCount matches actual data
    if (step.instanceCount !== undefined && step.instanceCount !== actualCount) {
      throw new Error(
        `executeMaterializeColor: instanceCount mismatch. ` +
        `Expected ${step.instanceCount}, got ${actualCount} colors in sourceSlot.`
      );
    }

    // Flatten color array to flat RGBA array for batch quantization
    const flatColors: number[] = [];
    for (const color of sourceValue) {
      flatColors.push(color.r, color.g, color.b, color.a);
    }

    buffer = quantizeColorRGBABatch(flatColors);
  } else {
    throw new Error(
      `executeMaterializeColor: sourceSlot contains invalid value. ` +
      `Expected Color or Color[], got: ${typeof sourceValue}`
    );
  }

  // 3. Write buffer to bufferSlot
  runtime.values.write(step.bufferSlot, buffer);

  // 4. Performance counters (Phase E work - stubbed for now)
  const cpuMs = performance.now() - startTime;

  // Future Phase E: Emit performance counters
  // - cpuMs: time spent in quantization kernel
  // - bytesWritten: buffer.length
  // - cacheHit: false (no caching yet)
  // - sourceEvalMs: 0 (source already evaluated by prior steps)

  // Debug logging (can be removed in production)
  if (step.debugLabel && cpuMs > 1.0) {
    console.debug(
      `MaterializeColor[${step.debugLabel}]: ${cpuMs.toFixed(2)}ms, ` +
      `${buffer.length} bytes`
    );
  }

  // Silence unused variable warnings
  void cpuMs;
}
