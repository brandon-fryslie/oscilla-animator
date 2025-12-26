/**
 * Extract SignalExprTable from LinkedGraphIR
 *
 * Bridges the sophisticated compiler IR (LinkedGraphIR) to the simpler
 * runtime IR (SignalExprTable) used by SigEvaluator.
 *
 * Phase 4 Workstream B: Compiler Integration
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-2025-12-26-031245.md §B5
 * - .agent_planning/signalexpr-runtime/DOD-2025-12-26-031245.md §B5
 */

import type { LinkedGraphIR } from '../passes/pass8-link-resolution';
import type { SignalExprTable } from './signalExpr';
import type { StateLayoutEntry } from './builderTypes';

/**
 * Extracted SignalExpr data for runtime evaluation.
 *
 * This is the minimal data needed by SigEvaluator to evaluate signals.
 */
export interface ExtractedSignalExprData {
  /** Signal expression table for SigEvaluator */
  signalTable: SignalExprTable;

  /** Constant pool (deduplicated values) */
  constPool: unknown[];

  /** State layout for stateful operations */
  stateLayout: StateLayoutEntry[];
}

/**
 * Extract SignalExprTable from LinkedGraphIR.
 *
 * The LinkedGraphIR is the complete compiler output with full provenance,
 * type information, and debug metadata. The SignalExprTable is a simplified
 * view focused only on signal evaluation.
 *
 * @param ir - LinkedGraphIR from compilation pipeline
 * @returns Extracted SignalExpr data for runtime
 */
export function extractSignalExprTable(
  ir: LinkedGraphIR
): ExtractedSignalExprData | undefined {
  try {
    // Build the IR to get the final program structure
    const programIR = ir.builder.build();

    // Extract signal expressions
    const signalTable: SignalExprTable = {
      nodes: programIR.signalIR.nodes,
    };

    // Extract constant pool
    const constPool = Array.from(programIR.constants);

    // Extract state layout
    const stateLayout = Array.from(programIR.stateLayout);

    return {
      signalTable,
      constPool,
      stateLayout,
    };
  } catch (error) {
    console.error('Failed to extract SignalExprTable from LinkedGraphIR:', error);
    return undefined;
  }
}
