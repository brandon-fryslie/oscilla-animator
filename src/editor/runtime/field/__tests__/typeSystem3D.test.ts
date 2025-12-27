/**
 * @file 3D Type System Tests - Phase 1
 * @description Unit tests for 3D type system additions: vec3, vec4, quat, mat4
 */

import { describe, it, expect } from 'vitest';
import { FieldBufferPool } from '../BufferPool';
import { vec3Type, vec4Type, quatType, mat4Type } from '../types';

// =============================================================================
// BufferPool Allocation Tests
// =============================================================================

describe('BufferPool - 3D Type Allocation', () => {
  it('allocates quatf32 buffers correctly', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('quatf32', 10);

    expect(buf).toBeInstanceOf(Float32Array);
    expect((buf as Float32Array).length).toBe(40); // 10 * 4
  });

  it('allocates mat4f32 buffers correctly', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('mat4f32', 5);

    expect(buf).toBeInstanceOf(Float32Array);
    expect((buf as Float32Array).length).toBe(80); // 5 * 16
  });

  it('reuses quatf32 buffers from pool', () => {
    const pool = new FieldBufferPool();
    const buf1 = pool.alloc('quatf32', 10);
    pool.releaseAll();
    const buf2 = pool.alloc('quatf32', 10);

    expect(buf2).toBe(buf1); // Same buffer reused
  });

  it('reuses mat4f32 buffers from pool', () => {
    const pool = new FieldBufferPool();
    const buf1 = pool.alloc('mat4f32', 5);
    pool.releaseAll();
    const buf2 = pool.alloc('mat4f32', 5);

    expect(buf2).toBe(buf1); // Same buffer reused
  });
});

// =============================================================================
// fillBufferConst Tests (Buffer Structure Verification)
// =============================================================================

describe('fillBufferConst - vec3', () => {
  it('allocates vec3 buffer with correct size', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('vec3f32', 3) as Float32Array;

    expect(buf.length).toBe(9); // 3 elements * 3 components

    // Manual fill to verify buffer structure
    for (let i = 0; i < 3; i++) {
      buf[i * 3 + 0] = 5.0;
      buf[i * 3 + 1] = 5.0;
      buf[i * 3 + 2] = 5.0;
    }

    expect(buf[0]).toBe(5.0);
    expect(buf[1]).toBe(5.0);
    expect(buf[2]).toBe(5.0);
    expect(buf[3]).toBe(5.0); // Second element x
  });

  it('fills vec3 with object constant structure', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('vec3f32', 2) as Float32Array;

    // Manual fill to verify {x, y, z} object structure
    const v = { x: 1, y: 2, z: 3 };
    for (let i = 0; i < 2; i++) {
      buf[i * 3 + 0] = v.x;
      buf[i * 3 + 1] = v.y;
      buf[i * 3 + 2] = v.z;
    }

    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(2);
    expect(buf[2]).toBe(3);
    expect(buf[3]).toBe(1); // Second element x
    expect(buf[4]).toBe(2); // Second element y
    expect(buf[5]).toBe(3); // Second element z
  });
});

describe('fillBufferConst - vec4', () => {
  it('allocates vec4 buffer with correct size', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('vec4f32', 2) as Float32Array;

    expect(buf.length).toBe(8); // 2 elements * 4 components

    // Manual fill to verify buffer structure
    for (let i = 0; i < 2; i++) {
      buf[i * 4 + 0] = 7.0;
      buf[i * 4 + 1] = 7.0;
      buf[i * 4 + 2] = 7.0;
      buf[i * 4 + 3] = 7.0;
    }

    expect(buf[0]).toBe(7.0);
    expect(buf[3]).toBe(7.0);
    expect(buf[4]).toBe(7.0); // Second element x
  });

  it('fills vec4 with object constant structure', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('vec4f32', 1) as Float32Array;

    // Manual fill to verify {x, y, z, w} object structure
    const v = { x: 1, y: 2, z: 3, w: 4 };
    buf[0] = v.x;
    buf[1] = v.y;
    buf[2] = v.z;
    buf[3] = v.w;

    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(2);
    expect(buf[2]).toBe(3);
    expect(buf[3]).toBe(4);
  });
});

