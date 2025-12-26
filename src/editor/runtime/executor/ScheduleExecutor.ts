/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the explicit schedule of steps to produce a frame.
 *
 * This is the heart of Phase 6 - the component that replaces
 * the closure-based `program.signal(tMs, ctx)` with explicit
 * step-by-step execution.
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor)
 * - design-docs/12-Compiler-Final/10-Schedule-Semantics.md §12
 * - design-docs/12-Compiler-Final/17-Scheduler-Full.md
 */

import type { CompiledProgramIR, StepIR } from "../../compiler/ir";
import type { RuntimeState } from "./RuntimeState";
import { resolveTime, type EffectiveTime } from "./timeResolution";

// Step executors
import { executeTimeDerive } from "./steps/executeTimeDerive";
import { executeNodeEval } from "./steps/executeNodeEval";
import { executeBusEval } from "./steps/executeBusEval";
import { executeMaterialize } from "./steps/executeMaterialize";
import { executeRenderAssemble } from "./steps/executeRenderAssemble";
import { executeDebugProbe } from "./steps/executeDebugProbe";

// ============================================================================
// Render Output (Stub for Sprint 1)
// ============================================================================

/**
 * RenderOutput - Final Frame Output
 *
 * Stub type for Sprint 1. Full definition will be in Phase 5.
 * For now, just a placeholder shape.
 *
 * TODO: Phase 5 - Define complete RenderOutput structure
 * - RenderTree or RenderCommands
 * - Instance buffers
 * - Uniform values
 * - Camera/viewport info
 */
export interface RenderOutput {
  /** Stub: just indicate frame completed */
  frameId: number;

  /** Stub: placeholder for render data */
  renderData?: unknown;
}

// ============================================================================
// Schedule Executor
// ============================================================================

/**
 * ScheduleExecutor - Frame Execution Engine
 *
 * Executes a compiled program for a single frame.
 *
 * Responsibilities:
 * 1. Frame lifecycle (new frame setup, clear per-frame state)
 * 2. Time resolution (compute effective time from tAbsMs + TimeModel)
 * 3. Step dispatch (execute each StepIR in schedule order)
 * 4. Output extraction (produce RenderOutput)
 * 5. Hot-swap (jank-free program replacement)
 *
 * Key invariants:
 * - Steps execute in exact schedule order (no reordering)
 * - Single writer per slot per frame (enforced by ValueStore)
 * - Deterministic execution (same inputs → same outputs)
 */
export class ScheduleExecutor {
  /**
   * Execute one frame of the schedule.
   *
   * Frame lifecycle:
   * 1. Start new frame (increment frameId, invalidate per-frame caches)
   * 2. Clear ValueStore (reset slot writes)
   * 3. Resolve effective time
   * 4. Execute each step in schedule order
   * 5. Extract render output
   *
   * @param program - Compiled program IR
   * @param runtime - Runtime state (values, state, caches)
   * @param tMs - Absolute time in milliseconds
   * @returns Render output for this frame
   */
  public executeFrame(
    program: CompiledProgramIR,
    runtime: RuntimeState,
    tMs: number,
  ): RenderOutput {
    // 1. New frame lifecycle
    runtime.frameCache.newFrame();
    runtime.values.clear();
    runtime.frameId++;

    // 2. Compute effective time
    const effectiveTime = resolveTime(tMs, program.timeModel);

    // 3. Execute each step in schedule order
    for (const step of program.schedule.steps) {
      this.executeStep(step, program, runtime, effectiveTime);
    }

    // 4. Extract render output (stub for Sprint 1)
    return this.extractRenderOutput(runtime);
  }

  /**
   * Hot-swap program while preserving state and time continuity.
   *
   * This is the core jank-free live editing primitive. It swaps to a new
   * compiled program while preserving state cells and frame continuity.
   *
   * State Preservation:
   * - Matching state cells (by nodeId:role) are copied
   * - New state cells initialized with defaults
   * - Removed state cells dropped
   *
   * Time Continuity:
   * - frameId preserved (not reset)
   * - FrameCache.frameId preserved
   *
   * Cache Policy:
   * - Per-frame caches invalidated
   * - New caches allocated
   *
   * @param newProgram - New compiled program to swap to
   * @param oldRuntime - Current runtime state
   * @returns New RuntimeState with preserved state/time
   *
   * @example
   * ```typescript
   * // Execute with old program
   * executor.executeFrame(oldProgram, runtime, tMs);
   *
   * // User edits patch - recompile
   * const newProgram = compile(editedPatch);
   *
   * // Hot-swap (no visual jank)
   * runtime = executor.swapProgram(newProgram, runtime);
   *
   * // Continue with new program
   * executor.executeFrame(newProgram, runtime, tMs);
   * ```
   */
  public swapProgram(
    newProgram: CompiledProgramIR,
    oldRuntime: RuntimeState,
  ): RuntimeState {
    // Hot-swap via RuntimeState.hotSwap()
    return oldRuntime.hotSwap(newProgram);
  }

  /**
   * Execute a single step.
   *
   * Dispatches to the appropriate step executor based on step.kind.
   * Uses exhaustive switch to ensure all step kinds are handled.
   *
   * @param step - Step to execute
   * @param program - Compiled program
   * @param runtime - Runtime state
   * @param effectiveTime - Resolved time values
   */
  private executeStep(
    step: StepIR,
    program: CompiledProgramIR,
    runtime: RuntimeState,
    effectiveTime: EffectiveTime,
  ): void {
    switch (step.kind) {
      case "timeDerive":
        executeTimeDerive(step, runtime, effectiveTime);
        break;

      case "nodeEval":
        executeNodeEval(step, program, runtime);
        break;

      case "busEval":
        executeBusEval(step, program, runtime);
        break;

      case "materialize":
        executeMaterialize(step, program, runtime);
        break;

      case "renderAssemble":
        executeRenderAssemble(step, program, runtime);
        break;

      case "debugProbe":
        executeDebugProbe(step, runtime);
        break;

      default: {
        // Exhaustiveness check - TypeScript will error if a case is missing
        const _exhaustive: never = step;
        throw new Error(`Unknown step kind: ${(_exhaustive as StepIR).kind}`);
      }
    }
  }

  /**
   * Extract render output from runtime state.
   *
   * Stub implementation for Sprint 1.
   * Full implementation will read from output slots specified in program.outputs.
   *
   * TODO: Phase 5 - Extract actual render data
   * - Read from program.outputs[0].slot (render root)
   * - Validate render tree structure
   * - Return properly typed RenderOutput
   *
   * @param runtime - Runtime state
   * @returns Render output (stub)
   */
  private extractRenderOutput(runtime: RuntimeState): RenderOutput {
    // Stub: just return frame ID
    return {
      frameId: runtime.frameId,
      renderData: undefined, // TODO: Extract from output slots
    };
  }
}
