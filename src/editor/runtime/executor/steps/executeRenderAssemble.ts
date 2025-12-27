/**
 * Execute Render Assemble Step
 *
 * Assembles final RenderFrameIR from materialized buffers and batch descriptors.
 *
 * This step reads batch descriptor lists and produces the final RenderFrameIR
 * that the Canvas2D renderer consumes.
 *
 * Algorithm:
 * 1. Read Instance2DBatchList from instance2dListSlot
 * 2. Read PathBatchList from pathBatchListSlot
 * 3. Assemble RenderFrameIR with passes array
 * 4. Write RenderFrameIR to outFrameSlot
 *
 * References:
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §C2
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 5
 */

import type { StepRenderAssemble, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import type { RenderFrameIR, Instances2DPassIR, Paths2DPassIR } from "../../../compiler/ir/renderIR";

/**
 * Instance2D batch descriptor - describes how to assemble an Instances2D pass
 */
interface Instance2DBatchDescriptor {
  kind: "instance2d";
  count: number;
  xSlot: number;
  ySlot: number;
  radiusSlot: number;
  rSlot: number;
  gSlot: number;
  bSlot: number;
  aSlot: number;
}

/**
 * Path batch descriptor - describes how to assemble a Paths2D pass
 */
interface PathBatchDescriptor {
  kind: "path";
  count: number;
  cmdsSlot: number;
  paramsSlot: number;
  rSlot: number;
  gSlot: number;
  bSlot: number;
  aSlot: number;
}

/**
 * Type guard for Instance2D batch descriptor
 */
function isInstance2DBatch(value: unknown): value is Instance2DBatchDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "instance2d" && typeof v.count === "number";
}

/**
 * Type guard for Path batch descriptor
 */
function isPathBatch(value: unknown): value is PathBatchDescriptor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "path" && typeof v.count === "number";
}

/**
 * Execute RenderAssemble step.
 *
 * Assembles final RenderFrameIR from batch descriptors and materialized buffers.
 *
 * @param step - RenderAssemble step specification
 * @param _program - Compiled program (not used directly)
 * @param runtime - Runtime state containing ValueStore
 */
export function executeRenderAssemble(
  step: StepRenderAssemble,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  const passes: (Instances2DPassIR | Paths2DPassIR)[] = [];

  // 1. Try to read Instance2D batch list
  try {
    const instance2dList = runtime.values.read(step.instance2dListSlot);

    if (Array.isArray(instance2dList)) {
      for (const batch of instance2dList) {
        if (isInstance2DBatch(batch)) {
          // Read materialized buffers from ValueStore
          const x = runtime.values.read(batch.xSlot) as Float32Array;
          const y = runtime.values.read(batch.ySlot) as Float32Array;
          const radius = runtime.values.read(batch.radiusSlot) as Float32Array;
          const r = runtime.values.read(batch.rSlot) as Float32Array;
          const g = runtime.values.read(batch.gSlot) as Float32Array;
          const b = runtime.values.read(batch.bSlot) as Float32Array;
          const a = runtime.values.read(batch.aSlot) as Float32Array;

          // Assemble Instances2DPassIR
          const pass: Instances2DPassIR = {
            kind: "instances2d",
            header: {
              blendMode: "srcOver",
              sortOrder: 0,
            },
            buffers: {
              x: { kind: "f32", slot: batch.xSlot, offset: 0, stride: 1 },
              y: { kind: "f32", slot: batch.ySlot, offset: 0, stride: 1 },
              radius: { kind: "f32", slot: batch.radiusSlot, offset: 0, stride: 1 },
              r: { kind: "f32", slot: batch.rSlot, offset: 0, stride: 1 },
              g: { kind: "f32", slot: batch.gSlot, offset: 0, stride: 1 },
              b: { kind: "f32", slot: batch.bSlot, offset: 0, stride: 1 },
              a: { kind: "f32", slot: batch.aSlot, offset: 0, stride: 1 },
            },
            material: {
              shape: "circle",
            },
            instanceCount: batch.count,
            // Store actual buffer data for renderer access
            _bufferData: { x, y, radius, r, g, b, a },
          };

          passes.push(pass);
        }
      }
    }
  } catch (_error) {
    // Slot not initialized - no instance2d batches
  }

  // 2. Try to read Path batch list
  try {
    const pathList = runtime.values.read(step.pathBatchListSlot);

    if (Array.isArray(pathList)) {
      for (const batch of pathList) {
        if (isPathBatch(batch)) {
          // Read materialized buffers
          const cmds = runtime.values.read(batch.cmdsSlot) as Uint16Array;
          const params = runtime.values.read(batch.paramsSlot) as Float32Array;
          const r = runtime.values.read(batch.rSlot) as Float32Array;
          const g = runtime.values.read(batch.gSlot) as Float32Array;
          const b = runtime.values.read(batch.bSlot) as Float32Array;
          const a = runtime.values.read(batch.aSlot) as Float32Array;

          // Assemble Paths2DPassIR
          const pass: Paths2DPassIR = {
            kind: "paths2d",
            header: {
              blendMode: "srcOver",
              sortOrder: 0,
            },
            geometry: {
              commands: { kind: "u16", slot: batch.cmdsSlot, offset: 0, stride: 1 },
              params: { kind: "f32", slot: batch.paramsSlot, offset: 0, stride: 1 },
              pathCount: batch.count,
              pathOffsets: { kind: "u32", slot: 0, offset: 0, stride: 1 },
            },
            style: {
              fill: {
                r: { kind: "f32", slot: batch.rSlot, offset: 0, stride: 1 },
                g: { kind: "f32", slot: batch.gSlot, offset: 0, stride: 1 },
                b: { kind: "f32", slot: batch.bSlot, offset: 0, stride: 1 },
                a: { kind: "f32", slot: batch.aSlot, offset: 0, stride: 1 },
              },
            },
            pathCount: batch.count,
            // Store actual buffer data for renderer access
            _bufferData: { cmds, params, r, g, b, a },
          };

          passes.push(pass);
        }
      }
    }
  } catch (_error) {
    // Slot not initialized - no path batches
  }

  // 3. Create RenderFrameIR
  const frame: RenderFrameIR = {
    version: 1,
    clear: {
      mode: "none",
    },
    passes,
  };

  // 4. Write to output slot
  runtime.values.write(step.outFrameSlot, frame);
}
