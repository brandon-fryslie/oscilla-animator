/**
 * Render Pass Executors - Instances2D and Paths2D
 *
 * This module provides rendering functions for Instances2D and Paths2D passes
 * from RenderFrameIR. These functions read buffers from ValueStore via BufferRefIR
 * and dispatch to Canvas2D for rendering.
 *
 * Design:
 * - Pure rendering functions (no state management)
 * - Read buffers via BufferRefIR from ValueStore
 * - Support scalar broadcasts (ScalarF32IR/ScalarU32IR)
 * - Respect RenderPassHeaderIR (z-order, clip, view, blend)
 * - Decode path commands to Canvas operations
 *
 * References:
 * - design-docs/13-Renderer/01-RendererIR.md §3 (Instances2D) and §4 (Paths2D)
 * - .agent_planning/renderer-ir/DOD-PHASE-CD-2025-12-26-173641.md
 */

import type {
  Instances2DPassIR,
  Paths2DPassIR,
  BufferRefIR,
  ScalarF32IR,
  ScalarU32IR,
  ScalarU16IR,
  RenderPassHeaderIR,
} from "../compiler/ir/renderIR";
import type { ValueStore } from "../compiler/ir/stores";
import { unpremultiplyColor } from "./kernels/ColorQuantize";

// ============================================================================
// Helper: Buffer Reading
// ============================================================================

/**
 * Read typed buffer from ValueStore via BufferRefIR.
 *
 * Validates buffer type matches expected type and returns strongly typed array.
 *
 * @param bufferRef - Buffer reference from IR
 * @param valueStore - ValueStore containing buffers
 * @returns Typed array view of buffer
 * @throws Error if buffer type mismatch or buffer not found
 */
function readBuffer(
  bufferRef: BufferRefIR,
  valueStore: ValueStore
): Float32Array | Uint32Array | Uint16Array | Uint8Array {
  const value = valueStore.read(bufferRef.bufferId);

  // Validate buffer type
  switch (bufferRef.type) {
    case "f32":
      if (!(value instanceof Float32Array)) {
        throw new Error(
          `readBuffer: expected Float32Array for bufferId=${bufferRef.bufferId}, ` +
          `got ${value?.constructor.name}`
        );
      }
      return value;

    case "u32":
      if (!(value instanceof Uint32Array)) {
        throw new Error(
          `readBuffer: expected Uint32Array for bufferId=${bufferRef.bufferId}, ` +
          `got ${value?.constructor.name}`
        );
      }
      return value;

    case "u16":
      if (!(value instanceof Uint16Array)) {
        throw new Error(
          `readBuffer: expected Uint16Array for bufferId=${bufferRef.bufferId}, ` +
          `got ${value?.constructor.name}`
        );
      }
      return value;

    case "u8":
      if (!(value instanceof Uint8Array || value instanceof Uint8ClampedArray)) {
        throw new Error(
          `readBuffer: expected Uint8Array for bufferId=${bufferRef.bufferId}, ` +
          `got ${value?.constructor.name}`
        );
      }
      return value as Uint8Array;

    default: {
      const _exhaustive: never = bufferRef.type;
      throw new Error(`readBuffer: unknown buffer type ${_exhaustive}`);
    }
  }
}

/**
 * Resolve buffer or scalar to typed array or constant.
 *
 * Handles BufferRefIR (read from ValueStore) and scalar broadcasts.
 *
 * @param attr - BufferRefIR or ScalarXXXIR
 * @param valueStore - ValueStore for buffer reads
 * @returns Object with { isScalar, value, buffer }
 */
function requireAttribute(
  attr: BufferRefIR | ScalarF32IR | ScalarU32IR | ScalarU16IR | undefined,
  valueStore: ValueStore
): {
  isScalar: boolean;
  value: number;
  buffer: Float32Array | Uint32Array | Uint16Array | Uint8Array | null;
} {
  if (attr === undefined) {
    throw new Error("renderPassExecutors: missing required instance attribute");
  }

  // Check for scalar broadcasts
  if ("kind" in attr) {
    switch (attr.kind) {
      case "scalar:f32":
      case "scalar:u32":
      case "scalar:u16":
        return { isScalar: true, value: attr.value, buffer: null };
      default: {
        const _exhaustive: never = attr;
        throw new Error(`requireAttribute: unknown scalar kind ${(_exhaustive as any).kind}`);
      }
    }
  }

  // BufferRefIR - read from ValueStore
  const buffer = readBuffer(attr, valueStore);
  return { isScalar: false, value: 0, buffer };
}

