/**
 * @file Field Buffer Pool
 * @description Manages typed array allocation and reuse for field materialization.
 *
 * Key Design:
 * - Buffer pool reduces allocations by reusing buffers across frames
 * - Buffers are keyed by format:count for exact match reuse
 * - releaseAll() returns all in-use buffers to pool at frame end
 */

import type { BufferFormat } from './types';

/**
 * FieldBufferPool manages typed array allocation and reuse.
 *
 * Pattern:
 * 1. alloc(format, count) - get or create buffer
 * 2. Use buffer during frame
 * 3. releaseAll() - return buffers to pool
 */
export class FieldBufferPool {
  /** Available buffers by key (format:count) */
  private pools: Map<string, ArrayBufferView[]> = new Map();

  /** Currently allocated buffers by key */
  private inUse: Map<string, ArrayBufferView[]> = new Map();

  /**
   * Allocate a buffer of the specified format and count.
   * Reuses an existing buffer from the pool if available.
   *
   * @param format - Buffer format (f32, vec2f32, etc.)
   * @param count - Number of elements (NOT bytes)
   * @returns Typed array buffer
   */
  alloc(format: BufferFormat, count: number): ArrayBufferView {
    const key = `${format}:${count}`;
    const pool = this.pools.get(key) ?? [];

    // Reuse from pool if available
    if (pool.length > 0) {
      const buffer = pool.pop()!;
      this.trackInUse(key, buffer);
      return buffer;
    }

    // Allocate new buffer
    const buffer = allocateBuffer(format, count);
    this.trackInUse(key, buffer);
    return buffer;
  }

  /**
   * Release all in-use buffers back to the pool.
   * Call this at the end of each frame.
   */
  releaseAll(): void {
    for (const [key, buffers] of this.inUse) {
      const pool = this.pools.get(key) ?? [];
      pool.push(...buffers);
      this.pools.set(key, pool);
    }
    this.inUse.clear();
  }

  /**
   * Track a buffer as in-use
   */
  private trackInUse(key: string, buffer: ArrayBufferView): void {
    const list = this.inUse.get(key) ?? [];
    list.push(buffer);
    this.inUse.set(key, list);
  }

  /**
   * Get pool statistics (for debugging)
   */
  getStats(): { pooled: number; inUse: number } {
    let pooled = 0;
    for (const buffers of this.pools.values()) {
      pooled += buffers.length;
    }

    let inUse = 0;
    for (const buffers of this.inUse.values()) {
      inUse += buffers.length;
    }

    return { pooled, inUse };
  }
}

/**
 * Allocate a new typed array buffer
 *
 * @param format - Buffer format
 * @param count - Number of elements
 * @returns Typed array of the specified format
 */
function allocateBuffer(format: BufferFormat, count: number): ArrayBufferView {
  switch (format) {
    case 'f32':
      return new Float32Array(count);

    case 'f64':
      return new Float64Array(count);

    case 'i32':
      return new Int32Array(count);

    case 'u32':
      return new Uint32Array(count);

    case 'u8':
      return new Uint8Array(count);

    case 'vec2f32':
      return new Float32Array(count * 2);

    case 'vec3f32':
      return new Float32Array(count * 3);

    case 'vec4f32':
      return new Float32Array(count * 4);

    case 'rgba8':
      return new Uint8ClampedArray(count * 4);

    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown buffer format: ${String(_exhaustive)}`);
    }
  }
}
