/**
 * FrameCache Tests
 *
 * Verifies per-frame memoization for signal values, field handles, and buffers.
 *
 * Test Coverage:
 * - Signal cache hit/miss based on stamps
 * - Field cache hit/miss based on stamps
 * - newFrame() invalidates stale stamps
 * - newFrame() clears buffer pool
 * - invalidate() zeros all stamps
 * - Monotonic frameId increments
 * - Cache capacity handling
 * - Buffer pool key collisions
 *
 * References:
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 1
 * - src/editor/runtime/executor/RuntimeState.ts (FrameCache implementation)
 */

import { describe, it, expect } from "vitest";
import { createFrameCache } from "../RuntimeState";
import type { FieldHandle } from "../../field/types";

describe("FrameCache - Initialization", () => {
  it("creates cache with correct capacities", () => {
    const cache = createFrameCache(1024, 512);

    expect(cache.sigValue).toBeInstanceOf(Float64Array);
    expect(cache.sigValue.length).toBe(1024);

    expect(cache.sigStamp).toBeInstanceOf(Uint32Array);
    expect(cache.sigStamp.length).toBe(1024);

    expect(Array.isArray(cache.fieldHandle)).toBe(true);
    expect(cache.fieldHandle.length).toBe(512);

    expect(cache.fieldStamp).toBeInstanceOf(Uint32Array);
    expect(cache.fieldStamp.length).toBe(512);

    expect(cache.fieldBuffers).toBeInstanceOf(Map);
    expect(cache.fieldBuffers.size).toBe(0);
  });

  it("starts frameId at 1 (not 0)", () => {
    const cache = createFrameCache(10, 10);
    expect(cache.frameId).toBe(1);
  });

  it("initializes stamps to 0", () => {
    const cache = createFrameCache(10, 10);

    // All signal stamps should be 0
    for (let i = 0; i < cache.sigStamp.length; i++) {
      expect(cache.sigStamp[i]).toBe(0);
    }

    // All field stamps should be 0
    for (let i = 0; i < cache.fieldStamp.length; i++) {
      expect(cache.fieldStamp[i]).toBe(0);
    }
  });

  it("creates cache with small capacities", () => {
    const cache = createFrameCache(1, 1);
    expect(cache.sigValue.length).toBe(1);
    expect(cache.fieldHandle.length).toBe(1);
  });

  it("creates cache with large capacities", () => {
    const cache = createFrameCache(10000, 5000);
    expect(cache.sigValue.length).toBe(10000);
    expect(cache.fieldHandle.length).toBe(5000);
  });
});

describe("FrameCache - Signal Cache", () => {
  it("detects cache miss when stamp < frameId", () => {
    const cache = createFrameCache(10, 10);
    const sigId = 5;

    // Initial state: stamp[5] = 0, frameId = 1
    expect(cache.sigStamp[sigId]).toBe(0);
    expect(cache.frameId).toBe(1);

    // Cache miss: stamp[5] (0) !== frameId (1)
    const isCacheHit = cache.sigStamp[sigId] === cache.frameId;
    expect(isCacheHit).toBe(false);
  });

  it("detects cache hit when stamp === frameId", () => {
    const cache = createFrameCache(10, 10);
    const sigId = 5;

    // Write value and stamp
    cache.sigValue[sigId] = 42;
    cache.sigStamp[sigId] = cache.frameId;

    // Cache hit: stamp[5] (1) === frameId (1)
    const isCacheHit = cache.sigStamp[sigId] === cache.frameId;
    expect(isCacheHit).toBe(true);
    expect(cache.sigValue[sigId]).toBe(42);
  });

  it("cache miss after newFrame() increments frameId", () => {
    const cache = createFrameCache(10, 10);
    const sigId = 5;

    // Frame 1: write value
    cache.sigValue[sigId] = 42;
    cache.sigStamp[sigId] = cache.frameId; // stamp = 1
    expect(cache.sigStamp[sigId]).toBe(1);

    // Frame 2: newFrame increments frameId
    cache.newFrame();
    expect(cache.frameId).toBe(2);

    // Cache miss: stamp[5] (1) !== frameId (2)
    const isCacheHit = cache.sigStamp[sigId] === cache.frameId;
    expect(isCacheHit).toBe(false);
  });

  it("maintains cached value across frames (no clearing)", () => {
    const cache = createFrameCache(10, 10);
    const sigId = 5;

    // Write value in frame 1
    cache.sigValue[sigId] = 42;
    cache.sigStamp[sigId] = cache.frameId;

    // Advance to frame 2
    cache.newFrame();

    // Value is still present (not cleared)
    expect(cache.sigValue[sigId]).toBe(42);

    // But stamp is stale
    expect(cache.sigStamp[sigId]).toBe(1);
    expect(cache.frameId).toBe(2);
  });

  it("multiple signals cached in same frame", () => {
    const cache = createFrameCache(10, 10);

    // Write multiple values
    cache.sigValue[0] = 10;
    cache.sigStamp[0] = cache.frameId;

    cache.sigValue[5] = 20;
    cache.sigStamp[5] = cache.frameId;

    cache.sigValue[9] = 30;
    cache.sigStamp[9] = cache.frameId;

    // All are cache hits
    expect(cache.sigStamp[0] === cache.frameId).toBe(true);
    expect(cache.sigStamp[5] === cache.frameId).toBe(true);
    expect(cache.sigStamp[9] === cache.frameId).toBe(true);

    // Values are correct
    expect(cache.sigValue[0]).toBe(10);
    expect(cache.sigValue[5]).toBe(20);
    expect(cache.sigValue[9]).toBe(30);
  });

  it("cache updates when writing new value in same frame", () => {
    const cache = createFrameCache(10, 10);
    const sigId = 5;

    // First write
    cache.sigValue[sigId] = 42;
    cache.sigStamp[sigId] = cache.frameId;
    expect(cache.sigValue[sigId]).toBe(42);

    // Second write (overwrite in same frame)
    cache.sigValue[sigId] = 99;
    cache.sigStamp[sigId] = cache.frameId;
    expect(cache.sigValue[sigId]).toBe(99);
  });
});

