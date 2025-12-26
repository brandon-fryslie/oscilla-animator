/**
 * Pass 3: Time Topology Inference
 *
 * Transforms a TypedPatch into a TimeResolvedPatch by:
 * 1. Discovering the single TimeRoot block (subcategory === 'TimeRoot')
 * 2. Extracting TimeModelIR from TimeRoot parameters
 * 3. Generating canonical time signals using IRBuilder
 * 4. Validating time constraints
 *
 * This pass makes time topology explicit and eliminates runtime time model inference.
 *
 * References:
 * - HANDOFF.md Topic 4: Pass 3 - Time Topology
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 3
 */

import type {
  TypedPatch,
  TimeResolvedPatch,
  TimeSignals,
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
  BlockIndex,
} from "../../types";
import type { TimeModelIR } from "../ir/schedule";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";

/**
 * Error types emitted by Pass 3.
 */
export interface MissingTimeRootError {
  kind: "MissingTimeRoot";
  message: string;
}

export interface MultipleTimeRootsError {
  kind: "MultipleTimeRoots";
  timeRootIds: string[];
  message: string;
}

export interface TimeRootViolationError {
  kind: "TimeRootViolation";
  timeRootId: string;
  message: string;
}

export type Pass3Error =
  | MissingTimeRootError
  | MultipleTimeRootsError
  | TimeRootViolationError;

/**
 * Check if a block is a TimeRoot block.
 * TimeRoot blocks have subcategory === 'TimeRoot'.
 */
function isTimeRootBlock(block: Block): boolean {
  // Access the block definition to check subcategory
  // The subcategory is defined in the block definition, not on the instance
  // For now, we'll check the block type directly
  return (
    block.type === "FiniteTimeRoot" ||
    block.type === "CycleTimeRoot" ||
    block.type === "InfiniteTimeRoot"
  );
}

/**
 * Extract TimeModelIR from TimeRoot block parameters.
 */
function extractTimeModel(timeRoot: Block): TimeModelIR {
  if (timeRoot.type === "FiniteTimeRoot") {
    // Extract durationMs from params or default source
    const durationMs = extractParamValue(timeRoot, "durationMs", 5000);
    return {
      kind: "finite",
      durationMs,
    };
  }

  if (timeRoot.type === "CycleTimeRoot") {
    // Extract periodMs and mode from params
    const periodMs = extractParamValue(timeRoot, "periodMs", 3000);
    const mode = extractParamValue(timeRoot, "mode", "loop") as
      | "loop"
      | "pingpong";
    return {
      kind: "cyclic",
      periodMs,
      mode,
      phaseDomain: "0..1",
    };
  }

  if (timeRoot.type === "InfiniteTimeRoot") {
    // Extract windowMs from params
    const windowMs = extractParamValue(timeRoot, "windowMs", 10000);
    const periodMs = extractParamValue(timeRoot, "periodMs", 10000);
    return {
      kind: "infinite",
      windowMs,
      suggestedUIWindowMs: periodMs,
    };
  }

  throw new Error(`Unknown TimeRoot type: ${timeRoot.type}`);
}

/**
 * Extract a parameter value from a block.
 * Checks params first, then falls back to default value.
 */
function extractParamValue(
  block: Block,
  paramName: string,
  defaultValue: unknown
): unknown {
  // Check params object
  if (block.params && paramName in block.params) {
    return block.params[paramName];
  }

  // Fall back to default
  return defaultValue;
}

/**
 * Generate canonical time signals using IRBuilder.
 */
function generateTimeSignals(timeModel: TimeModelIR): TimeSignals {
  const builder = new IRBuilderImpl();

  // All time models have tAbsMs and tModelMs
  const tAbsMs = builder.sigTimeAbsMs();
  const tModelMs = builder.sigTimeModelMs();

  // Cyclic models also have phase01 and wrapEvent
  if (timeModel.kind === "cyclic") {
    const phase01 = builder.sigPhase01();
    const wrapEvent = builder.sigWrapEvent();

    return {
      tAbsMs,
      tModelMs,
      phase01,
      wrapEvent,
    };
  }

  // Finite and infinite models only have time signals
  return {
    tAbsMs,
    tModelMs,
  };
}

/**
 * Pass 3: Time Topology Inference
 *
 * Discovers the TimeRoot, extracts the TimeModel, and generates canonical time signals.
 *
 * @param typed - The typed patch from Pass 2
 * @returns A time-resolved patch with TimeModel and canonical time signals
 */
export function pass3TimeTopology(
  typed: TypedPatch<Block, Connection, Publisher, Listener, Bus>
): TimeResolvedPatch<Block, Connection, Publisher, Listener, Bus> {
  const errors: Pass3Error[] = [];

  // Step 1: Find all TimeRoot blocks
  const timeRoots = typed.blocks.filter((b) => isTimeRootBlock(b));

  // Step 2: Validate exactly one TimeRoot exists
  if (timeRoots.length === 0) {
    errors.push({
      kind: "MissingTimeRoot",
      message:
        "Patch must have exactly one TimeRoot block (FiniteTimeRoot, CycleTimeRoot, or InfiniteTimeRoot)",
    });
  } else if (timeRoots.length > 1) {
    errors.push({
      kind: "MultipleTimeRoots",
      timeRootIds: timeRoots.map((r) => r.id),
      message: `Patch must have exactly one TimeRoot block, found ${timeRoots.length}: ${timeRoots.map((r) => r.id).join(", ")}`,
    });
  }

  // Throw if there are validation errors
  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 3 (Time Topology) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  // Step 3: Extract TimeModel from the single TimeRoot
  const timeRoot = timeRoots[0];
  const timeModel = extractTimeModel(timeRoot);

  // Step 4: Generate canonical time signals
  const timeSignals = generateTimeSignals(timeModel);

  // Step 5: Get TimeRoot index from blockIndexMap
  const timeRootIndex = typed.blockIndexMap.get(timeRoot.id);
  if (timeRootIndex === undefined) {
    throw new Error(
      `TimeRoot block ${timeRoot.id} not found in blockIndexMap (internal error)`
    );
  }

  // Step 6: Return time-resolved patch
  return {
    ...typed,
    timeModel,
    timeRootIndex: timeRootIndex as BlockIndex,
    timeSignals,
  };
}
