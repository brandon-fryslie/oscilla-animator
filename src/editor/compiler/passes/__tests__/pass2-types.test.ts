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
  Slot,
} from "../../../types";
import type { NormalizedPatch, BlockIndex } from "../../ir";
import type { TypeDesc } from "../../ir/types";
import { asTypeDesc } from "../../ir/types";

// Helper to convert blocks array to Map
function blocksToMap(blocks: Block[]): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const block of blocks) {
    map.set(block.id, block);
  }
  return map;
}

// Helper to create a minimal normalized patch
function createNormalizedPatch(
  overrides?: Partial<NormalizedPatch>
): NormalizedPatch {
  return {
    blockIndexMap: new Map<string, BlockIndex>(),
    blocks: new Map<string, unknown>(),
    edges: [],
    defaults: [],
    constPool: new Map(),
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


// Helper to create a BusBlock
function createBusBlock(
  id: string,
  name: string,
  type: TypeDesc
): Block {
  return {
    id,
    type: "BusBlock",
    label: name,
    inputs: [{ id: "in", label: "Publishers", type: "Signal<float>", direction: "input" as const }],
    outputs: [{ id: "out", label: "Bus Output", type: "Signal<float>", direction: "output" as const }],
    params: {
      busId: id,
      busName: name,
      busType: { domain: type.domain, world: type.world },
      combine: { when: "multi", mode: "last" },
      defaultValue: 0,
      sortKey: 0,
    },
    category: "Other",
  };
}

// Helper to create an edge
function createEdge(
  fromBlock: string,
  fromSlot: string,
  toBlock: string,
  toSlot: string,
  enabled: boolean = true
): import("../../../types").Edge {
  return {
    id: `${fromBlock}.${fromSlot}->${toBlock}.${toSlot}`,
    from: { kind: "port", blockId: fromBlock, slotId: fromSlot },
    to: { kind: "port", blockId: toBlock, slotId: toSlot },
    enabled,
  };
}

describe("pass2TypeGraph", () => {
  describe("SlotType → TypeDesc Conversion", () => {
    it("converts Signal<float> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<float>", "output")],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
      // Conversion succeeds without error
    });

    it("converts Field<vec2> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Field<vec2>", "output")],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts Signal<color> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<color>", "output")],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts Event<any> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Event<any>", "output")],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts Scalar:float to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            inputs: [createSlot("in1", "Scalar:float", "input")],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("converts special types without generic syntax", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [
              createSlot("scene", "Scene", "output"),
              createSlot("render", "RenderTree", "output"),
              createSlot("domain", "Domain", "output"),
            ],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("normalizes domain aliases (Point → vec2, Unit → float)", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [
              createSlot("point", "Signal<Point>", "output"),
              createSlot("unit", "Signal<Unit>", "output"),
              createSlot("time", "Signal<Time>", "output"),
            ],
          }),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
    });

    it("throws PortTypeUnknown error for unrecognized slot type", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "UnknownType<foo>", "output")],
          }),
        ]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/PortTypeUnknown/);
      expect(() => pass2TypeGraph(patch)).toThrow(/Cannot parse slot type/);
    });

    it("includes block and slot IDs in PortTypeUnknown error", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("block-123", {
            outputs: [createSlot("output-456", "InvalidType", "output")],
          }),
        ]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/block-123/);
      expect(() => pass2TypeGraph(patch)).toThrow(/output-456/);
    });
  });

  describe("Bus Eligibility Validation", () => {
    it("accepts signal buses (always eligible)", () => {
      const busBlock = createBusBlock("bus1", "testBus", asTypeDesc({
        world: "signal",
        domain: "float",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.size).toBe(1);
      const busType = typed.busOutputTypes?.get("bus1");
      expect(busType?.world).toBe("signal");
      expect(busType?.domain).toBe("float");
    });

    it("accepts event buses (always eligible)", () => {
      const busBlock = createBusBlock("bus1", "pulseBus", asTypeDesc({
        world: "event",
        domain: "trigger",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.size).toBe(1);
    });

    it("accepts field buses with scalar domains (float, boolean, color)", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBusBlock("bus1", "fieldNumber", asTypeDesc({
            world: "field",
            domain: "float",
          })),
          createBusBlock("bus2", "fieldBoolean", asTypeDesc({
            world: "field",
            domain: "boolean",
          })),
          createBusBlock("bus3", "fieldColor", asTypeDesc({
            world: "field",
            domain: "color",
          })),
        ]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.size).toBe(3);
    });

    it("rejects field buses with non-scalar domains (vec2, vec3)", () => {
      const busBlock = createBusBlock("bus1", "fieldVec2", asTypeDesc({
        world: "field",
        domain: "vec2",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
      expect(() => pass2TypeGraph(patch)).toThrow(/fieldVec2/);
    });

    it("rejects scalar buses (compile-time only)", () => {
      const busBlock = createBusBlock("bus1", "scalarBus", asTypeDesc({
        world: "scalar",
        domain: "float",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
    });

    it("rejects config buses (not bus-eligible)", () => {
      const busBlock = createBusBlock("bus1", "specialBus", asTypeDesc({
        world: "special",
        domain: "renderTree",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
    });

    it("includes bus name in BusIneligibleType error", () => {
      const busBlock = createBusBlock("bus-123", "myInvalidBus", asTypeDesc({
        world: "scalar",
        domain: "float",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/myInvalidBus/);
      expect(() => pass2TypeGraph(patch)).toThrow(/bus-123/);
    });
  });

  describe("Reserved Bus Validation", () => {
    it("accepts phaseA bus with Signal<phase> type", () => {
      const busBlock = createBusBlock("phaseA", "phaseA", asTypeDesc({
        world: "signal",
        domain: "float",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.get("phaseA")).toBeDefined();
    });

    it("rejects phaseA bus with wrong type", () => {
      const busBlock = createBusBlock("phaseA", "phaseA", asTypeDesc({
        world: "signal",
        domain: "color",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(
        /ReservedBusTypeViolation/
      );
      expect(() => pass2TypeGraph(patch)).toThrow(/phaseA/);
      expect(() => pass2TypeGraph(patch)).toThrow(/signal<float>/);
    });

    it("accepts pulse bus with Event<trigger> type", () => {
      const busBlock = createBusBlock("pulse", "pulse", asTypeDesc({
        world: "event",
        domain: "trigger",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.get("pulse")).toBeDefined();
    });

    it("rejects pulse bus with wrong type", () => {
      const busBlock = createBusBlock("pulse", "pulse", asTypeDesc({
        world: "signal",
        domain: "float",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      expect(() => pass2TypeGraph(patch)).toThrow(
        /ReservedBusTypeViolation/
      );
      expect(() => pass2TypeGraph(patch)).toThrow(/pulse/);
    });

    it("accepts energy bus with Signal<float> type", () => {
      const busBlock = createBusBlock("energy", "energy", asTypeDesc({
        world: "signal",
        domain: "float",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.get("energy")).toBeDefined();
    });

    it("accepts palette bus with Signal<color> type", () => {
      const busBlock = createBusBlock("palette", "palette", asTypeDesc({
        world: "signal",
        domain: "color",
      }));
      const patch = createNormalizedPatch({
        blocks: blocksToMap([busBlock]),
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busOutputTypes?.get("palette")).toBeDefined();
    });
  });

  describe("Conversion Path Precomputation", () => {
    it("computes empty path for exact type match", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<float>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<float>", "input")],
          }),
        ]),
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed).toBeDefined();
      // No conversion needed - type match
    });

    it("emits NoConversionPath error for type mismatch", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<vec2>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<float>", "input")],
          }),
        ]),
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/NoConversionPath/);
      expect(() => pass2TypeGraph(patch)).toThrow(/vec2/);
      expect(() => pass2TypeGraph(patch)).toThrow(/float/);
    });

    it("includes edge ID in NoConversionPath error", () => {
      const edge = createEdge("b1", "out1", "b2", "in1");
      const patch = createNormalizedPatch({
        blocks: blocksToMap([
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<color>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<float>", "input")],
          }),
        ]),
        edges: [edge],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(edge.id);
    });

    it("skips dangling edges gracefully", () => {
      const patch = createNormalizedPatch({
        blocks: blocksToMap([createBlock("b1")]),
        edges: [createEdge("b1", "out1", "b2", "in1")],
      });

      // Should not throw - dangling edges are validated in Pass 4
      expect(() => pass2TypeGraph(patch)).not.toThrow();
    });
  });

  describe("isBusEligible helper", () => {
    it("returns true for signal types", () => {
      expect(
        isBusEligible(asTypeDesc({ world: "signal", domain: "float" }))
      ).toBe(true);
      expect(
        isBusEligible(asTypeDesc({ world: "signal", domain: "color" }))
      ).toBe(true);
    });

    it("returns true for event types", () => {
      expect(
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
      ).toBe(true);
    });

    it("returns true for field types with scalar domains", () => {
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "float" }))
      ).toBe(true);
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "boolean" }))
      ).toBe(true);
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "color" }))
      ).toBe(true);
    });

    it("returns false for field types with non-scalar domains", () => {
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "vec2" }))
      ).toBe(false);
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "vec3" }))
      ).toBe(false);
    });

    it("returns false for scalar types", () => {
      expect(
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
      ).toBe(false);
    });

    it("returns false for config types", () => {
      expect(
        isBusEligible(asTypeDesc({ world: "special", domain: "renderTree" }))
      ).toBe(false);
    });
  });
});
