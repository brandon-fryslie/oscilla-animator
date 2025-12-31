/**
 * Pass 3 Time Topology Tests
 *
 * Tests for the pass3TimeTopology function.
 * Verifies TimeRoot discovery, TimeModel extraction, and canonical time signal generation.
 */

import { describe, it, expect } from "vitest";
import { pass3TimeTopology } from "../pass3-time";
import type {
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
} from "../../../types";
import type { TypedPatch, BlockIndex } from "../../ir";
import type { TypeDesc } from } from "../../ir/types";;
import { asTypeDesc } from

// Helper to create a minimal typed patch
function createTypedPatch(
  overrides?: Partial<
    TypedPatch<Block, Connection, Publisher, Listener, Bus>
  >
): TypedPatch<Block, Connection, Publisher, Listener, Bus> {
  return {
    blockIndexMap: new Map<string, BlockIndex>(),
    blocks: [],
    wires: [],
    publishers: [],
    listeners: [],
    buses: [],
    defaultSources: [],
    busTypes: new Map<string, TypeDesc>(),
    conversionPaths: new Map(),
    ...overrides,
  };
}

// Helper to create a block
function createBlock(
  id: string,
  type: string,
  params?: Record<string, unknown>
): Block {
  return {
    id,
    type,
    label: `Block ${id}`,
    inputs: [],
    outputs: [],
    params: params ?? {},
    category: "Other",
  };
}

// Helper to create a TimeRoot block with indexed map
function createPatchWithTimeRoot(
  timeRootType: string,
  params?: Record<string, unknown>
): TypedPatch<Block, Connection, Publisher, Listener, Bus> {
  const timeRoot = createBlock("timeroot-1", timeRootType, params);
  const blockIndexMap = new Map<string, BlockIndex>();
  blockIndexMap.set(timeRoot.id, 0 as BlockIndex);

  return createTypedPatch({
    blocks: [timeRoot],
    blockIndexMap,
  });
}

