/**
 * IR Runtime Adapter - Bridge from ScheduleExecutor to Player
 *
 * Wraps CompiledProgramIR and ScheduleExecutor to provide the Program<RenderTree>
 * interface expected by Player.
 *
 * This adapter enables the Player to use IR-based programs without modification,
 * bridging the gap between the new IR compiler and the existing Player interface.
 *
 * Key responsibilities:
 * - Wrap ScheduleExecutor.executeFrame() as Program.signal()
 * - Manage RuntimeState lifecycle across frames
 * - Support hot-swap via swapProgram()
 * - Stub Program.event() (events not implemented yet)
 *
 * References:
 * - .agent_planning/compiler-rendering-integration/PLAN-2025-12-26-110434.md §P0-2
 * - design-docs/12-Compiler-Final/14-Compiled-IR-Program-Contract.md §9
 */

import type { CompiledProgramIR } from "../../compiler/ir";
import type { RuntimeCtx, Program, KernelEvent } from "../../compiler/types";
import type { RenderTree } from "../renderTree";
import { ScheduleExecutor } from "./ScheduleExecutor";
import { createRuntimeState, type RuntimeState } from "./RuntimeState";

/**
 * IRRuntimeAdapter - Bridge ScheduleExecutor to Player
 *
 * Adapts the IR-based execution model (ScheduleExecutor + RuntimeState) to
 * the Player's expected Program<RenderTree> interface.
 *
 * Usage:
 * ```typescript
 * const program = compile(patch); // CompiledProgramIR
 * const adapter = new IRRuntimeAdapter(program);
 * const playerProgram = adapter.createProgram();
 * player.setIRProgram(playerProgram); // Use with Player
 * ```
 */
export class IRRuntimeAdapter {
  private executor: ScheduleExecutor;
  private program: CompiledProgramIR;
  private runtime: RuntimeState;

  /**
   * Create adapter from compiled program.
   *
   * Initializes ScheduleExecutor and RuntimeState for frame execution.
   *
   * @param program - Compiled program IR
   */
  constructor(program: CompiledProgramIR) {
    this.executor = new ScheduleExecutor();
    this.program = program;
    this.runtime = createRuntimeState(program);
  }

  /**
   * Create Program<RenderTree> interface for Player.
   *
   * Returns a Program object that calls ScheduleExecutor under the hood.
   * The Program's signal() method executes a frame and returns a RenderTree.
   *
   * RuntimeState is preserved across signal() calls (not recreated each frame).
   *
   * @returns Program<RenderTree> compatible with Player
   */
  createProgram(): Program<RenderTree> {
    return {
      signal: (tMs: number, _runtimeCtx: RuntimeCtx): RenderTree => {
        // Execute frame using ScheduleExecutor
        // Note: RuntimeCtx is currently ignored (P3-1 will add viewport support)
        return this.executor.executeFrame(this.program, this.runtime, tMs);
      },

      event: (_ev: KernelEvent): KernelEvent[] => {
        // Events not implemented yet - return empty array
        // This will be implemented in a future phase when event system is complete
        return [];
      },
    };
  }

  /**
   * Hot-swap to a new program while preserving state and time continuity.
   *
   * Swaps the internal program and runtime to a new CompiledProgramIR.
   * State cells matching by nodeId:role are preserved.
   * FrameId continues incrementing (no reset).
   *
   * This method should be called when the user edits the patch and it recompiles.
   * The Player will continue rendering without visual jank.
   *
   * @param newProgram - New compiled program to swap to
   *
   * @example
   * ```typescript
   * // Initial program
   * const adapter = new IRRuntimeAdapter(program1);
   * player.setIRProgram(adapter.createProgram());
   *
   * // User edits patch - recompile
   * const program2 = compile(editedPatch);
   *
   * // Hot-swap (preserves state)
   * adapter.swapProgram(program2);
   * // Player continues using the same Program object, but now with new behavior
   * ```
   */
  swapProgram(newProgram: CompiledProgramIR): void {
    // Use ScheduleExecutor.swapProgram() to get new runtime with preserved state
    this.runtime = this.executor.swapProgram(newProgram, this.runtime);
    this.program = newProgram;
  }
}
