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
import type {
  RenderFrameIR,
  Instances2DPassIR,
  Paths2DPassIR,
} from "../../../compiler/ir/renderIR";
import type { RuntimeState } from "../RuntimeState";
import { assembleInstanceBuffers } from "../assembleInstanceBuffers";

/**
 * Instance2D batch descriptor - describes how to assemble an Instances2D pass
 * Stored in ValueStore at instance2dListSlot
 */
interface Instance2DBatchDescriptor {
  kind: "instance2d";
  count: number;
  domainSlot: number;
  posXYSlot: number;
  sizeSlot: number;
  colorRGBASlot: number;
  opacitySlot: number;
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
  count: number;
  domainSlot: number;
  cmdsSlot: number;
  paramsSlot: number;
  cmdStartSlot: number;
  cmdLenSlot: number;
  pointStartSlot: number;
  pointLenSlot: number;
  fillColorSlot?: number;
  strokeColorSlot?: number;
  strokeWidthSlot?: number;
  opacitySlot?: number;
  draw: { stroke: boolean; fill: boolean };
  fillRule?: "nonzero" | "evenodd";
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  miterLimit?: number;
  dash?: { pattern: number[]; offset?: number } | null;
}

/**
 * Path batch list - stored in ValueStore
 */
interface PathBatchList {
  batches: PathBatchDescriptor[];
}

interface DomainHandle {
  kind: "domain";
  count: number;
  elementIds?: readonly string[];
}

function isInstance2DBatchList(value: unknown): value is Instance2DBatchList {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.batches);
}

function isPathBatchList(value: unknown): value is PathBatchList {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.batches);
}

function isDomainHandle(value: unknown): value is DomainHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.kind === "domain" && typeof v.count === "number";
}

function buildInstancesPass(
  batch: Instance2DBatchDescriptor,
  runtime: RuntimeState,
): Instances2DPassIR {
  let count = batch.count;
  if (count <= 0) {
    const domainValue = runtime.values.read(batch.domainSlot);
    if (isDomainHandle(domainValue)) {
      count = domainValue.count;
    }
  }

  return {
    kind: "instances2d",
    header: {
      id: `instances2d-${batch.domainSlot}`,
      z: 0,
      enabled: true,
    },
    count,
    material: {
      kind: "shape2d",
      shading: "flat",
      colorSpace: "srgb",
    },
    buffers: {
      ...assembleInstanceBuffers(
        {
          count,
          posXY: batch.posXYSlot,
          size: batch.sizeSlot,
          colorRGBA: batch.colorRGBASlot,
          opacity: batch.opacitySlot,
        },
        runtime,
      ),
      shapeId: { kind: "scalar:u16", value: 0 },
    },
  };
}