describe("pass3TimeTopology", () => {
  describe("TimeRoot Discovery", () => {
    it("discovers FiniteTimeRoot block", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeModel.kind).toBe("finite");
      expect(timeResolved.timeRootIndex).toBe(0);
    });

    it("discovers InfiniteTimeRoot block", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      // InfiniteTimeRoot now produces cyclic TimeModel (has phase/pulse)
      expect(timeResolved.timeModel.kind).toBe("cyclic");
    });

    it("throws MissingTimeRoot error when no TimeRoot block exists", () => {
      const patch = createTypedPatch({
        blocks: [createBlock("other-block", "SomeOtherBlock")],
      });

      expect(() => pass3TimeTopology(patch)).toThrow(/MissingTimeRoot/);
      expect(() => pass3TimeTopology(patch)).toThrow(
        /exactly one TimeRoot block/
      );
    });

    it("throws MultipleTimeRoots error when multiple TimeRoot blocks exist", () => {
      const timeRoot1 = createBlock("tr1", "FiniteTimeRoot");
      const timeRoot2 = createBlock("tr2", "InfiniteTimeRoot");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set(timeRoot1.id, 0 as BlockIndex);
      blockIndexMap.set(timeRoot2.id, 1 as BlockIndex);

      const patch = createTypedPatch({
        blocks: [timeRoot1, timeRoot2],
        blockIndexMap,
      });

      expect(() => pass3TimeTopology(patch)).toThrow(/MultipleTimeRoots/);
      expect(() => pass3TimeTopology(patch)).toThrow(/tr1/);
      expect(() => pass3TimeTopology(patch)).toThrow(/tr2/);
    });

    it("includes TimeRoot IDs in MultipleTimeRoots error", () => {
      const timeRoot1 = createBlock("timeroot-alpha", "FiniteTimeRoot");
      const timeRoot2 = createBlock("timeroot-beta", "InfiniteTimeRoot");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set(timeRoot1.id, 0 as BlockIndex);
      blockIndexMap.set(timeRoot2.id, 1 as BlockIndex);

      const patch = createTypedPatch({
        blocks: [timeRoot1, timeRoot2],
        blockIndexMap,
      });

      expect(() => pass3TimeTopology(patch)).toThrow(/timeroot-alpha/);
      expect(() => pass3TimeTopology(patch)).toThrow(/timeroot-beta/);
    });
  });

  describe("TimeModel Extraction - Finite", () => {
    it("extracts durationMs from FiniteTimeRoot params", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot", {
        durationMs: 8000,
      });
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeModel).toEqual({
        kind: "finite",
        durationMs: 8000,
      });
    });

    it("uses default durationMs when not provided", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeModel.kind).toBe("finite");
      if (timeResolved.timeModel.kind === "finite") {
        expect(timeResolved.timeModel.durationMs).toBe(5000);
      }
    });
  });

  describe("TimeModel Extraction - Cyclic", () => {
    it("extracts periodMs and mode from InfiniteTimeRoot params", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot", {
        periodMs: 4000,
        mode: "pingpong",
      });
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeModel).toEqual({
        kind: "cyclic",
        periodMs: 4000,
        mode: "pingpong",
        phaseDomain: "0..1",
      });
    });

    it("defaults to loop mode when not specified", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot", {
        periodMs: 2000,
      });
      const timeResolved = pass3TimeTopology(patch);

      if (timeResolved.timeModel.kind === "cyclic") {
        expect(timeResolved.timeModel.mode).toBe("loop");
      }
    });

    it("uses default periodMs when not provided", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      if (timeResolved.timeModel.kind === "cyclic") {
        expect(timeResolved.timeModel.periodMs).toBe(3000);
      }
    });

    it("always sets phaseDomain to 0..1 for cyclic models", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      if (timeResolved.timeModel.kind === "cyclic") {
        expect(timeResolved.timeModel.phaseDomain).toBe("0..1");
      }
    });
  });

  // NEEDS REVIEW - DEPRECATED: InfiniteTimeRoot currently emits cyclic TimeModel.
  describe.skip("TimeModel Extraction - Infinite", () => {
    it("extracts windowMs from InfiniteTimeRoot params", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot", {
        windowMs: 15000,
        periodMs: 20000,
      });
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeModel.kind).toBe("infinite");
      if (timeResolved.timeModel.kind === "infinite") {
        expect(timeResolved.timeModel.windowMs).toBe(15000);
        expect(timeResolved.timeModel.suggestedUIWindowMs).toBe(20000);
      }
    });

    it("uses default windowMs when not provided", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      if (timeResolved.timeModel.kind === "infinite") {
        expect(timeResolved.timeModel.windowMs).toBe(10000);
      }
    });
  });

  describe("Canonical Time Signals", () => {
    it("generates tAbsMs and tModelMs for all time models", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeSignals.tAbsMs).toBeDefined();
      expect(timeResolved.timeSignals.tModelMs).toBeDefined();
      expect(typeof timeResolved.timeSignals.tAbsMs).toBe("number");
      expect(typeof timeResolved.timeSignals.tModelMs).toBe("number");
    });

    it("generates phase01 and wrapEvent only for cyclic models", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeSignals.phase01).toBeDefined();
      expect(timeResolved.timeSignals.wrapEvent).toBeDefined();
      expect(typeof timeResolved.timeSignals.phase01).toBe("number");
      expect(typeof timeResolved.timeSignals.wrapEvent).toBe("number");
    });

    it("does not generate phase01 and wrapEvent for finite models", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeSignals.phase01).toBeUndefined();
      expect(timeResolved.timeSignals.wrapEvent).toBeUndefined();
    });

    // NEEDS REVIEW - DEPRECATED: InfiniteTimeRoot currently emits cyclic TimeModel.
    it.skip("does not generate phase01 and wrapEvent for infinite models", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeSignals.phase01).toBeUndefined();
      expect(timeResolved.timeSignals.wrapEvent).toBeUndefined();
    });
  });

  describe("TimeRoot Index", () => {
    it("sets timeRootIndex to the block's index in blockIndexMap", () => {
      const timeRoot = createBlock("my-timeroot", "FiniteTimeRoot");
      const otherBlock = createBlock("other", "SomeBlock");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set(otherBlock.id, 0 as BlockIndex);
      blockIndexMap.set(timeRoot.id, 1 as BlockIndex);

      const patch = createTypedPatch({
        blocks: [otherBlock, timeRoot],
        blockIndexMap,
      });

      const timeResolved = pass3TimeTopology(patch);
      expect(timeResolved.timeRootIndex).toBe(1);
    });
  });

  describe("Pass-through Fields", () => {
    it("preserves all fields from TypedPatch", () => {
      const busTypes = new Map<string, TypeDesc>();
      busTypes.set("bus1", asTypeDesc({ world: "signal", domain: "float" }));

      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      Object.assign(patch, { busTypes });

      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.blocks).toBe(patch.blocks);
      expect(timeResolved.wires).toBe(patch.wires);
      expect(timeResolved.publishers).toBe(patch.publishers);
      expect(timeResolved.listeners).toBe(patch.listeners);
      expect(timeResolved.buses).toBe(patch.buses);
      expect(timeResolved.busTypes).toBe(busTypes);
      expect(timeResolved.conversionPaths).toBe(patch.conversionPaths);
    });
  });
});
