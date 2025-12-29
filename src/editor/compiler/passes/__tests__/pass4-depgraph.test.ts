/**
 * Pass 4 Dependency Graph Tests
 *
 * Tests for the pass4DepGraph function.
 * Verifies dependency graph construction with BlockEval/BusValue nodes and edges.
 */

import { describe, it, expect } from "vitest";
import { pass4DepGraph } from "../pass4-depgraph";
import type {
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
} from "../../../types";
import type { TimeResolvedPatch, TimeSignals, BlockIndex } from "../../ir";
// Helper to create a minimal time-resolved patch
import type { TimeModelIR } from "../../ir/schedule";
import type { TypeDesc, SigExprId } from "../../ir/types";
function createTimeResolvedPatch(
  overrides?: Partial<
    TimeResolvedPatch<Block, Connection, Publisher, Listener, Bus>
  >
): TimeResolvedPatch<Block, Connection, Publisher, Listener, Bus> {
  const defaultTimeModel: TimeModelIR = {
    kind: "finite",
    durationMs: 5000,
  };

  const defaultTimeSignals: TimeSignals = {
    tAbsMs: 0 as SigExprId,
    tModelMs: 1 as SigExprId,
  };

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
    timeModel: defaultTimeModel,
    timeRootIndex: 0 as BlockIndex,
    timeSignals: defaultTimeSignals,
    ...overrides,
  };
}