describe("FrameCache - Field Cache", () => {
  it("detects cache miss when stamp < frameId", () => {
    const cache = createFrameCache(10, 10);
    const fieldId = 3;

    // Initial state: stamp[3] = 0, frameId = 1
    expect(cache.fieldStamp[fieldId]).toBe(0);
    expect(cache.frameId).toBe(1);

    // Cache miss
    const isCacheHit = cache.fieldStamp[fieldId] === cache.frameId;
    expect(isCacheHit).toBe(false);
  });

  it("detects cache hit when stamp === frameId", () => {
    const cache = createFrameCache(10, 10);
    const fieldId = 3;

    // Write handle and stamp
    const handle: FieldHandle = {
      kind: "Const",
      constId: 42,
      type: { kind: 'number' as const },
    };
    cache.fieldHandle[fieldId] = handle;
    cache.fieldStamp[fieldId] = cache.frameId;

    // Cache hit
    const isCacheHit = cache.fieldStamp[fieldId] === cache.frameId;
    expect(isCacheHit).toBe(true);
    expect(cache.fieldHandle[fieldId]).toBe(handle);
  });

  it("cache miss after newFrame() increments frameId", () => {
    const cache = createFrameCache(10, 10);
    const fieldId = 3;

    // Frame 1: write handle
    const handle: FieldHandle = {
      kind: "Const",
      constId: 42,
      type: { kind: 'number' as const },
    };
    cache.fieldHandle[fieldId] = handle;
    cache.fieldStamp[fieldId] = cache.frameId; // stamp = 1

    // Frame 2: newFrame increments frameId
    cache.newFrame();
    expect(cache.frameId).toBe(2);

    // Cache miss: stamp[3] (1) !== frameId (2)
    const isCacheHit = cache.fieldStamp[fieldId] === cache.frameId;
    expect(isCacheHit).toBe(false);
  });

  it("maintains cached handle across frames (no clearing)", () => {
    const cache = createFrameCache(10, 10);
    const fieldId = 3;

    // Write handle in frame 1
    const handle: FieldHandle = {
      kind: "Const",
      constId: 42,
      type: { kind: 'number' as const },
    };
    cache.fieldHandle[fieldId] = handle;
    cache.fieldStamp[fieldId] = cache.frameId;

    // Advance to frame 2
    cache.newFrame();

    // Handle is still present (not cleared)
    expect(cache.fieldHandle[fieldId]).toBe(handle);

    // But stamp is stale
    expect(cache.fieldStamp[fieldId]).toBe(1);
    expect(cache.frameId).toBe(2);
  });

  it("multiple field handles cached in same frame", () => {
    const cache = createFrameCache(10, 10);

    const handle0: FieldHandle = {
      kind: "Const",
      constId: 10,
      type: { kind: 'number' as const },
    };
    const handle5: FieldHandle = {
      kind: "Broadcast",
      sigId: 0,
      domainId: 0,
      type: { kind: 'number' as const },
    };
    const handle9: FieldHandle = {
      kind: "Source",
      sourceTag: "pos",
      domainId: 1,
      type: { kind: 'vec2' as const },
    };

    // Write multiple handles
    cache.fieldHandle[0] = handle0;
    cache.fieldStamp[0] = cache.frameId;

    cache.fieldHandle[5] = handle5;
    cache.fieldStamp[5] = cache.frameId;

    cache.fieldHandle[9] = handle9;
    cache.fieldStamp[9] = cache.frameId;

    // All are cache hits
    expect(cache.fieldStamp[0] === cache.frameId).toBe(true);
    expect(cache.fieldStamp[5] === cache.frameId).toBe(true);
    expect(cache.fieldStamp[9] === cache.frameId).toBe(true);

    // Handles are correct
    expect(cache.fieldHandle[0]).toBe(handle0);
    expect(cache.fieldHandle[5]).toBe(handle5);
    expect(cache.fieldHandle[9]).toBe(handle9);
  });
});