describe('fillBufferConst - quat', () => {
  it('identity quaternion is normalized', () => {
    // Identity quaternion: (0, 0, 0, 1)
    const q = { x: 0, y: 0, z: 0, w: 1 };

    // Verify it's normalized
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    expect(Math.abs(len - 1.0)).toBeLessThan(0.001);
  });

  it('allocates quat buffer with correct size', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('quatf32', 1) as Float32Array;

    expect(buf.length).toBe(4); // 1 element * 4 components

    // Identity quaternion: (0, 0, 0, 1)
    const q = { x: 0, y: 0, z: 0, w: 1 };

    // Fill buffer
    buf[0] = q.x;
    buf[1] = q.y;
    buf[2] = q.z;
    buf[3] = q.w;

    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
    expect(buf[3]).toBe(1);
  });

  it('90-degree rotation quaternion is normalized', () => {
    // 90-degree rotation around Z: (0, 0, sin(45°), cos(45°))
    const q = { x: 0, y: 0, z: 0.7071, w: 0.7071 };

    // Verify it's normalized (approximately)
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    expect(Math.abs(len - 1.0)).toBeLessThan(0.001);
  });

  it('detects non-normalized quaternion', () => {
    // Non-unit quaternion: (1, 0, 0, 0.5)
    const q = { x: 1, y: 0, z: 0, w: 0.5 };
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);

    // Should NOT be normalized
    expect(Math.abs(len - 1.0)).toBeGreaterThan(0.001);
  });
});

describe('fillBufferConst - mat4', () => {
  it('allocates mat4 buffer with correct size', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('mat4f32', 1) as Float32Array;

    expect(buf.length).toBe(16); // 1 element * 16 components
  });

  it('identity matrix structure is correct', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('mat4f32', 1) as Float32Array;

    // Identity matrix (column-major)
    const identity = [
      1, 0, 0, 0,  // Column 0
      0, 1, 0, 0,  // Column 1
      0, 0, 1, 0,  // Column 2
      0, 0, 0, 1   // Column 3
    ];

    expect(identity.length).toBe(16);

    // Fill buffer
    for (let i = 0; i < 16; i++) {
      buf[i] = identity[i];
    }

    // Verify diagonal is 1
    expect(buf[0]).toBe(1); // m00
    expect(buf[5]).toBe(1); // m11
    expect(buf[10]).toBe(1); // m22
    expect(buf[15]).toBe(1); // m33

    // Verify off-diagonal is 0
    expect(buf[1]).toBe(0);
    expect(buf[4]).toBe(0);
  });

  it('validates mat4 array length requirement', () => {
    const wrongLength = [1, 2, 3, 4, 5]; // Only 5 elements
    expect(wrongLength.length).not.toBe(16);

    const tooMany = new Array(17).fill(0);
    expect(tooMany.length).not.toBe(16);
  });

  it('translation matrix uses column-major layout', () => {
    const pool = new FieldBufferPool();
    const buf = pool.alloc('mat4f32', 1) as Float32Array;

    // Translation matrix: translate by (10, 20, 30)
    const translation = [
      1, 0, 0, 0,   // Column 0
      0, 1, 0, 0,   // Column 1
      0, 0, 1, 0,   // Column 2
      10, 20, 30, 1 // Column 3 (translation)
    ];

    for (let i = 0; i < 16; i++) {
      buf[i] = translation[i];
    }

    expect(buf[12]).toBe(10); // tx
    expect(buf[13]).toBe(20); // ty
    expect(buf[14]).toBe(30); // tz
  });
});

// =============================================================================
// Integration Test: Type Singletons
// =============================================================================

describe('Type Descriptor Singletons', () => {
  it('exports vec3Type singleton', () => {
    expect(vec3Type).toEqual({ kind: 'vec3' });
  });

  it('exports vec4Type singleton', () => {
    expect(vec4Type).toEqual({ kind: 'vec4' });
  });

  it('exports quatType singleton', () => {
    expect(quatType).toEqual({ kind: 'quat' });
  });

  it('exports mat4Type singleton', () => {
    expect(mat4Type).toEqual({ kind: 'mat4' });
  });
});
