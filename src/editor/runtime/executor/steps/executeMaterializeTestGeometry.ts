/**
 * Execute MaterializeTestGeometry Step
 *
 * TEMPORARY executor that creates test geometry data for circles.
 * This is a placeholder until we implement full field materialization.
 *
 * Algorithm:
 * 1. Read domain handle from domainSlot to get instance count
 * 2. Create test positions in a grid pattern centered on screen
 * 3. Create test radius values (fixed radius)
 * 4. Write x, y, radius Float32Array buffers to ValueStore
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md (temporary measure)
 */

import type { StepMaterializeTestGeometry, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Domain handle representation
 */
interface DomainHandle {
  kind: "domain";
  count: number;
  ids?: Uint32Array;
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
 * Execute MaterializeTestGeometry step.
 *
 * Creates test data for circle positions and radius.
 * Uses a simple grid layout centered on the viewport.
 *
 * @param step - MaterializeTestGeometry step specification
 * @param _program - Compiled program (not used)
 * @param runtime - Runtime state containing ValueStore
 *
 * @throws Error if domainSlot contains invalid domain
 */
export function executeMaterializeTestGeometry(
  step: StepMaterializeTestGeometry,
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
      `executeMaterializeTestGeometry: domainSlot contains invalid value. ` +
        `Expected Domain handle or count, got: ${typeof domainValue}`
    );
  }

  // 2. Allocate 3 Float32Array buffers for x, y, radius
  const xBuffer = runtime.values.ensureF32(step.outXSlot, instanceCount);
  const yBuffer = runtime.values.ensureF32(step.outYSlot, instanceCount);
  const radiusBuffer = runtime.values.ensureF32(step.outRadiusSlot, instanceCount);

  // 3. Generate test data
  // Create a grid layout that works well for various counts
  const gridSize = Math.ceil(Math.sqrt(instanceCount));
  const spacing = 60; // pixels between circles
  const baseRadius = 15; // base radius in pixels

  // Center the grid on the viewport (assume 800x600 canvas)
  const viewportW = 800;
  const viewportH = 600;
  const gridW = (gridSize - 1) * spacing;
  const gridH = (gridSize - 1) * spacing;
  const offsetX = (viewportW - gridW) / 2;
  const offsetY = (viewportH - gridH) / 2;

  for (let i = 0; i < instanceCount; i++) {
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;

    xBuffer[i] = offsetX + col * spacing;
    yBuffer[i] = offsetY + row * spacing;
    radiusBuffer[i] = baseRadius;
  }

  // 4. Performance logging (debug mode)
  const cpuMs = performance.now() - startTime;
  if (cpuMs > 1.0) {
    console.debug(
      `MaterializeTestGeometry: ${cpuMs.toFixed(2)}ms for ${instanceCount} instances, ` +
        `${instanceCount * 3 * 4} bytes (3 x Float32Array[${instanceCount}])`
    );
  }
}
