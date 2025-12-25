/**
 * Execute Node Eval Step (STUB)
 *
 * Evaluates a node by reading inputs, executing opcode, and writing outputs.
 *
 * STUB IMPLEMENTATION: This is a placeholder for Sprint 1.
 * Full implementation requires Phase 4 (SignalExpr evaluator).
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Node Eval)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 2
 */

import type { StepNodeEval, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";

/**
 * Execute NodeEval step (STUB).
 *
 * Stub implementation:
 * - Reads input slots
 * - Calls placeholder opcode executor (returns zeros)
 * - Writes output slots
 *
 * TODO: Phase 4 - Implement actual opcode execution
 * - Dispatch to opcode handlers based on node type
 * - Execute SignalExpr/FieldExpr evaluation
 * - Handle state reads/writes
 *
 * @param step - NodeEval step specification
 * @param _program - Compiled program (not used in stub)
 * @param runtime - Runtime state
 */
export function executeNodeEval(
  step: StepNodeEval,
  _program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // Read inputs (stub - just read the slots)
  const inputs = step.inputSlots.map((slot) => runtime.values.read(slot));

  // Execute opcode (stub - placeholder returns zeros)
  // TODO: Full opcode execution requires Phase 4 evaluators
  const outputs = executeOpcodeStub(step, inputs);

  // Write outputs
  step.outputSlots.forEach((slot, i) => {
    runtime.values.write(slot, outputs[i]);
  });
}

/**
 * Placeholder opcode executor (STUB).
 *
 * Returns zero/default values for all outputs.
 * This is sufficient for testing the execution loop structure.
 *
 * TODO: Phase 4 - Replace with actual opcode dispatch:
 * - switch (node.opcodeId) { ... }
 * - Call evaluator functions (evalAdd, evalSin, evalIntegrate, etc.)
 * - Handle state updates for stateful nodes
 *
 * @param step - NodeEval step
 * @param _inputs - Input values (not used in stub)
 * @returns Array of output values (all zeros in stub)
 */
function executeOpcodeStub(step: StepNodeEval, _inputs: unknown[]): unknown[] {
  // Stub: return zeros for all outputs
  return step.outputSlots.map(() => 0);
}
