/**
 * Execute Signal Eval Step
 *
 * Evaluates signal expressions via SigEvaluator and writes their values to slots.
 */

import type { StepSignalEval, CompiledProgramIR } from "../../../compiler/ir";
import type { RuntimeState } from "../RuntimeState";
import type { SigFrameCache } from "../../signal-expr/SigFrameCache";
import { evalSig } from "../../signal-expr/SigEvaluator";
import { createSigEnv } from "../../signal-expr/SigEnv";
import type { SlotValueReader } from "../../signal-expr/SlotValueReader";

function buildSlotReader(runtime: RuntimeState): SlotValueReader {
  return {
    readNumber(slot) {
      const value = runtime.values.read(slot);
      if (typeof value !== "number") {
        throw new Error(`executeSignalEval: slot ${slot} is not a number`);
      }
      return value;
    },
    hasValue(slot) {
      try {
        const value = runtime.values.read(slot);
        return typeof value === "number";
      } catch {
        return false;
      }
    },
  };
}

export function executeSignalEval(
  step: StepSignalEval,
  program: CompiledProgramIR,
  runtime: RuntimeState,
  effectiveTime: { tAbsMs: number; tModelMs?: number; phase01?: number; wrapEvent?: number },
): void {
  const signalTable = program.signalTable?.nodes;
  if (!signalTable) {
    throw new Error("executeSignalEval: program.signalTable is missing");
  }

  const constPool = program.constants?.json ?? [];
  const numbers = constPool.map((value) => (typeof value === "number" ? value : NaN));

  const cache: SigFrameCache = {
    frameId: runtime.frameCache.frameId,
    value: runtime.frameCache.sigValue,
    stamp: runtime.frameCache.sigStamp,
    validMask: runtime.frameCache.sigValidMask,
  };

  const env = createSigEnv({
    tAbsMs: effectiveTime.tAbsMs,
    tModelMs: effectiveTime.tModelMs,
    phase01: effectiveTime.phase01,
    wrapOccurred: effectiveTime.wrapEvent === 1,
    constPool: { numbers },
    cache,
    slotValues: buildSlotReader(runtime),
  });

  for (const output of step.outputs) {
    const value = evalSig(output.sigId, env, signalTable);
    runtime.values.write(output.slot, value);
  }
}
