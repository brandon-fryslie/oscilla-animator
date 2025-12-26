/**
 * Debug Sink Interface
 *
 * Optional debug tracing interface for signal expression evaluation.
 * When enabled, allows instrumentation of signal evaluation for:
 * - Debug visualization
 * - Time-travel debugging
 * - Performance profiling
 * - Value tracing
 *
 * CRITICAL: Debug tracing must have ZERO overhead when disabled.
 * Always check `if (env.debug?.traceFoo)` before creating trace info objects.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-03-busCombine.md §P1 "Add Optional Debug Tracing"
 * - .agent_planning/signalexpr-runtime/SPRINT-04-transform.md §P2 "Add Debug Tracing for Transforms"
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P1 "Debug Tracing for Closure Bridge"
 */

import type { SigExprId, TransformChainId } from "../../compiler/ir/types";
import type { SigCombineMode } from "../../compiler/ir/signalExpr";

/**
 * Debug sink interface - optional tracing for signal evaluation.
 *
 * All methods are optional. When a method is undefined, no tracing occurs
 * for that operation.
 *
 * Implementation example:
 * ```typescript
 * const debug: DebugSink = {
 *   traceBusCombine: (info) => {
 *     console.log(`Bus ${info.busIndex}: ${info.mode} of ${info.termValues} = ${info.result}`);
 *   }
 * };
 * ```
 */
export interface DebugSink {
  /**
   * Trace bus combine operation.
   *
   * Called after successfully evaluating a busCombine node.
   *
   * @param info - Bus combine trace information
   */
  traceBusCombine?(info: BusCombineTraceInfo): void;

  /**
   * Trace transform chain application.
   *
   * Called after successfully applying a transform chain.
   * Includes source value, each step's input/output, and final value.
   *
   * @param info - Transform trace information
   */
  traceTransform?(info: TransformTraceInfo): void;

  /**
   * TEMPORARY: Trace closure bridge call (Sprint 6).
   *
   * Called after successfully calling a legacy closure from closureBridge node.
   * Includes closure ID, time, result, and optional execution time.
   *
   * Will be REMOVED once all blocks are migrated to IR (Sprint 7+).
   *
   * @param info - Closure bridge trace information
   */
  traceClosureBridge?(info: ClosureBridgeTraceInfo): void;

  // Future tracing methods:
  // traceMap?(info: MapTraceInfo): void;
  // traceZip?(info: ZipTraceInfo): void;
  // traceSelect?(info: SelectTraceInfo): void;
}

/**
 * Bus combine trace information.
 *
 * Contains all information about a bus combine evaluation:
 * - Which bus (busIndex)
 * - Input terms (termIds and their evaluated values)
 * - Combine mode used
 * - Final result
 */
export interface BusCombineTraceInfo {
  /** Bus index (for identification) */
  busIndex: number;

  /** Term signal IDs (pre-sorted by compiler) */
  termIds: SigExprId[];

  /** Evaluated term values (in same order as termIds) */
  termValues: number[];

  /** Combine mode used */
  mode: SigCombineMode;

  /** Final combined result */
  result: number;
}

/**
 * Transform trace information.
 *
 * Contains all information about a transform chain evaluation:
 * - Source value before transform
 * - Transform chain ID
 * - Each step's kind, input, and output
 * - Final transformed value
 */
export interface TransformTraceInfo {
  /** Source value before transform */
  srcValue: number;

  /** Transform chain ID */
  chainId: TransformChainId;

  /** Step-by-step trace (each step's input and output) */
  steps: TransformStepTrace[];

  /** Final transformed value */
  finalValue: number;
}

/**
 * Trace information for a single transform step.
 */
export interface TransformStepTrace {
  /** Step kind (scaleBias, normalize, etc.) */
  kind: string;

  /** Input value to this step */
  inputValue: number;

  /** Output value from this step */
  outputValue: number;
}

/**
 * TEMPORARY: Closure bridge trace information (Sprint 6).
 *
 * Contains all information about a closure bridge call:
 * - Closure ID (for identification)
 * - Time passed to closure
 * - Result returned from closure
 * - Optional execution time (for performance tracking)
 *
 * Will be REMOVED once all blocks are migrated to IR (Sprint 7+).
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P1
 */
export interface ClosureBridgeTraceInfo {
  /** Closure ID from registry */
  closureId: string;

  /** Absolute time passed to closure (milliseconds) */
  tAbsMs: number;

  /** Result returned from closure */
  result: number;

  /** Optional execution time in milliseconds (for performance tracking) */
  executionTimeMs?: number;
}
