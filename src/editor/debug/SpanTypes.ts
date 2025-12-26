/**
 * Span Types and Flags for Debug Infrastructure
 *
 * Defines the canonical span types that can be recorded during evaluation,
 * along with bit flags for additional metadata (NaN, Inf, cache hits, etc.).
 *
 * These types are IR-agnostic: they work with both closure-based evaluation
 * and future IR-based evaluation.
 */

/**
 * SpanKind identifies the type of evaluation span.
 * Each kind represents a distinct instrumentation point in the evaluation pipeline.
 */
export const SpanKind = {
  /** Root frame evaluation - program.signal() invocation */
  FrameEval: 1,

  /** Block evaluation boundary - single block's output computation */
  BlockEval: 2,

  /** Bus read operation - requesting value from a bus */
  BusRead: 3,

  /** Bus combine operation - merging multiple publisher values */
  BusCombine: 4,

  /** Bus default fallback - using default value when no publishers exist */
  BusDefault: 5,

  /** Field materialization - lazy field evaluation to array */
  MaterializeField: 6,

  /** Render sink evaluation - final drawing operation */
  RenderSinkEval: 7,

  /** Signal sampling - evaluating a signal at a specific time */
  SignalSample: 8,

  /** Adapter step application - type conversion operation */
  AdapterStep: 9,

  /** Lens step application - value transformation operation */
  LensStep: 10,
} as const;

export type SpanKind = typeof SpanKind[keyof typeof SpanKind];

/**
 * SpanFlags provide additional metadata about span execution.
 * Use bitwise operations to test/set multiple flags.
 */
export const SpanFlags = {
  /** No flags set */
  None: 0,

  /** Result contains NaN */
  HAS_NAN: 1,

  /** Result contains Infinity or -Infinity */
  HAS_INF: 2,

  /** Value was served from cache (not recomputed) */
  CACHE_HIT: 4,

  /** Automatic type coercion occurred */
  TYPE_COERCION: 8,

  /** Automatic adapter was inserted */
  AUTO_ADAPTER: 16,
} as const;

export type SpanFlags = number; // Allow bitwise combination

/**
 * SpanData represents a single evaluation span.
 *
 * Subject ID interpretation depends on SpanKind:
 * - BlockEval: blockNumericId from DebugIndex
 * - BusRead/BusCombine: busNumericId from DebugIndex
 * - MaterializeField: fieldId/portId from DebugIndex
 * - Other: context-specific ID
 */
export interface SpanData {
  /** Frame number (for temporal grouping) */
  frameId: number;

  /** Wall-clock timestamp in milliseconds */
  tMs: number;

  /** Type of span */
  kind: SpanKind;

  /** Subject identifier (interpretation depends on kind) */
  subjectId: number;

  /** Parent span ID (0 = none, root frame) */
  parentSpanId: number;

  /** Execution duration in microseconds */
  durationUs: number;

  /** Bitfield of SpanFlags */
  flags: SpanFlags;
}

/**
 * Test if a flag is set in a flags bitfield.
 */
export function hasFlag(flags: SpanFlags, flag: number): boolean {
  return (flags & flag) !== 0;
}

/**
 * Set a flag in a flags bitfield.
 */
export function setFlag(flags: SpanFlags, flag: number): SpanFlags {
  return flags | flag;
}

/**
 * Clear a flag from a flags bitfield.
 */
export function clearFlag(flags: SpanFlags, flag: number): SpanFlags {
  return flags & ~flag;
}

/**
 * Get a human-readable name for a SpanKind.
 */
export function getSpanKindName(kind: SpanKind): string {
  switch (kind) {
    case SpanKind.FrameEval: return 'FrameEval';
    case SpanKind.BlockEval: return 'BlockEval';
    case SpanKind.BusRead: return 'BusRead';
    case SpanKind.BusCombine: return 'BusCombine';
    case SpanKind.BusDefault: return 'BusDefault';
    case SpanKind.MaterializeField: return 'MaterializeField';
    case SpanKind.RenderSinkEval: return 'RenderSinkEval';
    case SpanKind.SignalSample: return 'SignalSample';
    case SpanKind.AdapterStep: return 'AdapterStep';
    case SpanKind.LensStep: return 'LensStep';
    default: return `Unknown(${String(kind)})`;
  }
}
