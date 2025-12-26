/**
 * @file Signal Bridge - Temporary Signal Evaluation for Broadcast Nodes
 * @description
 * This module provides a minimal signal evaluation bridge that allows field
 * materialization to work with broadcast nodes before Phase 4 (SignalExpr Runtime)
 * is complete.
 *
 * **TEMPORARY**: This is explicitly a Phase 5 workaround. It will be replaced
 * with the proper SignalExpr IR evaluator when Phase 4 is complete.
 *
 * The bridge wraps legacy signal closures and provides the `evalSig()` interface
 * expected by the field materializer.
 *
 * References:
 * - design-docs/12-Compiler-Final/12-SignalExpr.md (future signal IR evaluator)
 * - src/editor/runtime/field/Materializer.ts (evalSig stub)
 */

import type { SigExprId } from "../field/types";

// =============================================================================
// Types
// =============================================================================

/**
 * Signal closure function signature
 * @param t - Current time in milliseconds
 * @returns Signal value at time t
 */
export type SignalClosure = (t: number) => number;

/**
 * Signal environment for evaluation
 */
export interface SigEnv {
  /** Current frame time in milliseconds */
  time: number;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Thrown when trying to evaluate an unregistered signal
 */
export class UnregisteredSignalError extends Error {
  constructor(public readonly sigId: SigExprId) {
    super(
      `Signal ${sigId} is not registered in SignalBridge. ` +
        `Make sure to call registerSignal() before materializing fields that use this signal.`
    );
    this.name = "UnregisteredSignalError";
  }
}

// =============================================================================
// Signal Bridge
// =============================================================================

/**
 * SignalBridge provides temporary signal evaluation for broadcast nodes.
 *
 * **TEMPORARY**: This is a Phase 5 workaround until Phase 4 signal IR evaluator
 * is implemented. The bridge:
 * - Wraps legacy signal closures
 * - Provides evalSig() interface for field materializer
 * - Will be replaced with proper SignalExpr IR evaluation
 *
 * Usage:
 * ```typescript
 * const bridge = new SignalBridge();
 * bridge.registerSignal(sigId, (t) => Math.sin(t / 1000));
 *
 * const env: SigEnv = { time: 1000 };
 * const value = bridge.evalSig(sigId, env);
 * ```
 */
export class SignalBridge {
  /**
   * Map from SigExprId to signal closure
   */
  private signalClosures = new Map<SigExprId, SignalClosure>();

  /**
   * Register a signal closure by ID.
   *
   * This must be called for every signal that will be broadcast to a field
   * before materialization occurs.
   *
   * @param sigId - Signal expression ID
   * @param closure - Signal closure function (t) => value
   */
  registerSignal(sigId: SigExprId, closure: SignalClosure): void {
    this.signalClosures.set(sigId, closure);
  }

  /**
   * Unregister a signal (useful for cleanup or hot-swap scenarios)
   *
   * @param sigId - Signal expression ID to unregister
   * @returns true if the signal was registered, false otherwise
   */
  unregisterSignal(sigId: SigExprId): boolean {
    return this.signalClosures.delete(sigId);
  }

  /**
   * Check if a signal is registered
   *
   * @param sigId - Signal expression ID to check
   * @returns true if registered, false otherwise
   */
  hasSignal(sigId: SigExprId): boolean {
    return this.signalClosures.has(sigId);
  }

  /**
   * Evaluate a signal at the current time.
   *
   * This is the main evaluation function called by field materialization.
   *
   * @param sigId - Signal expression ID to evaluate
   * @param env - Signal environment (contains current time)
   * @throws {UnregisteredSignalError} if sigId is not registered
   * @returns Signal value at env.time
   */
  evalSig(sigId: SigExprId, env: SigEnv): number {
    const closure = this.signalClosures.get(sigId);

    if (!closure) {
      throw new UnregisteredSignalError(sigId);
    }

    return closure(env.time);
  }

  /**
   * Clear all registered signals.
   *
   * Useful for cleanup or when starting a new compilation.
   */
  clear(): void {
    this.signalClosures.clear();
  }

  /**
   * Get the number of registered signals.
   *
   * Useful for debugging and testing.
   */
  get signalCount(): number {
    return this.signalClosures.size;
  }

  /**
   * Get all registered signal IDs.
   *
   * Useful for debugging and introspection.
   */
  getRegisteredSignalIds(): SigExprId[] {
    return Array.from(this.signalClosures.keys());
  }
}

// =============================================================================
// Singleton Instance (Optional Convenience)
// =============================================================================

/**
 * Shared global SignalBridge instance.
 *
 * **NOTE**: This is a convenience for simple use cases. For complex scenarios
 * (multiple patches, hot-swapping), prefer creating your own instances.
 */
export const globalSignalBridge = new SignalBridge();
