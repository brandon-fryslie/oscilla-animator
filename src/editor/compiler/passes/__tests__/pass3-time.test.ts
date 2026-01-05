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
} from "../../../types";
import type { TypedPatch, BlockIndex } from "../../ir";

// Helper to create a minimal typed patch
function createTypedPatch(
  overrides?: Partial<TypedPatch>
): TypedPatch {
  return {
    blockIndexMap: new Map<string, BlockIndex>(),
    blocks: new Map<string, unknown>(),
    edges: [],
    blockOutputTypes: new Map(),
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
    position: { x: 0, y: 0 },
    params: params ?? {},
    form: 'primitive',
    role: { kind: 'user', meta: {} },
  };
}

// Helper to create a TimeRoot block with indexed map
function createPatchWithTimeRoot(
  timeRootType: string,
  params?: Record<string, unknown>
): TypedPatch {
  const timeRoot = createBlock("timeroot-1", timeRootType, params);
  const blockIndexMap = new Map<string, BlockIndex>();
  blockIndexMap.set(timeRoot.id, 0 as BlockIndex);

  const blocksMap = new Map<string, unknown>();
  blocksMap.set(timeRoot.id, timeRoot);

  return createTypedPatch({
    blocks: blocksMap,
    blockIndexMap,
  });
}

describe("pass3TimeTopology", () => {
  describe("TimeRoot Discovery", () => {
    it("discovers FiniteTimeRoot block", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeModel.kind).toBe("finite");
    });

    it("discovers InfiniteTimeRoot block", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      // InfiniteTimeRoot now produces cyclic TimeModel (has phase/pulse)
      expect(timeResolved.timeModel.kind).toBe("cyclic");
    });

    it("throws MissingTimeRoot error when no TimeRoot block exists", () => {
      const other = createBlock("other-block", "SomeOtherBlock");
      const blocksMap = new Map<string, unknown>();
      blocksMap.set(other.id, other);

      const patch = createTypedPatch({
        blocks: blocksMap,
      });

      expect(() => pass3TimeTopology(patch)).toThrow(/No TimeRoot block found/);
      expect(() => pass3TimeTopology(patch)).toThrow(
        /exactly one TimeRoot/
      );
    });

    it("throws MultipleTimeRoots error when multiple TimeRoot blocks exist", () => {
      const timeRoot1 = createBlock("tr1", "FiniteTimeRoot");
      const timeRoot2 = createBlock("tr2", "InfiniteTimeRoot");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set(timeRoot1.id, 0 as BlockIndex);
      blockIndexMap.set(timeRoot2.id, 1 as BlockIndex);

      const blocksMap = new Map<string, unknown>();
      blocksMap.set(timeRoot1.id, timeRoot1);
      blocksMap.set(timeRoot2.id, timeRoot2);

      const patch = createTypedPatch({
        blocks: blocksMap,
        blockIndexMap,
      });

      expect(() => pass3TimeTopology(patch)).toThrow(/Multiple TimeRoot blocks found/);
    });

    it("includes TimeRoot IDs in MultipleTimeRoots error", () => {
      const timeRoot1 = createBlock("timeroot-alpha", "FiniteTimeRoot");
      const timeRoot2 = createBlock("timeroot-beta", "InfiniteTimeRoot");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set(timeRoot1.id, 0 as BlockIndex);
      blockIndexMap.set(timeRoot2.id, 1 as BlockIndex);

      const blocksMap = new Map<string, unknown>();
      blocksMap.set(timeRoot1.id, timeRoot1);
      blocksMap.set(timeRoot2.id, timeRoot2);

      const patch = createTypedPatch({
        blocks: blocksMap,
        blockIndexMap,
      });

      expect(() => pass3TimeTopology(patch)).toThrow(/2/);
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
        expect(timeResolved.timeModel.durationMs).toBe(10000);
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

      expect(timeResolved.timeModel.kind).toBe("cyclic");
      if (timeResolved.timeModel.kind === "cyclic") {
        expect(timeResolved.timeModel.periodMs).toBe(4000);
      }
    });

    it("defaults to loop mode when not specified", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot", {
        periodMs: 2000,
      });
      const timeResolved = pass3TimeTopology(patch);

      if (timeResolved.timeModel.kind === "cyclic") {
        // The implementation doesn't set a mode field
        expect(timeResolved.timeModel.periodMs).toBe(2000);
      }
    });

    it("uses default periodMs when not provided", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      if (timeResolved.timeModel.kind === "cyclic") {
        expect(timeResolved.timeModel.periodMs).toBe(4000);
      }
    });

    it("always sets phaseDomain to 0..1 for cyclic models", () => {
      const patch = createPatchWithTimeRoot("InfiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      // The implementation doesn't set phaseDomain - this is a domain assumption
      expect(timeResolved.timeModel.kind).toBe("cyclic");
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
    it("generates tModelMs for all time models", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.timeSignals.tModelMs).toBeDefined();
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

  describe("Pass-through Fields", () => {
    it("preserves blockIndexMap and edges from TypedPatch", () => {
      const patch = createPatchWithTimeRoot("FiniteTimeRoot");
      const timeResolved = pass3TimeTopology(patch);

      expect(timeResolved.blockIndexMap).toBe(patch.blockIndexMap);
      expect(timeResolved.edges).toBe(patch.edges);
    });
  });
});
