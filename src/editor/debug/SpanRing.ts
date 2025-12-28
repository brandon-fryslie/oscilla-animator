/**
 * SpanRing - Fixed-capacity ring buffer for span records
 *
 * Zero-allocation ring buffer using typed arrays for columnar storage.
 * Wraps at capacity without allocations.
 *
 * Memory layout (columnar):
 * - frameId: Uint32Array
 * - tMs: Float64Array
 * - kind: Uint16Array
 * - subjectId: Uint32Array
 * - parentSpanId: Uint32Array
 * - durationUs: Uint32Array
 * - flags: Uint32Array
 *
 * 32-byte alignment per span ensures cache-friendly access.
 */

import type { SpanData, SpanKind } from './SpanTypes';

/**
 * Default capacity: 200k spans (spec recommendation).
 * At 60fps with 10 blocks = 600 spans/sec → 333 seconds of history.
 */
export const DEFAULT_SPAN_CAPACITY = 200_000;

/**
 * SpanRing stores evaluation spans in a fixed-capacity ring buffer.
 *
 * Key properties:
 * - Zero allocation during write (pre-allocated typed arrays)
 * - Wraps at capacity (old spans overwritten)
 * - Columnar storage for cache efficiency
 * - Query API for retrieving spans
 */
export class SpanRing {
  private readonly capacity: number;
  private writePtr = 0;

  // Columnar storage (each field is a separate typed array)
  private readonly frameId: Uint32Array;
  private readonly tMs: Float64Array;
  private readonly kind: Uint16Array;
  private readonly subjectId: Uint32Array;
  private readonly parentSpanId: Uint32Array;
  private readonly durationUs: Uint32Array;
  private readonly flags: Uint32Array;

  constructor(capacity: number = DEFAULT_SPAN_CAPACITY) {
    // Ensure capacity is power of 2 for efficient modulo (optional optimization)
    this.capacity = capacity;

    // Allocate columnar arrays
    this.frameId = new Uint32Array(capacity);
    this.tMs = new Float64Array(capacity);
    this.kind = new Uint16Array(capacity);
    this.subjectId = new Uint32Array(capacity);
    this.parentSpanId = new Uint32Array(capacity);
    this.durationUs = new Uint32Array(capacity);
    this.flags = new Uint32Array(capacity);
  }

  /**
   * Write a span to the ring buffer.
   * Returns the index where the span was written.
   *
   * If the ring is full, this overwrites the oldest span.
   */
  writeSpan(span: SpanData): number {
    const idx = this.writePtr % this.capacity;

    this.frameId[idx] = span.frameId;
    this.tMs[idx] = span.tMs;
    this.kind[idx] = span.kind;
    this.subjectId[idx] = span.subjectId;
    this.parentSpanId[idx] = span.parentSpanId;
    this.durationUs[idx] = span.durationUs;
    this.flags[idx] = span.flags;

    this.writePtr++;
    return idx;
  }

  /**
   * Get a single span by index.
   * Returns undefined if the index has been overwritten or is out of range.
   */
  getSpan(idx: number): SpanData | undefined {
    // Check if index is still valid (not overwritten)
    if (this.writePtr > this.capacity && idx < this.writePtr - this.capacity) {
      return undefined; // Overwritten
    }

    if (idx >= this.writePtr) {
      return undefined; // Not written yet
    }

    const physicalIdx = idx % this.capacity;
    // SpanData fields - kind and flags require type assertion from number
     
    const kindValue = this.kind[physicalIdx] as SpanKind;
    return {
      frameId: this.frameId[physicalIdx],
      tMs: this.tMs[physicalIdx],
      kind: kindValue,
      subjectId: this.subjectId[physicalIdx],
      parentSpanId: this.parentSpanId[physicalIdx],
      durationUs: this.durationUs[physicalIdx],
      flags: this.flags[physicalIdx],
    };
  }

  /**
   * Get all spans for a specific frame.
   * Returns empty array if frame is not in the buffer.
   */
  getSpansForFrame(frameId: number): SpanData[] {
    const result: SpanData[] = [];
    const limit = Math.min(this.writePtr, this.capacity);
    const startOffset = Math.max(0, this.writePtr - this.capacity);

    for (let i = 0; i < limit; i++) {
      if (this.frameId[i] === frameId) {
        const logicalIdx = startOffset + i;
        const span = this.getSpan(logicalIdx);
        if (span) {
          result.push(span);
        }
      }
    }

    return result;
  }

  /**
   * Get a slice of spans in a given range.
   * Returns spans from [start, start+count).
   * Handles ring wrapping correctly.
   */
  getSpansInRange(start: number, count: number): SpanData[] {
    const result: SpanData[] = [];
    for (let i = 0; i < count; i++) {
      const span = this.getSpan(start + i);
      if (span) {
        result.push(span);
      }
    }
    return result;
  }

  /**
   * Get the current write pointer (number of spans written).
   */
  getWritePtr(): number {
    return this.writePtr;
  }

  /**
   * Get the buffer capacity.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get the number of valid spans currently in the buffer.
   */
  size(): number {
    return Math.min(this.writePtr, this.capacity);
  }

  /**
   * Clear the buffer (reset write pointer).
   */
  clear(): void {
    this.writePtr = 0;
  }
}
