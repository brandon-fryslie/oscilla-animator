/**
 * Assemble Instance Buffer Sets for Instances2D Rendering
 *
 * This module provides helpers to assemble InstanceBufferSetIR from materialized
 * color buffers and other per-instance attribute buffers.
 *
 * Design:
 * - Handles required buffer: posXY (Float32Array, length=count*2)
 * - Handles optional buffers: size, rot, scaleXY, colorRGBA, opacity
 * - Supports scalar broadcasts (all instances same value) via ScalarF32IR/ScalarU32IR
 * - Allocates BufferRefIR from ValueStore
 *
 * References:
 * - design-docs/13-Renderer/01-RendererIR.md §3 (Instances2D)
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md §P0.C3
 */

import type { ValueSlot } from "../../compiler/ir/types";
import type {
  InstanceBufferSetIR,
  BufferRefIR,
} from "../../compiler/ir/renderIR";
import type { RuntimeState } from "./RuntimeState";


/**
 * Instance buffer specification for assembly
 *
 * Specifies which slots contain the various instance attributes.
 * All slots except posXY are optional.
 */
export interface InstanceBufferSpec {
  /** Number of instances to render */
  count: number;

  // Required
  /** Position XY buffer slot (Float32Array, length=count*2) */
  posXY: ValueSlot;

  // Optional attributes
  /** Size/radius slot (scalar or per-instance) */
  size?: ValueSlot;

  /** Rotation in radians slot (scalar or per-instance) */
  rot?: ValueSlot;

  /** Scale XY slot (scalar or per-instance, vec2) */
  scaleXY?: ValueSlot;

  /** Color RGBA slot (scalar or per-instance, u8x4 premul RGBA) */
  colorRGBA?: ValueSlot;

  /** Opacity multiplier slot (scalar or per-instance, 0-1) */
  opacity?: ValueSlot;

  /** Shape ID slot (scalar or per-instance) */
  shapeId?: ValueSlot;

  /** Stroke width slot (scalar or per-instance) */
  strokeWidth?: ValueSlot;

  /** Stroke color RGBA slot (scalar or per-instance, u8x4 premul RGBA) */
  strokeColorRGBA?: ValueSlot;
}

/**
 * Assemble instance buffer set from materialized buffers.
 *
 * Reads attribute buffers from ValueStore and creates BufferRefIR or scalar
 * broadcasts as appropriate. Validates buffer shapes against instance count.
 *
 * Algorithm:
 * 1. Read posXY buffer (required) and validate length = count*2
 * 2. For each optional attribute:
 *    a. Read value from ValueStore
 *    b. Determine if scalar broadcast or per-instance buffer
 *    c. Create appropriate IR (BufferRefIR or ScalarXXXIR)
 * 3. Return assembled InstanceBufferSetIR
 *
 * @param spec - Instance buffer specification
 * @param runtime - Runtime state containing ValueStore
 * @returns Assembled InstanceBufferSetIR ready for renderer
 * @throws Error if required buffer missing or wrong shape
 *
 * @example
 * ```typescript
 * const bufferSet = assembleInstanceBuffers({
 *   count: 100,
 *   posXY: slot10,
 *   colorRGBA: slot11, // per-instance colors
 *   size: slot12,       // scalar broadcast (all same size)
 * }, runtime);
 * ```
 */
