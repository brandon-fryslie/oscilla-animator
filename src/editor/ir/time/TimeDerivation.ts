/**
 * Time Derivation for IR
 *
 * Functions for deriving time signals from TimeModelIR.
 * This is what the runtime's timeDerive step uses.
 *
 * @module ir/time/TimeDerivation
 */

import type {
  TimeModelIR,
  CyclicTimeModelIR,
  FiniteTimeModelIR,
} from '../schema/CompiledProgramIR';
import type { ValueSlot } from '../types/Indices';

// =============================================================================
// Canonical Time Signals
// =============================================================================

/**
 * Canonical time signals produced by time derivation.
 * The actual ValueSlots are assigned during compilation.
 */
export interface CanonicalTimeSignals {
  /** Absolute monotonic time in milliseconds (never wraps) */
  readonly tAbsMs: ValueSlot;

  /** Model-local time in milliseconds (may wrap for cyclic) */
  readonly tModelMs: ValueSlot;

  /** Phase 0..1 (cyclic/finite only) */
  readonly phase01?: ValueSlot;

  /** Wrap event (true on frame where wrap occurred, cyclic only) */
  readonly wrapEvent?: ValueSlot;

  /** Progress 0..1 for finite animations */
  readonly progress?: ValueSlot;

  /** End event for finite animations (true when progress >= 1) */
  readonly endEvent?: ValueSlot;
}

/**
 * Specification of which canonical time signals are available.
 * Boolean flags indicate availability, not actual slots.
 */
export interface CanonicalTimeSignalSpec {
  readonly tAbsMs: boolean;
  readonly tModelMs: boolean;
  readonly phase01: boolean;
  readonly wrapEvent: boolean;
  readonly progress: boolean;
  readonly endEvent: boolean;
}

/**
 * Derive which canonical time signals are available for a TimeModel.
 *
 * @param model - The time model
 * @returns Specification of available signals
 */
