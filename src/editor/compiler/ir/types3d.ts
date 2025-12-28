/**
 * 3D IR Types - Camera, Mesh, and Projection
 *
 * This module defines the IR types for 3D rendering support:
 * - CameraIR: Deterministic camera definitions
 * - MeshIR: Extrusion-only procedural mesh recipes
 * - Instance2DBufferRef: 3D-to-2D projection output
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md
 */

// ============================================================================
// Camera IR (07-3d-Canonical.md §2)
// ============================================================================

/**
 * Camera identifier (stable across program revisions)
 */
export type CameraId = string;

/**
 * Camera projection kind
 */
export type ProjectionKind = "perspective" | "orthographic";

/**
 * Camera IR - Deterministic, portable camera definition
 *
 * Locked conventions for parity across TS and Rust/WASM:
 * - Right-handed coordinate system
 * - Camera looks down -Z axis
 * - Y is up
 * - NDC origin at center, Y-axis down in screen space
 *
 * All camera evaluation is float32 math for deterministic results.
 */
export interface CameraIR {
  /** Unique camera identifier */
  id: CameraId;

  /** Coordinate system handedness (locked to "right") */
  handedness: "right";

  /** Camera forward direction (locked to "-Z") */
  forwardAxis: "-Z";

  /** Camera up direction (locked to "+Y") */
  upAxis: "+Y";

  /** Projection parameters */
  projection: {
    /** Projection type */
    kind: ProjectionKind;

    /** Near clipping plane distance (must be > 0) */
    near: number;

    /** Far clipping plane distance (must be > near) */
    far: number;

    /** Field of view Y in radians (perspective only, range: (0, π)) */
    fovYRad?: number;

    /** Orthographic visible height in world units (orthographic only) */
    orthoHeight?: number;
  };

  /** Camera pose in world space */
  pose: {
    /** Camera position */
    position: { x: number; y: number; z: number };

    /** Camera orientation as unit quaternion */
    orientation: { x: number; y: number; z: number; w: number };
  };

  /** Screen mapping convention (fixed) */
  ndcToScreen: {
    /** NDC origin location */
    origin: "center";

    /** Screen Y-axis direction */
    yAxis: "down";
  };
}

/**
 * Evaluated camera matrices (runtime cache product)
 *
 * Computed using float32 math for determinism.
 * Cached by (cameraId, viewportKey).
 */
export interface CameraEval {
  /** View matrix (world to camera space) - 16 elements */
  viewMat4: Float32Array;

  /** Projection matrix (camera to clip space) - 16 elements */
  projMat4: Float32Array;

  /** Combined view-projection matrix - 16 elements */
  viewProjMat4: Float32Array;

  /** Viewport parameters used for this evaluation */
  viewportKey: { w: number; h: number; dpr: number };
}

/**
 * Camera table in compiled program IR
 */
export interface CameraTable {
  /** All cameras defined in the program */
  cameras: CameraIR[];

  /** Fast lookup from camera ID to array index */
  cameraIdToIndex: Record<CameraId, number>;
}

/**
 * Default camera injected when patch has 0 camera blocks.
 *
 * Position: (0, 0, 100) looking at origin (0, 0, 0) with Y-up.
 * The identity quaternion (0, 0, 0, 1) corresponds to this view
 * since the camera looks down -Z by convention.
 */
export const DEFAULT_CAMERA_IR: CameraIR = {
  id: "__default__",
  handedness: "right",
  forwardAxis: "-Z",
  upAxis: "+Y",
  projection: {
    kind: "perspective",
    near: 0.1,
    far: 1000,
    fovYRad: Math.PI / 3, // 60 degrees
    orthoHeight: 10,
  },
  pose: {
    position: { x: 0, y: 0, z: 100 },
    // Identity quaternion: camera looks down -Z, Y is up
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  },
  ndcToScreen: {
    origin: "center",
    yAxis: "down",
  },
};

// ============================================================================
// Mesh IR (07-3d-Canonical.md §3)
// ============================================================================

/**
 * Mesh identifier (stable across program revisions)
 */
export type MeshId = string;

/**
 * 2D profile shapes for extrusion
 *
 * Limited to simple, procedural profiles to keep the system
 * coherent and debuggable.
 */
export type ExtrudeProfile2D =
  | { kind: "circle"; radius: number; segments: number }
  | { kind: "ngon"; sides: number; radius: number }
  | { kind: "polyline"; points: { x: number; y: number }[]; closed: boolean };

