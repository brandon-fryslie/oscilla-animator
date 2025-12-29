/**
 * Legacy Closure Types
 *
 * Interface for legacy signal closures during migration period.
 * This is TEMPORARY infrastructure to support gradual migration from
 * closure-based signals to SignalExpr IR.
 *
 * Philosophy:
 * - Bridge old and new systems during migration
 * - Explicit context passing (no hidden closure state)
 * - Will be removed once all blocks are migrated
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P0 "Define Legacy Closure Types"
 * - design-docs/12-Compiler-Final/01.1-CompilerMigration-Roadmap.md
 */

import type { SigEnv } from "./SigEnv";

/**
 * Legacy closure signature - matches existing Signal<float> type.
 *
 * This is the signature used by the current closure-based compiler.
 * During migration, these closures are called from within SignalExpr DAG
 * via closureBridge nodes.
 *
 * @param tAbsMs - Absolute time in milliseconds
 * @param ctx - Legacy context with frame timing
 * @returns Signal value (number)
 *
 * @example
 * ```typescript
 * // Legacy oscillator closure
 * const legacyOsc: LegacyClosure = (t, ctx) => {
 *   return Math.sin(t * 0.001 * Math.PI * 2);
 * };
 * ```
 */
export type LegacyClosure = (tAbsMs: number, ctx: LegacyContext) => number;

/**
 * Legacy context - runtime information for legacy closures.
 *
 * Matches the context interface expected by existing closure-based signals.
 * Adapted from SigEnv to provide compatibility.
 */
export interface LegacyContext {
  /** Time since last frame (seconds) */
  deltaSec: number;

  /** Time since last frame (milliseconds) */
  deltaMs: number;

  /** Monotonic frame counter */
  frameIndex: number;
}

/**
 * Create a legacy context from a signal evaluation environment.
 *
 * Adapts the new SigEnv interface to the old LegacyContext interface.
 * This bridges the gap between new and old systems during migration.
 *
 * @param env - Signal evaluation environment
 * @returns Legacy context for closure evaluation
 *
 * @example
 * ```typescript
 * const env = createSigEnv({ ... });
 * const ctx = createLegacyContext(env);
 * const result = legacyClosure(env.tAbsMs, ctx);
 * ```
 */
export function createLegacyContext(env: SigEnv): LegacyContext {
  return {
    deltaSec: env.runtimeCtx.deltaSec,
    deltaMs: env.runtimeCtx.deltaMs,
    frameIndex: env.runtimeCtx.frameIndex,
  };
}
