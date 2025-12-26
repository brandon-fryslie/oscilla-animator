/**
 * Closure Instrumentation Wrappers
 *
 * Provides wrapper functions for instrumented closure evaluation.
 * These are bridge implementations for the current closure-based runtime.
 * They will be replaced by IR hooks when Phase 6 lands.
 *
 * Key wrappers:
 * - wrapSignalForDebug: Block evaluation timing
 * - wrapFieldForDebug: Field materialization stats
 * - wrapBusCombineForDebug: Bus combine timing
 */

import type { RuntimeCtx } from '../compiler/types';
import type { DebugIndex } from './DebugIndex';
import type { SpanRing } from './SpanRing';
import type { ValueRing } from './ValueRing';
import { SpanKind, SpanFlags } from './SpanTypes';
import { TraceController } from './TraceController';
import { ValueTag, packF32 } from './ValueRecord';

// =============================================================================
// P1-1: Block Timing Wrapper
// =============================================================================

/**
 * Wrap a signal closure for debug instrumentation.
 *
 * Emits SpanKind.BlockEval with timing and NaN/Inf detection.
 *
 * @param original - Original signal closure
 * @param blockId - Block instance ID (e.g., "RadialOrigin#1")
 * @param debugIndex - DebugIndex for ID interning
 * @param spanRing - SpanRing for span recording
 * @returns Instrumented closure
 */
export function wrapSignalForDebug(
  original: (tMs: number, ctx: RuntimeCtx) => number,
  blockId: string,
  debugIndex: DebugIndex,
  spanRing: SpanRing,
): (tMs: number, ctx: RuntimeCtx) => number {
  // Intern block ID once (outside closure)
  const subjectId = debugIndex.internBlock(blockId);

  return (tMs: number, ctx: RuntimeCtx) => {
    // Fast path: skip instrumentation if 'off' mode
    if (!TraceController.instance.shouldEmitSpans()) {
      return original(tMs, ctx);
    }

    const start = performance.now();
    const frameId = (ctx as RuntimeCtx & { frameId?: number }).frameId ?? 0;

    // Evaluate original closure
    const value = original(tMs, ctx);

    // Compute duration and flags
    const durationUs = (performance.now() - start) * 1000;
    let flags = SpanFlags.None;
    if (Number.isNaN(value)) flags |= SpanFlags.HAS_NAN;
    if (!Number.isFinite(value)) flags |= SpanFlags.HAS_INF;

    // Emit span
    spanRing.writeSpan({
      frameId,
      tMs,
      kind: SpanKind.BlockEval,
      subjectId,
      parentSpanId: 0, // TODO: causal parent tracking in future
      durationUs,
      flags,
    });

    return value;
  };
}

// =============================================================================
// P1-2: Field Materialization Wrapper
// =============================================================================

/**
 * Field stat computation flags.
 */
export const FieldStatMask = {
  None: 0,
  HasMinMax: 1,
  HasNaN: 2,
} as const;

/**
 * Wrap a field closure for debug instrumentation.
 *
 * Emits SpanKind.MaterializeField with timing and optional FieldStats.
 *
 * @param original - Original field closure
 * @param fieldId - Field identifier (e.g., port key)
 * @param domain - Domain of the field (for stat computation)
 * @param debugIndex - DebugIndex for ID interning
 * @param spanRing - SpanRing for span recording
 * @param valueRing - ValueRing for value sample recording
 * @returns Instrumented closure
 */
export function wrapFieldForDebug<T>(
  original: (seed: number, n: number, ctx: RuntimeCtx) => readonly T[],
  fieldId: string,
  domain: 'number' | 'vec2' | 'color' | 'unknown',
  debugIndex: DebugIndex,
  spanRing: SpanRing,
  valueRing: ValueRing,
): (seed: number, n: number, ctx: RuntimeCtx) => readonly T[] {
  // Intern field ID once (port key)
  const subjectId = debugIndex.internPort(fieldId);

  return (seed: number, n: number, ctx: RuntimeCtx) => {
    // Fast path: skip instrumentation if 'off' mode
    if (!TraceController.instance.shouldEmitSpans()) {
      return original(seed, n, ctx);
    }

    const start = performance.now();
    const frameId = (ctx as RuntimeCtx & { frameId?: number }).frameId ?? 0;
    const tMs = (ctx as RuntimeCtx & { tMs?: number }).tMs ?? 0;

    // Materialize field
    const array = original(seed, n, ctx);

    // Compute duration and stats
    const durationUs = (performance.now() - start) * 1000;
    let flags = SpanFlags.None;
    let statMask = FieldStatMask.None;
    let min = 0;
    let max = 0;

    // Compute min/max for number[] fields
    if (domain === 'number' && array.length > 0) {
      const nums = array as readonly number[];
      min = nums[0];
      max = nums[0];

      for (let i = 1; i < nums.length; i++) {
        const val = nums[i];
        if (Number.isNaN(val)) {
          flags |= SpanFlags.HAS_NAN;
          statMask |= FieldStatMask.HasNaN;
        } else {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }

      statMask |= FieldStatMask.HasMinMax;
    }

    // Emit span
    spanRing.writeSpan({
      frameId,
      tMs,
      kind: SpanKind.MaterializeField,
      subjectId,
      parentSpanId: 0,
      durationUs,
      flags,
    });

    // Emit value record (if capturing values and numeric domain)
    if (TraceController.instance.shouldCaptureValues() && domain === 'number') {
      valueRing.writeValue({
        tag: ValueTag.FieldStats,
        typeId: 0, // TODO: get from TypeKeyTable in future
        a: 0, // domainId (reserved)
        b: n, // element count
        c: statMask,
        d: packF32(min),
        e: packF32(max),
        f: 0, // hash (reserved for future)
      });
    }

    return array;
  };
}

// =============================================================================
// P1-3: Bus Combine Wrapper
// =============================================================================

/**
 * Wrap a bus combine closure for debug instrumentation.
 *
 * Emits SpanKind.BusCombine with timing.
 *
 * @param original - Original combine closure
 * @param busId - Bus canonical ID (e.g., "/time/t")
 * @param _publisherCount - Number of publishers (reserved for future use)
 * @param debugIndex - DebugIndex for ID interning
 * @param spanRing - SpanRing for span recording
 * @returns Instrumented closure
 */
export function wrapBusCombineForDebug(
  original: (tMs: number, ctx: RuntimeCtx) => number,
  busId: string,
  _publisherCount: number,
  debugIndex: DebugIndex,
  spanRing: SpanRing,
): (tMs: number, ctx: RuntimeCtx) => number {
  // Intern bus ID once
  const subjectId = debugIndex.internBus(busId);

  return (tMs: number, ctx: RuntimeCtx) => {
    // Fast path: skip instrumentation if 'off' mode
    if (!TraceController.instance.shouldEmitSpans()) {
      return original(tMs, ctx);
    }

    const start = performance.now();
    const frameId = (ctx as RuntimeCtx & { frameId?: number }).frameId ?? 0;

    // Evaluate combine
    const value = original(tMs, ctx);

    // Compute duration
    const durationUs = (performance.now() - start) * 1000;

    // Emit span
    // TODO: Encode publisherCount in aux field (future enhancement)
    spanRing.writeSpan({
      frameId,
      tMs,
      kind: SpanKind.BusCombine,
      subjectId,
      parentSpanId: 0,
      durationUs,
      flags: SpanFlags.None,
    });

    return value;
  };
}
