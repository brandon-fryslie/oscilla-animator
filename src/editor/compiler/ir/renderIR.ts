/**
 * Renderer IR Type Definitions
 *
 * This module defines the complete type system for the Renderer IR - the contract
 * between the VM/compiler and the Canvas renderer. All types are pure TypeScript
 * interfaces with no runtime implementation.
 *
 * The Renderer IR supports a hybrid 2D rendering architecture with two peer primitives:
 * - Instances2D: High-volume instance rendering (thousands of particles, sprites)
 * - Paths2D: Expressive vector path rendering (morphing line art, glyphs)
 *
 * Design Principles:
 * - Renderer consumes only typed buffers, never objects or closures
 * - All materialization (color quantization, path flattening) is scheduled and cacheable
 * - Deterministic across hot-swaps via stable cache keys
 * - Rust/WASM compatible encoding (u8x4 color, u16 path commands, LE byte order)
 *
 * References:
 * - design-docs/spec/ (authoritative specification)
 * - design-docs/13-Renderer/01-RendererIR.md (authoritative specification)
 * - design-docs/13-Renderer/03-Decisions.md (encoding decisions)
 * - design-docs/13-Renderer/04-Decision-to-IR.md (buffer descriptors)
 *
 * Phase: A (IR Type Definitions)
 * Status: Pure types only - no runtime implementation
 */

// ============================================================================
// Frame Structure (Doc 01 Section 1)
// ============================================================================

/**
 * RenderFrameIR - Root frame structure produced by VM and consumed by renderer
 *
 * This is the top-level contract between the VM (executeRenderAssemble step)
 * and the Canvas renderer. One RenderFrameIR is produced per frame.
 *
 * Design: Flat list of passes, no implicit graph traversal, stable ordering
 */
export interface RenderFrameIR {
  /** IR version for evolution (currently 1) */
  version: 1;

  /** Optional frame identity for cache continuity across hot-swaps */
  frameKey?: FrameKey;

  /** Canvas clearing specification */
  clear: ClearSpecIR;

  /** Ordered list of render passes (drawn in sequence) */
  passes: RenderPassIR[];

  /** Optional overlay passes (debug, selection, UI) */
  overlays?: RenderPassIR[];

  /** Optional metadata for debugging/profiling (not used in hot path) */
  meta?: RenderFrameMetaIR;
}

/**
 * Frame identity key for cache continuity
 *
 * Allows renderer to skip work if frame unchanged. Stable across hot-swaps
 * when patch semantics are unchanged.
 *
 * Future: Can be hash-based or hierarchical for fine-grained caching
 */
export type FrameKey = string | number;

/**
 * Frame metadata for debugging and profiling
 *
 * Placeholder for extensibility. Not used in rendering hot path.
 */
export interface RenderFrameMetaIR {
  [key: string]: unknown;
}

// ============================================================================
// Pass Model (Doc 01 Section 2)
// ============================================================================

/**
 * RenderPassIR - Discriminated union of all pass types
 *
 * Each pass is a draw unit with a concrete payload type.
 * Renderer branches on `kind` discriminator.
 */
export type RenderPassIR =
  | Instances2DPassIR
  | Paths2DPassIR
  | ClipGroupPassIR
  | PostFXPassIR; // Future work, stubbed for completeness

/**
 * RenderPassHeaderIR - Shared metadata for all pass types
 *
 * Controls pass-level behavior: ordering, clipping, transforms, blending.
 * All passes include this header regardless of their specific payload type.
 */
export interface RenderPassHeaderIR {
  /** Stable pass identity (persists across compiles if same semantic pass) */
  id: string;

  /** Z-order for stable sorting (lower values drawn first) */
  z: number;

  /** Whether this pass is enabled (false = skip rendering) */
  enabled: boolean;

  /** Optional clipping region for this pass */
  clip?: ClipSpecIR;

  /** Optional global transform applied to entire pass (2D camera-ish) */
  view?: Mat3x2IR;

  /** Optional blend mode and opacity for pass-level compositing */
  blend?: BlendSpecIR;

  /** Optional warnings or performance notes (non-fatal) */
  notes?: string[];
}

/**
 * ClearSpecIR - Canvas clearing specification
 *
 * Controls how canvas is cleared before rendering passes.
 */