export function deriveTimeSignals(model: TimeModelIR): CanonicalTimeSignalSpec {
  switch (model.kind) {
    case 'cyclic':
      return {
        tAbsMs: true,
        tModelMs: true,
        phase01: true,
        wrapEvent: true,
        progress: false,
        endEvent: false,
      };

    case 'finite':
      return {
        tAbsMs: true,
        tModelMs: true,
        phase01: true,  // Progress is also a phase
        wrapEvent: false,
        progress: true,
        endEvent: true,
      };

    case 'infinite':
      return {
        tAbsMs: true,
        tModelMs: true,
        phase01: false,
        wrapEvent: false,
        progress: false,
        endEvent: false,
      };
  }
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Result of time model validation.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validate a TimeModel for internal consistency.
 *
 * @param model - The time model to validate
 * @returns Validation result with any errors
 */
export function validateTimeModel(model: TimeModelIR): ValidationResult {
  const errors: string[] = [];

  switch (model.kind) {
    case 'cyclic':
      if (model.periodMs <= 0) {
        errors.push('Cyclic time model must have periodMs > 0');
      }
      if (model.phaseDomain !== '0..1') {
        errors.push('Cyclic time model phaseDomain must be "0..1"');
      }
      if (model.mode !== 'loop' && model.mode !== 'pingpong') {
        errors.push('Cyclic time model mode must be "loop" or "pingpong"');
      }
      break;

    case 'finite':
      if (model.durationMs <= 0) {
        errors.push('Finite time model must have durationMs > 0');
      }
      if (model.cuePoints) {
        for (const cp of model.cuePoints) {
          if (cp.tMs < 0) {
            errors.push(`Cue point "${cp.id}" at ${cp.tMs}ms must be >= 0`);
          }
          if (cp.tMs > model.durationMs) {
            errors.push(`Cue point "${cp.id}" at ${cp.tMs}ms is outside duration ${model.durationMs}ms`);
          }
        }
      }
      break;

    case 'infinite':
      if (model.windowMs <= 0) {
        errors.push('Infinite time model must have windowMs > 0');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// Time Derivation Calculation
// =============================================================================

/**
 * Time-derived values for a single frame.
 */
export interface TimeDerivedValues {
  /** Absolute time in milliseconds */
  readonly tAbsMs: number;

  /** Model-local time in milliseconds */
  readonly tModelMs: number;

  /** Phase 0..1 (cyclic/finite only) */
  readonly phase01?: number;

  /** Wrap event occurred this frame (cyclic only) */
  readonly wrapEvent?: boolean;

  /** Progress 0..1 (finite only) */
  readonly progress?: number;

  /** End event occurred this frame (finite only) */
  readonly endEvent?: boolean;
}

/**
 * Calculate time-derived values for a given absolute time.
 * This is what the runtime's timeDerive step executes.
 *
 * @param model - The time model
 * @param tAbsMs - Current absolute time in milliseconds
 * @param prevTAbsMs - Previous frame's absolute time (for event detection)
 * @returns Time-derived values for this frame
 */
export function calculateTimeDerivedValues(
  model: TimeModelIR,
  tAbsMs: number,
  prevTAbsMs: number
): TimeDerivedValues {
  switch (model.kind) {
    case 'cyclic':
      return calculateCyclicTime(model, tAbsMs, prevTAbsMs);

    case 'finite':
      return calculateFiniteTime(model, tAbsMs, prevTAbsMs);

    case 'infinite':
      return calculateInfiniteTime(tAbsMs);
  }
}

/**
 * Calculate time values for cyclic time model.
 */
function calculateCyclicTime(
  model: CyclicTimeModelIR,
  tAbsMs: number,
  prevTAbsMs: number
): TimeDerivedValues {
  const { periodMs, mode } = model;

  // Calculate raw phase (may be > 1 for multiple periods)
  const rawPhase = tAbsMs / periodMs;
  const prevRawPhase = prevTAbsMs / periodMs;

  // Model-local time wraps at period
  const tModelMs = tAbsMs % periodMs;

  // Phase 0..1
  let phase01: number;
  if (mode === 'pingpong') {
    // Pingpong: 0→1→0→1...
    const cyclePhase = rawPhase % 2;
    phase01 = cyclePhase <= 1 ? cyclePhase : 2 - cyclePhase;
  } else {
    // Loop: 0→1→0→1...
    phase01 = rawPhase % 1;
  }

  // Wrap event: detect when we crossed a period boundary
  const currentCycle = Math.floor(rawPhase);
  const prevCycle = Math.floor(prevRawPhase);
  const wrapEvent = currentCycle > prevCycle;

  return {
    tAbsMs,
    tModelMs,
    phase01,
    wrapEvent,
  };
}

/**
 * Calculate time values for finite time model.
 */
function calculateFiniteTime(
  model: FiniteTimeModelIR,
  tAbsMs: number,
  prevTAbsMs: number
): TimeDerivedValues {
  const { durationMs } = model;

  // Clamp model time to duration
  const tModelMs = Math.min(tAbsMs, durationMs);

  // Progress 0..1 (clamped)
  const progress = Math.min(tAbsMs / durationMs, 1);
  const prevProgress = Math.min(prevTAbsMs / durationMs, 1);

  // End event: crossed the 100% threshold
  const endEvent = progress >= 1 && prevProgress < 1;

  return {
    tAbsMs,
    tModelMs,
    phase01: progress,  // For finite, phase01 === progress
    progress,
    endEvent,
  };
}

/**
 * Calculate time values for infinite time model.
 */
function calculateInfiniteTime(tAbsMs: number): TimeDerivedValues {
  // Infinite: time just flows
  return {
    tAbsMs,
    tModelMs: tAbsMs,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the period/duration of a time model in milliseconds.
 * Returns undefined for infinite time models.
 */
export function getTimeModelPeriod(model: TimeModelIR): number | undefined {
  switch (model.kind) {
    case 'cyclic':
      return model.periodMs;
    case 'finite':
      return model.durationMs;
    case 'infinite':
      return undefined;
  }
}

/**
 * Check if a time model is bounded (has a finite duration/period).
 */
export function isTimeModelBounded(model: TimeModelIR): boolean {
  return model.kind !== 'infinite';
}

/**
 * Check if a time model loops.
 */
export function isTimeModelLooping(model: TimeModelIR): boolean {
  return model.kind === 'cyclic';
}
