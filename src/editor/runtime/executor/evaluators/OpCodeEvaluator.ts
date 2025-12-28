/**
 * OpCode Evaluator
 *
 * Implements the execution logic for all runtime OpCodes.
 *
 * This is the "ALU" of the runtime - it takes an OpCode and input values
 * and produces output values.
 *
 * References:
 * - src/editor/compiler/ir/opcodes.ts (OpCode definitions)
 * - src/core/types.ts (Vec2, etc.)
 */

import { OpCode } from "../../../compiler/ir/opcodes";
import { Vec2 } from "../../../../core/types";
import type { RuntimeState } from "../RuntimeState";
import type { NodeIR, CompiledProgramIR } from "../../../compiler/ir/program";
import { colorHSLToRGB, colorShiftHue, colorLerp, colorScaleSat, colorScaleLight } from "../kernels/color";

// ============================================================================
// Types
// ============================================================================

/**
 * Evaluate an OpCode with given inputs.
 *
 * @param opcode - The operation to perform
 * @param inputs - Array of input values
 * @param state - Runtime state (for time, state buffers, etc.)
 * @param node - The node being evaluated (for metadata, state bindings, etc.)
 * @param program - Compiled program (for const pool access)
 * @returns Array of output values
 */
export function evaluateOp(
  opcode: OpCode,
  inputs: unknown[],
  _state: RuntimeState,
  node: NodeIR,
  program?: CompiledProgramIR
): unknown[] {
  switch (opcode) {
    // ========================================================================
    // Time Operations (10-19)
    // ========================================================================
    case OpCode.TimeAbsMs:
      // TODO: Get real time from state (need to ensure it's passed down or available)
      // For now, assuming state has a way to get time, or we rely on inputs.
      // Actually, TimeAbsMs usually has no inputs, it gets time from the environment.
      // RuntimeState doesn't explicitly store 't' in a public field in the interface I saw.
      // But executeNodeEval runs in a context where time is known.
      // StepNodeEval might not pass time directly.
      // However, usually time is passed as a signal input OR available in global context.
      // If we look at `executeNodeEval`, it has access to `RuntimeState`.
      // `RuntimeState` should ideally have current time if we want to access it globally,
      // OR we use the `TimeDerive` step to put time into a slot, and `TimeAbsMs` reads that slot.
      //
      // DESIGN CHECK: In IR, time is usually a Signal. If it's a node `TimeAbsMs`, it likely
      // reads from a "system" source or is just a placeholder that requires a special input.
      //
      // If `TimeAbsMs` is an OpCode, it should probably return the time.
      // Let's assume for now that `RuntimeState` *should* have the time, or we rely on pre-filled slots.
      // BUT, checking `executeTimeDerive.ts` (which I haven't read but is imported in `ScheduleExecutor`),
      // it likely writes time to slots.
      //
      // IF `TimeAbsMs` is a node in the graph, it must output time.
      // If it has no inputs, where does it get time?
      //
      // Pattern: The `TimeDerive` step writes `t` to specific slots.
      // Nodes that need time should just read from those slots via wires.
      // So `OpCode.TimeAbsMs` might be redundant if we have `TimeDerive` + wires.
      // OR, `TimeAbsMs` is a special node that *reads* the system time from `RuntimeState`.
      //
      // I'll assume `RuntimeState` (or the scheduler context) has the time.
      // Wait, `ScheduleExecutor.executeFrame` calculates `effectiveTime`.
      // It passes it to `executeTimeDerive`.
      // But `executeNodeEval` only gets `program` and `runtime`.
      // It does NOT get `effectiveTime`.
      // This suggests that "Time" is injected via `TimeDerive` into slots, and other nodes just read slots.
      //
      // So: `OpCode.TimeAbsMs` might effectively be a "read global time" op, but we don't have it in `RuntimeState` interface.
      //
      // Re-reading `RuntimeState.ts`: it has `frameId`.
      // It does NOT have `tMs`.
      //
      // Use case: Maybe `TimeAbsMs` is just a passthrough for a specific slot?
      // Or maybe we update `RuntimeState` to hold `tMs`?
      // `Player.ts` manages `tMs`.
      //
      // DECISION: For Sprint 1, I'll return 0 if I can't find time, or rely on `TimeDerive` to have populated slots
      // and this OpCode simply returns what's given (identity) or looks up a global.
      // actually, if `TimeAbsMs` is a 0-input node, it implies global access.
      // I will add `tMs` to `RuntimeState` or assume it's set on the state object during execution.
      // For now, I'll return 0 to unblock, noting the dependency.
      return [0]; // Placeholder

    case OpCode.Phase01:
      // Similarly, phase should come from TimeDerive outputs.
      return [0];

    // ========================================================================
    // Constants (0-9)
    // ========================================================================
    case OpCode.Const: {
      // Constants are read from the constant pool.
      // The node.compilerTag holds the constId.
      if (!program || !program.constants) {
        console.warn("OpCode.Const: no program or constant pool available");
        return [0];
      }

      const constId = node.compilerTag ?? 0;
      const constPool = program.constants;

      // Use constIndex to find the storage location
      if (
        constPool.constIndex &&
        constId < constPool.constIndex.length
      ) {
        const entry = constPool.constIndex[constId];
        switch (entry.k) {
          case "f64":
            return [constPool.f64[entry.idx]];
          case "f32":
            return [constPool.f32[entry.idx]];
          case "i32":
            return [constPool.i32[entry.idx]];
          case "json":
            return [constPool.json[entry.idx]];
        }
      }

      // Fallback: try f64 pool directly
      if (constId < constPool.f64.length) {
        return [constPool.f64[constId]];
      }

      // Last fallback: try json pool
      if (constId < constPool.json.length) {
        return [constPool.json[constId]];
      }

      console.warn(`OpCode.Const: constId ${constId} not found in pool`);
      return [0];
    }

    // ========================================================================
    // Pure Math - Binary (100-139)
    // ========================================================================
    case OpCode.Add:
      return [Number(inputs[0]) + Number(inputs[1])];
    case OpCode.Sub:
      return [Number(inputs[0]) - Number(inputs[1])];
    case OpCode.Mul:
      return [Number(inputs[0]) * Number(inputs[1])];
    case OpCode.Div:
      return [Number(inputs[0]) / Number(inputs[1])];
    case OpCode.Mod:
      return [Number(inputs[0]) % Number(inputs[1])];
    case OpCode.Pow:
      return [Math.pow(Number(inputs[0]), Number(inputs[1]))];

    // ========================================================================
    // Trigonometry (110-116)
    // ========================================================================
    case OpCode.Sin:
      return [Math.sin(Number(inputs[0]))];
    case OpCode.Cos:
      return [Math.cos(Number(inputs[0]))];
    case OpCode.Tan:
      return [Math.tan(Number(inputs[0]))];
    case OpCode.Asin:
      return [Math.asin(Number(inputs[0]))];
    case OpCode.Acos:
      return [Math.acos(Number(inputs[0]))];
    case OpCode.Atan:
      return [Math.atan(Number(inputs[0]))];
    case OpCode.Atan2:
      return [Math.atan2(Number(inputs[0]), Number(inputs[1]))];

    // ========================================================================
    // Rounding (120-125)
    // ========================================================================
    case OpCode.Abs:
      return [Math.abs(Number(inputs[0]))];
    case OpCode.Floor:
      return [Math.floor(Number(inputs[0]))];
    case OpCode.Ceil:
      return [Math.ceil(Number(inputs[0]))];
    case OpCode.Round:
      return [Math.round(Number(inputs[0]))];
    case OpCode.Fract: {
      const v = Number(inputs[0]);
      return [v - Math.floor(v)];
    }
    case OpCode.Sign:
      return [Math.sign(Number(inputs[0]))];

    // ========================================================================
    // Comparison/Selection (130-135)
    // ========================================================================
    case OpCode.Min:
      return [Math.min(Number(inputs[0]), Number(inputs[1]))];
    case OpCode.Max:
      return [Math.max(Number(inputs[0]), Number(inputs[1]))];
    case OpCode.Clamp: {
      const v = Number(inputs[0]);
      const min = Number(inputs[1]);
      const max = Number(inputs[2]);
      return [Math.min(Math.max(v, min), max)];
    }
    case OpCode.Lerp: {
      const a = Number(inputs[0]);
      const b = Number(inputs[1]);
      const t = Number(inputs[2]);
      return [a + (b - a) * t];
    }
    case OpCode.Step: {
      const edge = Number(inputs[0]);
      const x = Number(inputs[1]);
      return [x < edge ? 0 : 1];
    }
    case OpCode.Smoothstep: {
      const edge0 = Number(inputs[0]);
      const edge1 = Number(inputs[1]);
      const x = Number(inputs[2]);
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return [t * t * (3 - 2 * t)];
    }

    // ========================================================================
    // Vec2 Operations (200-219)
    // ========================================================================
    case OpCode.Vec2Add:
      return [Vec2.add(inputs[0] as Vec2, inputs[1] as Vec2)];
    case OpCode.Vec2Sub:
      return [Vec2.sub(inputs[0] as Vec2, inputs[1] as Vec2)];
    case OpCode.Vec2Mul:
      return [{ x: (inputs[0] as Vec2).x * (inputs[1] as Vec2).x, y: (inputs[0] as Vec2).y * (inputs[1] as Vec2).y }];
    case OpCode.Vec2Scale:
      return [Vec2.scale(inputs[0] as Vec2, Number(inputs[1]))];
    case OpCode.Vec2Dot:
      return [Vec2.dot(inputs[0] as Vec2, inputs[1] as Vec2)];
    case OpCode.Vec2Length:
      return [Vec2.length(inputs[0] as Vec2)];
    case OpCode.Vec2Normalize:
      return [Vec2.normalize(inputs[0] as Vec2)];
    case OpCode.Vec2Rotate: {
      const v = inputs[0] as Vec2;
      const angle = Number(inputs[1]);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [{ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }];
    }
    case OpCode.Vec2Angle: {
      const v = inputs[0] as Vec2;
      return [Math.atan2(v.y, v.x)];
    }

    // ========================================================================
    // Color Operations (300-319)
    // ========================================================================
    case OpCode.ColorHSLToRGB: {
      // Convert HSL to RGB hex color
      // Input: [h: number (0-360), s: number (0-1), l: number (0-1)]
      // Output: color hex string '#RRGGBB'
      const h = Number(inputs[0]);
      const s = Number(inputs[1]);
      const l = Number(inputs[2]);
      return [colorHSLToRGB(h, s, l)];
    }
    case OpCode.ColorShiftHue: {
      // Shift hue of a color
      // Input: [color: string, hueShift: number (degrees)]
      const color = String(inputs[0]);
      const hueShift = Number(inputs[1]);
      return [colorShiftHue(color, hueShift)];
    }
    case OpCode.ColorLerp: {
      // Interpolate between two colors
      // Input: [color1: string, color2: string, t: number (0-1)]
      const color1 = String(inputs[0]);
      const color2 = String(inputs[1]);
      const t = Number(inputs[2]);
      return [colorLerp(color1, color2, t)];
    }
    case OpCode.ColorScaleSat: {
      // Scale saturation of a color
      // Input: [color: string, scale: number]
      const color = String(inputs[0]);
      const scale = Number(inputs[1]);
      return [colorScaleSat(color, scale)];
    }
    case OpCode.ColorScaleLight: {
      // Scale lightness of a color
      // Input: [color: string, scale: number]
      const color = String(inputs[0]);
      const scale = Number(inputs[1]);
      return [colorScaleLight(color, scale)];
    }

    // ========================================================================
    // State Operations (400-419)
    // ========================================================================
    case OpCode.Integrate: {
      // TODO: Needs state binding resolution and persistent state access
      // For now return input (pass-through) to unblock
      return [inputs[0]];
    }
    case OpCode.DelayMs: {
      // TODO: Needs state binding
      return [inputs[0]];
    }

    // ========================================================================
    // Default / Unimplemented
    // ========================================================================
    default:
      console.warn(`Unimplemented OpCode: ${opcode}`);
      return [0];
  }
}
