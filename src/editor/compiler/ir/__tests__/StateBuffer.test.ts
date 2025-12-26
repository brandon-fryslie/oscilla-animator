/**
 * StateBuffer Tests
 *
 * Tests for StateBuffer implementation.
 * Verifies typed array allocation, state cell initialization, and const pool integration.
 */

import { describe, it, expect } from "vitest";
import { createStateBuffer, initializeState } from "../stores";
import type { StateLayout } from "../stores";
import type { ConstPool } from "../program";

describe("StateBuffer", () => {
  describe("Allocation", () => {
    it("allocates f64 array with correct size from layout", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 10,
        f32Size: 0,
        i32Size: 0,
      };

      const buffer = createStateBuffer(layout);

      expect(buffer.f64).toBeInstanceOf(Float64Array);
      expect(buffer.f64.length).toBe(10);
    });

    it("allocates f32 array with correct size", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 5,
        i32Size: 0,
      };

      const buffer = createStateBuffer(layout);

      expect(buffer.f32).toBeInstanceOf(Float32Array);
      expect(buffer.f32.length).toBe(5);
    });

    it("allocates i32 array with correct size", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 3,
      };

      const buffer = createStateBuffer(layout);

      expect(buffer.i32).toBeInstanceOf(Int32Array);
      expect(buffer.i32.length).toBe(3);
    });

    it("allocates all storage types with correct sizes", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 10,
        f32Size: 5,
        i32Size: 3,
      };

      const buffer = createStateBuffer(layout);

      expect(buffer.f64.length).toBe(10);
      expect(buffer.f32.length).toBe(5);
      expect(buffer.i32.length).toBe(3);
    });

    it("handles zero-length arrays (no state of that type)", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const buffer = createStateBuffer(layout);

      expect(buffer.f64.length).toBe(0);
      expect(buffer.f32.length).toBe(0);
      expect(buffer.i32.length).toBe(0);
    });

    it("allocates mixed storage types", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 100,
        f32Size: 0,
        i32Size: 50,
      };

      const buffer = createStateBuffer(layout);

      expect(buffer.f64.length).toBe(100);
      expect(buffer.f32.length).toBe(0);
      expect(buffer.i32.length).toBe(50);
    });
  });

  describe("Initialization", () => {
    it("initializes scalar cell with zero when no initialConstId", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      expect(buffer.f64[0]).toBe(0);
    });

    it("initializes scalar cell with value from const pool", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
            initialConstId: 0,
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([3.14]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [{ k: "f64", idx: 0 }],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      expect(buffer.f64[0]).toBe(3.14);
    });

    it("initializes ring buffer (size > 1) with same value for all elements", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "delay-1",
            storage: "f64",
            offset: 0,
            size: 5,
            nodeId: "node-1",
            role: "ringBuffer",
            initialConstId: 0,
          },
        ],
        f64Size: 5,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([1.5]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [{ k: "f64", idx: 0 }],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      // All 5 elements should be initialized to 1.5
      expect(buffer.f64[0]).toBe(1.5);
      expect(buffer.f64[1]).toBe(1.5);
      expect(buffer.f64[2]).toBe(1.5);
      expect(buffer.f64[3]).toBe(1.5);
      expect(buffer.f64[4]).toBe(1.5);
    });

    it("initializes multiple cells with different initial values", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
            initialConstId: 0,
          },
          {
            stateId: "state-2",
            storage: "f64",
            offset: 1,
            size: 1,
            nodeId: "node-2",
            role: "phase",
            initialConstId: 1,
          },
        ],
        f64Size: 2,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([100.0, 200.0]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [
          { k: "f64", idx: 0 },
          { k: "f64", idx: 1 },
        ],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      expect(buffer.f64[0]).toBe(100.0);
      expect(buffer.f64[1]).toBe(200.0);
    });

    it("initializes f32 cells correctly", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f32",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "value",
            initialConstId: 0,
          },
        ],
        f64Size: 0,
        f32Size: 1,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([]),
        f32: new Float32Array([2.5]),
        i32: new Int32Array([]),
        constIndex: [{ k: "f32", idx: 0 }],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      expect(buffer.f32[0]).toBe(2.5);
    });

    it("initializes i32 cells correctly", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "i32",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "counter",
            initialConstId: 0,
          },
        ],
        f64Size: 0,
        f32Size: 0,
        i32Size: 1,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([]),
        f32: new Float32Array([]),
        i32: new Int32Array([42]),
        constIndex: [{ k: "i32", idx: 0 }],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      expect(buffer.i32[0]).toBe(42);
    });

    it("initializes mixed storage types", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-f64",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
            initialConstId: 0,
          },
          {
            stateId: "state-f32",
            storage: "f32",
            offset: 0,
            size: 1,
            nodeId: "node-2",
            role: "value",
            initialConstId: 1,
          },
          {
            stateId: "state-i32",
            storage: "i32",
            offset: 0,
            size: 1,
            nodeId: "node-3",
            role: "counter",
            initialConstId: 2,
          },
        ],
        f64Size: 1,
        f32Size: 1,
        i32Size: 1,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([1.1]),
        f32: new Float32Array([2.2]),
        i32: new Int32Array([33]),
        constIndex: [
          { k: "f64", idx: 0 },
          { k: "f32", idx: 0 },
          { k: "i32", idx: 0 },
        ],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      expect(buffer.f64[0]).toBe(1.1);
      expect(buffer.f32[0]).toBeCloseTo(2.2);
      expect(buffer.i32[0]).toBe(33);
    });

    it("throws error when constId not found in constPool", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 1,
            nodeId: "node-1",
            role: "accumulator",
            initialConstId: 99, // Invalid constId
          },
        ],
        f64Size: 1,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [],
      };

      const buffer = createStateBuffer(layout);

      expect(() => initializeState(buffer, layout, constPool)).toThrow(
        "constId 99 not found in constPool",
      );
    });

    it("handles empty layout (no state cells)", () => {
      const layout: StateLayout = {
        cells: [],
        f64Size: 0,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [],
      };

      const buffer = createStateBuffer(layout);

      expect(() => initializeState(buffer, layout, constPool)).not.toThrow();
    });

    it("initializes cells at non-contiguous offsets", () => {
      const layout: StateLayout = {
        cells: [
          {
            stateId: "state-1",
            storage: "f64",
            offset: 0,
            size: 2,
            nodeId: "node-1",
            role: "buffer",
            initialConstId: 0,
          },
          {
            stateId: "state-2",
            storage: "f64",
            offset: 5,
            size: 3,
            nodeId: "node-2",
            role: "buffer",
            initialConstId: 1,
          },
        ],
        f64Size: 8,
        f32Size: 0,
        i32Size: 0,
      };

      const constPool: ConstPool = {
        json: [],
        f64: new Float64Array([10.0, 20.0]),
        f32: new Float32Array([]),
        i32: new Int32Array([]),
        constIndex: [
          { k: "f64", idx: 0 },
          { k: "f64", idx: 1 },
        ],
      };

      const buffer = createStateBuffer(layout);
      initializeState(buffer, layout, constPool);

      // First cell at offset 0-1
      expect(buffer.f64[0]).toBe(10.0);
      expect(buffer.f64[1]).toBe(10.0);

      // Gap at offset 2-4 (uninitialized by this test, should be 0)
      expect(buffer.f64[2]).toBe(0);
      expect(buffer.f64[3]).toBe(0);
      expect(buffer.f64[4]).toBe(0);

      // Second cell at offset 5-7
      expect(buffer.f64[5]).toBe(20.0);
      expect(buffer.f64[6]).toBe(20.0);
      expect(buffer.f64[7]).toBe(20.0);
    });
  });
});
