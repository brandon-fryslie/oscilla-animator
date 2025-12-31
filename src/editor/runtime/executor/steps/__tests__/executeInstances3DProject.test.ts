/**
 * Tests for executeInstances3DProject
 *
 * Test coverage:
 * - Basic projection (identity camera)
 * - Offset camera projection
 * - Frustum culling (behind camera, outside bounds)
 * - Depth sorting
 * - NaN/Inf handling
 * - Performance counter accuracy
 * - Empty domain handling
 */

<<<<<<< HEAD
import { asTypeDesc } from "../../../../compiler/ir/types";
=======
import { asTypeDesc } from "../../../compiler/ir/types";
<<<<<<< HEAD
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
import { describe, it, expect, beforeEach } from "vitest";
import {
  executeInstances3DProject,
  type StepInstances3DProjectTo2D,
  type ViewportInfo,
} from "../executeInstances3DProject";
import { createRuntimeState } from "../../RuntimeState";
import type { RuntimeState } from "../../RuntimeState";
import type { CompiledProgramIR } from "../../../../compiler/ir";
import type { SlotMeta } from "../../../../compiler/ir/stores";
import type { CameraEvalHandle } from "../executeCameraEval";
import type { Instance2DBufferRef } from "../../../../compiler/ir/types3d";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create identity view-projection matrix (no transformation)
 */
