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

/**
 * Instance2D batch descriptor - describes how to assemble an Instances2D pass
 * Stored in ValueStore at instance2dListSlot
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
 * Instance2D batch list - stored in ValueStore
 */
interface Instance2DBatchList {
  batches: Instance2DBatchDescriptor[];
}

/**
 * Path batch descriptor - describes how to assemble a Paths2D pass
 */
interface PathBatchDescriptor {
  kind: "path";
  cmdsSlot: number;
  paramsSlot: number;
}

/**
 * Path batch list - stored in ValueStore
 */
interface PathBatchList {
  batches: PathBatchDescriptor[];
}

/**
 * Simplified Instances2D batch for renderer consumption
 * (Matches design-docs/13-Renderer/11-FINAL-INTEGRATION.md §C1)
 */
interface Instances2DBatchIR {
  count: number;
  x: Float32Array;
  y: Float32Array;
  radius: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Float32Array;
}

/**
 * Simplified Paths2D batch for renderer consumption
 */
interface Paths2DBatchIR {
  cmds: Uint16Array;
  params: Float32Array;
}

/**
 * Render pass types for the simplified renderer format
 */
type SimpleRenderPassIR =
  | { kind: "instances2d"; batch: Instances2DBatchIR }
  | { kind: "paths2d"; batch: Paths2DBatchIR };

/**
 * Simplified RenderFrameIR for Canvas2D renderer
 * (Matches design-docs/13-Renderer/11-FINAL-INTEGRATION.md §C1)
 */
interface SimpleRenderFrameIR {
  version: 1;
  clear: { r: number; g: number; b: number; a: number } | { mode: "none" };
  passes: SimpleRenderPassIR[];
  perf?: {
    instances2d: number;
    pathCmds: number;
  };
}

/**
 * Type guard for Instance2D batch list
 */
function isInstance2DBatchList(value: unknown): value is Instance2DBatchList {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.batches);
}

/**
 * Type guard for Path batch list
 */
function isPathBatchList(value: unknown): value is PathBatchList {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.batches);
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
  const passes: SimpleRenderPassIR[] = [];

  // 1. Try to read Instance2D batch list
  try {
    const instanceList = runtime.values.read(step.instance2dListSlot);

    if (isInstance2DBatchList(instanceList)) {
      for (const batch of instanceList.batches) {
        if (batch.kind === "instance2d") {
          // Read materialized buffers from ValueStore
          const x = runtime.values.read(batch.xSlot) as Float32Array;
          const y = runtime.values.read(batch.ySlot) as Float32Array;
          const radius = runtime.values.read(batch.radiusSlot) as Float32Array;
          const r = runtime.values.read(batch.rSlot) as Float32Array;
          const g = runtime.values.read(batch.gSlot) as Float32Array;
          const b = runtime.values.read(batch.bSlot) as Float32Array;
          const a = runtime.values.read(batch.aSlot) as Float32Array;

          // Determine count from buffer length (use the shortest buffer to be safe)
          const count = Math.min(
            x.length,
            y.length,
            radius.length,
            r.length,
            g.length,
            b.length,
            a.length
          );

          passes.push({
            kind: "instances2d",
            batch: { count, x, y, radius, r, g, b, a },
          });
        }
      }
    }
  } catch (_error) {
    // Slot not initialized - no instance2d batches
  }

  // 2. Try to read Path batch list
  try {
    const pathList = runtime.values.read(step.pathBatchListSlot);

    if (isPathBatchList(pathList)) {
      for (const batch of pathList.batches) {
        if (batch.kind === "path") {
          // Read materialized buffers
          const cmds = runtime.values.read(batch.cmdsSlot) as Uint16Array;
          const params = runtime.values.read(batch.paramsSlot) as Float32Array;

          passes.push({
            kind: "paths2d",
            batch: { cmds, params },
          });
        }
      }
    }
  } catch (_error) {
    // Slot not initialized - no path batches
  }

  // 3. Calculate performance counters
  let instances2dCount = 0;
  let pathCmdsCount = 0;
  for (const pass of passes) {
    if (pass.kind === "instances2d") {
      instances2dCount += pass.batch.count;
    } else if (pass.kind === "paths2d") {
      pathCmdsCount += pass.batch.cmds.length;
    }
  }

  // 4. Create RenderFrameIR
  const frame: SimpleRenderFrameIR = {
    version: 1,
    clear: { mode: "none" },
    passes,
    perf: {
      instances2d: instances2dCount,
      pathCmds: pathCmdsCount,
    },
  };

  // 5. Write to output slot
  runtime.values.write(step.outFrameSlot, frame);
}
