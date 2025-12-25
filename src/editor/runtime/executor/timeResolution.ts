/**
 * Time Resolution - Derive Time Signals from Absolute Time
 *
 * Computes effective time values from absolute time (tAbsMs) and TimeModel.
 *
 * References:
 * - HANDOFF.md Topic 3 (ScheduleExecutor - Time Resolution)
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §4
 */

import type { TimeModelIR } from "../../compiler/ir";

// ============================================================================
// Effective Time
// ============================================================================

/**
 * EffectiveTime - Resolved Time Values
 *
 * Contains all derived time signals computed from tAbsMs + TimeModel.
 *
 * These values are written to well-known slots by StepTimeDerive.
 */
export interface EffectiveTime {
  /** Absolute time in milliseconds (input) */
  tAbsMs: number;

  /** Model time in milliseconds (clamped/wrapped based on time model) */
  tModelMs: number;

  // Cyclic model outputs
  /** Phase 0..1 (cyclic models only) */
  phase01?: number;

  /** Wrap event (1.0 when wrapping occurred, 0.0 otherwise) - cyclic models only */
  wrapEvent?: number;

  // Finite model outputs
  /** Progress 0..1 (finite models only) */
  progress01?: number;
}

// ============================================================================
// Time Resolution Function
// ============================================================================

/**
 * Resolve effective time from absolute time and time model.
 *
 * This function computes all derived time signals based on the time model kind.
 *
 * Semantics:
 * - Finite: tModelMs clamped to [0, durationMs], progress01 = tModelMs / durationMs
 * - Cyclic: tModelMs wrapped to [0, periodMs], phase01 = tModelMs / periodMs, wrapEvent detected
 * - Infinite: tModelMs = tAbsMs, no derived signals
 *
 * @param tAbsMs - Absolute time in milliseconds
 * @param timeModel - Time model specification
 * @returns Effective time with all derived signals
 */
export function resolveTime(tAbsMs: number, timeModel: TimeModelIR): EffectiveTime {
  switch (timeModel.kind) {
    case "finite": {
      // Clamp to duration
      const tModelMs = Math.max(0, Math.min(tAbsMs, timeModel.durationMs));
      const progress01 = timeModel.durationMs > 0 ? tModelMs / timeModel.durationMs : 0;

      return {
        tAbsMs,
        tModelMs,
        progress01,
      };
    }

    case "cyclic": {
      // Wrap to period
      const periodMs = timeModel.periodMs;
      let tModelMs: number;
      let wrapEvent = 0.0;

      if (timeModel.mode === "loop") {
        // Standard loop: modulo
        const prevTModelMs = ((tAbsMs - 16.67) % periodMs + periodMs) % periodMs; // approx 60fps
        tModelMs = (tAbsMs % periodMs + periodMs) % periodMs;

        // Detect wrap (when tModelMs < prevTModelMs, we wrapped)
        if (tModelMs < prevTModelMs) {
          wrapEvent = 1.0;
        }
      } else {
        // Ping-pong: bounce at boundaries
        const cycleCount = Math.floor(tAbsMs / periodMs);
        const tInCycle = tAbsMs % periodMs;
        const isReverse = cycleCount % 2 === 1;

        tModelMs = isReverse ? periodMs - tInCycle : tInCycle;

        // Wrap event at each bounce
        const prevCycleCount = Math.floor((tAbsMs - 16.67) / periodMs);
        if (cycleCount !== prevCycleCount) {
          wrapEvent = 1.0;
        }
      }

      const phase01 = periodMs > 0 ? tModelMs / periodMs : 0;

      return {
        tAbsMs,
        tModelMs,
        phase01,
        wrapEvent,
      };
    }

    case "infinite": {
      // No transformation: tModelMs = tAbsMs
      return {
        tAbsMs,
        tModelMs: tAbsMs,
      };
    }

    default: {
      // Exhaustiveness check
      const _exhaustive: never = timeModel;
      throw new Error(`Unknown time model kind: ${(_exhaustive as TimeModelIR).kind}`);
    }
  }
}