function createIdentityViewProj(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/**
 * Create simple perspective projection matrix
 * Near=0.1, Far=100, FOV~90deg, aspect=1
 */
function createPerspectiveViewProj(): Float32Array {
  const near = 0.1;
  const far = 100;
  const f = 1 / Math.tan(Math.PI / 4); // 45-degree half-angle

  return new Float32Array([
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, -(far + near) / (far - near), -1,
    0, 0, -(2 * far * near) / (far - near), 0,
  ]);
}

/**
 * Create domain handle
 */
function createDomain(count: number): { kind: "domain"; count: number } {
  return { kind: "domain" as const, count };
}

/**
 * Create buffer handle
 */
function createBufferHandle(data: ArrayBufferView): { kind: "buffer"; data: ArrayBufferView } {
  return { kind: "buffer" as const, data };
}

/**
 * Create camera eval handle
 */
function createCameraEval(viewProjMat4: Float32Array): CameraEvalHandle {
  return {
    kind: "cameraEval" as const,
    cameraId: "test-camera",
    viewMat4: new Float32Array(16),
    projMat4: new Float32Array(16),
    viewProjMat4,
    viewportKey: { w: 800, h: 600, dpr: 1 },
  };
}

/**
 * Create default viewport
 */
function createViewport(): ViewportInfo {
  return { width: 800, height: 600, dpr: 1 };
}

/**
 * Create minimal program for RuntimeState with slots for testing
 */
function createMinimalProgram(): CompiledProgramIR {
  // Create slot metadata for slots 0-99 (all object storage for simplicity)
  const slotMeta: SlotMeta[] = Array.from({ length: 100 }, (_, i) => ({
    slot: i,
    storage: "object" as const,
    offset: i,
    type: asTypeDesc({ world: "config", domain: "unknown" }),
  }));

  return {
    schedule: { steps: [] },
    slotMeta,
  } as unknown as CompiledProgramIR;
}

// =============================================================================
// Basic Projection Tests
// =============================================================================

describe("executeInstances3DProject - basic projection", () => {
  let runtime: RuntimeState;

  beforeEach(() => {
    const program = createMinimalProgram();
    runtime = createRuntimeState(program);
  });

  it("projects single point at origin with identity camera", () => {
    const viewport = createViewport();

    // Setup domain
    runtime.values.write(0, createDomain(1));

    // Setup camera (identity)
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Setup position (origin)
    const positions = new Float32Array([0, 0, 0]);
    runtime.values.write(2, createBufferHandle(positions));

    // Setup colors (white)
    runtime.values.write(3, createBufferHandle(new Float32Array([1]))); // R
    runtime.values.write(4, createBufferHandle(new Float32Array([1]))); // G
    runtime.values.write(5, createBufferHandle(new Float32Array([1]))); // B
    runtime.values.write(6, createBufferHandle(new Float32Array([1]))); // A

    // Setup radius
    runtime.values.write(7, createBufferHandle(new Float32Array([10])));

    // Create step
    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    // Execute
    const perf = executeInstances3DProject(step, runtime.values, viewport);

    // Check performance counters
    expect(perf.instancesIn).toBe(1);
    expect(perf.instancesOut).toBe(1);
    expect(perf.culled).toBe(0);
    expect(perf.clipped).toBe(0);
    expect(perf.nanCount).toBe(0);
    expect(perf.infCount).toBe(0);

    // Check output buffer
    const output = runtime.values.read(10) as Instance2DBufferRef;
    expect(output).toBeDefined();
    expect(output.x.length).toBe(1);
    expect(output.y.length).toBe(1);

    // With identity transform and origin point, should project to center
    expect(output.x[0]).toBeCloseTo(viewport.width / 2, 1);
    expect(output.y[0]).toBeCloseTo(viewport.height / 2, 1);

    // Check color (white = 255,255,255,255)
    expect(output.r[0]).toBe(255);
    expect(output.g[0]).toBe(255);
    expect(output.b[0]).toBe(255);
    expect(output.a[0]).toBe(255);

    // Check size
    expect(output.s![0]).toBe(10);

    // Check alive
    expect(output.alive![0]).toBe(1);
  });

  it("projects multiple points", () => {
    const viewport = createViewport();

    // Setup domain (3 points)
    runtime.values.write(0, createDomain(3));

    // Setup camera
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Setup positions (3 points in a line along X)
    const positions = new Float32Array([
      -1, 0, 0, // Left
      0, 0, 0,  // Center
      1, 0, 0,  // Right
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    // Setup colors (red, green, blue)
    runtime.values.write(3, createBufferHandle(new Float32Array([1, 0, 0]))); // R
    runtime.values.write(4, createBufferHandle(new Float32Array([0, 1, 0]))); // G
    runtime.values.write(5, createBufferHandle(new Float32Array([0, 0, 1]))); // B
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1]))); // A

    // Setup radius
    runtime.values.write(7, createBufferHandle(new Float32Array([5, 10, 15])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    expect(perf.instancesIn).toBe(3);
    expect(perf.instancesOut).toBe(3);

    const output = runtime.values.read(10) as Instance2DBufferRef;
    expect(output.x.length).toBe(3);

    // Check colors
    expect(output.r[0]).toBe(255); // Red
    expect(output.g[1]).toBe(255); // Green
    expect(output.b[2]).toBe(255); // Blue

    // Check sizes
    expect(output.s![0]).toBe(5);
    expect(output.s![1]).toBe(10);
    expect(output.s![2]).toBe(15);
  });

  it("handles empty domain", () => {
    const viewport = createViewport();

    // Setup empty domain
    runtime.values.write(0, createDomain(0));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Setup empty buffers
    runtime.values.write(2, createBufferHandle(new Float32Array(0)));
    runtime.values.write(3, createBufferHandle(new Float32Array(0)));
    runtime.values.write(4, createBufferHandle(new Float32Array(0)));
    runtime.values.write(5, createBufferHandle(new Float32Array(0)));
    runtime.values.write(6, createBufferHandle(new Float32Array(0)));
    runtime.values.write(7, createBufferHandle(new Float32Array(0)));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    expect(perf.instancesIn).toBe(0);
    expect(perf.instancesOut).toBe(0);

    const output = runtime.values.read(10) as Instance2DBufferRef;
    expect(output.x.length).toBe(0);
  });
});

// =============================================================================
// Culling Tests
// =============================================================================

describe("executeInstances3DProject - culling", () => {
  let runtime: RuntimeState;

  beforeEach(() => {
    const program = createMinimalProgram();
    runtime = createRuntimeState(program);
  });

  it("culls points behind camera (w <= 0)", () => {
    const viewport = createViewport();

    // Setup domain (2 points: one in front, one behind)
    runtime.values.write(0, createDomain(2));

    // Setup camera with perspective
    runtime.values.write(1, createCameraEval(createPerspectiveViewProj()));

    // Positions: one at z=-1 (in front), one at z=1 (behind for -Z forward camera)
    const positions = new Float32Array([
      0, 0, -1,  // In front
      0, 0, 1,   // Behind
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    // Colors
    runtime.values.write(3, createBufferHandle(new Float32Array([1, 1])));
    runtime.values.write(4, createBufferHandle(new Float32Array([1, 1])));
    runtime.values.write(5, createBufferHandle(new Float32Array([1, 1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    // Should have culled the point behind camera
    expect(perf.instancesIn).toBe(2);
    expect(perf.instancesOut).toBe(1);
    expect(perf.culled).toBe(1);

    const output = runtime.values.read(10) as Instance2DBufferRef;
    expect(output.x.length).toBe(1);
  });

  it("culls points outside frustum with cullMode=frustum", () => {
    const viewport = createViewport();

    // Setup domain (3 points: center, way left, way right)
    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createPerspectiveViewProj()));

    // Positions: center and two far outside frustum
    const positions = new Float32Array([
      0, 0, -1,    // Center (visible)
      100, 0, -1,  // Far right (outside)
      -100, 0, -1, // Far left (outside)
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    runtime.values.write(3, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(4, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(5, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "frustum",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    // Should cull the two points outside frustum
    expect(perf.instancesIn).toBe(3);
    expect(perf.instancesOut).toBe(1);
    expect(perf.culled).toBe(2);
  });

  it("does not cull with cullMode=none", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // All points way outside (but not behind)
    const positions = new Float32Array([
      10, 0, -0.5,
      -10, 0, -0.5,
      0, 10, -0.5,
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    runtime.values.write(3, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(4, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(5, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    // With cullMode=none, should not cull based on frustum
    // But clipMode=discard will mark as not alive if outside viewport
    expect(perf.instancesIn).toBe(3);
    expect(perf.culled).toBe(0);
  });
});

// =============================================================================
// NaN/Inf Handling Tests
// =============================================================================

describe("executeInstances3DProject - NaN/Inf handling", () => {
  let runtime: RuntimeState;

  beforeEach(() => {
    const program = createMinimalProgram();
    runtime = createRuntimeState(program);
  });

  it("culls NaN positions and tracks count", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Positions with NaN
    const positions = new Float32Array([
      0, 0, 0,      // Valid
      NaN, 0, 0,    // NaN
      0, NaN, 0,    // NaN
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    runtime.values.write(3, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(4, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(5, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    expect(perf.instancesIn).toBe(3);
    expect(perf.instancesOut).toBe(1);
    expect(perf.nanCount).toBe(2);
    expect(perf.culled).toBe(2);
  });

  it("culls Inf positions and tracks count", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Positions with Infinity
    const positions = new Float32Array([
      0, 0, 0,          // Valid
      Infinity, 0, 0,   // Inf
      0, -Infinity, 0,  // -Inf
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    runtime.values.write(3, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(4, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(5, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    expect(perf.instancesIn).toBe(3);
    expect(perf.instancesOut).toBe(1);
    expect(perf.infCount).toBe(2);
    expect(perf.culled).toBe(2);
  });
});

// =============================================================================
// Depth Sorting Tests
// =============================================================================

describe("executeInstances3DProject - depth sorting", () => {
  let runtime: RuntimeState;

  beforeEach(() => {
    const program = createMinimalProgram();
    runtime = createRuntimeState(program);
  });

  it("sorts by depth when zSort=true", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Positions at different depths (Z)
    const positions = new Float32Array([
      0, 0, -3,  // Far (index 0)
      0, 0, -1,  // Near (index 1)
      0, 0, -2,  // Middle (index 2)
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    // Different colors to track order
    runtime.values.write(3, createBufferHandle(new Float32Array([1, 0, 0.5]))); // R
    runtime.values.write(4, createBufferHandle(new Float32Array([0, 1, 0.5]))); // G
    runtime.values.write(5, createBufferHandle(new Float32Array([0, 0, 1])));   // B
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: true, // Enable sorting
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    const perf = executeInstances3DProject(step, runtime.values, viewport);

    expect(perf.instancesOut).toBe(3);

    const output = runtime.values.read(10) as Instance2DBufferRef;

    // Check depth order (should be sorted far to near)
    expect(output.z![0]).toBeLessThan(output.z![1]);
    expect(output.z![1]).toBeLessThan(output.z![2]);

    // Verify colors match sorted order
    // Far (z=-3): red -> should be first
    // Middle (z=-2): gray -> should be second
    // Near (z=-1): green -> should be third
    expect(output.r[0]).toBe(255); // Far is red
    expect(output.g[2]).toBe(255); // Near is green
  });

  it("maintains element index order when zSort=false", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    // Random depth order
    const positions = new Float32Array([
      0, 0, -2,
      0, 0, -1,
      0, 0, -3,
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    runtime.values.write(3, createBufferHandle(new Float32Array([1, 0, 0.5])));
    runtime.values.write(4, createBufferHandle(new Float32Array([0, 1, 0.5])));
    runtime.values.write(5, createBufferHandle(new Float32Array([0, 0, 1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([1, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false, // No sorting
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    executeInstances3DProject(step, runtime.values, viewport);

    const output = runtime.values.read(10) as Instance2DBufferRef;

    // Should maintain original order
    expect(output.r[0]).toBe(255); // First is red
    expect(output.g[1]).toBe(255); // Second is green
    expect(output.b[2]).toBe(255); // Third is blue
  });
});

// =============================================================================
// Color Quantization Tests
// =============================================================================

describe("executeInstances3DProject - color quantization", () => {
  let runtime: RuntimeState;

  beforeEach(() => {
    const program = createMinimalProgram();
    runtime = createRuntimeState(program);
  });

  it("quantizes colors from 0-1 to 0-255", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(4));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    const positions = new Float32Array([
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
    ]);
    runtime.values.write(2, createBufferHandle(positions));

    // Test various color values
    runtime.values.write(3, createBufferHandle(new Float32Array([0, 0.5, 1, 0.25])));
    runtime.values.write(4, createBufferHandle(new Float32Array([0, 0.5, 1, 0.75])));
    runtime.values.write(5, createBufferHandle(new Float32Array([0, 0.5, 1, 0.1])));
    runtime.values.write(6, createBufferHandle(new Float32Array([0, 0.5, 1, 1])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    executeInstances3DProject(step, runtime.values, viewport);

    const output = runtime.values.read(10) as Instance2DBufferRef;

    // Check quantization
    expect(output.r[0]).toBe(0);      // 0 -> 0
    expect(output.r[1]).toBe(128);    // 0.5 -> 128 (rounded)
    expect(output.r[2]).toBe(255);    // 1 -> 255
    expect(output.r[3]).toBe(64);     // 0.25 -> 64 (rounded)
  });

  it("clamps color values to 0-255 range", () => {
    const viewport = createViewport();

    runtime.values.write(0, createDomain(3));
    runtime.values.write(1, createCameraEval(createIdentityViewProj()));

    const positions = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    runtime.values.write(2, createBufferHandle(positions));

    // Out of range values
    runtime.values.write(3, createBufferHandle(new Float32Array([-0.5, 1.5, 0.5])));
    runtime.values.write(4, createBufferHandle(new Float32Array([0.5, 0.5, 0.5])));
    runtime.values.write(5, createBufferHandle(new Float32Array([0.5, 0.5, 0.5])));
    runtime.values.write(6, createBufferHandle(new Float32Array([0.5, 0.5, 0.5])));
    runtime.values.write(7, createBufferHandle(new Float32Array([10, 10, 10])));

    const step: StepInstances3DProjectTo2D = {
      kind: "Instances3DProjectTo2D",
      id: "test-step",
      deps: [],
      domainSlot: 0,
      cameraEvalSlot: 1,
      positionSlot: 2,
      colorRSlot: 3,
      colorGSlot: 4,
      colorBSlot: 5,
      colorASlot: 6,
      radiusSlot: 7,
      zSort: false,
      cullMode: "none",
      clipMode: "discard",
      sizeSpace: "px",
      outSlot: 10,
    };

    executeInstances3DProject(step, runtime.values, viewport);

    const output = runtime.values.read(10) as Instance2DBufferRef;

    // Check clamping
    expect(output.r[0]).toBe(0);   // -0.5 clamped to 0
    expect(output.r[1]).toBe(255); // 1.5 clamped to 255
    expect(output.r[2]).toBe(128); // 0.5 -> 128 (normal)
  });
});
