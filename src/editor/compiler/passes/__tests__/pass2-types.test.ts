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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
import type { TypeDesc } from "../../ir/types"; import { asTypeDesc } from "../../ir/types";
=======
import type { TypeDesc } from } from "../../ir/types";;
import { asTypeDesc } from
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
<<<<<<< HEAD
=======
import type { TypeDesc } from "../../ir/types"; import { asTypeDesc } from "../../ir/types";
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
<<<<<<< HEAD
import type { TypeDesc } from "../../ir/types"; import { asTypeDesc } from "../../ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
import type { TypeDesc } from "../../ir/types"; import { asTypeDesc } from "../../ir/types";
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
import type { TypeDesc } from } from "../../ir/types";;
import { asTypeDesc } from
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
import type { TypeDesc } from "../../ir/types"; import { asTypeDesc } from "../../ir/types";
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)

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
    it("converts Signal<float> to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<float>", "output")],
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

    it("converts Scalar:float to TypeDesc", () => {
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            inputs: [createSlot("in1", "Scalar:float", "input")],
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

    it("normalizes domain aliases (Point → vec2, Unit → float)", () => {
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
          createBus("bus1", "testBus", asTypeDesc({
    world: "signal",
    domain: "float",
  })),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.size).toBe(1);
      const busType = typed.busTypes.get("bus1");
      expect(busType?.world).toBe("signal");
      expect(busType?.domain).toBe("float");
    });

    it("accepts event buses (always eligible)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "pulseBus", asTypeDesc({
    world: "event",
    domain: "trigger",
  })),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.size).toBe(1);
    });

    it("accepts field buses with scalar domains (float, boolean, color)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "fieldNumber", asTypeDesc({
    world: "field",
    domain: "float",
  })),
          createBus("bus2", "fieldBoolean", asTypeDesc({
    world: "field",
    domain: "boolean",
  })),
          createBus("bus3", "fieldColor", asTypeDesc({
    world: "field",
    domain: "color",
  })),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.size).toBe(3);
    });

    it("rejects field buses with non-scalar domains (vec2, vec3)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "fieldVec2", asTypeDesc({
    world: "field",
    domain: "vec2",
  })),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
      expect(() => pass2TypeGraph(patch)).toThrow(/fieldVec2/);
    });

    it("rejects scalar buses (compile-time only)", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus1", "scalarBus", asTypeDesc({
    world: "scalar",
    domain: "float",
  })),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
    });

    it("rejects config buses (not bus-eligible)", () => {
      const patch = createNormalizedPatch({
        buses: [
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
          createBus("bus1", "configBus", asTypeDesc({
    world: "config",
=======
          createBus("bus1", "specialBus", asTypeDesc({
    world: "special",
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
          createBus("bus1", "specialBus", asTypeDesc({
    world: "special",
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
          createBus("bus1", "specialBus", asTypeDesc({
    world: "special",
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
    domain: "renderTree",
  })),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/BusIneligibleType/);
    });

    it("includes bus name in BusIneligibleType error", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("bus-123", "myInvalidBus", asTypeDesc({
    world: "scalar",
    domain: "float",
  })),
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
          createBus("phaseA", "phaseA", asTypeDesc({
    world: "signal",
    domain: "float",
  })),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("phaseA")).toBeDefined();
    });

    it("rejects phaseA bus with wrong type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("phaseA", "phaseA", asTypeDesc({
    world: "signal",
    domain: "color",
  })),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(
        /ReservedBusTypeViolation/
      );
      expect(() => pass2TypeGraph(patch)).toThrow(/phaseA/);
      expect(() => pass2TypeGraph(patch)).toThrow(/signal<float>/);
    });

    it("accepts pulse bus with Event<trigger> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("pulse", "pulse", asTypeDesc({
    world: "event",
    domain: "trigger",
  })),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("pulse")).toBeDefined();
    });

    it("rejects pulse bus with wrong type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("pulse", "pulse", asTypeDesc({
    world: "signal",
    domain: "float",
  })),
        ],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(
        /ReservedBusTypeViolation/
      );
      expect(() => pass2TypeGraph(patch)).toThrow(/pulse/);
    });

    it("accepts energy bus with Signal<float> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("energy", "energy", asTypeDesc({
    world: "signal",
    domain: "float",
  })),
        ],
      });

      const typed = pass2TypeGraph(patch);
      expect(typed.busTypes.get("energy")).toBeDefined();
    });

    it("accepts palette bus with Signal<color> type", () => {
      const patch = createNormalizedPatch({
        buses: [
          createBus("palette", "palette", asTypeDesc({
    world: "signal",
    domain: "color",
  })),
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
            outputs: [createSlot("out1", "Signal<float>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<float>", "input")],
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
            inputs: [createSlot("in1", "Signal<float>", "input")],
          }),
        ],
        wires: [createConnection("b1", "out1", "b2", "in1")],
      });

      expect(() => pass2TypeGraph(patch)).toThrow(/NoConversionPath/);
      expect(() => pass2TypeGraph(patch)).toThrow(/vec2/);
      expect(() => pass2TypeGraph(patch)).toThrow(/float/);
    });

    it("includes connection ID in NoConversionPath error", () => {
      const wire = createConnection("b1", "out1", "b2", "in1");
      const patch = createNormalizedPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "Signal<color>", "output")],
          }),
          createBlock("b2", {
            inputs: [createSlot("in1", "Signal<float>", "input")],
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        isBusEligible(asTypeDesc({ world: "signal", domain: "float" }))
      ).toBe(true);
      expect(
        isBusEligible(asTypeDesc({ world: "signal", domain: "color" }))
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        isBusEligible({ world: "signal", domain: "float", category: "core", busEligible: true })
      ).toBe(true);
      expect(
        isBusEligible({ world: "signal", domain: "color", category: "core", busEligible: true })
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
<<<<<<< HEAD
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible({ world: "signal", domain: "float", category: "core", busEligible: true })
      ).toBe(true);
      expect(
        isBusEligible({ world: "signal", domain: "color", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ).toBe(true);
    });

    it("returns true for event types", () => {
      expect(
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
=======
        isBusEligible({ world: "event", domain: "trigger", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
<<<<<<< HEAD
=======
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
<<<<<<< HEAD
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible({ world: "event", domain: "trigger", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
        isBusEligible(asTypeDesc({ world: "event", domain: "trigger" }))
=======
        isBusEligible({ world: "event", domain: "trigger", category: "core", busEligible: true })
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ).toBe(true);
    });

    it("returns true for field types with scalar domains", () => {
      expect(
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        isBusEligible(asTypeDesc({ world: "field", domain: "float" }))
      ).toBe(true);
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "boolean" }))
      ).toBe(true);
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "color" }))
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        isBusEligible({ world: "field", domain: "float", category: "core", busEligible: true })
      ).toBe(true);
      expect(
        isBusEligible({ world: "field", domain: "boolean", category: "core", busEligible: true })
      ).toBe(true);
      expect(
        isBusEligible({ world: "field", domain: "color", category: "core", busEligible: true })
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
<<<<<<< HEAD
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible({ world: "field", domain: "float", category: "core", busEligible: true })
      ).toBe(true);
      expect(
        isBusEligible({ world: "field", domain: "boolean", category: "core", busEligible: true })
      ).toBe(true);
      expect(
        isBusEligible({ world: "field", domain: "color", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ).toBe(true);
    });

    it("returns false for field types with non-scalar domains", () => {
      expect(
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        isBusEligible(asTypeDesc({ world: "field", domain: "vec2" }))
      ).toBe(false);
      expect(
        isBusEligible(asTypeDesc({ world: "field", domain: "vec3" }))
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        isBusEligible({ world: "field", domain: "vec2", category: "core", busEligible: true })
      ).toBe(false);
      expect(
        isBusEligible({ world: "field", domain: "vec3", category: "core", busEligible: true })
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
<<<<<<< HEAD
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible({ world: "field", domain: "vec2", category: "core", busEligible: true })
      ).toBe(false);
      expect(
        isBusEligible({ world: "field", domain: "vec3", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ).toBe(false);
    });

    it("returns false for scalar types", () => {
      expect(
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
=======
        isBusEligible({ world: "scalar", domain: "float", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
<<<<<<< HEAD
=======
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
=======
<<<<<<< HEAD
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible({ world: "scalar", domain: "float", category: "core", busEligible: true })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
        isBusEligible(asTypeDesc({ world: "scalar", domain: "float" }))
=======
        isBusEligible({ world: "scalar", domain: "float", category: "core", busEligible: true })
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ).toBe(false);
    });

    it("returns false for config types", () => {
      expect(
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        isBusEligible(asTypeDesc({ world: "config", domain: "renderTree" }))
=======
<<<<<<< HEAD
        isBusEligible(asTypeDesc({ world: "special", domain: "renderTree" }))
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible({ world: "special", domain: "renderTree", category: "internal", busEligible: false })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "special", domain: "renderTree" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
        isBusEligible(asTypeDesc({ world: "special", domain: "renderTree" }))
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        isBusEligible(asTypeDesc({ world: "config", domain: "renderTree" }))
=======
        isBusEligible({ world: "special", domain: "renderTree", category: "internal", busEligible: false })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "special", domain: "renderTree" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
        isBusEligible({ world: "special", domain: "renderTree", category: "internal", busEligible: false })
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
        isBusEligible(asTypeDesc({ world: "special", domain: "renderTree" }))
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
        isBusEligible(asTypeDesc({ world: "config", domain: "renderTree" }))
=======
        isBusEligible({ world: "special", domain: "renderTree", category: "internal", busEligible: false })
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ).toBe(false);
    });
  });
});
