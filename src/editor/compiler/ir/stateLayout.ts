/**
 * State Layout Computation
 *
 * Computes memory layout for stateful signal operations.
 * Each stateful operation gets a unique offset in the appropriate state buffer.
 *
 * Phase 4, Sprint 8: Compiler Integration
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-2025-12-26-031245.md §B3
 * - .agent_planning/signalexpr-runtime/DOD-2025-12-26-031245.md §B3
 */

import type { SignalExprIR } from './signalExpr';
import type { StateLayoutEntry } from './builderTypes';
import type { StateId } from './types';

/**
 * Compute state layout from SignalExpr IR nodes.
 *
 * Scans all stateful nodes and allocates offsets for state cells.
 * Returns a list of state layout entries describing each stateful operation.
 *
 * State buffers:
 * - f64: High-precision state (integrate, delays, etc.)
 * - f32: Single-precision state (for performance)
 * - i32: Integer state (frame counters, etc.)
 *
 * @param nodes - Array of SignalExpr IR nodes
 * @returns State layout entries
 *
 * @example
 * ```typescript
 * const nodes: SignalExprIR[] = [
 *   { kind: 'const', type: numberType, constId: 0 },
 *   { kind: 'stateful', type: numberType, op: 'integrate', input: 0, stateId: 'state_0' },
 *   { kind: 'stateful', type: numberType, op: 'delayMs', input: 0, stateId: 'state_1', params: { delayMs: 100 } },
 * ];
 *
 * const layout = computeStateLayout(nodes);
 * // layout = [
 * //   { stateId: 'state_0', type: { world: 'signal', domain: 'number' }, initial: 0 },
 * //   { stateId: 'state_1', type: { world: 'signal', domain: 'number' }, initial: undefined },
 * // ]
 * ```
 */
export function computeStateLayout(nodes: SignalExprIR[]): StateLayoutEntry[] {
  const layout: StateLayoutEntry[] = [];

  for (const node of nodes) {
    if (node.kind === 'stateful') {
      // Extract state ID and type
      const stateId = node.stateId;
      const type = node.type;

      // Determine initial value based on operation
      let initial: unknown;
      switch (node.op) {
        case 'integrate':
          initial = 0; // Accumulator starts at 0
          break;
        case 'sampleHold':
          initial = 0; // Hold value starts at 0
          break;
        case 'delayMs':
        case 'delayFrames':
          initial = undefined; // Delay buffer allocated separately
          break;
        case 'slew':
          initial = 0; // Slew target starts at 0
          break;
        case 'edgeDetectWrap':
          initial = 0; // Previous phase starts at 0
          break;
        default:
          initial = 0;
      }

      // Add to layout
      layout.push({
        stateId: stateId as StateId,
        type,
        initial,
        debugName: `${node.op}_${stateId}`,
      });
    }
  }

  return layout;
}

/**
 * Compute total state buffer sizes from layout.
 *
 * Returns the number of slots needed in each buffer type.
 *
 * @param layout - State layout entries
 * @returns Buffer sizes
 */
export function computeStateBufferSizes(layout: StateLayoutEntry[]): {
  f64Count: number;
  f32Count: number;
  i32Count: number;
} {
  // For now, all state goes into f64 (simplest approach)
  // Future optimization: separate by actual type requirements
  return {
    f64Count: layout.length,
    f32Count: 0,
    i32Count: 0,
  };
}
