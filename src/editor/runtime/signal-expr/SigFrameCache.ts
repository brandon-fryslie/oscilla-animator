/**
 * Per-Frame Signal Cache
 *
 * Implements per-frame memoization for signal expressions.
 * Ensures each signal node is evaluated at most once per frame.
 *
 * Cache Strategy:
 * - Parallel typed arrays for value and stamp storage
 * - Cache hit: stamp[sigId] === frameId
 * - Cache miss: stamp[sigId] !== frameId
 * - No clearing on new frame - stamp comparison handles invalidation
 *
 * IMPORTANT: frameId starts at 1 (not 0) to avoid collision with initial Uint32Array values.
 *
 * References:
 * - .agent_planning/signalexpr-runtime/PLAN-20251225-190000.md §P0 "Implement SigFrameCache"
 * - .agent_planning/signalexpr-runtime/HANDOFF.md §1 "Per-Frame Cache Structure"
 */

import type { SigExprId } from "../../compiler/ir/types";

/**
 * Per-frame cache for signal evaluation.
 *
 * Maintains parallel arrays for values, stamps, and validity masks.
 * Frame invalidation is handled by stamp comparison (no array clearing).
 */
export interface SigFrameCache {
  /** Current frame ID - increments monotonically (starts at 1) */
  frameId: number;

  /** Cached signal values (Float64Array for number signals) */
  value: Float64Array;

  /** Frame stamp for each cached value (Uint32Array) */
  stamp: Uint32Array;

  /**
   * Validity mask for non-number types (future).
   * Reserved for vec2, color, etc.
   */
  validMask: Uint8Array;
}

/**
 * Create a new per-frame cache with specified capacity.
 *
 * @param capacity - Number of signal nodes to support (default: 1024)
 * @returns Initialized cache with frameId=1 (stamps are 0, so no false cache hits)
 *
 * @example
 * ```typescript
 * const cache = createSigFrameCache(1024);
 * console.log(cache.frameId); // 1 (NOT 0 - prevents false cache hits)
 * console.log(cache.value.length); // 1024
 * ```
 */
export function createSigFrameCache(capacity = 1024): SigFrameCache {
  return {
    frameId: 1, // Start at 1 to avoid collision with initial stamp values (0)
    value: new Float64Array(capacity),
    stamp: new Uint32Array(capacity), // All initialized to 0
    validMask: new Uint8Array(capacity),
  };
}

/**
 * Advance cache to a new frame.
 *
 * Updates frameId without clearing arrays.
 * Old cached values are implicitly invalidated by stamp comparison.
 *
 * Performance: O(1) - no array operations.
 *
 * @param cache - The cache to update
 * @param frameId - New frame ID (typically cache.frameId + 1)
 *
 * @example
 * ```typescript
 * const cache = createSigFrameCache(10);
 * console.log(cache.frameId); // 1
 * newFrame(cache, 2);
 * console.log(cache.frameId); // 2
 * ```
 */
export function newFrame(cache: SigFrameCache, frameId: number): void {
  cache.frameId = frameId;
  // Do NOT clear arrays - stamp comparison handles invalidation
}

/**
 * Check if a signal value is cached for the current frame.
 *
 * @param cache - The cache to check
 * @param sigId - Signal expression ID
 * @returns true if cached, false otherwise
 *
 * @example
 * ```typescript
 * const cache = createSigFrameCache(10);
 * cache.stamp[5] = cache.frameId;
 * console.log(isCached(cache, 5)); // true
 * console.log(isCached(cache, 6)); // false
 * ```
 */
export function isCached(cache: SigFrameCache, sigId: SigExprId): boolean {
  return cache.stamp[sigId] === cache.frameId;
}

/**
 * Get cached value for a signal (assumes cache hit - caller must check).
 *
 * @param cache - The cache to read from
 * @param sigId - Signal expression ID
 * @returns Cached value
 *
 * @example
 * ```typescript
 * const cache = createSigFrameCache(10);
 * cache.value[5] = 42;
 * cache.stamp[5] = cache.frameId;
 * console.log(getCached(cache, 5)); // 42
 * ```
 */
export function getCached(cache: SigFrameCache, sigId: SigExprId): number {
  return cache.value[sigId];
}

/**
 * Write a value to the cache for the current frame.
 *
 * @param cache - The cache to write to
 * @param sigId - Signal expression ID
 * @param value - Value to cache
 *
 * @example
 * ```typescript
 * const cache = createSigFrameCache(10);
 * setCached(cache, 5, 42);
 * console.log(cache.value[5]); // 42
 * console.log(cache.stamp[5]); // current frameId
 * ```
 */
export function setCached(
  cache: SigFrameCache,
  sigId: SigExprId,
  value: number
): void {
  cache.value[sigId] = value;
  cache.stamp[sigId] = cache.frameId;
}
