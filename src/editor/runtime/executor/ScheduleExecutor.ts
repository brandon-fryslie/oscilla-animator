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
import type { RenderFrameIR } from "../../compiler/ir/renderIR";
import { resolveTime, type EffectiveTime } from "./timeResolution";

// Step executors
import { executeTimeDerive } from "./steps/executeTimeDerive";
import { executeNodeEval } from "./steps/executeNodeEval";
import { executeBusEval } from "./steps/executeBusEval";
import { executeEventBusEval } from "./steps/executeEventBusEval";
import { executeMaterialize } from "./steps/executeMaterialize";
import { executeMaterializeColor } from "./steps/executeMaterializeColor";
import { executeMaterializePath } from "./steps/executeMaterializePath";
import { executeMaterializeTestGeometry } from "./steps/executeMaterializeTestGeometry";
import { executeRenderAssemble } from "./steps/executeRenderAssemble";
import { executeDebugProbe } from "./steps/executeDebugProbe";
import { executeSignalEval } from "./steps/executeSignalEval";

// 3D step executors
import { executeCameraEval } from "./steps/executeCameraEval";
import { executeMeshMaterialize } from "./steps/executeMeshMaterialize";
import { executeInstances3DProject } from "./steps/executeInstances3DProject";

// ============================================================================
// Type Guard for RenderFrameIR
// ============================================================================

/**
 * Type guard to check if a value is a valid RenderFrameIR.
 *
 * A RenderFrameIR has version, clear, and passes.
 */
function isRenderFrameIR(value: unknown): value is RenderFrameIR {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const frame = value as { version?: number; passes?: unknown[] };
  return (
    frame.version === 1 &&
    Array.isArray(frame.passes)
  );
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
 * 4. Output extraction (produce RenderTree)
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
   * 3. Resolve effective time (with wrap detection using timeState)
   * 4. Execute each step in schedule order
   * 5. Extract render output
   *
   * @param program - Compiled program IR
   * @param runtime - Runtime state (values, state, caches, timeState)
   * @param tMs - Absolute time in milliseconds
   * @returns RenderFrameIR for this frame
   */
  public executeFrame(
    program: CompiledProgramIR,
    runtime: RuntimeState,
    tMs: number,
  ): RenderFrameIR {
    // 1. New frame lifecycle
    runtime.frameCache.newFrame();
    runtime.values.clear();
    runtime.frameId++;

    // 2. Compute effective time (pass timeState for wrap detection)
    const effectiveTime = resolveTime(tMs, program.timeModel, runtime.timeState);

    // 3. Execute each step in schedule order
    for (const step of program.schedule.steps) {
      this.executeStep(step, program, runtime, effectiveTime);
    }

    // 4. Extract render output
    return this.extractRenderOutput(program, runtime);
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
   * - timeState preserved (for wrap detection)
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

      case "signalEval":
        executeSignalEval(step, program, runtime, effectiveTime);
        break;

      case "nodeEval":
        executeNodeEval(step, program, runtime);
        break;

      case "busEval":
        executeBusEval(step, program, runtime);
        break;

      case "eventBusEval":
        executeEventBusEval(step, program, runtime);
        break;

      case "materialize":
        executeMaterialize(step, program, runtime, effectiveTime);
        break;

      case "materializeColor":
        executeMaterializeColor(step, program, runtime);
        break;

      case "materializePath":
        executeMaterializePath(step, program, runtime);
        break;

      case "materializeTestGeometry":
        executeMaterializeTestGeometry(step, program, runtime);
        break;

      case "renderAssemble":
        executeRenderAssemble(step, program, runtime);
        break;

      case "debugProbe":
        executeDebugProbe(step, runtime);
        break;

      // 3D steps
      case "CameraEval":
        executeCameraEval(
          step,
          runtime.cameraStore,
          runtime.viewport,
          runtime.values
        );
        break;

      case "MeshMaterialize": {
        const { result } = executeMeshMaterialize(step, runtime.meshStore);
        // Write mesh buffer to output slot
        runtime.values.write(step.outSlot, { kind: 'meshBuffer', buffer: result });
        break;
      }

      case "Instances3DProjectTo2D":
        executeInstances3DProject(
          step,
          runtime.values,
          runtime.viewport
        );
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
   * Reads the RenderFrameIR from the output slot specified in program.outputs[0].
   * Validates that the value is a valid RenderFrameIR structure.
   *
   * @param program - Compiled program (contains output specification)
   * @param runtime - Runtime state (contains ValueStore with render frame)
   * @returns RenderFrameIR for this frame
   * @throws Error if no outputs defined or output slot is empty/invalid
   */
  private extractRenderOutput(
    program: CompiledProgramIR,
    runtime: RuntimeState,
  ): RenderFrameIR {
    // Handle case where program has no outputs
    if (!program.outputs || program.outputs.length === 0) {
      // Return empty render frame
      return {
        version: 1,
        clear: { mode: "none" },
        passes: [],
      };
    }

    // Get first output specification (render root)
    const outputSpec = program.outputs[0];

    // Read render frame from output slot
    const value = runtime.values.read(outputSpec.slot);

    // Validate that value is a RenderFrameIR
    if (!isRenderFrameIR(value)) {
      throw new Error(
        `extractRenderOutput: output slot ${outputSpec.slot} does not contain a valid RenderFrameIR. ` +
        `Expected {version: 1, passes: [...]}, got: ${JSON.stringify(value)?.slice(0, 100)}`
      );
    }

    return value;
  }
}
