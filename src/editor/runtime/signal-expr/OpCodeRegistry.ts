/**
 * OpCode Registry - Pure Function Application
 *
 * Implements runtime execution of pure opcodes (map and zip operations).
 * OpCode definitions live in compiler/ir/opcodes.ts - this file executes them.
 *
 * Key invariants:
 * - All functions are pure (no side effects, deterministic)
 * - Direct Math.* calls for performance (no indirection)
 * - Division by zero returns 0 (safe default, no NaN propagation)
 * - Unknown opcodes throw clear errors
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P1 "Implement OpCode Registry"
 * - .agent_planning/signalexpr-runtime/HANDOFF.md §1 "Map Evaluation", "Zip Evaluation"
 * - src/editor/compiler/ir/opcodes.ts (OpCode enum)
 */

import { OpCode } from "../../compiler/ir/opcodes";
import type { PureFnRef } from "../../compiler/ir/transforms";

/**
 * Apply a pure unary function to a single input.
 *
 * Used by map nodes: `map(fn, src)` → `fn(src)`
 *
 * @param fn - Pure function reference (opcode or kernel)
 * @param input - Input value
 * @returns Result of applying fn to input
 * @throws Error if opcode is unknown or not unary
 *
 * @example
 * ```typescript
 * const fn: PureFnRef = { kind: "opcode", opcode: OpCode.Sin };
 * console.log(applyPureFn(fn, Math.PI / 2)); // ~1.0
 * console.log(applyPureFn({ kind: "opcode", opcode: OpCode.Abs }, -42)); // 42
 * ```
 */
export function applyPureFn(fn: PureFnRef, input: number): number {
  if (fn.kind === "kernel") {
    throw new Error("WASM kernels not yet supported in this sprint");
  }

  switch (fn.opcode) {
    // Trigonometry
    case OpCode.Sin:
      return Math.sin(input);
    case OpCode.Cos:
      return Math.cos(input);
    case OpCode.Tan:
      return Math.tan(input);
    case OpCode.Asin:
      return Math.asin(input);
    case OpCode.Acos:
      return Math.acos(input);
    case OpCode.Atan:
      return Math.atan(input);

    // Rounding
    case OpCode.Abs:
      return Math.abs(input);
    case OpCode.Floor:
      return Math.floor(input);
    case OpCode.Ceil:
      return Math.ceil(input);
    case OpCode.Round:
      return Math.round(input);
    case OpCode.Fract:
      return input - Math.floor(input);
    case OpCode.Sign:
      return Math.sign(input);

    default:
      throw new Error(`Unknown or non-unary opcode: ${fn.opcode}`);
  }
}

/**
 * Apply a pure binary function to two inputs.
 *
 * Used by zip nodes: `zip(fn, a, b)` → `fn(a, b)`
 *
 * Division by zero: Returns 0 (safe default, prevents NaN propagation).
 *
 * @param fn - Pure function reference (opcode or kernel)
 * @param a - First input value
 * @param b - Second input value
 * @returns Result of applying fn to (a, b)
 * @throws Error if opcode is unknown or not binary
 *
 * @example
 * ```typescript
 * const add: PureFnRef = { kind: "opcode", opcode: OpCode.Add };
 * console.log(applyBinaryFn(add, 10, 20)); // 30
 *
 * const div: PureFnRef = { kind: "opcode", opcode: OpCode.Div };
 * console.log(applyBinaryFn(div, 10, 2)); // 5
 * console.log(applyBinaryFn(div, 10, 0)); // 0 (safe default)
 * ```
 */
export function applyBinaryFn(fn: PureFnRef, a: number, b: number): number {
  if (fn.kind === "kernel") {
    throw new Error("WASM kernels not yet supported in this sprint");
  }

  switch (fn.opcode) {
    // Binary arithmetic
    case OpCode.Add:
      return a + b;
    case OpCode.Sub:
      return a - b;
    case OpCode.Mul:
      return a * b;
    case OpCode.Div:
      return b !== 0 ? a / b : 0; // Safe default for division by zero
    case OpCode.Mod:
      return b !== 0 ? a % b : 0; // Safe default for modulo by zero
    case OpCode.Pow:
      return Math.pow(a, b);

    // Comparison/Selection
    case OpCode.Min:
      return Math.min(a, b);
    case OpCode.Max:
      return Math.max(a, b);

    // Two-argument trig
    case OpCode.Atan2:
      return Math.atan2(a, b);

    default:
      throw new Error(`Unknown or non-binary opcode: ${fn.opcode}`);
  }
}

/**
 * Apply a pure ternary function to three inputs.
 *
 * Currently supports: Clamp, Lerp, Smoothstep.
 *
 * @param fn - Pure function reference (opcode or kernel)
 * @param a - First input value
 * @param b - Second input value
 * @param c - Third input value
 * @returns Result of applying fn to (a, b, c)
 * @throws Error if opcode is unknown or not ternary
 *
 * @example
 * ```typescript
 * const clamp: PureFnRef = { kind: "opcode", opcode: OpCode.Clamp };
 * console.log(applyTernaryFn(clamp, 5, 0, 10)); // 5
 * console.log(applyTernaryFn(clamp, -1, 0, 10)); // 0
 * console.log(applyTernaryFn(clamp, 15, 0, 10)); // 10
 * ```
 */
export function applyTernaryFn(
  fn: PureFnRef,
  a: number,
  b: number,
  c: number
): number {
  if (fn.kind === "kernel") {
    throw new Error("WASM kernels not yet supported in this sprint");
  }

  switch (fn.opcode) {
    case OpCode.Clamp:
      return Math.max(b, Math.min(c, a)); // clamp(value, min, max)

    case OpCode.Lerp:
      return a + (b - a) * c; // lerp(a, b, t)

    case OpCode.Smoothstep: {
      // smoothstep(edge0, edge1, x)
      const t = Math.max(0, Math.min(1, (c - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }

    case OpCode.Step:
      return c >= a ? 1 : 0; // step(edge, x) - binary but takes 2 args

    default:
      throw new Error(`Unknown or non-ternary opcode: ${fn.opcode}`);
  }
}