function buildPathsPass(
  batch: PathBatchDescriptor,
  runtime: RuntimeState,
): Paths2DPassIR {
  let count = batch.count;
  if (count <= 0) {
    const domainValue = runtime.values.read(batch.domainSlot);
    if (isDomainHandle(domainValue)) {
      count = domainValue.count;
    }
  }

  const commands = runtime.values.read(batch.cmdsSlot);
  if (!(commands instanceof Uint16Array)) {
    throw new Error(
      `buildPathsPass: commands must be Uint16Array, got ${commands?.constructor.name}`
    );
  }

  const points = runtime.values.read(batch.paramsSlot);
  if (!(points instanceof Float32Array)) {
    throw new Error(
      `buildPathsPass: points must be Float32Array, got ${points?.constructor.name}`
    );
  }

  const cmdStart = runtime.values.read(batch.cmdStartSlot);
  const cmdLen = runtime.values.read(batch.cmdLenSlot);
  const pointStart = runtime.values.read(batch.pointStartSlot);
  const pointLen = runtime.values.read(batch.pointLenSlot);

  if (!(cmdStart instanceof Uint32Array)) {
    throw new Error(
      `buildPathsPass: cmdStart must be Uint32Array, got ${cmdStart?.constructor.name}`
    );
  }
  if (!(cmdLen instanceof Uint32Array)) {
    throw new Error(
      `buildPathsPass: cmdLen must be Uint32Array, got ${cmdLen?.constructor.name}`
    );
  }
  if (!(pointStart instanceof Uint32Array)) {
    throw new Error(
      `buildPathsPass: pointStart must be Uint32Array, got ${pointStart?.constructor.name}`
    );
  }
  if (!(pointLen instanceof Uint32Array)) {
    throw new Error(
      `buildPathsPass: pointLen must be Uint32Array, got ${pointLen?.constructor.name}`
    );
  }

  const geometry: Paths2DPassIR["geometry"] = {
    pathCount: count,
    pathCommandStart: { bufferId: batch.cmdStartSlot, type: "u32", length: cmdStart.length },
    pathCommandLen: { bufferId: batch.cmdLenSlot, type: "u32", length: cmdLen.length },
    pathPointStart: { bufferId: batch.pointStartSlot, type: "u32", length: pointStart.length },
    pathPointLen: { bufferId: batch.pointLenSlot, type: "u32", length: pointLen.length },
    commands: { bufferId: batch.cmdsSlot, type: "u16", length: commands.length },
    pointsXY: { bufferId: batch.paramsSlot, type: "f32", length: points.length },
    encoding: { kind: "v1", commands: ["M", "L", "Q", "C", "Z"] },
  };

  const style: Paths2DPassIR["style"] = {
    fillRule: batch.fillRule,
    lineCap: batch.lineCap,
    lineJoin: batch.lineJoin,
    miterLimit: batch.miterLimit,
    dash: batch.dash,
  };

  if (batch.fillColorSlot !== undefined) {
    const fillValue = runtime.values.read(batch.fillColorSlot);
    if (typeof fillValue === "number") {
      style.fillColorRGBA = { kind: "scalar:u32", value: fillValue };
    } else if (fillValue instanceof Uint8Array || fillValue instanceof Uint8ClampedArray) {
      style.fillColorRGBA = {
        bufferId: batch.fillColorSlot,
        type: "u8",
        length: fillValue.length,
      };
    } else {
      throw new Error(
        `buildPathsPass: fillColor must be number or Uint8Array, got ${fillValue?.constructor.name}`
      );
    }
  }

  if (batch.strokeColorSlot !== undefined) {
    const strokeValue = runtime.values.read(batch.strokeColorSlot);
    if (typeof strokeValue === "number") {
      style.strokeColorRGBA = { kind: "scalar:u32", value: strokeValue };
    } else if (strokeValue instanceof Uint8Array || strokeValue instanceof Uint8ClampedArray) {
      style.strokeColorRGBA = {
        bufferId: batch.strokeColorSlot,
        type: "u8",
        length: strokeValue.length,
      };
    } else {
      throw new Error(
        `buildPathsPass: strokeColor must be number or Uint8Array, got ${strokeValue?.constructor.name}`
      );
    }
  }

  if (batch.strokeWidthSlot !== undefined) {
    const widthValue = runtime.values.read(batch.strokeWidthSlot);
    if (typeof widthValue === "number") {
      style.strokeWidth = { kind: "scalar:f32", value: widthValue };
    } else if (widthValue instanceof Float32Array) {
      style.strokeWidth = {
        bufferId: batch.strokeWidthSlot,
        type: "f32",
        length: widthValue.length,
      };
    } else {
      throw new Error(
        `buildPathsPass: strokeWidth must be number or Float32Array, got ${widthValue?.constructor.name}`
      );
    }
  }

  if (batch.opacitySlot !== undefined) {
    const opacityValue = runtime.values.read(batch.opacitySlot);
    if (typeof opacityValue === "number") {
      style.opacity = { kind: "scalar:f32", value: opacityValue };
    } else if (opacityValue instanceof Float32Array) {
      style.opacity = {
        bufferId: batch.opacitySlot,
        type: "f32",
        length: opacityValue.length,
      };
    } else {
      throw new Error(
        `buildPathsPass: opacity must be number or Float32Array, got ${opacityValue?.constructor.name}`
      );
    }
  }

  return {
    kind: "paths2d",
    header: {
      id: `paths2d-${batch.domainSlot}`,
      z: 0,
      enabled: true,
    },
    geometry,
    style,
    draw: batch.draw,
  };
}

/**
 * Execute RenderAssemble step.
 *
 * Assembles final RenderFrameIR from batch descriptors and materialized buffers.
 *
 * Per design-docs/13-Renderer/12-ValueSlotPerNodeOutput.md:
 * - Batches are now compile-time config embedded in the step (preferred path)
 * - Legacy: fall back to reading batch lists from slots (deprecated)
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

  // 1. Process Instance2D batches
  // Prefer embedded config (new path), fallback to slots (legacy/deprecated)
  if (step.instance2dBatches !== undefined && step.instance2dBatches.length > 0) {
    for (const batch of step.instance2dBatches) {
      passes.push(buildInstancesPass(batch, runtime));
    }
  } else if (step.instance2dListSlot !== undefined) {
    try {
      const instanceList = runtime.values.read(step.instance2dListSlot);

      if (isInstance2DBatchList(instanceList)) {
        for (const batch of instanceList.batches) {
          if (batch.kind === "instance2d") {
            passes.push(buildInstancesPass(batch, runtime));
          }
        }
      }
    } catch (_error) {
      // Slot not initialized - no instance2d batches
    }
  }

  // 2. Process Path batches
  // Prefer embedded config (new path), fallback to slots (legacy/deprecated)
  if (step.pathBatches !== undefined && step.pathBatches.length > 0) {
    for (const batch of step.pathBatches) {
      passes.push(buildPathsPass(batch, runtime));
    }
  } else if (step.pathBatchListSlot !== undefined) {
    try {
      const pathList = runtime.values.read(step.pathBatchListSlot);

      if (isPathBatchList(pathList)) {
        for (const batch of pathList.batches) {
          if (batch.kind === "path") {
            passes.push(buildPathsPass(batch, runtime));
          }
        }
      }
    } catch (_error) {
      // Slot not initialized - no path batches
    }
  }

  // 3. Create RenderFrameIR with black background clear
  const frame: RenderFrameIR = {
    version: 1,
    clear: { mode: "color", colorRGBA: 0x000000FF }, // Black background
    passes,
  };

  // 4. Write to output slot
  runtime.values.write(step.outFrameSlot, frame);
}
