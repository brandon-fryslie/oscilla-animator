/**
 * ValueStore Tests
 *
 * Tests for ValueStore implementation.
 * Verifies typed array allocation, slot addressing, single-writer enforcement,
 * and frame lifecycle management.
 */

import { describe, it, expect } from "vitest";
import { createValueStore } from "../stores";
import type { SlotMeta } from "../stores";
import type { TypeDesc } from "../types";
import { asTypeDesc } from "../types";

// Helper to create a simple TypeDesc
function makeType(world: "signal" | "field", domain: string): TypeDesc {
  return asTypeDesc({
    world,
    domain: domain as TypeDesc["domain"],
  });
}

describe("ValueStore", () => {
  describe("Allocation", () => {
    it("allocates f64 array with correct size based on max offset", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 2, type: makeType("signal", "float") },
        { slot: 2, storage: "f64", offset: 1, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      // Max offset is 2, so array size should be 3
      expect(store.f64.length).toBe(3);
    });

    it("allocates f32 array with correct size", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f32", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f32", offset: 4, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      expect(store.f32.length).toBe(5);
    });

    it("allocates i32 array with correct size", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "i32", offset: 1, type: makeType("signal", "float") },
        { slot: 1, storage: "i32", offset: 3, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      expect(store.i32.length).toBe(4);
    });

    it("allocates u32 array with correct size", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "u32", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "u32", offset: 2, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      expect(store.u32.length).toBe(3);
    });

    it("allocates object array with correct size", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "object", offset: 0, type: makeType("field", "vec2") },
        { slot: 1, storage: "object", offset: 1, type: makeType("field", "vec3") },
      ];

      const store = createValueStore(slotMeta);

      expect(store.objects.length).toBe(2);
    });

    it("allocates mixed storage types correctly", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 1, type: makeType("signal", "float") },
        { slot: 2, storage: "f32", offset: 0, type: makeType("signal", "float") },
        { slot: 3, storage: "i32", offset: 0, type: makeType("signal", "float") },
        { slot: 4, storage: "object", offset: 0, type: makeType("field", "vec2") },
      ];

      const store = createValueStore(slotMeta);

      expect(store.f64.length).toBe(2);
      expect(store.f32.length).toBe(1);
      expect(store.i32.length).toBe(1);
      expect(store.u32.length).toBe(0); // No u32 slots
      expect(store.objects.length).toBe(1);
    });

    it("handles empty slotMeta (no slots)", () => {
      const slotMeta: SlotMeta[] = [];
      const store = createValueStore(slotMeta);

      expect(store.f64.length).toBe(0);
      expect(store.f32.length).toBe(0);
      expect(store.i32.length).toBe(0);
      expect(store.u32.length).toBe(0);
      expect(store.objects.length).toBe(0);
    });

    it("handles sparse slot indices (gaps in slot numbers)", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 5, storage: "f64", offset: 1, type: makeType("signal", "float") },
        { slot: 10, storage: "f64", offset: 2, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      // Array size based on max offset, not max slot
      expect(store.f64.length).toBe(3);

      // All slots should be accessible
      store.write(0, 1.0);
      store.write(5, 2.0);
      store.write(10, 3.0);

      expect(store.read(0)).toBe(1.0);
      expect(store.read(5)).toBe(2.0);
      expect(store.read(10)).toBe(3.0);
    });
  });

  describe("Write Operations", () => {
    it("writes to f64 array at correct offset", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 1, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      store.write(0, 3.14);
      store.write(1, 2.71);

      expect(store.f64[0]).toBe(3.14);
      expect(store.f64[1]).toBe(2.71);
    });

    it("writes to f32 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f32", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, 1.5);

      expect(store.f32[0]).toBe(1.5);
    });

    it("writes to i32 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "i32", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, -42);

      expect(store.i32[0]).toBe(-42);
    });

    it("writes to u32 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "u32", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, 42);

      expect(store.u32[0]).toBe(42);
    });

    it("writes to object array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "object", offset: 0, type: makeType("field", "vec2") },
      ];

      const store = createValueStore(slotMeta);
      const obj = { type: "fieldHandle", id: 123 };
      store.write(0, obj);

      expect(store.objects[0]).toBe(obj);
    });

    it("throws error when writing to non-existent slot", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      expect(() => store.write(99, 1.0)).toThrow("ValueStore.write: no metadata for slot 99");
    });
  });

  describe("Read Operations", () => {
    it("reads value from f64 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, 3.14);

      expect(store.read(0)).toBe(3.14);
    });

    it("reads value from f32 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f32", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, 1.5);

      expect(store.read(0)).toBe(1.5);
    });

    it("reads value from i32 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "i32", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, -42);

      expect(store.read(0)).toBe(-42);
    });

    it("reads value from u32 array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "u32", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);
      store.write(0, 42);

      expect(store.read(0)).toBe(42);
    });

    it("reads object from object array", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "object", offset: 0, type: makeType("field", "vec2") },
      ];

      const store = createValueStore(slotMeta);
      const obj = { type: "fieldHandle", id: 123 };
      store.write(0, obj);

      expect(store.read(0)).toBe(obj);
    });

    it("throws error when reading from non-existent slot", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      expect(() => store.read(99)).toThrow("ValueStore.read: no metadata for slot 99");
    });

    it("reads correct value with multiple slots at different offsets", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 2, type: makeType("signal", "float") },
        { slot: 2, storage: "f64", offset: 1, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      store.write(0, 10.0);
      store.write(1, 30.0);
      store.write(2, 20.0);

      expect(store.read(0)).toBe(10.0);
      expect(store.read(1)).toBe(30.0);
      expect(store.read(2)).toBe(20.0);
    });
  });

  describe("Single-Writer Enforcement", () => {
    it("allows single write to each slot per frame", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 1, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      // First write to each slot should succeed
      expect(() => store.write(0, 1.0)).not.toThrow();
      expect(() => store.write(1, 2.0)).not.toThrow();
    });

    it("throws error on duplicate write to same slot in same frame", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      store.write(0, 1.0);
      expect(() => store.write(0, 2.0)).toThrow("ValueStore.write: slot 0 written multiple times this frame");
    });

    it("error message includes slot index for debugging", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 5, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      store.write(5, 1.0);
      expect(() => store.write(5, 2.0)).toThrow("ValueStore.write: slot 5 written multiple times this frame");
    });

    it("allows write to different slots in same frame", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 1, type: makeType("signal", "float") },
        { slot: 2, storage: "object", offset: 0, type: makeType("field", "vec2") },
      ];

      const store = createValueStore(slotMeta);

      expect(() => {
        store.write(0, 1.0);
        store.write(1, 2.0);
        store.write(2, { id: 3 });
      }).not.toThrow();
    });
  });

  describe("Frame Management", () => {
    it("clear() resets write tracking", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      // Write in first frame
      store.write(0, 1.0);

      // Clear for new frame
      store.clear();

      // Write to same slot in new frame should succeed
      expect(() => store.write(0, 2.0)).not.toThrow();
      expect(store.read(0)).toBe(2.0);
    });

    it("clear() does not erase values (optimization)", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 1, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      store.write(0, 3.14);
      store.write(1, 2.71);
      store.clear();

      // Values persist in arrays until overwritten
      expect(store.f64[0]).toBe(3.14);
      expect(store.f64[1]).toBe(2.71);
    });

    it("supports multiple frame cycles", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      // Frame 1
      store.write(0, 1.0);
      expect(store.read(0)).toBe(1.0);

      store.clear();

      // Frame 2
      store.write(0, 2.0);
      expect(store.read(0)).toBe(2.0);

      store.clear();

      // Frame 3
      store.write(0, 3.0);
      expect(store.read(0)).toBe(3.0);
    });

    it("clear() resets tracking for all slots", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
        { slot: 1, storage: "f64", offset: 1, type: makeType("signal", "float") },
        { slot: 2, storage: "object", offset: 0, type: makeType("field", "vec2") },
      ];

      const store = createValueStore(slotMeta);

      // Write all slots in frame 1
      store.write(0, 1.0);
      store.write(1, 2.0);
      store.write(2, { id: 3 });

      store.clear();

      // All slots should be writable again in frame 2
      expect(() => {
        store.write(0, 10.0);
        store.write(1, 20.0);
        store.write(2, { id: 30 });
      }).not.toThrow();
    });
  });

  describe("Slot Metadata", () => {
    it("stores slotMeta reference", () => {
      const slotMeta: SlotMeta[] = [
        { slot: 0, storage: "f64", offset: 0, type: makeType("signal", "float") },
      ];

      const store = createValueStore(slotMeta);

      expect(store.slotMeta).toStrictEqual(slotMeta);
    });

    it("preserves type information in slotMeta", () => {
      const type = makeType("field", "vec2");
      const slotMeta: SlotMeta[] = [{ slot: 0, storage: "object", offset: 0, type }];

      const store = createValueStore(slotMeta);

      expect(store.slotMeta[0].type).toEqual(type);
    });
  });
});