function optionalAttribute(
  attr: BufferRefIR | ScalarF32IR | ScalarU32IR | ScalarU16IR | undefined,
  valueStore: ValueStore,
  defaultScalar: number
): {
  isScalar: boolean;
  value: number;
  buffer: Float32Array | Uint32Array | Uint16Array | Uint8Array | null;
} {
  if (attr === undefined) {
    return { isScalar: true, value: defaultScalar, buffer: null };
  }
  return requireAttribute(attr, valueStore);
}

// ============================================================================
// Helper: Canvas State Management
// ============================================================================

/**
 * Apply RenderPassHeaderIR to Canvas context.
 *
 * Sets up clipping, view transform, and blend mode based on header spec.
 *
 * @param ctx - Canvas 2D context
 * @param header - Pass header specification
 */
function applyPassHeader(
  ctx: CanvasRenderingContext2D,
  header: RenderPassHeaderIR,
): void {
  // Apply view transform if specified
  if (header.view !== undefined) {
    const t = header.view;
    ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
  }

  // Apply clipping if specified
  if (header.clip !== undefined) {
    if (header.clip.kind === "rect") {
      const { x, y, w, h } = header.clip;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
    } else {
      // Path-based clipping not implemented yet (requires path decoding)
      console.warn("renderPassExecutors: path-based clipping not implemented");
    }
  }

  // Apply blend mode and opacity if specified
  if (header.blend !== undefined) {
    // Set composite operation
    switch (header.blend.mode) {
      case "normal":
        ctx.globalCompositeOperation = "source-over";
        break;
      case "add":
        ctx.globalCompositeOperation = "lighter";
        break;
      case "multiply":
        ctx.globalCompositeOperation = "multiply";
        break;
      case "screen":
        ctx.globalCompositeOperation = "screen";
        break;
      default: {
        const _exhaustive: never = header.blend.mode;
        throw new Error(`applyPassHeader: unknown blend mode ${_exhaustive}`);
      }
    }

    // Set opacity
    if (header.blend.opacity !== undefined) {
      ctx.globalAlpha *= header.blend.opacity;
    }
  }
}

/**
 * Unpack u8x4 color to CSS rgba string.
 *
 * Assumes u8x4 encoding: [R, G, B, A] in 0-255 range.
 *
 * @param buffer - Uint8Array with RGBA components
 * @param index - Index of first component (R)
 * @returns CSS rgba() string
 */
function unpackColorU8(buffer: Uint8Array, index: number): string {
  const slice = buffer.subarray(index, index + 4);
  const c = unpremultiplyColor(slice);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r},${g},${b},${c.a})`;
}

/**
 * Unpack u32 packed color to CSS rgba string.
 *
 * Assumes RGBA u32 encoding (little-endian byte order).
 *
 * @param packed - Packed u32 color value
 * @returns CSS rgba() string
 */
function unpackColorU32(packed: number): string {
  const r = (packed >>> 0) & 0xFF;
  const g = (packed >>> 8) & 0xFF;
  const b = (packed >>> 16) & 0xFF;
  const a = (packed >>> 24) & 0xFF;
  const c = unpremultiplyColor(new Uint8Array([r, g, b, a]));
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`;
}

// ============================================================================
// Phase C: Instances2D Pass Executor
// ============================================================================

/**
 * Render an Instances2D pass to Canvas.
 *
 * Reads instance attribute buffers from ValueStore and renders shape2d material
 * (circles, squares, stars) with per-instance transforms, colors, and styles.
 *
 * Algorithm:
 * 1. Apply pass header (view, clip, blend)
 * 2. Resolve all attribute buffers (posXY, size, rot, colorRGBA, etc.)
 * 3. For each instance:
 *    a. Read or broadcast instance attributes
 *    b. Apply per-instance transform (position, size, rotation)
 *    c. Draw shape primitive with fill/stroke styling
 *
 * Supported material: "shape2d" with "flat" shading
 * Shape types: circle (shapeId=0), square (shapeId=1), star (shapeId=2+)
 *
 * @param pass - Instances2D pass specification
 * @param ctx - Canvas 2D context
 * @param valueStore - ValueStore for buffer reads
 *
 * @example
 * ```typescript
 * renderInstances2DPass(pass, ctx, runtime.values);
 * ```
 */