describe("FrameCache - Buffer Pool", () => {
  it("starts with empty buffer pool", () => {
    const cache = createFrameCache(10, 10);
    expect(cache.fieldBuffers.size).toBe(0);
  });

  it("stores buffer in pool with key", () => {
    const cache = createFrameCache(10, 10);
    const key = "field_0_domain_1_f32";
    const buffer = new Float32Array([1, 2, 3]);

    cache.fieldBuffers.set(key, buffer);

    expect(cache.fieldBuffers.size).toBe(1);
    expect(cache.fieldBuffers.get(key)).toBe(buffer);
  });

  it("retrieves same buffer instance for same key", () => {
    const cache = createFrameCache(10, 10);
    const key = "field_5_domain_0_f64";
    const buffer = new Float64Array([42, 99]);

    cache.fieldBuffers.set(key, buffer);
    const retrieved = cache.fieldBuffers.get(key);

    expect(retrieved).toBe(buffer); // Same instance
  });

  it("handles multiple buffers with different keys", () => {
    const cache = createFrameCache(10, 10);

    const buf1 = new Float32Array([1, 2]);
    const buf2 = new Float64Array([3, 4]);
    const buf3 = new Uint8Array([5, 6]);

    cache.fieldBuffers.set("key1", buf1);
    cache.fieldBuffers.set("key2", buf2);
    cache.fieldBuffers.set("key3", buf3);

    expect(cache.fieldBuffers.size).toBe(3);
    expect(cache.fieldBuffers.get("key1")).toBe(buf1);
    expect(cache.fieldBuffers.get("key2")).toBe(buf2);
    expect(cache.fieldBuffers.get("key3")).toBe(buf3);
  });

  it("overwrites buffer when using same key", () => {
    const cache = createFrameCache(10, 10);
    const key = "field_0_domain_0_f32";

    const buf1 = new Float32Array([1, 2, 3]);
    const buf2 = new Float32Array([4, 5, 6]);

    cache.fieldBuffers.set(key, buf1);
    expect(cache.fieldBuffers.get(key)).toBe(buf1);

    cache.fieldBuffers.set(key, buf2);
    expect(cache.fieldBuffers.get(key)).toBe(buf2); // Replaced
    expect(cache.fieldBuffers.size).toBe(1); // Still 1 entry
  });
});

