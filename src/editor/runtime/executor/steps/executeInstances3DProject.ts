/**
 * Execute Instances3D Project to 2D Step
 *
 * Projects 3D instances through a camera to produce 2D instance buffers
 * suitable for Canvas rendering.
 *
 * Algorithm:
 * 1. Get domain count N from domainSlot
 * 2. Get CameraEval from cameraEvalSlot (contains view-projection matrix)
 * 3. Materialize 3D position field (N * vec3)
 * 4. For each element:
 *    - Transform position through view-projection matrix
 *    - Apply perspective divide (clip space → NDC)
 *    - Convert NDC to screen coordinates
 *    - Check culling (frustum, behind camera)
 *    - Store in 2D output buffers
 * 5. Optional: z-sort by depth
 * 6. Populate Instance2DBufferRef and StepPerfCounters
 *
 * Math conventions:
 * - All math is float32 (Math.fround)
 * - Deterministic projection (same inputs → same outputs)
 * - NDC range: [-1, 1] (OpenGL convention)
 * - Screen origin: center, Y-axis down
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md §7.2
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md §3
 */

import type { ValueSlot } from "../../../compiler/ir/types";
import type {
  Instance2DBufferRef,
  StepPerfCounters,
} from "../../../compiler/ir/types3d";
import type { ValueStore } from "../../../compiler/ir/stores";
import type { CameraEvalHandle } from "./executeCameraEval";

// =============================================================================
// Step Definition
// =============================================================================

/**
 * Culling mode for frustum culling
 */
export type CullMode = "none" | "frustum";

/**
 * Clipping mode for out-of-bounds elements
 */
export type ClipMode = "discard" | "clamp";

/**
 * Size interpretation mode
 */
export type SizeSpace = "px" | "world";

/**
 * Instances3D Project to 2D Step
 *
 * Projects 3D instances through camera to 2D for canvas rendering.
 */
export interface StepInstances3DProjectTo2D {
  kind: "Instances3DProjectTo2D";

  /** Step identifier */
  id: string;

  // Required inputs
  /** Domain slot (provides element count) */
  domainSlot: ValueSlot;

  /** CameraEval slot (from CameraStore via executeCameraEval) */
  cameraEvalSlot: ValueSlot;

  /** Field<vec3> - 3D positions */
  positionSlot: ValueSlot;

  // Optional 3D inputs
  /** Field<quat> - 3D rotations (null for billboard) */
  rotationSlot?: ValueSlot;

  /** Field<number> or Field<vec3> - scales */
  scaleSlot?: ValueSlot;

  // Style inputs (pass through to 2D)
  /** Field<number> - red channel 0-1 */
  colorRSlot: ValueSlot;

  /** Field<number> - green channel 0-1 */
  colorGSlot: ValueSlot;

  /** Field<number> - blue channel 0-1 */
  colorBSlot: ValueSlot;

  /** Field<number> - alpha channel 0-1 */
  colorASlot: ValueSlot;

  /** Field<number> - size in output */
  radiusSlot: ValueSlot;

  // Projection options
  /** Whether to sort by depth */
  zSort: boolean;

  /** Frustum culling mode */
  cullMode: CullMode;

  /** Clipping mode for out-of-bounds */
  clipMode: ClipMode;

  /** Size interpretation */
  sizeSpace: SizeSpace;

  // Output
  /** Output slot for Instance2DBufferRef */
  outSlot: ValueSlot;
}

// =============================================================================
// Viewport Info
// =============================================================================

/**
 * Viewport information for NDC→screen conversion
 */
export interface ViewportInfo {
  width: number;
  height: number;
  dpr: number;
}

// =============================================================================
// Domain Handle (from ValueStore)
// =============================================================================

/**
 * Domain handle stored in ValueStore
 */
interface DomainHandle {
  kind: "domain";
  count: number;
  elementIds?: readonly string[];
}

function isDomainHandle(value: unknown): value is DomainHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "domain" && typeof v.count === "number";
}

// =============================================================================
// Buffer Handle (from ValueStore)
// =============================================================================

/**
 * Buffer handle from materialization
 */
interface BufferHandle {
  kind: "buffer";
  data: ArrayBufferView;
}

