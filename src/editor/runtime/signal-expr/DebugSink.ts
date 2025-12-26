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
 */

import type { SigExprId } from "../../compiler/ir/types";
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

  // Future tracing methods:
  // traceMap?(info: MapTraceInfo): void;
  // traceZip?(info: ZipTraceInfo): void;
  // traceSelect?(info: SelectTraceInfo): void;
  // traceTransform?(info: TransformTraceInfo): void;
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