export function assembleInstanceBuffers(
  spec: InstanceBufferSpec,
  runtime: RuntimeState,
): InstanceBufferSetIR {
  const { count } = spec;

  // 1. Read required posXY buffer
  const posXYValue = runtime.values.read(spec.posXY);

  if (!(posXYValue instanceof Float32Array)) {
    throw new Error(
      `assembleInstanceBuffers: posXY buffer must be Float32Array, ` +
      `got ${posXYValue?.constructor.name}`
    );
  }

  if (posXYValue.length !== count * 2) {
    throw new Error(
      `assembleInstanceBuffers: posXY buffer length mismatch. ` +
      `Expected ${count * 2} (count=${count}), got ${posXYValue.length}`
    );
  }

  // Allocate BufferRefIR for posXY
  // In full implementation, ValueStore would manage buffer IDs
  // For now, use slot number as buffer ID (simplified)
  const posXY: BufferRefIR = {
    bufferId: spec.posXY,
    type: "f32",
    length: posXYValue.length,
  };

  // 2. Assemble optional attributes
  const bufferSet: InstanceBufferSetIR = { posXY };

  // Size (scalar f32 or buffer)
  if (spec.size !== undefined) {
    const sizeValue = runtime.values.read(spec.size);

    if (typeof sizeValue === "number") {
      bufferSet.size = { kind: "scalar:f32", value: sizeValue };
    } else if (sizeValue instanceof Float32Array) {
      if (sizeValue.length !== count) {
        throw new Error(
          `assembleInstanceBuffers: size buffer length mismatch. ` +
          `Expected ${count}, got ${sizeValue.length}`
        );
      }

      bufferSet.size = {
        bufferId: spec.size,
        type: "f32",
        length: sizeValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: size must be number or Float32Array, ` +
        `got ${sizeValue?.constructor.name}`
      );
    }
  }

  // Rotation (scalar f32 or buffer)
  if (spec.rot !== undefined) {
    const rotValue = runtime.values.read(spec.rot);

    if (typeof rotValue === "number") {
      bufferSet.rot = { kind: "scalar:f32", value: rotValue };
    } else if (rotValue instanceof Float32Array) {
      if (rotValue.length !== count) {
        throw new Error(
          `assembleInstanceBuffers: rot buffer length mismatch. ` +
          `Expected ${count}, got ${rotValue.length}`
        );
      }

      bufferSet.rot = {
        bufferId: spec.rot,
        type: "f32",
        length: rotValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: rot must be number or Float32Array, ` +
        `got ${rotValue?.constructor.name}`
      );
    }
  }

  // Scale XY (scalar f32 or buffer with interleaved xy pairs)
  if (spec.scaleXY !== undefined) {
    const scaleValue = runtime.values.read(spec.scaleXY);

    if (typeof scaleValue === "number") {
      // Scalar broadcast - uniform scale
      bufferSet.scaleXY = { kind: "scalar:f32", value: scaleValue };
    } else if (scaleValue instanceof Float32Array) {
      // Per-instance scale - interleaved xy pairs (length = count*2)
      if (scaleValue.length !== count * 2) {
        throw new Error(
          `assembleInstanceBuffers: scaleXY buffer length mismatch. ` +
          `Expected ${count * 2} (vec2, count=${count}), got ${scaleValue.length}`
        );
      }

      bufferSet.scaleXY = {
        bufferId: spec.scaleXY,
        type: "f32",
        length: scaleValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: scaleXY must be number or Float32Array, ` +
        `got ${scaleValue?.constructor.name}`
      );
    }
  }

  // Color RGBA (scalar u32 or buffer with u8x4 encoding)
  // Color buffers from MaterializeColor are Uint8Array with length=count*4
  if (spec.colorRGBA !== undefined) {
    const colorValue = runtime.values.read(spec.colorRGBA);

    if (typeof colorValue === "number") {
      // Scalar broadcast - packed u32 RGBA
      bufferSet.colorRGBA = { kind: "scalar:u32", value: colorValue };
    } else if (colorValue instanceof Uint8Array || colorValue instanceof Uint8ClampedArray) {
      // Per-instance colors - u8x4 array (length = count*4)
      if (colorValue.length !== count * 4) {
        throw new Error(
          `assembleInstanceBuffers: colorRGBA buffer length mismatch. ` +
          `Expected ${count * 4} (u8x4, count=${count}), got ${colorValue.length}`
        );
      }

      bufferSet.colorRGBA = {
        bufferId: spec.colorRGBA,
        type: "u8",
        length: colorValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: colorRGBA must be number or Uint8Array, ` +
        `got ${colorValue?.constructor.name}`
      );
    }
  }

  // Opacity (scalar f32 or buffer)
  if (spec.opacity !== undefined) {
    const opacityValue = runtime.values.read(spec.opacity);

    if (typeof opacityValue === "number") {
      bufferSet.opacity = { kind: "scalar:f32", value: opacityValue };
    } else if (opacityValue instanceof Float32Array) {
      if (opacityValue.length !== count) {
        throw new Error(
          `assembleInstanceBuffers: opacity buffer length mismatch. ` +
          `Expected ${count}, got ${opacityValue.length}`
        );
      }

      bufferSet.opacity = {
        bufferId: spec.opacity,
        type: "f32",
        length: opacityValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: opacity must be number or Float32Array, ` +
        `got ${opacityValue?.constructor.name}`
      );
    }
  }

  // Shape ID (scalar u16 or buffer)
  if (spec.shapeId !== undefined) {
    const shapeIdValue = runtime.values.read(spec.shapeId);

    if (typeof shapeIdValue === "number") {
      bufferSet.shapeId = { kind: "scalar:u16", value: shapeIdValue };
    } else if (shapeIdValue instanceof Uint32Array) {
      if (shapeIdValue.length !== count) {
        throw new Error(
          `assembleInstanceBuffers: shapeId buffer length mismatch. ` +
          `Expected ${count}, got ${shapeIdValue.length}`
        );
      }

      bufferSet.shapeId = {
        bufferId: spec.shapeId,
        type: "u32", // Use u32 for buffer (u16 would need Uint16Array)
        length: shapeIdValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: shapeId must be number or Uint32Array, ` +
        `got ${shapeIdValue?.constructor.name}`
      );
    }
  }

  // Stroke width (scalar f32 or buffer)
  if (spec.strokeWidth !== undefined) {
    const strokeWidthValue = runtime.values.read(spec.strokeWidth);

    if (typeof strokeWidthValue === "number") {
      bufferSet.strokeWidth = { kind: "scalar:f32", value: strokeWidthValue };
    } else if (strokeWidthValue instanceof Float32Array) {
      if (strokeWidthValue.length !== count) {
        throw new Error(
          `assembleInstanceBuffers: strokeWidth buffer length mismatch. ` +
          `Expected ${count}, got ${strokeWidthValue.length}`
        );
      }

      bufferSet.strokeWidth = {
        bufferId: spec.strokeWidth,
        type: "f32",
        length: strokeWidthValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: strokeWidth must be number or Float32Array, ` +
        `got ${strokeWidthValue?.constructor.name}`
      );
    }
  }

  // Stroke color RGBA (scalar u32 or buffer)
  if (spec.strokeColorRGBA !== undefined) {
    const strokeColorValue = runtime.values.read(spec.strokeColorRGBA);

    if (typeof strokeColorValue === "number") {
      bufferSet.strokeColorRGBA = { kind: "scalar:u32", value: strokeColorValue };
    } else if (strokeColorValue instanceof Uint8Array) {
      if (strokeColorValue.length !== count * 4) {
        throw new Error(
          `assembleInstanceBuffers: strokeColorRGBA buffer length mismatch. ` +
          `Expected ${count * 4} (u8x4, count=${count}), got ${strokeColorValue.length}`
        );
      }

      bufferSet.strokeColorRGBA = {
        bufferId: spec.strokeColorRGBA,
        type: "u8",
        length: strokeColorValue.length,
      };
    } else {
      throw new Error(
        `assembleInstanceBuffers: strokeColorRGBA must be number or Uint8Array, ` +
        `got ${strokeColorValue?.constructor.name}`
      );
    }
  }

  return bufferSet;
}
