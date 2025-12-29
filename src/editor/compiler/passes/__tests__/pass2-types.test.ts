/**
 * Pass 2 Type Graph Tests
 *
 * Tests for the pass2TypeGraph function.
 * Verifies SlotType → TypeDesc conversion, bus eligibility validation,
 * reserved bus constraints, and conversion path computation.
 */

import { describe, it, expect } from "vitest";
import { pass2TypeGraph, isBusEligible } from "../pass2-types";
import type {
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
  Slot,
} from "../../../types";
import type { NormalizedPatch, BlockIndex } from "../../ir";
import type { TypeDesc } from "../../ir/types";

// Helper to create a minimal normalized patch
function createNormalizedPatch(
  overrides?: Partial<
    NormalizedPatch<Block, Connection, Publisher, Listener, Bus>
  >
): NormalizedPatch<Block, Connection, Publisher, Listener, Bus> {
  return {
    blockIndexMap: new Map<string, BlockIndex>(),
    blocks: [],
    wires: [],
    publishers: [],
    listeners: [],
    buses: [],
    defaultSources: [],
    ...overrides,
  };
}

// Helper to create a minimal block
function createBlock(id: string, overrides?: Partial<Block>): Block {
  return {
    id,
    type: "test-block",
    label: `Block ${id}`,
    inputs: [],
    outputs: [],
    params: {},
    category: "Other",
    ...overrides,
  };
}

// Helper to create a slot
function createSlot(
  id: string,
  type: string,
  direction: "input" | "output",
  overrides?: Partial<Slot>
): Slot {
  return {
    id,
    label: id,
    type,
    direction,
    ...overrides,
  } as Slot;
}

// Helper to create a connection
function createConnection(
  fromBlock: string,
  fromSlot: string,
  toBlock: string,
  toSlot: string
): Connection {
  return {
    id: `${fromBlock}.${fromSlot}->${toBlock}.${toSlot}`,
    from: { blockId: fromBlock, slotId: fromSlot, direction: "output" as const },
    to: { blockId: toBlock, slotId: toSlot, direction: "input" as const },
  };
}

// Helper to create a bus
function createBus(
  id: string,
  name: string,
  type: TypeDesc,
  overrides?: Partial<Bus>
): Bus {
  return {
    id,
    name,
    type: type as unknown as import("../../../types").Bus["type"], // Cast to match editor TypeDesc
    combineMode: "last",
    defaultValue: 0,
    sortKey: 0,
    ...overrides,
  };
}

