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
 * - Return RenderFrameIR directly from schedule execution
 *
 * References:
 * - .agent_planning/compiler-rendering-integration/PLAN-2025-12-26-110434.md §P0-2
 * - design-docs/12-Compiler-Final/14-Compiled-IR-Program-Contract.md §9
 * - design-docs/13-Renderer/11-FINAL-INTEGRATION.md §E
 */

import type { CompiledProgramIR } from "../../compiler/ir";
import type { Program, KernelEvent, RuntimeCtx } from "../../compiler/types";
import type { RenderTree, GroupNode } from "../renderTree";
import type { RenderFrameIR } from "../../compiler/ir/renderIR";
import type { ValueStore } from "../../compiler/ir/stores";
import { ScheduleExecutor } from "./ScheduleExecutor";
import { createRuntimeState } from "./RuntimeState";
import type { RuntimeState } from "./RuntimeState";

/**
 * IRRuntimeAdapter - Adapts CompiledProgramIR to Player's Program interface
 *
 * Manages the lifecycle of ScheduleExecutor and RuntimeState.
 * Provides Program.signal() and Program.event() for Player compatibility.
 *
 * @example
 * ```typescript
 * const adapter = new IRRuntimeAdapter(compiledProgram);
 * const program = adapter.createProgram(); // Program<RenderTree>
 * const tree = program.signal(tMs, runtimeCtx);
 * ```
 */
export class IRRuntimeAdapter {
  private program: CompiledProgramIR;
  private readonly executor: ScheduleExecutor;
  private runtime: RuntimeState;

  /**
   * Create a new IRRuntimeAdapter.
   *
   * @param program - Compiled program IR
   */
  constructor(program: CompiledProgramIR) {
    this.program = program;
    this.executor = new ScheduleExecutor();
    this.runtime = createRuntimeState(program);
    console.log('[IRRuntimeAdapter] Created with program:', {
      patchId: program.patchId,
      scheduleSteps: program.schedule.steps.length,
      stepKinds: program.schedule.steps.map(s => s.kind),
      outputs: program.outputs?.length ?? 0,
    });
  }

  /**
   * Execute a frame and return RenderFrameIR.
   *
   * This is the pure IR path - calls executeFrame which returns RenderFrameIR.
   *
   * @param tMs - Absolute time in milliseconds
   * @returns RenderFrameIR for direct rendering
   */
  private frameCount = 0;
  executeAndGetFrame(tMs: number): RenderFrameIR {
    const frame = this.executor.executeFrame(this.program, this.runtime, tMs);
    if (this.frameCount++ % 60 === 0) {
      console.log('[IRRuntimeAdapter] Frame:', {
        tMs,
        passCount: frame.passes.length,
        passKinds: frame.passes.map(p => p.kind),
        clear: frame.clear.mode,
      });
    }
    return frame;
  }

  /**
   * Access the current ValueStore for render frame execution.
   */
  getValueStore(): ValueStore {
    return this.runtime.values;
  }

  /**
   * Create Program<RenderTree> interface for Player compatibility.
   *
   * Returns a Program object that calls ScheduleExecutor under the hood.
   * The Program's signal() method executes a frame.
   *
   * For production rendering, use executeAndGetFrame() for direct RenderFrameIR access.
   *
   * RuntimeState is preserved across signal() calls (not recreated each frame).
   *
   * @returns Program<RenderTree> compatible with Player
   */
  createProgram(): Program<RenderTree> {
    return {
      signal: (tMs: number, _runtimeCtx: RuntimeCtx): RenderTree => {
        // Execute frame lifecycle using ScheduleExecutor
        const frame = this.executor.executeFrame(this.program, this.runtime, tMs);

        // Convert RenderFrameIR to a stub GroupNode for Player compatibility
        // In production, use executeAndGetFrame() and process the RenderFrameIR directly
        const emptyGroup: GroupNode = {
          kind: "group",
          id: frame.passes.length > 0 ? "root" : "empty",
          children: [],
        };
        return emptyGroup as unknown as RenderTree;
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
   * const playerProgram = adapter.createProgram();
   *
   * // After user edit, hot-swap
   * adapter.swapProgram(program2);
   *
   * // Player continues rendering with program2 (same state, no jank)
   * playerProgram.signal(tMs, ctx);
   * ```
   */
  swapProgram(newProgram: CompiledProgramIR): void {
    // 1. Snapshot old state for preservation
    const oldStateF64 = this.runtime.state.f64.slice();
    const oldStateF32 = this.runtime.state.f32.slice();
    const oldStateI32 = this.runtime.state.i32.slice();
    const oldLayout = this.program.stateLayout;
    const currentFrameId = this.runtime.frameCache.frameId;

    // 2. Create new runtime for new program
    const newRuntime = createRuntimeState(newProgram);

    // 3. Restore frameId (continue incrementing, no reset)
    newRuntime.frameCache.frameId = currentFrameId;

    // 4. Preserve state cells by matching nodeId:role
    // For each old state cell, find matching cell in new layout and copy value
    for (const oldCell of oldLayout.cells) {
      // Find matching cell in new layout (same nodeId + role)
      const newCell = newProgram.stateLayout.cells.find(
        (c) => c.nodeId === oldCell.nodeId && c.role === oldCell.role,
      );

      if (newCell !== undefined) {
        // Copy state value from old to new
        if (newCell.storage === "f64") {
          newRuntime.state.f64[newCell.offset] = oldStateF64[oldCell.offset];
        } else if (newCell.storage === "f32") {
          newRuntime.state.f32[newCell.offset] = oldStateF32[oldCell.offset];
        } else if (newCell.storage === "i32") {
          newRuntime.state.i32[newCell.offset] = oldStateI32[oldCell.offset];
        }
      }
    }

    // 5. Swap to new program and runtime
    this.program = newProgram;
    this.runtime = newRuntime;
  }
}