export function renderInstances2DPass(
  pass: Instances2DPassIR,
  ctx: CanvasRenderingContext2D,
  valueStore: ValueStore,
): void {
  // Skip if disabled
  if (!pass.header.enabled) {
    return;
  }

  // Apply pass header in saved state
  ctx.save();
  try {
    applyPassHeader(ctx, pass.header);

    // Validate material (only shape2d supported for now)
    if (pass.material.kind !== "shape2d") {
      console.warn(
        `renderInstances2DPass: material kind '${pass.material.kind}' not implemented`
      );
      return;
    }

    // Read required posXY buffer
    const posXY = readBuffer(pass.buffers.posXY, valueStore) as Float32Array;

    // Resolve optional attribute buffers/scalars
    const size = requireAttribute(pass.buffers.size, valueStore);
    const colorRGBA = requireAttribute(pass.buffers.colorRGBA, valueStore);
    const opacity = requireAttribute(pass.buffers.opacity, valueStore);
    const shapeId = requireAttribute(pass.buffers.shapeId, valueStore);
    const rot = optionalAttribute(pass.buffers.rot, valueStore, 0);
    const strokeWidth = optionalAttribute(pass.buffers.strokeWidth, valueStore, 0);
    const strokeColorRGBA = optionalAttribute(pass.buffers.strokeColorRGBA, valueStore, 0);

    // Render each instance
    for (let i = 0; i < pass.count; i++) {
      // Read position (required, interleaved xy pairs)
      const x = posXY[i * 2 + 0];
      const y = posXY[i * 2 + 1];

      // Read or broadcast size
      const s = size.isScalar ? size.value : (size.buffer as Float32Array)[i];

      // Read or broadcast rotation
      const r = rot.isScalar ? rot.value : (rot.buffer as Float32Array)[i];

      // Read or broadcast opacity
      const op = opacity.isScalar
        ? opacity.value
        : (opacity.buffer as Float32Array)[i];

      // Read or broadcast shape ID
      const shape = shapeId.isScalar
        ? shapeId.value
        : (shapeId.buffer as Uint32Array)[i];

      // Apply per-instance transform
      ctx.save();
      try {
        // Translate to position
        ctx.translate(x, y);

        // Rotate
        if (r !== 0) {
          ctx.rotate(r);
        }

        // Scale by size
        if (s !== 1) {
          ctx.scale(s, s);
        }

        // Apply opacity
        if (op !== 1) {
          ctx.globalAlpha *= op;
        }

        // Prepare fill and stroke styles
        let fillStyle: string | null = null;
        let strokeStyle: string | null = null;

        // Fill color
        if (!colorRGBA.isScalar || colorRGBA.value !== 0) {
          if (colorRGBA.isScalar) {
            fillStyle = unpackColorU32(colorRGBA.value);
          } else if (colorRGBA.buffer instanceof Uint8Array) {
            fillStyle = unpackColorU8(colorRGBA.buffer, i * 4);
          }
        }

        // Stroke color and width
        if (!strokeColorRGBA.isScalar || strokeColorRGBA.value !== 0) {
          if (strokeColorRGBA.isScalar) {
            strokeStyle = unpackColorU32(strokeColorRGBA.value);
          } else if (strokeColorRGBA.buffer instanceof Uint8Array) {
            strokeStyle = unpackColorU8(strokeColorRGBA.buffer, i * 4);
          }

          // Set stroke width
          const sw = strokeWidth.isScalar
            ? strokeWidth.value
            : (strokeWidth.buffer as Float32Array)[i];
          ctx.lineWidth = sw;
        }

        // Draw shape primitive
        ctx.beginPath();

        // Shape ID determines primitive type
        // 0 = circle, 1 = square, 2+ = star variants
        if (shape === 0) {
          // Circle (unit radius 0.5)
          ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
        } else if (shape === 1) {
          // Square (unit size, centered at origin)
          ctx.rect(-0.5, -0.5, 1, 1);
        } else {
          // Star (shape >= 2)
          // Star points = max(3, shape)
          // Inner radius = 0.5 (can be parameterized later)
          const points = Math.max(3, shape);
          const inner = 0.5; // Inner/outer radius ratio

          for (let k = 0; k < points * 2; k++) {
            const isOuter = (k % 2) === 0;
            const rad = isOuter ? 0.5 : 0.5 * inner;
            const theta = (k / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            const px = Math.cos(theta) * rad;
            const py = Math.sin(theta) * rad;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        }

        // Fill and stroke
        if (fillStyle !== null) {
          ctx.fillStyle = fillStyle;
          ctx.fill();
        }

        if (strokeStyle !== null) {
          ctx.strokeStyle = strokeStyle;
          ctx.stroke();
        }
      } finally {
        ctx.restore();
      }
    }
  } finally {
    ctx.restore();
  }
}

// ============================================================================
// Phase D: Paths2D Pass Executor
// ============================================================================

/**
 * Decode u16 path command to Canvas operation.
 *
 * Command encoding (per PathEncodingIR v1):
 * - 0 = M (MoveTo): consumes 1 point (x, y)
 * - 1 = L (LineTo): consumes 1 point (x, y)
 * - 2 = Q (QuadraticTo): consumes 2 points (ctrl_x, ctrl_y, end_x, end_y)
 * - 3 = C (CubicTo): consumes 3 points (c1_x, c1_y, c2_x, c2_y, end_x, end_y)
 * - 4 = Z (Close): consumes 0 points
 *
 * @param ctx - Canvas 2D context
 * @param cmd - Command code (u16)
 * @param points - Point buffer (Float32Array, interleaved xy pairs)
 * @param pointIndex - Current point index (in xy pairs, NOT floats)
 * @returns Number of points consumed (in xy pairs)
 */
function decodePathCommand(
  ctx: CanvasRenderingContext2D,
  cmd: number,
  points: Float32Array,
  pointIndex: number
): number {
  const pi = pointIndex * 2; // Convert xy pair index to float index

  switch (cmd) {
    case 0: // M (MoveTo)
      ctx.moveTo(points[pi], points[pi + 1]);
      return 1; // Consumed 1 xy pair

    case 1: // L (LineTo)
      ctx.lineTo(points[pi], points[pi + 1]);
      return 1; // Consumed 1 xy pair

    case 2: // Q (QuadraticTo)
      ctx.quadraticCurveTo(
        points[pi],     // ctrl_x
        points[pi + 1], // ctrl_y
        points[pi + 2], // end_x
        points[pi + 3]  // end_y
      );
      return 2; // Consumed 2 xy pairs

    case 3: // C (CubicTo)
      ctx.bezierCurveTo(
        points[pi],     // c1_x
        points[pi + 1], // c1_y
        points[pi + 2], // c2_x
        points[pi + 3], // c2_y
        points[pi + 4], // end_x
        points[pi + 5]  // end_y
      );
      return 3; // Consumed 3 xy pairs

    case 4: // Z (Close)
      ctx.closePath();
      return 0; // Consumed 0 xy pairs

    default:
      throw new Error(`decodePathCommand: unknown command code ${cmd}`);
  }
}

/**
 * Render a Paths2D pass to Canvas.
 *
 * Reads path geometry buffers from ValueStore and decodes command/point streams
 * to Canvas path operations. Applies PathStyleIR (fill, stroke, dash) with
 * per-path or global styling.
 *
 * Algorithm:
 * 1. Apply pass header (view, clip, blend)
 * 2. Read geometry indexing buffers (pathCommandStart, pathPointStart, etc.)
 * 3. Read packed command and point streams
 * 4. Resolve style attributes (fillColorRGBA, strokeColorRGBA, etc.)
 * 5. For each path:
 *    a. Decode command stream to Canvas path operations
 *    b. Apply per-path or global styling
 *    c. Fill and/or stroke based on pass.draw spec
 *
 * Path commands: M=0, L=1, Q=2, C=3, Z=4 (per PathEncodingIR v1)
 *
 * @param pass - Paths2D pass specification
 * @param ctx - Canvas 2D context
 * @param valueStore - ValueStore for buffer reads
 *
 * @example
 * ```typescript
 * renderPaths2DPass(pass, ctx, runtime.values);
 * ```
 */
export function renderPaths2DPass(
  pass: Paths2DPassIR,
  ctx: CanvasRenderingContext2D,
  valueStore: ValueStore,
): void {
  // Skip if disabled
  if (!pass.header.enabled) {
    return;
  }

  // Apply pass header in saved state
  ctx.save();
  try {
    applyPassHeader(ctx, pass.header);

    // Read geometry indexing buffers
    const pathCommandStart = readBuffer(
      pass.geometry.pathCommandStart,
      valueStore
    ) as Uint32Array;
    const pathCommandLen = readBuffer(
      pass.geometry.pathCommandLen,
      valueStore
    ) as Uint32Array;
    const pathPointStart = readBuffer(
      pass.geometry.pathPointStart,
      valueStore
    ) as Uint32Array;

    // Read packed command and point streams
    const commands = readBuffer(pass.geometry.commands, valueStore) as Uint16Array;
    const pointsXY = readBuffer(pass.geometry.pointsXY, valueStore) as Float32Array;

    // Resolve style attributes
    const fillColorRGBA = optionalAttribute(pass.style.fillColorRGBA, valueStore, 0);
    const strokeColorRGBA = optionalAttribute(pass.style.strokeColorRGBA, valueStore, 0);
    const strokeWidth = optionalAttribute(pass.style.strokeWidth, valueStore, 1);
    const opacity = optionalAttribute(pass.style.opacity, valueStore, 1);

    // Render each path
    for (let pathIdx = 0; pathIdx < pass.geometry.pathCount; pathIdx++) {
      ctx.save();
      try {
        // Get path geometry bounds
        const cmdStart = pathCommandStart[pathIdx];
        const cmdLen = pathCommandLen[pathIdx];
        const ptStart = pathPointStart[pathIdx];

        // Build path from commands
        ctx.beginPath();
        let pointIndex = ptStart; // Current point index (in xy pairs)

        for (let cmdIdx = cmdStart; cmdIdx < cmdStart + cmdLen; cmdIdx++) {
          const cmd = commands[cmdIdx];
          const consumed = decodePathCommand(ctx, cmd, pointsXY, pointIndex);
          pointIndex += consumed;
        }

        // Apply per-path opacity
        const op = opacity.isScalar
          ? opacity.value
          : (opacity.buffer as Float32Array)[pathIdx];
        if (op !== 1) {
          ctx.globalAlpha *= op;
        }

        // Apply fill if enabled
        if (pass.draw.fill) {
          let fillStyle: string | null = null;

          if (!fillColorRGBA.isScalar || fillColorRGBA.value !== 0) {
            if (fillColorRGBA.isScalar) {
              fillStyle = unpackColorU32(fillColorRGBA.value);
            } else if (fillColorRGBA.buffer instanceof Uint8Array) {
              fillStyle = unpackColorU8(fillColorRGBA.buffer, pathIdx * 4);
            }
          }

          if (fillStyle !== null) {
            ctx.fillStyle = fillStyle;
            // Apply fill rule if specified
            const fillRule = pass.style.fillRule || "nonzero";
            ctx.fill(fillRule);
          }
        }

        // Apply stroke if enabled
        if (pass.draw.stroke) {
          let strokeStyle: string | null = null;

          if (!strokeColorRGBA.isScalar || strokeColorRGBA.value !== 0) {
            if (strokeColorRGBA.isScalar) {
              strokeStyle = unpackColorU32(strokeColorRGBA.value);
            } else if (strokeColorRGBA.buffer instanceof Uint8Array) {
              strokeStyle = unpackColorU8(strokeColorRGBA.buffer, pathIdx * 4);
            }
          }

          if (strokeStyle !== null) {
            ctx.strokeStyle = strokeStyle;

            // Set stroke width
            const sw = strokeWidth.isScalar
              ? strokeWidth.value
              : (strokeWidth.buffer as Float32Array)[pathIdx];
            ctx.lineWidth = sw;

            // Set line cap/join if specified
            if (pass.style.lineCap !== undefined) {
              ctx.lineCap = pass.style.lineCap;
            }
            if (pass.style.lineJoin !== undefined) {
              ctx.lineJoin = pass.style.lineJoin;
            }
            if (pass.style.miterLimit !== undefined) {
              ctx.miterLimit = pass.style.miterLimit;
            }

            // Set dash pattern if specified
            if (pass.style.dash !== null && pass.style.dash !== undefined) {
              ctx.setLineDash(pass.style.dash.pattern);
              if (pass.style.dash.offset !== undefined) {
                ctx.lineDashOffset = pass.style.dash.offset;
              }
            } else {
              ctx.setLineDash([]); // Clear dash pattern
            }

            ctx.stroke();
          }
        }
      } finally {
        ctx.restore();
      }
    }
  } finally {
    ctx.restore();
  }
}
