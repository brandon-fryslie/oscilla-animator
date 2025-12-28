/**
 * ValueRing - Fixed-capacity ring buffer for value records
 *
 * Zero-allocation ring buffer using typed arrays for value storage.
 * Each value record is 32 bytes (ValueRecord32 structure).
 *
 * Memory layout (columnar):
 * - tag: Uint8Array
 * - typeId: Uint16Array
 * - a, b, c, d, e, f: Uint32Array (6 payload slots)
 *
 * Total: 32 bytes per record (aligned)
 */

import type { ValueRecord32, ValueTag } from './ValueRecord';

/**
 * Default capacity: 100k value records.
 * Separate from spans because not every span has an associated value.
 */
export const DEFAULT_VALUE_CAPACITY = 100_000;

/**
 * ValueRing stores value samples in a fixed-capacity ring buffer.
 *
 * Key properties:
 * - Zero allocation during write (pre-allocated typed arrays)
 * - Wraps at capacity (old values overwritten)
 * - Columnar storage for cache efficiency
 * - 32-byte alignment per record
 */
export class ValueRing {
  private readonly capacity: number;
  private writePtr = 0;

  // Columnar storage
  private readonly tag: Uint8Array;
  private readonly typeId: Uint16Array;
  private readonly a: Uint32Array;
  private readonly b: Uint32Array;
  private readonly c: Uint32Array;
  private readonly d: Uint32Array;
  private readonly e: Uint32Array;
  private readonly f: Uint32Array;

  constructor(capacity: number = DEFAULT_VALUE_CAPACITY) {
    this.capacity = capacity;

    // Allocate columnar arrays
    this.tag = new Uint8Array(capacity);
    this.typeId = new Uint16Array(capacity);
    this.a = new Uint32Array(capacity);
    this.b = new Uint32Array(capacity);
    this.c = new Uint32Array(capacity);
    this.d = new Uint32Array(capacity);
    this.e = new Uint32Array(capacity);
    this.f = new Uint32Array(capacity);
  }

  /**
   * Write a value record to the ring buffer.
   * Returns the index where the value was written.
   *
   * If the ring is full, this overwrites the oldest value.
   */
  writeValue(value: ValueRecord32): number {
    const idx = this.writePtr % this.capacity;

    this.tag[idx] = value.tag;
    this.typeId[idx] = value.typeId;
    this.a[idx] = value.a;
    this.b[idx] = value.b;
    this.c[idx] = value.c;
    this.d[idx] = value.d;
    this.e[idx] = value.e;
    this.f[idx] = value.f;

    this.writePtr++;
    return idx;
  }

  /**
   * Get a single value record by index.
   * Returns undefined if the index has been overwritten or is out of range.
   */
  getValue(idx: number): ValueRecord32 | undefined {
    // Check if index is still valid (not overwritten)
    if (this.writePtr > this.capacity && idx < this.writePtr - this.capacity) {
      return undefined; // Overwritten
    }

    if (idx >= this.writePtr) {
      return undefined; // Not written yet
    }

    const physicalIdx = idx % this.capacity;
    // ValueRecord32 fields - tag requires type assertion from number
     
    const tagValue = this.tag[physicalIdx] as ValueTag;
    return {
      tag: tagValue,
      typeId: this.typeId[physicalIdx],
      a: this.a[physicalIdx],
      b: this.b[physicalIdx],
      c: this.c[physicalIdx],
      d: this.d[physicalIdx],
      e: this.e[physicalIdx],
      f: this.f[physicalIdx],
    };
  }

  /**
   * Get a slice of values in a given range.
   * Returns values from [start, start+count).
   * Handles ring wrapping correctly.
   */
  getValuesInRange(start: number, count: number): ValueRecord32[] {
    const result: ValueRecord32[] = [];
    for (let i = 0; i < count; i++) {
      const value = this.getValue(start + i);
      if (value) {
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Get the current write pointer (number of values written).
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
   * Get the number of valid values currently in the buffer.
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