export interface ClearSpecIR {
  /** Clearing mode */
  mode: "none" | "color";

  /**
   * Clear color as packed u32 RGBA
   *
   * Encoding convention TBD in Phase B (likely u8x4 premul linear RGBA).
   * Only used when mode = "color".
   */
  colorRGBA?: number;
}

/**
 * BlendSpecIR - Blending and opacity specification
 *
 * Controls Canvas2D globalCompositeOperation and globalAlpha.
 */
export interface BlendSpecIR {
  /** Blend mode (maps to Canvas2D composite operations) */
  mode: "normal" | "add" | "multiply" | "screen";

  /** Pass-wide opacity multiplier (0-1), default 1.0 */
  opacity?: number;
}

/**
 * ClipSpecIR - Clipping region specification
 *
 * Supports rect, circle, and path-based clipping.
 * Path variant creates forward reference to PathGeometryBufferIR.
 */
export type ClipSpecIR =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "circle"; x: number; y: number; radius: number }
  | { kind: "path"; geometry: PathGeometryBufferIR };

// ============================================================================
// Instances2D Pass (Doc 01 Section 3)
// ============================================================================

/**
 * Instances2DPassIR - High-volume instance rendering
 *
 * The "thousands of particles" fast path. Renders many instances of the same
 * primitive (shape, sprite, glyph) with per-instance attributes.
 *
 * Design: Packed typed buffers for all per-instance data, with optional
 * scalar broadcasts for constant values.
 */
export interface Instances2DPassIR {
  /** Pass type discriminator */
  kind: "instances2d";

  /** Pass-level metadata and controls */
  header: RenderPassHeaderIR;

  /** Number of instances to render */
  count: number;

  /** Material defines how to interpret buffers into visuals */
  material: InstanceMaterialIR;

  /** Packed typed buffer references for per-instance attributes */
  buffers: InstanceBufferSetIR;

  /** Optional per-instance sorting (for correct alpha blending) */
  sort?: InstanceSortIR;
}

/**
 * InstanceMaterialIR - Material selection for instance rendering
 *
 * Defines how instance buffers are interpreted and what visual primitive
 * is rendered per instance.
 *
 * Design: Small material system prevents explosion of specialized blocks.
 * Renderer switches on material kind.
 */
export type InstanceMaterialIR =
  | {
      /** Shape2D: Render geometric primitives (circles, squares, stars) */
      kind: "shape2d";
      /** Shading mode (flat or gradient) */
      shading: "flat" | "gradient";
      /** Color space for interpretation (sRGB or linear) */
      colorSpace: "srgb" | "linear";
      /** Gradient specification (only when shading = "gradient") */
      gradient?: GradientSpecIR;
    }
  | {
      /** Sprite: Render textured quads */
      kind: "sprite";
      /** Texture sampling mode */
      sampling: "nearest" | "linear";
      /** Texture atlas identifier */
      textureId: string;
    }
  | {
      /** Glyph: Render font glyphs (future work, defined for completeness) */
      kind: "glyph";
      /** Font identifier */
      fontId: string;
    };

/**
 * GradientSpecIR - Gradient fill specification
 *
 * Defines linear or radial gradients for instance materials.
 */
export interface GradientSpecIR {
  /** Gradient type */
  type: "linear" | "radial";

  /** Gradient stops (offset and color) */
  stops: GradientStopIR[];

  /** Gradient coordinates (context-specific interpretation) */
  coords?: {
    /** Start point (x, y) for linear or center (x, y) for radial */
    start: [number, number];
    /** End point (x, y) for linear or radius for radial */
    end: [number, number] | number;
  };
}

/**
 * GradientStopIR - Single gradient stop
 */
export interface GradientStopIR {
  /** Offset along gradient (0-1) */
  offset: number;

  /** Color as packed u32 RGBA */
  colorRGBA: number;
}

/**
 * InstanceBufferSetIR - Per-instance attribute buffers
 *
 * All buffers are either BufferRefIR (typed array from ValueStore) or
 * scalar broadcasts (constant value as-if it were a buffer).
 *
 * Layout conventions:
 * - posXY: Interleaved x,y pairs (length = count*2)
 * - colorRGBA: Packed u32 or f32x4 (encoding TBD Phase B)
 * - shapeId: 0=circle, 1=square, 2=star (matches shape2d block conventions)
 */
