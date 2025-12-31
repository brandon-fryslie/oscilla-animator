/**
 * Time Resolution - Convert Absolute Time to Effective Time
 *
 * Resolves absolute time (tAbsMs) into effective time signals based on the time model.
 *
 * References:
 * - design-docs/spec/SPEC-05-time-architecture.md (Time Models)
 * - .agent_planning/time-event-semantics/PLAN-2025-12-31-013758.md (Event Payloads)
 */

import type { TimeModelIR } from "../../compiler/ir";

// ============================================================================
// EffectiveTime Interface
// ============================================================================

/**
 * EffectiveTime - Resolved time signals for a frame
 *
 * Contains all time-derived signals computed from the time model.
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

  // Scrub detection (P2)
  /** True if this frame is a scrub (non-monotonic or large jump) */
  isScrub: boolean;
}

// ============================================================================
// Time State (for wrap detection)
// ============================================================================

/**
 * TimeState - Persistent time state for wrap detection
 *
 * Stores previous tModelMs to enable accurate wrap/bounce detection,
 * plus wrap count and frame delta for event payloads.
 *
 * This state should be maintained across frames in RuntimeState.
 *
 * References:
 * - .agent_planning/time-event-semantics/PLAN-2025-12-31-013758.md (P1)
 */
export interface TimeState {
  /** Previous tModelMs (for wrap detection) */
  prevTModelMs: number | null;

  /** Previous tAbsMs (for deltaMs calculation) */
  prevTAbsMs: number | null;

  /** Total wrap count since animation start */
  wrapCount: number;

  /** Last frame delta (ms) - for event payloads */
  lastDeltaMs: number;
}

/**
 * Create initial TimeState
 */
export function createTimeState(): TimeState {
  return {
    prevTModelMs: null,
    prevTAbsMs: null,
    wrapCount: 0,
    lastDeltaMs: 0,
  };
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
 * Wrap Detection:
 * - Uses actual previous tModelMs comparison (stored in timeState)
 * - Detects wrap when tModelMs < prevTModelMs (for loop mode)
 * - Detects bounce when cycleCount changes (for ping-pong mode)
 * - Works correctly under variable frame rates and scrubbing
 * - Tracks wrap count and deltaMs for event payloads
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
 *
 * Scrub Detection (P2):
 * - Scrub detected when: mode === 'scrub' OR |deltaMs| > 1000 OR deltaMs < 0
 * - When scrub detected: wrapEvent suppressed (set to 0.0)
 * - Prevents phantom wrap events during non-monotonic time changes
=======
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
 *
 * @param tAbsMs - Absolute time in milliseconds
 * @param timeModel - Time model specification
 * @param timeState - Optional time state for wrap detection (modified in place)
 * @param mode - Optional playback mode ('playback' | 'scrub', defaults to 'playback')
 * @returns Effective time with all derived signals
 */
export function resolveTime(
  tAbsMs: number,
  timeModel: TimeModelIR,
  timeState?: TimeState,
  mode: 'playback' | 'scrub' = 'playback'
): EffectiveTime {
  // Calculate frame delta for event payloads
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
  let deltaMs = 0;
  if (timeState !== undefined) {
    if (timeState.prevTAbsMs !== null) {
      deltaMs = tAbsMs - timeState.prevTAbsMs;
      timeState.lastDeltaMs = deltaMs;
=======
  if (timeState !== undefined) {
    if (timeState.prevTAbsMs !== null) {
      timeState.lastDeltaMs = tAbsMs - timeState.prevTAbsMs;
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
  if (timeState !== undefined) {
    if (timeState.prevTAbsMs !== null) {
      timeState.lastDeltaMs = tAbsMs - timeState.prevTAbsMs;
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
  if (timeState !== undefined) {
    if (timeState.prevTAbsMs !== null) {
      timeState.lastDeltaMs = tAbsMs - timeState.prevTAbsMs;
<<<<<<< HEAD
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
    }
    timeState.prevTAbsMs = tAbsMs;
  }

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
  // Detect scrub mode (P2)
  // Scrub if: explicit mode OR backward time OR large jump (>1s)
  const isScrub = mode === 'scrub' || deltaMs < 0 || Math.abs(deltaMs) > 1000;

=======
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 3cfa545 (feat(events): Implement EventStore for discrete event semantics)
  switch (timeModel.kind) {
    case "finite": {
      // Clamp to duration
      const tModelMs = Math.max(0, Math.min(tAbsMs, timeModel.durationMs));
      const progress01 = timeModel.durationMs > 0 ? tModelMs / timeModel.durationMs : 0;

      return {
        tAbsMs,
        tModelMs,
        progress01,
        isScrub,
      };
    }

    case "cyclic": {
      // Wrap to period
      const periodMs = timeModel.periodMs;
      let tModelMs: number;
      let wrapEvent = 0.0;

      if (timeModel.mode === "loop") {
        // Standard loop: modulo
        tModelMs = (tAbsMs % periodMs + periodMs) % periodMs;

        // Detect wrap using actual previous tModelMs (if available)
        // Suppress wrap event during scrub (P2)
        if (timeState !== undefined && timeState.prevTModelMs !== null && !isScrub) {
          // Wrap occurred if current tModelMs < previous tModelMs
          // This handles both forward playback wraps and scrubbing backwards across wrap boundary
          if (tModelMs < timeState.prevTModelMs) {
            wrapEvent = 1.0;
            timeState.wrapCount++;
          }
        }

        // Update time state for next frame
        if (timeState !== undefined) {
          timeState.prevTModelMs = tModelMs;
        }
      } else {
        // Ping-pong: bounce at boundaries
        const cycleCount = Math.floor(tAbsMs / periodMs);
        const tInCycle = tAbsMs % periodMs;
        const isReverse = cycleCount % 2 === 1;

        tModelMs = isReverse ? periodMs - tInCycle : tInCycle;

        // Detect bounce using actual previous cycle count (derived from prevTModelMs)
        // Suppress wrap event during scrub (P2)
        if (timeState !== undefined && timeState.prevTModelMs !== null && !isScrub) {
          // Derive previous cycle count from prevTModelMs and compare
          // For ping-pong, wrap occurs when direction changes
          const prevCycleCount = Math.floor((tAbsMs - (tModelMs - timeState.prevTModelMs)) / periodMs);
          if (cycleCount !== prevCycleCount) {
            wrapEvent = 1.0;
            timeState.wrapCount++;
          }
        }

        // Update time state for next frame
        if (timeState !== undefined) {
          timeState.prevTModelMs = tModelMs;
        }
      }

      const phase01 = periodMs > 0 ? tModelMs / periodMs : 0;

      return {
        tAbsMs,
        tModelMs,
        phase01,
        wrapEvent,
        isScrub,
      };
    }

    case "infinite": {
      // No transformation: tModelMs = tAbsMs
      return {
        tAbsMs,
        tModelMs: tAbsMs,
        isScrub,
      };
    }

    default: {
      // Exhaustiveness check
      const _exhaustive: never = timeModel;
      throw new Error(`Unknown time model kind: ${(_exhaustive as TimeModelIR).kind}`);
    }
  }
}
