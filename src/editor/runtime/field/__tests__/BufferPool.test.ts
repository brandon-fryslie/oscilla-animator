/**
 * @file BufferPool Tests
 * @description Tests for buffer allocation and pooling
 */

import { describe, it, expect } from 'vitest';
import { FieldBufferPool } from '../BufferPool';

describe('FieldBufferPool', () => {
  it('allocates new buffer on first request', () => {
    const pool = new FieldBufferPool();

    const buffer = pool.alloc('f32', 100);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.byteLength).toBe(100 * 4); // f32 = 4 bytes per element
  });

  it('allocates different buffer types correctly', () => {
    const pool = new FieldBufferPool();

    const f32 = pool.alloc('f32', 10);
    const f64 = pool.alloc('f64', 10);
    const i32 = pool.alloc('i32', 10);
    const u32 = pool.alloc('u32', 10);
    const u8 = pool.alloc('u8', 10);

    expect(f32).toBeInstanceOf(Float32Array);
    expect(f64).toBeInstanceOf(Float64Array);
    expect(i32).toBeInstanceOf(Int32Array);
    expect(u32).toBeInstanceOf(Uint32Array);
    expect(u8).toBeInstanceOf(Uint8Array);
  });

  it('allocates vector buffers with correct size', () => {
    const pool = new FieldBufferPool();

    const vec2 = pool.alloc('vec2f32', 10);
    const vec3 = pool.alloc('vec3f32', 10);
    const vec4 = pool.alloc('vec4f32', 10);
    const rgba = pool.alloc('rgba8', 10);

    // vec2 = 2 floats per element
    expect(vec2).toBeInstanceOf(Float32Array);
    expect((vec2 as Float32Array).length).toBe(20);

    // vec3 = 3 floats per element
    expect(vec3).toBeInstanceOf(Float32Array);
    expect((vec3 as Float32Array).length).toBe(30);

    // vec4 = 4 floats per element
    expect(vec4).toBeInstanceOf(Float32Array);
    expect((vec4 as Float32Array).length).toBe(40);

    // rgba8 = 4 bytes per element
    expect(rgba).toBeInstanceOf(Uint8ClampedArray);
    expect((rgba as Uint8ClampedArray).length).toBe(40);
  });

  it('reuses buffers after release', () => {
    const pool = new FieldBufferPool();

    // Allocate buffer
    const buf1 = pool.alloc('f32', 100);

    // Release back to pool
    pool.releaseAll();

    // Allocate again - should get same buffer
    const buf2 = pool.alloc('f32', 100);

    expect(buf1).toBe(buf2);
  });

  it('does not reuse buffers with different format', () => {
    const pool = new FieldBufferPool();

    const f32buf = pool.alloc('f32', 100);
    pool.releaseAll();

    const f64buf = pool.alloc('f64', 100);

    // Different format -> different buffer
    expect(f32buf).not.toBe(f64buf);
  });

  it('does not reuse buffers with different count', () => {
    const pool = new FieldBufferPool();

    const buf100 = pool.alloc('f32', 100);
    pool.releaseAll();

    const buf200 = pool.alloc('f32', 200);

    // Different count -> different buffer
    expect(buf100).not.toBe(buf200);
  });

  it('tracks in-use and pooled buffers', () => {
    const pool = new FieldBufferPool();

    expect(pool.getStats()).toEqual({ pooled: 0, inUse: 0 });

    // Allocate 2 buffers
    pool.alloc('f32', 100);
    pool.alloc('f32', 200);

    expect(pool.getStats()).toEqual({ pooled: 0, inUse: 2 });

    // Release buffers
    pool.releaseAll();

    expect(pool.getStats()).toEqual({ pooled: 2, inUse: 0 });
  });

  it('can reuse multiple buffers of same type', () => {
    const pool = new FieldBufferPool();

    // Allocate 3 buffers
    const buf1 = pool.alloc('f32', 100);
    const buf2 = pool.alloc('f32', 100);
    const buf3 = pool.alloc('f32', 100);

    // Release all
    pool.releaseAll();

    // Reallocate 3 - should get same buffers
    const buf4 = pool.alloc('f32', 100);
    const buf5 = pool.alloc('f32', 100);
    const buf6 = pool.alloc('f32', 100);

    // All original buffers should be reused
    const original = new Set([buf1, buf2, buf3]);
    const reused = new Set([buf4, buf5, buf6]);

    expect(original).toEqual(reused);
  });

  it('throws on unknown buffer format', () => {
    const pool = new FieldBufferPool();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    expect(() => pool.alloc('unknown' as any, 100)).toThrow('Unknown buffer format');
  });
});