export interface InstanceBufferSetIR {
  // ---- Required ----

  /** Instance positions as interleaved xy pairs (Float32Array, length = count*2) */
  posXY: BufferRefIR;

  // ---- Optional Common ----

  /** Instance size/radius (scalar broadcast or per-instance buffer) */
  size?: BufferRefIR | ScalarF32IR;

  /** Instance rotation in radians (scalar broadcast or per-instance buffer) */
  rot?: BufferRefIR | ScalarF32IR;

  /** Instance scale XY (scalar broadcast or per-instance buffer) */
  scaleXY?: BufferRefIR | ScalarF32IR;

  /**
   * Instance color as packed RGBA
   *
   * Encoding TBD Phase B (u8x4 premul linear RGBA likely).
   * Can be Uint32Array or Float32Array*4 depending on encoding.
   */
  colorRGBA?: BufferRefIR | ScalarU32IR;

  /** Instance opacity multiplier 0-1 (scalar broadcast or per-instance buffer) */
  opacity?: BufferRefIR | ScalarF32IR;

  // ---- Optional Shape-Specific ----

  /**
   * Shape selection per instance
   *
   * Uint16Array: 0=circle, 1=square, 2=star, etc.
   * Encoding must match shape2d block implementations.
   */
  shapeId?: BufferRefIR | ScalarU16IR;

  // ---- Optional Stroke ----

  /** Stroke width (scalar broadcast or per-instance buffer) */
  strokeWidth?: BufferRefIR | ScalarF32IR;

  /** Stroke color as packed RGBA (encoding matches colorRGBA) */
  strokeColorRGBA?: BufferRefIR | ScalarU32IR;

  // ---- Extensibility ----

  /**
   * Custom attribute channels for advanced materials
   *
   * Allows future material extensions without breaking changes.
   * Material-specific interpretation.
   */
  custom?: Record<string, BufferRefIR>;
}

/**
 * InstanceSortIR - Per-instance sorting specification
 *
 * Controls draw order within an instance pass. Critical for correct alpha
 * blending (back-to-front or front-to-back).
 *
 * Design: Stable, deterministic sorting via explicit sort keys.
 */
export type InstanceSortIR =
  | { kind: "none" }
  | {
      kind: "byKey";
      /** Float32 sort key buffer (length = count) */
      key: BufferRefIR;
      /** Sort order */
      order: "asc" | "desc";
    };

// ============================================================================
// Paths2D Pass (Doc 01 Section 4)
// ============================================================================

/**
 * Paths2DPassIR - Vector path rendering
 *
 * The "morphing line art / glyph outlines" track. Renders arbitrary 2D vector
 * paths with rich styling (stroke, fill, dash, caps, joins).
 *
 * Design: Packed command/point streams with per-path indexing for efficient
 * morphing and batching.
 */
export interface Paths2DPassIR {
  /** Pass type discriminator */
  kind: "paths2d";

  /** Pass-level metadata and controls */
  header: RenderPassHeaderIR;

  /** Packed path geometry buffers */
  geometry: PathGeometryBufferIR;

  /** Path styling (stroke, fill, dash) */
  style: PathStyleIR;

  /** Draw mode control */
  draw: {
    /** Whether to stroke paths */
    stroke: boolean;
    /** Whether to fill paths */
    fill: boolean;
  };
}

/**
 * PathGeometryBufferIR - Packed path geometry representation
 *
 * Represents multiple paths efficiently as:
 * - Single packed command stream (all paths concatenated)
 * - Single packed point stream (all points concatenated)
 * - Per-path indexing (start/length into command and point streams)
 *
 * This layout supports:
 * - Efficient morphing (stable point counts)
 * - Batched rendering (single draw call per pass)
 * - Incremental updates (modify subset of paths)
 *
 * Indexing scheme:
 * For path i:
 *   commands[pathCommandStart[i] .. pathCommandStart[i] + pathCommandLen[i]]
 *   points[pathPointStart[i]*2 .. (pathPointStart[i] + pathPointLen[i])*2]
 */