describe("FrameCache - newFrame()", () => {
  it("increments frameId by 1", () => {
    const cache = createFrameCache(10, 10);
    expect(cache.frameId).toBe(1);

    cache.newFrame();
    expect(cache.frameId).toBe(2);

    cache.newFrame();
    expect(cache.frameId).toBe(3);
  });

  it("clears buffer pool on newFrame()", () => {
    const cache = createFrameCache(10, 10);

    // Add buffers in frame 1
    cache.fieldBuffers.set("key1", new Float32Array([1, 2]));
    cache.fieldBuffers.set("key2", new Float64Array([3, 4]));
    expect(cache.fieldBuffers.size).toBe(2);

    // Advance to frame 2
    cache.newFrame();

    // Buffer pool should be cleared
    expect(cache.fieldBuffers.size).toBe(0);
  });

  it("does NOT zero signal stamp array", () => {
    const cache = createFrameCache(10, 10);

    // Write stamps in frame 1
    cache.sigStamp[0] = 1;
    cache.sigStamp[5] = 1;
    cache.sigStamp[9] = 1;

    // Advance to frame 2
    cache.newFrame();

    // Stamps should still have value 1 (not zeroed)
    expect(cache.sigStamp[0]).toBe(1);
    expect(cache.sigStamp[5]).toBe(1);
    expect(cache.sigStamp[9]).toBe(1);
  });

  it("does NOT zero field stamp array", () => {
    const cache = createFrameCache(10, 10);

    // Write stamps in frame 1
    cache.fieldStamp[0] = 1;
    cache.fieldStamp[5] = 1;
    cache.fieldStamp[9] = 1;

    // Advance to frame 2
    cache.newFrame();

    // Stamps should still have value 1 (not zeroed)
    expect(cache.fieldStamp[0]).toBe(1);
    expect(cache.fieldStamp[5]).toBe(1);
    expect(cache.fieldStamp[9]).toBe(1);
  });

  it("does NOT clear sigValue array", () => {
    const cache = createFrameCache(10, 10);

    // Write values in frame 1
    cache.sigValue[0] = 10;
    cache.sigValue[5] = 20;

    // Advance to frame 2
    cache.newFrame();

    // Values should still be present
    expect(cache.sigValue[0]).toBe(10);
    expect(cache.sigValue[5]).toBe(20);
  });

  it("does NOT clear fieldHandle array", () => {
    const cache = createFrameCache(10, 10);

    // Write handles in frame 1
    const handle: FieldHandle = {
      kind: "Const",
      constId: 42,
      type: { kind: 'number' as const },
    };
    cache.fieldHandle[5] = handle;

    // Advance to frame 2
    cache.newFrame();

    // Handle should still be present
    expect(cache.fieldHandle[5]).toBe(handle);
  });

  it("multiple newFrame() calls increment monotonically", () => {
    const cache = createFrameCache(10, 10);

    const frames: number[] = [];
    for (let i = 0; i < 10; i++) {
      frames.push(cache.frameId);
      cache.newFrame();
    }

    // FrameId should increment: 1, 2, 3, ..., 10
    expect(frames).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(cache.frameId).toBe(11);
  });
});

describe("FrameCache - invalidate()", () => {
  it("zeros all signal stamps", () => {
    const cache = createFrameCache(10, 10);

    // Write stamps
    for (let i = 0; i < 10; i++) {
      cache.sigStamp[i] = cache.frameId;
    }

    // Invalidate
    cache.invalidate();

    // All stamps should be 0
    for (let i = 0; i < 10; i++) {
      expect(cache.sigStamp[i]).toBe(0);
    }
  });

  it("zeros all field stamps", () => {
    const cache = createFrameCache(10, 10);

    // Write stamps
    for (let i = 0; i < 10; i++) {
      cache.fieldStamp[i] = cache.frameId;
    }

    // Invalidate
    cache.invalidate();

    // All stamps should be 0
    for (let i = 0; i < 10; i++) {
      expect(cache.fieldStamp[i]).toBe(0);
    }
  });

  it("clears buffer pool", () => {
    const cache = createFrameCache(10, 10);

    // Add buffers
    cache.fieldBuffers.set("key1", new Float32Array([1, 2]));
    cache.fieldBuffers.set("key2", new Float64Array([3, 4]));
    expect(cache.fieldBuffers.size).toBe(2);

    // Invalidate
    cache.invalidate();

    // Buffer pool should be cleared
    expect(cache.fieldBuffers.size).toBe(0);
  });

  it("does NOT reset frameId (monotonic)", () => {
    const cache = createFrameCache(10, 10);

    // Advance to frame 5
    for (let i = 0; i < 4; i++) {
      cache.newFrame();
    }
    expect(cache.frameId).toBe(5);

    // Invalidate
    cache.invalidate();

    // FrameId should remain unchanged
    expect(cache.frameId).toBe(5);
  });

  it("invalidate() forces cache miss for all entries", () => {
    const cache = createFrameCache(10, 10);

    // Write signal values
    cache.sigValue[0] = 10;
    cache.sigStamp[0] = cache.frameId;

    cache.sigValue[5] = 20;
    cache.sigStamp[5] = cache.frameId;

    // Verify cache hits
    expect(cache.sigStamp[0] === cache.frameId).toBe(true);
    expect(cache.sigStamp[5] === cache.frameId).toBe(true);

    // Invalidate
    cache.invalidate();

    // Now cache misses (stamps are 0, frameId is still 1)
    expect(cache.sigStamp[0] === cache.frameId).toBe(false);
    expect(cache.sigStamp[5] === cache.frameId).toBe(false);
  });
});