// Helper to create a block
function createBlock(id: string, type: string = "TestBlock"): Block {
  return {
    id,
    type,
    label: `Block ${id}`,
    inputs: [],
    outputs: [],
    params: {},
    category: "Other",
  };
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

// Helper to create a publisher
function createPublisher(
  id: string,
  busId: string,
  fromBlock: string,
  fromSlot: string
): Publisher {
  return {
    id,
    busId,
    from: { blockId: fromBlock, slotId: fromSlot, direction: "output" as const },
    enabled: true,
    sortKey: 0,
  };
}

// Helper to create a listener
function createListener(
  id: string,
  busId: string,
  toBlock: string,
  toSlot: string
): Listener {
  return {
    id,
    busId,
    to: { blockId: toBlock, slotId: toSlot, direction: "input" as const },
    enabled: true,
  };
}

// Helper to create a bus
function createBus(id: string, name: string): Bus {
  return {
    id,
    name,
    type: {
      world: "signal",
      domain: "float",
      category: "core",
      busEligible: true,
    },
    combineMode: "last",
    defaultValue: 0,
    sortKey: 0,
  };
}

describe("pass4DepGraph", () => {
  describe("Node Creation", () => {
    it("creates BlockEval nodes for all blocks", () => {
      const b1 = createBlock("b1");
      const b2 = createBlock("b2");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);
      blockIndexMap.set("b2", 1 as BlockIndex);

      const patch = createTimeResolvedPatch({
        blocks: [b1, b2],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.nodes[0]).toEqual({ kind: "BlockEval", blockIndex: 0 });
      expect(result.graph.nodes[1]).toEqual({ kind: "BlockEval", blockIndex: 1 });
    });

    it("creates BusValue nodes for all buses", () => {
      const blockIndexMap = new Map<string, BlockIndex>();
      const patch = createTimeResolvedPatch({
        buses: [createBus("bus1", "Bus 1"), createBus("bus2", "Bus 2")],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.nodes[0]).toEqual({ kind: "BusValue", busIndex: 0 });
      expect(result.graph.nodes[1]).toEqual({ kind: "BusValue", busIndex: 1 });
    });

    it("creates both BlockEval and BusValue nodes", () => {
      const b1 = createBlock("b1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);

      const patch = createTimeResolvedPatch({
        blocks: [b1],
        buses: [createBus("bus1", "Bus 1")],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.nodes[0].kind).toBe("BlockEval");
      expect(result.graph.nodes[1].kind).toBe("BusValue");
    });
  });

  describe("Wire Edges", () => {
    it("creates Wire edges from block to block", () => {
      const b1 = createBlock("b1");
      const b2 = createBlock("b2");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);
      blockIndexMap.set("b2", 1 as BlockIndex);

      const wire = createConnection("b1", "out", "b2", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b1, b2],
        wires: [wire],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      expect(result.graph.edges).toHaveLength(1);
      expect(result.graph.edges[0]).toEqual({
        from: { kind: "BlockEval", blockIndex: 0 },
        to: { kind: "BlockEval", blockIndex: 1 },
      });
    });

    it("creates multiple Wire edges", () => {
      const b1 = createBlock("b1");
      const b2 = createBlock("b2");
      const b3 = createBlock("b3");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);
      blockIndexMap.set("b2", 1 as BlockIndex);
      blockIndexMap.set("b3", 2 as BlockIndex);

      const wire1 = createConnection("b1", "out", "b2", "in");
      const wire2 = createConnection("b2", "out", "b3", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b1, b2, b3],
        wires: [wire1, wire2],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      expect(result.graph.edges).toHaveLength(2);
    });

    it("throws DanglingConnection error for missing source block", () => {
      const b2 = createBlock("b2");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b2", 0 as BlockIndex);

      const wire = createConnection("b1-missing", "out", "b2", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b2],
        wires: [wire],
        blockIndexMap,
      });

      expect(() => pass4DepGraph(patch)).toThrow(/DanglingConnection/);
      expect(() => pass4DepGraph(patch)).toThrow(/b1-missing/);
    });

    it("throws DanglingConnection error for missing target block", () => {
      const b1 = createBlock("b1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);

      const wire = createConnection("b1", "out", "b2-missing", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b1],
        wires: [wire],
        blockIndexMap,
      });

      expect(() => pass4DepGraph(patch)).toThrow(/DanglingConnection/);
      expect(() => pass4DepGraph(patch)).toThrow(/b2-missing/);
    });

    it("includes wire ID in DanglingConnection error", () => {
      const wire = createConnection("b1", "out", "b2", "in");
      const patch = createTimeResolvedPatch({
        wires: [wire],
      });

      expect(() => pass4DepGraph(patch)).toThrow(wire.id);
    });
  });

  describe("Publisher Edges", () => {
    it("creates Publisher edges from block to bus", () => {
      const b1 = createBlock("b1");
      const bus = createBus("bus1", "Bus 1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);

      const publisher = createPublisher("pub1", "bus1", "b1", "out");

      const patch = createTimeResolvedPatch({
        blocks: [b1],
        buses: [bus],
        publishers: [publisher],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      // Nodes: 1 BlockEval + 1 BusValue = 2
      // Edges: 1 Publisher = 1
      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.edges).toHaveLength(1);
      expect(result.graph.edges[0]).toEqual({
        from: { kind: "BlockEval", blockIndex: 0 },
        to: { kind: "BusValue", busIndex: 0 },
      });
    });

    it("throws DanglingBindingEndpoint error for missing publisher block", () => {
      const bus = createBus("bus1", "Bus 1");
      const publisher = createPublisher("pub1", "bus1", "b1-missing", "out");

      const patch = createTimeResolvedPatch({
        buses: [bus],
        publishers: [publisher],
      });

      expect(() => pass4DepGraph(patch)).toThrow(/DanglingBindingEndpoint/);
      expect(() => pass4DepGraph(patch)).toThrow(/b1-missing/);
      expect(() => pass4DepGraph(patch)).toThrow(/pub1/);
    });

    it("throws DanglingBindingEndpoint error for missing bus", () => {
      const b1 = createBlock("b1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);

      const publisher = createPublisher("pub1", "bus-missing", "b1", "out");

      const patch = createTimeResolvedPatch({
        blocks: [b1],
        publishers: [publisher],
        blockIndexMap,
      });

      expect(() => pass4DepGraph(patch)).toThrow(/DanglingBindingEndpoint/);
      expect(() => pass4DepGraph(patch)).toThrow(/bus-missing/);
    });
  });

  describe("Listener Edges", () => {
    it("creates Listener edges from bus to block", () => {
      const b1 = createBlock("b1");
      const bus = createBus("bus1", "Bus 1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);

      const listener = createListener("lis1", "bus1", "b1", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b1],
        buses: [bus],
        listeners: [listener],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.edges).toHaveLength(1);
      expect(result.graph.edges[0]).toEqual({
        from: { kind: "BusValue", busIndex: 0 },
        to: { kind: "BlockEval", blockIndex: 0 },
      });
    });

    it("throws DanglingBindingEndpoint error for missing listener block", () => {
      const bus = createBus("bus1", "Bus 1");
      const listener = createListener("lis1", "bus1", "b1-missing", "in");

      const patch = createTimeResolvedPatch({
        buses: [bus],
        listeners: [listener],
      });

      expect(() => pass4DepGraph(patch)).toThrow(/DanglingBindingEndpoint/);
      expect(() => pass4DepGraph(patch)).toThrow(/b1-missing/);
      expect(() => pass4DepGraph(patch)).toThrow(/lis1/);
    });

    it("throws DanglingBindingEndpoint error for missing bus", () => {
      const b1 = createBlock("b1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);

      const listener = createListener("lis1", "bus-missing", "b1", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b1],
        listeners: [listener],
        blockIndexMap,
      });

      expect(() => pass4DepGraph(patch)).toThrow(/DanglingBindingEndpoint/);
      expect(() => pass4DepGraph(patch)).toThrow(/bus-missing/);
    });
  });

  describe("Complete Graph", () => {
    it("creates a complete graph with all edge types", () => {
      const b1 = createBlock("b1");
      const b2 = createBlock("b2");
      const b3 = createBlock("b3");
      const bus = createBus("bus1", "Bus 1");
      const blockIndexMap = new Map<string, BlockIndex>();
      blockIndexMap.set("b1", 0 as BlockIndex);
      blockIndexMap.set("b2", 1 as BlockIndex);
      blockIndexMap.set("b3", 2 as BlockIndex);

      const wire = createConnection("b1", "out", "b2", "in");
      const publisher = createPublisher("pub1", "bus1", "b2", "out");
      const listener = createListener("lis1", "bus1", "b3", "in");

      const patch = createTimeResolvedPatch({
        blocks: [b1, b2, b3],
        buses: [bus],
        wires: [wire],
        publishers: [publisher],
        listeners: [listener],
        blockIndexMap,
      });

      const result = pass4DepGraph(patch);

      // Nodes: 3 BlockEval + 1 BusValue = 4
      expect(result.graph.nodes).toHaveLength(4);

      // Edges: 1 Wire + 1 Publisher + 1 Listener = 3
      expect(result.graph.edges).toHaveLength(3);

      // Verify edge types
      const wireEdges = result.graph.edges.filter(
        (e) => e.from.kind === "BlockEval" && e.to.kind === "BlockEval"
      );
      const publisherEdges = result.graph.edges.filter(
        (e) => e.from.kind === "BlockEval" && e.to.kind === "BusValue"
      );
      const listenerEdges = result.graph.edges.filter(
        (e) => e.from.kind === "BusValue" && e.to.kind === "BlockEval"
      );

      expect(wireEdges).toHaveLength(1);
      expect(publisherEdges).toHaveLength(1);
      expect(listenerEdges).toHaveLength(1);
    });
  });
});