function isBufferHandle(value: unknown): value is BufferHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "buffer" && v.data instanceof Object;
}

function isCameraEvalHandle(value: unknown): value is CameraEvalHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "cameraEval";
}

// =============================================================================
// Projection Math (Float32)
// =============================================================================

/**
 * Project a 3D point through view-projection matrix
 *
 * @param pos - 3D position {x, y, z}
 * @param viewProj - View-projection matrix (Float32Array, length 16, column-major)
 * @returns Clip space coordinates {x, y, z, w}
 */
function projectPoint(
  pos: { x: number; y: number; z: number },
  viewProj: Float32Array
): { x: number; y: number; z: number; w: number } {
  // Convert position to float32
  const px = Math.fround(pos.x);
  const py = Math.fround(pos.y);
  const pz = Math.fround(pos.z);

  // Column-major matrix multiply: result = M * vec4(px, py, pz, 1)
  const x = Math.fround(
    Math.fround(viewProj[0] * px) +
      Math.fround(viewProj[4] * py) +
      Math.fround(viewProj[8] * pz) +
      viewProj[12]
  );

  const y = Math.fround(
    Math.fround(viewProj[1] * px) +
      Math.fround(viewProj[5] * py) +
      Math.fround(viewProj[9] * pz) +
      viewProj[13]
  );

  const z = Math.fround(
    Math.fround(viewProj[2] * px) +
      Math.fround(viewProj[6] * py) +
      Math.fround(viewProj[10] * pz) +
      viewProj[14]
  );

  const w = Math.fround(
    Math.fround(viewProj[3] * px) +
      Math.fround(viewProj[7] * py) +
      Math.fround(viewProj[11] * pz) +
      viewProj[15]
  );

  return { x, y, z, w };
}

/**
 * Convert clip space to NDC (perspective divide)
 *
 * @param clip - Clip space coordinates {x, y, z, w}
 * @returns NDC coordinates {ndcX, ndcY, depth, behind}
 */
function clipToNDC(clip: {
  x: number;
  y: number;
  z: number;
  w: number;
}): { ndcX: number; ndcY: number; depth: number; behind: boolean } {
  // Behind camera check (w <= 0)
  if (clip.w <= 0) {
    return { ndcX: 0, ndcY: 0, depth: 0, behind: true };
  }

  // Perspective divide
  const ndcX = Math.fround(clip.x / clip.w);
  const ndcY = Math.fround(clip.y / clip.w);
  const depth = Math.fround(clip.z / clip.w);

  return { ndcX, ndcY, depth, behind: false };
}

/**
 * Convert NDC to screen coordinates
 *
 * @param ndc - Normalized device coordinates {ndcX, ndcY} in [-1, 1]
 * @param viewport - Viewport dimensions {width, height}
 * @returns Screen coordinates {screenX, screenY} with origin at center, Y down
 */
function ndcToScreen(
  ndc: { ndcX: number; ndcY: number },
  viewport: { width: number; height: number }
): { screenX: number; screenY: number } {
  // NDC [-1, 1] → screen [0, width/height]
  // Origin at center, Y-axis down
  const screenX = Math.fround((ndc.ndcX * 0.5 + 0.5) * viewport.width);
  const screenY = Math.fround((0.5 - ndc.ndcY * 0.5) * viewport.height);

  return { screenX, screenY };
}

// =============================================================================
// Instance Data Structure
// =============================================================================

/**
 * Instance data for projection and sorting
 */
interface InstanceData {
  /** Element index */
  index: number;

  /** Screen X */
  x: number;

  /** Screen Y */
  y: number;

  /** Depth (for sorting) */
  z: number;

  /** Red (0-255) */
  r: number;

  /** Green (0-255) */
  g: number;

  /** Blue (0-255) */
  b: number;

  /** Alpha (0-255) */
  a: number;

  /** Size */
  size: number;

  /** Alive (0 or 1) */
  alive: number;
}

// =============================================================================
// Execute Instances3D Project
// =============================================================================

/**
 * Execute Instances3D project to 2D step
 *
 * @param step - Step definition
 * @param valueStore - Value store for reading/writing slots
 * @param viewport - Viewport info for screen mapping
 * @returns Performance counters
 */