export interface PathGeometryBufferIR {
  /** Number of paths in this pass */
  pathCount: number;

  // ---- Per-Path Indexing ----

  /** Start index into commands buffer for each path (Uint32Array, length = pathCount) */
  pathCommandStart: BufferRefIR;

  /** Number of commands for each path (Uint32Array, length = pathCount) */
  pathCommandLen: BufferRefIR;

  /** Start index into points buffer for each path (Uint32Array, length = pathCount) */
  pathPointStart: BufferRefIR;

  /** Number of points for each path (Uint32Array, length = pathCount) */
  pathPointLen: BufferRefIR;

  // ---- Packed Streams ----

  /**
   * Packed command stream
   *
   * Encoding: Uint8Array or Uint16Array (Phase B locks to u16, LE)
   * Commands: 0=M, 1=L, 2=Q, 3=C, 4=Z (or similar encoding, see PathEncodingIR)
   */
  commands: BufferRefIR;

  /**
   * Packed point stream as interleaved xy pairs
   *
   * Float32Array, length = totalPoints*2
   * Points are referenced by commands in-order (implicit)
   */
  pointsXY: BufferRefIR;

  // ---- Optional Extensions ----

  /**
   * Auxiliary data for advanced commands (arc parameters, etc.)
   *
   * Future work - can be omitted initially.
   */
  aux?: BufferRefIR;

  /** Path encoding convention (command semantics and point consumption) */
  encoding: PathEncodingIR;
}

/**
 * PathEncodingIR - Path command encoding specification
 *
 * Defines the command set and point consumption rules for path geometry.
 *
 * Commands and point consumption:
 * - M (MoveTo): consumes 1 point (x, y)
 * - L (LineTo): consumes 1 point (x, y)
 * - Q (QuadraticTo): consumes 2 points (ctrl_x, ctrl_y, end_x, end_y)
 * - C (CubicTo): consumes 3 points (c1_x, c1_y, c2_x, c2_y, end_x, end_y)
 * - Z (Close): consumes 0 points
 *
 * Storage: Commands are stored as numeric codes in `commands` buffer
 * (e.g., 0=M, 1=L, 2=Q, 3=C, 4=Z). Phase B will lock exact encoding.
 */
export interface PathEncodingIR {
  /** Encoding version */
  kind: "v1";

  /**
   * Conceptual command set (actual storage is numeric)
   *
   * This field documents the semantic meaning. Actual `commands` buffer
   * stores these as numeric codes (Uint8 or Uint16).
   */
  commands: ("M" | "L" | "Q" | "C" | "Z")[];
}

/**
 * PathStyleIR - Path stroke and fill styling
 *
 * Supports both global (scalar broadcast) and per-path (buffer) styling.
 * Rich Canvas2D styling options: fill rule, stroke caps/joins, dash patterns.
 */
export interface PathStyleIR {
  // ---- Fill ----

  /**
   * Fill color as packed RGBA
   *
   * Can be scalar (all paths same color) or buffer (per-path colors).
   * Encoding matches Instances2D colorRGBA (TBD Phase B).
   */
  fillColorRGBA?: BufferRefIR | ScalarU32IR;

  /** Fill rule for path winding (Canvas2D fill rule) */
  fillRule?: "nonzero" | "evenodd";

  // ---- Stroke ----

  /** Stroke color as packed RGBA (encoding matches fillColorRGBA) */
  strokeColorRGBA?: BufferRefIR | ScalarU32IR;

  /** Stroke width (scalar or per-path buffer) */
  strokeWidth?: BufferRefIR | ScalarF32IR;

  /** Line cap style (Canvas2D lineCap) */
  lineCap?: "butt" | "round" | "square";

  /** Line join style (Canvas2D lineJoin) */
  lineJoin?: "miter" | "round" | "bevel";

  /** Miter limit for miter joins (Canvas2D miterLimit) */
  miterLimit?: number;

  /**
   * Dash pattern and offset
   *
   * null = no dash (solid stroke)
   * pattern: array of dash/gap lengths
   * offset: dash pattern offset
   */
  dash?: { pattern: number[]; offset?: number } | null;

  // ---- Opacity ----