/**
 * Extrusion methods
 *
 * Defines how a 2D profile becomes a 3D solid.
 */
export type ExtrudeKind =
  | { kind: "linear"; depth: number; cap: "both" | "front" | "back" | "none" }
  | { kind: "rounded"; depth: number; roundSegments: number; radius: number };

/**
 * Mesh IR - Extrusion-only procedural mesh recipe
 *
 * Meshes are defined as recipes, not raw triangles.
 * This keeps the system coherent, debuggable, and optimizable.
 *
 * Materialization is cached by canonical recipe hash.
 */
export interface MeshIR {
  /** Unique mesh identifier */
  id: MeshId;

  /** Procedural mesh recipe */
  recipe: {
    /** 2D profile to extrude */
    profile: ExtrudeProfile2D;

    /** Extrusion method */
    extrude: ExtrudeKind;

    /** Optional bevel parameters */
    bevel?: { size: number; segments: number };
  };

  /** Vertex attributes to generate */
  attributes: {
    /** Generate normals for lighting */
    normals: boolean;

    /** Generate UV coordinates */
    uvs: boolean;
  };

  /** Triangle winding order (locked to CCW) */
  winding: "CCW";

  /** Always generate indexed geometry */
  indexed: true;

  /** Index buffer element type */
  indexType: "u16" | "u32";
}

/**
 * Materialized mesh buffers (runtime cache product)
 *
 * The result of executing a mesh recipe.
 * Cached and reused across frames.
 */
export interface MeshBufferRef {
  /** Vertex positions (xyz packed) */
  positions: Float32Array;

  /** Vertex normals (xyz packed, optional) */
  normals?: Float32Array;

  /** UV coordinates (uv packed, optional) */
  uvs?: Float32Array;

  /** Triangle indices */
  indices: Uint16Array | Uint32Array;

  /** Axis-aligned bounding box */
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

/**
 * Mesh table in compiled program IR
 */
export interface MeshTable {
  /** All meshes defined in the program */
  meshes: MeshIR[];

  /** Fast lookup from mesh ID to array index */
  meshIdToIndex: Record<MeshId, number>;
}

// ============================================================================
// Instance2D Buffer (07-3d-Canonical.md §4)
// ============================================================================

/**
 * Instance2D buffer contract (Canvas sink input)
 *
 * This is the canonical "fast path" shape for high-volume renderable
 * instances on Canvas. This is the output of 3D-to-2D projection and
 * the input to 2D render sinks.
 *
 * Color storage uses split RGBA channels (Option C) for efficient
 * per-channel operations.
 *
 * Buffers may be arena-backed for efficient reuse.
 */
export interface Instance2DBufferRef {
  /** Screen X coordinates */
  x: Float32Array;

  /** Screen Y coordinates */
  y: Float32Array;

  /** Per-instance size (semantic: px unless explicitly declared otherwise) */
  s?: Float32Array;

  /** Per-instance rotation in radians (optional) */
  rot?: Float32Array;

  /** Color red channel (0..255) */
  r: Uint8Array;

  /** Color green channel (0..255) */
  g: Uint8Array;

  /** Color blue channel (0..255) */
  b: Uint8Array;

  /** Color alpha channel (0..255) */
  a: Uint8Array;

  /** Optional depth for ordering/diagnostics */
  z?: Float32Array;

  /** Optional alive mask (0/1) produced by culling steps */
  alive?: Uint8Array;
}

// ============================================================================
// Step Performance Counters (07-3d-Canonical.md §5)
// ============================================================================

/**
 * Standard performance counters for scheduled steps
 *
 * These counters are required for debugging and optimization.
 * All 3D-related steps must emit these counters.
 */
export interface StepPerfCounters {
  /** Step identifier */
  stepId: string;

  /** CPU time in milliseconds */
  cpuMs: number;

  /** Whether this step used cached results */
  cacheHit: boolean;

  /** Bytes written to buffers */
  bytesWritten: number;

  /** Number of buffers reused from arena/pool */
  buffersReused: number;

  /** Number of instances input to step (for instance-oriented steps) */
  instancesIn?: number;

  /** Number of instances output from step (for instance-oriented steps) */
  instancesOut?: number;

  /** Number of instances culled (for projection/culling steps) */
  culled?: number;

  /** Number of instances clipped (for projection/culling steps) */
  clipped?: number;

  /** Number of NaN values detected */
  nanCount: number;

  /** Number of Infinity values detected */
  infCount: number;
}