export function executeInstances3DProject(
  step: StepInstances3DProjectTo2D,
  valueStore: ValueStore,
  viewport: ViewportInfo
): StepPerfCounters {
  const startTime = performance.now();

  // Performance counters
  let instancesIn = 0;
  let instancesOut = 0;
  let culled = 0;
  let clipped = 0;
  let nanCount = 0;
  let infCount = 0;

  // 1. Get domain count
  const domainValue = valueStore.read(step.domainSlot);
  if (!isDomainHandle(domainValue)) {
    throw new Error(
      `executeInstances3DProject: domainSlot must contain DomainHandle, got ${typeof domainValue}`
    );
  }
  const count = domainValue.count;
  instancesIn = count;

  // Early exit for empty domain
  if (count === 0) {
    const emptyBuffer = allocateInstance2DBuffer(0);
    valueStore.write(step.outSlot, emptyBuffer);
    return {
      stepId: step.id,
      cpuMs: performance.now() - startTime,
      cacheHit: false,
      bytesWritten: 0,
      buffersReused: 0,
      instancesIn: 0,
      instancesOut: 0,
      culled: 0,
      clipped: 0,
      nanCount: 0,
      infCount: 0,
    };
  }

  // 2. Get CameraEval
  const cameraValue = valueStore.read(step.cameraEvalSlot);
  if (!isCameraEvalHandle(cameraValue)) {
    throw new Error(
      `executeInstances3DProject: cameraEvalSlot must contain CameraEvalHandle`
    );
  }
  const viewProj = cameraValue.viewProjMat4;

  // 3. Materialize position field (vec3 = 3 floats per element)
  const positionValue = valueStore.read(step.positionSlot);
  if (!isBufferHandle(positionValue)) {
    throw new Error(
      `executeInstances3DProject: positionSlot must contain BufferHandle (materialized field)`
    );
  }
  const positionData = positionValue.data;
  if (!(positionData instanceof Float32Array)) {
    throw new Error(
      `executeInstances3DProject: position buffer must be Float32Array`
    );
  }
  if (positionData.length !== count * 3) {
    throw new Error(
      `executeInstances3DProject: position buffer length mismatch (expected ${count * 3}, got ${positionData.length})`
    );
  }

  // 4. Materialize color channels (each is a single float per element)
  const colorR = readChannelBuffer(valueStore, step.colorRSlot, count, "colorR");
  const colorG = readChannelBuffer(valueStore, step.colorGSlot, count, "colorG");
  const colorB = readChannelBuffer(valueStore, step.colorBSlot, count, "colorB");
  const colorA = readChannelBuffer(valueStore, step.colorASlot, count, "colorA");

  // 5. Materialize radius (size)
  const radius = readChannelBuffer(valueStore, step.radiusSlot, count, "radius");

  // 6. Project all instances
  const instances: InstanceData[] = [];

  for (let i = 0; i < count; i++) {
    // Get 3D position
    const px = positionData[i * 3];
    const py = positionData[i * 3 + 1];
    const pz = positionData[i * 3 + 2];

    // Check for NaN/Inf in position
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      if (Number.isNaN(px) || Number.isNaN(py) || Number.isNaN(pz)) {
        nanCount++;
      } else {
        infCount++;
      }
      culled++;
      continue; // Skip this instance
    }

    // Project to clip space
    const clip = projectPoint({ x: px, y: py, z: pz }, viewProj);

    // Convert to NDC
    const ndc = clipToNDC(clip);

    // Check if behind camera
    if (ndc.behind) {
      culled++;
      continue;
    }

    // Frustum culling (NDC bounds check)
    if (step.cullMode === "frustum") {
      if (
        ndc.ndcX < -1 ||
        ndc.ndcX > 1 ||
        ndc.ndcY < -1 ||
        ndc.ndcY > 1 ||
        ndc.depth < -1 ||
        ndc.depth > 1
      ) {
        culled++;
        continue;
      }
    }

    // Convert to screen coordinates
    const screen = ndcToScreen(ndc, viewport);

    // Clipping mode
    let alive = 1;
    if (step.clipMode === "discard") {
      // Discard if outside viewport (even if cullMode is 'none')
      if (
        screen.screenX < 0 ||
        screen.screenX > viewport.width ||
        screen.screenY < 0 ||
        screen.screenY > viewport.height
      ) {
        clipped++;
        alive = 0;
      }
    } else if (step.clipMode === "clamp") {
      // Clamp to viewport bounds
      screen.screenX = Math.max(0, Math.min(viewport.width, screen.screenX));
      screen.screenY = Math.max(0, Math.min(viewport.height, screen.screenY));
    }

    // Get color and size
    const r = Math.max(0, Math.min(255, Math.round(colorR[i] * 255)));
    const g = Math.max(0, Math.min(255, Math.round(colorG[i] * 255)));
    const b = Math.max(0, Math.min(255, Math.round(colorB[i] * 255)));
    const a = Math.max(0, Math.min(255, Math.round(colorA[i] * 255)));
    const size = radius[i];

    // Store instance data
    instances.push({
      index: i,
      x: screen.screenX,
      y: screen.screenY,
      z: ndc.depth,
      r,
      g,
      b,
      a,
      size,
      alive,
    });

    if (alive === 1) {
      instancesOut++;
    }
  }

  // 7. Optional z-sorting (stable sort by depth, then element index)
  if (step.zSort && instances.length > 0) {
    instances.sort((a, b) => {
      // Sort by depth (far to near for painter's algorithm)
      if (a.z !== b.z) {
        return a.z - b.z; // Ascending depth
      }
      // Stable tie-break by element index
      return a.index - b.index;
    });
  }

  // 8. Allocate and populate Instance2DBufferRef
  const outputCount = instances.length;
  const buffer = allocateInstance2DBuffer(outputCount);

  for (let i = 0; i < outputCount; i++) {
    const inst = instances[i];
    buffer.x[i] = inst.x;
    buffer.y[i] = inst.y;
    buffer.r[i] = inst.r;
    buffer.g[i] = inst.g;
    buffer.b[i] = inst.b;
    buffer.a[i] = inst.a;
    if (buffer.s) buffer.s[i] = inst.size;
    if (buffer.z) buffer.z[i] = inst.z;
    if (buffer.alive) buffer.alive[i] = inst.alive;
  }

  // 9. Write output to slot
  valueStore.write(step.outSlot, buffer);

  // 10. Calculate bytes written
  const bytesWritten =
    buffer.x.byteLength +
    buffer.y.byteLength +
    buffer.r.byteLength +
    buffer.g.byteLength +
    buffer.b.byteLength +
    buffer.a.byteLength +
    (buffer.s?.byteLength ?? 0) +
    (buffer.z?.byteLength ?? 0) +
    (buffer.alive?.byteLength ?? 0);

  return {
    stepId: step.id,
    cpuMs: performance.now() - startTime,
    cacheHit: false,
    bytesWritten,
    buffersReused: 0,
    instancesIn,
    instancesOut,
    culled,
    clipped,
    nanCount,
    infCount,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Read a channel buffer (Field<number>) from a slot
 */
function readChannelBuffer(
  valueStore: ValueStore,
  slot: ValueSlot,
  expectedCount: number,
  channelName: string
): Float32Array {
  const value = valueStore.read(slot);
  if (!isBufferHandle(value)) {
    throw new Error(
      `executeInstances3DProject: ${channelName} slot must contain BufferHandle`
    );
  }
  const data = value.data;
  if (!(data instanceof Float32Array)) {
    throw new Error(
      `executeInstances3DProject: ${channelName} buffer must be Float32Array`
    );
  }
  if (data.length !== expectedCount) {
    throw new Error(
      `executeInstances3DProject: ${channelName} buffer length mismatch (expected ${expectedCount}, got ${data.length})`
    );
  }
  return data;
}

/**
 * Allocate Instance2DBufferRef with all required arrays
 */
function allocateInstance2DBuffer(count: number): Instance2DBufferRef {
  return {
    x: new Float32Array(count),
    y: new Float32Array(count),
    r: new Uint8Array(count),
    g: new Uint8Array(count),
    b: new Uint8Array(count),
    a: new Uint8Array(count),
    s: new Float32Array(count),
    z: new Float32Array(count),
    alive: new Uint8Array(count),
  };
}