describe("FrameCache - Cache Invalidation Scenarios", () => {
  it("stale stamps invalidated after multiple newFrame() calls", () => {
    const cache = createFrameCache(10, 10);

    // Frame 1: write value
    cache.sigValue[5] = 42;
    cache.sigStamp[5] = cache.frameId; // stamp = 1
    expect(cache.sigStamp[5] === cache.frameId).toBe(true);

    // Frame 2
    cache.newFrame();
    expect(cache.sigStamp[5] === cache.frameId).toBe(false); // stamp 1 < frameId 2

    // Frame 3
    cache.newFrame();
    expect(cache.sigStamp[5] === cache.frameId).toBe(false); // stamp 1 < frameId 3

    // Frame 4
    cache.newFrame();
    expect(cache.sigStamp[5] === cache.frameId).toBe(false); // stamp 1 < frameId 4
  });

  it("re-cache after invalidation works correctly", () => {
    const cache = createFrameCache(10, 10);

    // Frame 1: write value
    cache.sigValue[5] = 42;
    cache.sigStamp[5] = cache.frameId;
    expect(cache.sigStamp[5] === cache.frameId).toBe(true);

    // Frame 2: cache miss
    cache.newFrame();
    expect(cache.sigStamp[5] === cache.frameId).toBe(false);

    // Re-cache with new value
    cache.sigValue[5] = 99;
    cache.sigStamp[5] = cache.frameId; // stamp = 2
    expect(cache.sigStamp[5] === cache.frameId).toBe(true);
    expect(cache.sigValue[5]).toBe(99);
  });

  it("buffer pool cleared and repopulated across frames", () => {
    const cache = createFrameCache(10, 10);

    // Frame 1: add buffer
    const buf1 = new Float32Array([1, 2, 3]);
    cache.fieldBuffers.set("key1", buf1);
    expect(cache.fieldBuffers.size).toBe(1);

    // Frame 2: pool cleared
    cache.newFrame();
    expect(cache.fieldBuffers.size).toBe(0);

    // Add new buffer in frame 2
    const buf2 = new Float32Array([4, 5, 6]);
    cache.fieldBuffers.set("key1", buf2);
    expect(cache.fieldBuffers.size).toBe(1);
    expect(cache.fieldBuffers.get("key1")).toBe(buf2); // New instance
  });
});

describe("FrameCache - Edge Cases", () => {
  it("handles id at capacity boundary", () => {
    const cache = createFrameCache(10, 10);
    const sigId = 9; // Last valid index

    cache.sigValue[sigId] = 42;
    cache.sigStamp[sigId] = cache.frameId;

    expect(cache.sigValue[sigId]).toBe(42);
    expect(cache.sigStamp[sigId] === cache.frameId).toBe(true);
  });

  it("handles frameId overflow (Uint32 max)", () => {
    const cache = createFrameCache(10, 10);

    // Simulate high frameId
    cache.frameId = 0xffffffff - 2; // Near Uint32 max

    cache.newFrame();
    expect(cache.frameId).toBe(0xffffffff - 1);

    cache.newFrame();
    expect(cache.frameId).toBe(0xffffffff);

    // Next increment would overflow to 0 in TypeScript (number type)
    cache.newFrame();
    expect(cache.frameId).toBe(0x100000000); // Actually becomes this (number can exceed Uint32)
  });

  it("empty buffer pool key works", () => {
    const cache = createFrameCache(10, 10);
    const key = "";
    const buffer = new Float32Array([1, 2]);

    cache.fieldBuffers.set(key, buffer);
    expect(cache.fieldBuffers.get(key)).toBe(buffer);
  });

  it("complex buffer pool keys work", () => {
    const cache = createFrameCache(10, 10);
    const key = "field_42_domain_99_format_vec4f32_layout_AoS";
    const buffer = new Float32Array([1, 2, 3, 4]);

    cache.fieldBuffers.set(key, buffer);
    expect(cache.fieldBuffers.get(key)).toBe(buffer);
  });

  it("zero capacity cache creates empty arrays", () => {
    const cache = createFrameCache(0, 0);

    expect(cache.sigValue.length).toBe(0);
    expect(cache.sigStamp.length).toBe(0);
    expect(cache.fieldHandle.length).toBe(0);
    expect(cache.fieldStamp.length).toBe(0);
  });
});