  /** Path opacity multiplier 0-1 (scalar or per-path buffer) */
  opacity?: BufferRefIR | ScalarF32IR;
}

// ============================================================================
// ClipGroup Pass (Gap 3: Clipping/Masking)
// ============================================================================

/**
 * ClipGroupPassIR - Hierarchical clipping pass
 *
 * Renders child passes within a clipping region. Supports rect, circle, and
 * path-based clipping with save/restore semantics.
 *
 * Design: Clip region is applied before rendering children, then restored.
 * Children can be any render pass type (instances2d, paths2d, nested clipGroups).
 */
export interface ClipGroupPassIR {
  /** Pass type discriminator */
  kind: "clipGroup";

  /** Pass-level metadata and controls */
  header: RenderPassHeaderIR;

  /** Clipping region specification */
  clip: ClipSpecIR;

  /** Child passes to render within clip region */
  children: RenderPassIR[];
}

// ============================================================================
// PostFX Pass (Future Work, Stubbed)
// ============================================================================

/**
 * PostFXPassIR - Post-processing effects pass
 *
 * Applies post-processing effects to framebuffer or intermediate textures.
 * Supports blur, bloom, color grading, vignette, etc.
 */
export interface PostFXPassIR {
  kind: "postfx";
  header: RenderPassHeaderIR;

  /** Effect specification */
  effect: PostFXEffectIR;

  /** Effect parameters (scalar or buffer) */
  params?: Record<string, number | BufferRefIR>;
}

/**
 * PostFXEffectIR - Post-processing effect specification
 *
 * Discriminated union of supported effects.
 */
export type PostFXEffectIR =
  | { kind: "blur"; radiusX: number; radiusY: number }
  | { kind: "bloom"; threshold: number; intensity: number; radius: number }
  | { kind: "vignette"; intensity: number; softness: number }
  | { kind: "colorGrade"; matrix: number[] };

// ============================================================================
// Buffer References (Doc 01 Section 5)
// ============================================================================

/**
 * BufferRefIR - Reference to a typed array buffer in ValueStore
 *
 * The VM/materializer allocates buffers and assigns dense IDs.
 * Renderer reads buffers via these references - zero copies, pure reads.
 *
 * Design: Renderer never allocates, never owns buffers. VM owns lifecycle.
 */
export interface BufferRefIR {
  /** Dense buffer ID in VM's BufferStore */
  bufferId: number;

  /** Element type of the typed array */
  type: "f32" | "u32" | "u16" | "u8";

  /** Number of elements (NOT bytes) */
  length: number;
}

/**
 * ScalarF32IR - 32-bit float scalar broadcast
 *
 * Represents a constant value used as-if it were a buffer of that value
 * repeated for all instances/paths. Avoids allocating N copies of same value.
 *
 * Example: All particles same size → size: { kind: "scalar:f32", value: 10.0 }
 */
export interface ScalarF32IR {
  kind: "scalar:f32";
  value: number;
}

/**
 * ScalarU32IR - 32-bit unsigned int scalar broadcast
 *
 * Typically used for packed color values (RGBA as u32).
 * Semantic interpretation depends on context (colorRGBA, etc.).
 */
export interface ScalarU32IR {
  kind: "scalar:u32";
  value: number;
}

/**
 * ScalarU16IR - 16-bit unsigned int scalar broadcast
 *
 * Typically used for shape IDs or other small enumerated values.
 * Example: All particles circles → shapeId: { kind: "scalar:u16", value: 0 }
 */
export interface ScalarU16IR {
  kind: "scalar:u16";
  value: number;
}

// ============================================================================
// Transforms (Doc 01 Section 6)
// ============================================================================

/**
 * Mat3x2IR - 2D affine transform matrix
 *
 * Represents a 2D affine transformation in homogeneous coordinates.
 * Used for pass-level view transforms (2D camera).
 *
 * Convention: [a c e; b d f; 0 0 1] in homogeneous coordinates
 * Maps to Canvas2D setTransform(a, b, c, d, e, f)
 *
 * Transform semantics:
 * - (a, b): x-axis basis (cosθ, sinθ for rotation)
 * - (c, d): y-axis basis (-sinθ, cosθ for rotation)
 * - (e, f): translation (tx, ty)
 */
export interface Mat3x2IR {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
