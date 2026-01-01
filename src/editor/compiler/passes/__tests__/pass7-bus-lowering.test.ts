/**
 * Tests for Pass 7: Bus Lowering to IR
 */

import { describe, it, expect } from "vitest";
import { pass7BusLowering } from "../pass7-bus-lowering";
import { IRBuilderImpl } from "../../ir/IRBuilderImpl";
import type { Bus, Publisher, Domain, BusCombineMode } from "../../../types";
import type { UnlinkedIRFragments } from "../pass6-block-lowering";

describe("Pass 7: Bus Lowering", () => {
  // Helper to create a basic UnlinkedIRFragments
  function createUnlinkedFragments(): UnlinkedIRFragments {
    return {
      builder: new IRBuilderImpl(),
      blockOutputs: new Map(),
      errors: [],
    };
  }

  // Helper to create a Bus with proper TypeDesc
  function createBus(
    id: string,
    world: "signal" | "field",
    domain: string,
    combineMode: string,
    defaultValue: unknown
  ): Bus {
    return {
      id,
      name: `Bus ${id}`,
      type: {
        world,
        domain: domain as Domain,
        category: "core",
        busEligible: true,
      },
      combine: { when: 'multi', mode: combineMode as BusCombineMode },
      defaultValue,
      sortKey: 0,
    };
  }

  describe("Empty buses", () => {
    it("should create constant signal for signal bus with no publishers", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "signal", "float", "last", 42)];
      const publishers: Publisher[] = [];

      const result = pass7BusLowering(unlinked, buses, publishers, []);

      expect(result.busRoots.size).toBe(1);
      expect(result.busRoots.get(0)).toBeDefined();
      expect(result.busRoots.get(0)?.k).toBe("sig");
      expect(result.errors.length).toBe(0);
    });

    it("should create constant field for field bus with no publishers", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "field", "float", "sum", 10)];
      const publishers: Publisher[] = [];

      const result = pass7BusLowering(unlinked, buses, publishers, []);

      expect(result.busRoots.size).toBe(1);
      expect(result.busRoots.get(0)).toBeDefined();
      expect(result.busRoots.get(0)?.k).toBe("field");
      expect(result.errors.length).toBe(0);
    });
  });

  describe("Combine modes", () => {
    it("should support 'sum' combine mode for signal buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "signal", "float", "sum", 0)];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should support 'last' combine mode for signal buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "signal", "float", "last", 0)];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should support 'average' combine mode for field buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "field", "float", "average", 0)];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should support 'max' combine mode for field buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "field", "float", "max", 0)];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should support 'min' combine mode for field buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "field", "float", "min", 0)];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it("should support 'layer' combine mode for field buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("bus1", "field", "color", "layer", { r: 0, g: 0, b: 0, a: 1 })];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.errors.length).toBe(0);
    });
  });

  describe("Multiple buses", () => {
    it("should handle multiple signal buses", () => {
      const unlinked = createUnlinkedFragments();

      const buses: Bus[] = [
        createBus("bus1", "signal", "float", "sum", 1),
        createBus("bus2", "signal", "float", "last", 2),
      ];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(2);
      expect(result.busRoots.get(0)).toBeDefined();
      expect(result.busRoots.get(1)).toBeDefined();
      expect(result.errors.length).toBe(0);
    });

    it("should handle mixed signal and field buses", () => {
      const unlinked = createUnlinkedFragments();

      const buses: Bus[] = [
        createBus("sig_bus", "signal", "float", "sum", 0),
        createBus("field_bus", "field", "vec2", "average", { x: 0, y: 0 }),
      ];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(2);
      expect(result.busRoots.get(0)?.k).toBe("sig");
      expect(result.busRoots.get(1)?.k).toBe("field");
      expect(result.errors.length).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("should preserve errors from Pass 6", () => {
      const unlinked: UnlinkedIRFragments = {
        builder: new IRBuilderImpl(),
        blockOutputs: new Map(),
        errors: [
          {
            code: "BlockMissing",
            message: "Test error from Pass 6",
          },
        ],
      };

      const buses: Bus[] = [];
      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].code).toBe("BlockMissing");
    });
  });

  describe("Type domains", () => {
    it("should handle vec2 signal buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("vec_bus", "signal", "vec2", "last", { x: 1, y: 2 })];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.busRoots.get(0)?.k).toBe("sig");
      expect(result.errors.length).toBe(0);
    });

    it("should handle color field buses", () => {
      const unlinked = createUnlinkedFragments();
      const buses: Bus[] = [createBus("color_bus", "field", "color", "layer", { r: 1, g: 0.5, b: 0, a: 1 })];

      const result = pass7BusLowering(unlinked, buses, [], []);

      expect(result.busRoots.size).toBe(1);
      expect(result.busRoots.get(0)?.k).toBe("field");
      expect(result.errors.length).toBe(0);
    });
  });
});
