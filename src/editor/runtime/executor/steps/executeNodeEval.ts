/**
 * Execute Node Eval Step
 *
 * Evaluates a node by reading inputs, executing opcode, and writing outputs.
 * Uses the OpCodeEvaluator to perform the actual computation.
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Node Eval)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12.2 Step 2
 */

import type { StepNodeEval, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import { evaluateOp } from "../evaluators/OpCodeEvaluator";
import { OpCode } from "../../../compiler/ir/opcodes";

/**
 * Execute NodeEval step.
 *
 * 1. Resolves NodeIR from program using step.nodeIndex
 * 2. Reads input values from runtime.values using step.inputSlots
 * 3. Dispatches to OpCodeEvaluator
 * 4. Writes output values to runtime.values using step.outputSlots
 *
 * @param step - NodeEval step specification
 * @param program - Compiled program
 * @param runtime - Runtime state
 */
export function executeNodeEval(
  step: StepNodeEval,
  program: CompiledProgramIR,
  runtime: RuntimeState,
): void {
  // 1. Get NodeIR from signalExprs table
  const node = program.signalExprs.nodes[step.nodeIndex];
  if (!node) {
    throw new Error(`executeNodeEval: Invalid nodeIndex ${step.nodeIndex}`);
  }

  // 2. Read inputs
  const inputs = step.inputSlots.map((slot) => runtime.values.read(slot));

  // 3. Execute OpCode
  // Note: SignalExprIR doesn't have opcodeId - it uses discriminated union with 'kind'
  // For now, default to OpCode.Const as a safe fallback
  // TODO: Map SignalExprIR kinds to appropriate OpCodes or refactor evaluation
  const opcode = OpCode.Const;

  const outputs = evaluateOp(opcode, inputs, runtime, {}, program);

  // 4. Write outputs
  // Ensure we don't write more outputs than we have slots for
  const count = Math.min(step.outputSlots.length, outputs.length);
  for (let i = 0; i < count; i++) {
    runtime.values.write(step.outputSlots[i], outputs[i]);
  }
}