describe("pass2TypeGraph", () => {
  describe("SlotType → TypeDesc Conversion", () => {
    it("converts Signal<number> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<number>", "output")],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
      // Conversion succeeds without error
    });

    it("converts Field<vec2> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Field<vec2>", "output")],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts Signal<color> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<color>", "output")],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts Event<any> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Event<any>", "output")],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts Scalar:number to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            inputs: [createSlot("in1", "Scalar:number", "input")],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts special types without generic syntax", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [
              createSlot("scene", "Scene", "output"),
              createSlot("render", "RenderTree", "output"),
              createSlot("domain", "Domain", "output"),
            ],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("normalizes domain aliases (Point → vec2, Unit → unit01)", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [
              createSlot("point", "Signal<Point>", "output"),
              createSlot("unit", "Signal<Unit>", "output"),
              createSlot("time", "Signal<Time>", "output"),
            ],
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("throws PortTypeUnknown error for unrecognized slot type", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "UnknownType<foo>", "output")],
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/PortTypeUnknown/);
      expect(() => pass2TypeGraph(patch)).toThrow(/Cannot parse slot type/);
    });

    it("includes block and slot IDs in PortTypeUnknown error", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("block-123", {
            outputs: [createSlot("output-456", "InvalidType", "output")],
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/block-123/);
      expect(() => pass2TypeGraph(patch)).toThrow(/output-456/);
    });
  });

  describe("Bus Eligibility Validation", () => {
    it("accepts signal buses (always eligible)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "testBus", {
            world: "signal",
            domain: "number",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.size).toBe(1);
      expect(typed.busTypes.get("bus1")).toEqual({
        world: "signal",
        domain: "number",
      });
    });

    it("accepts event buses (always eligible)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "pulseBus", {
            world: "event",
            domain: "trigger",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.size).toBe(1);
    });

    it("accepts field buses with scalar domains (number, boolean, color)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "fieldNumber", {
            world: "field",
            domain: "number",
          }),
          createBus("bus2", "fieldBoolean", {
            world: "field",
            domain: "boolean",
          }),
          createBus("bus3", "fieldColor", {
            world: "field",
            domain: "color",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.size).toBe(3);
    });

    it("rejects field buses with non-scalar domains (vec2, vec3)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "fieldVec2", {
            world: "field",
            domain: "vec2",
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
      expect(() => pass2TypeGraph(patch)).toThrow(/fieldVec2/);
    });

    it("rejects scalar buses (compile-time only)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "scalarBus", {
            world: "scalar",
            domain: "number",
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
    });

    it("rejects special buses (not bus-eligible)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "specialBus", {
            world: "special",
            domain: "renderTree",
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
    });

    it("includes bus name in BusIneligibleType error", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus-123", "myInvalidBus", {
            world: "scalar",
            domain: "number",
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/myInvalidBus/);
      expect(() => pass2TypeGraph(patch)).toThrow(/bus-123/);
    });
  });

  describe("Reserved Bus Validation", () => {
    it("accepts phaseA bus with Signal<phase> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("phaseA", "phaseA", {
            world: "signal",
            domain: "phase01",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("phaseA")).toBeDefined();
    });

    it("rejects phaseA bus with wrong type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("phaseA", "phaseA", {
            world: "signal",
            domain: "color",
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(
        /ReservedBusTypeViolation/
      );
      expect(() => pass2TypeGraph(patch)).toThrow(/phaseA/);
      expect(() => pass2TypeGraph(patch)).toThrow(/signal<phase01>/);
    });

    it("accepts pulse bus with Event<trigger> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("pulse", "pulse", {
            world: "event",
            domain: "trigger",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("pulse")).toBeDefined();
    });

    it("rejects pulse bus with wrong type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("pulse", "pulse", {
            world: "signal",
            domain: "number",
          }),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(
        /ReservedBusTypeViolation/
      );
      expect(() => pass2TypeGraph(patch)).toThrow(/pulse/);
    });

    it("accepts energy bus with Signal<number> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("energy", "energy", {
            world: "signal",
            domain: "number",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("energy")).toBeDefined();
    });

    it("accepts palette bus with Signal<color> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("palette", "palette", {
            world: "signal",
            domain: "color",
          }),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("palette")).toBeDefined();
    });
  });

  describe("Conversion Path Precomputation", () => {
    it("computes empty path for exact type match", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<number>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<number>", "input")],
          }),
        ],
        wires: [createConnection("b1", "out1", "b2", "in1")],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.conversionPaths.size).toBe(0); // No conversion needed
    });

    it("emits NoConversionPath error for type mismatch", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<vec2>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<number>", "input")],
          }),
        ],
        wires: [createConnection("b1", "out1", "b2", "in1")],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/NoConversionPath/);
      expect(() => pass2TypeGraph(patch)).toThrow(/vec2/);
      expect(() => pass2TypeGraph(patch)).toThrow(/number/);
    });

    it("includes connection ID in NoConversionPath error", () => {
      const wire = createConnection("b1", "out1", "b2", "in1");
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<color>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<number>", "input")],
          }),
        ],
        wires: [wire],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(wire.id);
    });

    it("skips dangling connections gracefully", () => {
      const patch = createNormalizedPatch({
        blocks: [createBlock("b1")],
        wires: [createConnection("b1", "out1", "b2", "in1")],
      });

      // Should not throw - dangling connections are validated in Pass 4
      expect(() => pass2TypeGraph(patch)).not.toThrow();
    });
  });

  describe("isBusEligible helper", () => {
    it("returns true for signal types", () => {
      expect(
        isBusEligible({ world: "signal", domain: "number" })
      ).toBe(true);
      expect(
        isBusEligible({ world: "signal", domain: "color" })
      ).toBe(true);
    });

    it("returns true for event types", () => {
      expect(
        isBusEligible({ world: "event", domain: "trigger" })
      ).toBe(true);
    });

    it("returns true for field types with scalar domains", () => {
      expect(
        isBusEligible({ world: "field", domain: "number" })
      ).toBe(true);
      expect(
        isBusEligible({ world: "field", domain: "boolean" })
      ).toBe(true);
      expect(
        isBusEligible({ world: "field", domain: "color" })
      ).toBe(true);
    });

    it("returns false for field types with non-scalar domains", () => {
      expect(
        isBusEligible({ world: "field", domain: "vec2" })
      ).toBe(false);
      expect(
        isBusEligible({ world: "field", domain: "vec3" })
      ).toBe(false);
    });

    it("returns false for scalar types", () => {
      expect(
        isBusEligible({ world: "scalar", domain: "number" })
      ).toBe(false);
    });

    it("returns false for special types", () => {
      expect(
        isBusEligible({ world: "special", domain: "renderTree" })
      ).toBe(false);
    });
  });
});
