/**
 * SignalExprBuilder - Minimal IR Builder for Signal Block Migration
 *
 * Lightweight builder for signal block compilers to emit SignalExpr IR.
 * This is a SIMPLIFIED version of the full IRBuilder specifically for
 * individual block compilation during the migration phase (Sprint 7).
 *
 * Philosophy:
 * - Block compilers build small DAGs (not full programs)
 * - Builder manages node allocation and const pool
 * - Output is nodes[] + constPool that can be embedded in larger IR
 *
 * This is TEMPORARY infrastructure for migration. Once all blocks are
 * migrated, we may integrate with the full IRBuilder system.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-07-blockCompilerMigration.md §P0
 * - HANDOFF.md Topic 1: SignalExpr Runtime
 */

import type { SignalExprIR } from "../../compiler/ir/signalExpr";
import { asTypeDesc } from "../../compiler/ir/types";
import type { SigExprId, TypeDesc } from "../../compiler/ir/types";
import type { PureFnRef } from "../../compiler/ir/transforms";
import type { OpCode } from "../../compiler/ir/opcodes";

/**
 * Constant pool - stores deduplicated constant values.
 */
export interface ConstPool {
  numbers: number[];
  // Future: vec2, color, etc.
}

/**
 * Result of building a signal expression.
 * Contains the DAG nodes and constant pool.
 */
export interface SignalExprBuildResult {
  /** Dense array of IR nodes */
  nodes: SignalExprIR[];

  /** Constant pool (shared, deduplicated) */
  constPool: ConstPool;

  /** Root node ID (typically the last node, representing the output) */
  rootId: SigExprId;
}

/**
 * Minimal IR builder for signal block compilers.
 *
 * Usage pattern:
 * ```typescript
 * const builder = createSignalExprBuilder();
 * const a = builder.sigConst(10);
 * const b = builder.sigConst(20);
 * const sum = builder.sigZip(a, b, { kind: "opcode", opcode: OpCode.Add });
 * const result = builder.build(sum);
 * // result.nodes = [const 10, const 20, zip add]
 * // result.constPool.numbers = [10, 20]
 * ```
 */
export interface SignalExprBuilder {
  /**
   * Create a constant signal node.
   * Constants are deduplicated automatically.
   *
   * @param value - Constant value
   * @returns Signal expression ID
   */
  sigConst(value: number): SigExprId;

  /**
   * Create absolute time signal (monotonic player time in milliseconds).
   *
   * @returns Signal expression ID
   */
  sigTimeAbsMs(): SigExprId;

  /**
   * Create map node - apply unary function to input signal.
   *
   * @param src - Source signal ID
   * @param fn - Pure function reference (opcode or kernel)
   * @returns Signal expression ID
   *
   * @example
   * ```typescript
   * const t = builder.sigTimeAbsMs();
   * const sinT = builder.sigMap(t, { kind: "opcode", opcode: OpCode.Sin });
   * ```
   */
  sigMap(src: SigExprId, fn: PureFnRef): SigExprId;

  /**
   * Create zip node - apply binary function to two input signals.
   *
   * @param a - First input signal ID
   * @param b - Second input signal ID
   * @param fn - Pure binary function reference
   * @returns Signal expression ID
   *
   * @example
   * ```typescript
   * const a = builder.sigConst(10);
   * const b = builder.sigConst(20);
   * const sum = builder.sigZip(a, b, { kind: "opcode", opcode: OpCode.Add });
   * ```
   */
  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId;

  /**
   * Build final result with root node.
   *
   * @param rootId - Root node ID (typically the output node)
   * @returns Build result with nodes, const pool, and root ID
   */
  build(rootId: SigExprId): SignalExprBuildResult;

  /**
   * Get the current nodes array (for inspection/testing).
   * NOTE: Nodes array is mutable - prefer using build() for final result.
   */
  getNodes(): SignalExprIR[];

  /**
   * Get the const pool (for inspection/testing).
   * NOTE: Pool is mutable - prefer using build() for final result.
   */
  getConstPool(): ConstPool;
}

/**
 * Implementation of SignalExprBuilder.
 */
class SignalExprBuilderImpl implements SignalExprBuilder {
  private nodes: SignalExprIR[] = [];
  private constNumbers: number[] = [];
  private constMap = new Map<number, number>(); // value -> constId (dedup)

  // Standard number type for signals
  private readonly numberType: TypeDesc = asTypeDesc({
    world: "signal",
    domain: "float",
  });

  sigConst(value: number): SigExprId {
    // Deduplicate constants
    let constId = this.constMap.get(value);

    if (constId === undefined) {
      // Allocate new constant
      constId = this.constNumbers.length;
      this.constNumbers.push(value);
      this.constMap.set(value, constId);
    }

    // Create const node
    const id = this.nodes.length;
    this.nodes.push({
      kind: "const",
      type: this.numberType,
      constId,
    });

    return id;
  }

  sigTimeAbsMs(): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: "timeAbsMs",
      type: asTypeDesc({
        world: "signal",
        domain: "timeMs",
      }),
    });
    return id;
  }

  sigMap(src: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: "map",
      type: this.numberType,
      src,
      fn,
    });
    return id;
  }

  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: "zip",
      type: this.numberType,
      a,
      b,
      fn,
    });
    return id;
  }

  build(rootId: SigExprId): SignalExprBuildResult {
    return {
      nodes: [...this.nodes], // Clone for immutability
      constPool: { numbers: [...this.constNumbers] }, // Clone
      rootId,
    };
  }

  getNodes(): SignalExprIR[] {
    return this.nodes;
  }

  getConstPool(): ConstPool {
    return { numbers: this.constNumbers };
  }
}

/**
 * Create a new SignalExprBuilder instance.
 *
 * @returns Fresh builder instance
 *
 * @example
 * ```typescript
 * const builder = createSignalExprBuilder();
 * const output = builder.sigZip(
 *   builder.sigConst(10),
 *   builder.sigConst(20),
 *   { kind: "opcode", opcode: OpCode.Add }
 * );
 * const result = builder.build(output);
 * ```
 */
export function createSignalExprBuilder(): SignalExprBuilder {
  return new SignalExprBuilderImpl();
}

/**
 * Helper to create opcode reference for common operations.
 * Reduces boilerplate in block compilers.
 */
export function opcode(code: OpCode): PureFnRef {
  return { kind: "opcode", opcode: code };
}
