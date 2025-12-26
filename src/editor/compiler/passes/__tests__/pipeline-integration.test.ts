/**
 * Pipeline Integration Test
 *
 * Tests the complete Pass 1-5 compilation pipeline:
 * Patch → NormalizedPatch → TypedPatch → TimeResolvedPatch → DepGraph → AcyclicOrLegalGraph
 *
 * Validates:
 * - Full pipeline execution on minimal and complex patches
 * - Proper error handling for malformed inputs
 * - Data flow through all transformation stages
 *
 * References:
 * - DOD-2025-12-25-193919.md § Pipeline Integration
 */

import { describe, it, expect } from "vitest";
import { pass1Normalize } from "../pass1-normalize";
import { pass2TypeGraph } from "../pass2-types";
import { pass3TimeTopology } from "../pass3-time";
import { pass4DepGraph } from "../pass4-depgraph";
import { pass5CycleValidation } from "../pass5-scc";
import type {
  Patch,
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
  Slot,
} from "../../../types";
import type { TimeResolvedPatch } from "../../ir";

// =============================================================================
// Test Helpers
// =============================================================================

function createPatch(overrides?: Partial<Patch>): Patch {
  return {
    version: 1,
    blocks: [],
    connections: [],
    lanes: [],
    buses: [],
    publishers: [],
    listeners: [],
    defaultSources: [],
    settings: {
      seed: 0,
      speed: 1,
    },
    ...overrides,
  };
}

function createBlock(id: string, type: string, overrides?: Partial<Block>): Block {
  return {
    id,
    type,
    label: `Block ${id}`,
    inputs: [],
    outputs: [],
    params: {},
    category: "Other",
    ...overrides,
  };
}

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

function createBus(id: string, name: string): Bus {
  return {
    id,
    name,
    type: { world: "signal", domain: "number" } as any,
    combineMode: "last",
  } as Bus;
}

function createPublisher(
  id: string,
  busId: string,
  fromBlock: string,
  fromSlot: string,
  sortKey = 0
): Publisher {
  return {
    id,
    busId,
    from: { blockId: fromBlock, slotId: fromSlot, direction: "output" as const },
    enabled: true,
    sortKey,
  };
}

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

/**
 * Create a blocks array sorted by blockIndex for pass5.
 *
 * Pass1 creates a blockIndexMap based on sorted block IDs, but doesn't reorder
 * the blocks array. Pass5 expects blocks[i] to be the block with blockIndex i.
 * This helper creates a properly sorted array.
 */
function getSortedBlocksForPass5<T extends Block>(
  timeResolved: TimeResolvedPatch<T, unknown, unknown, unknown, unknown>
): readonly T[] {
  const sorted: T[] = new Array(timeResolved.blocks.length);

  for (const block of timeResolved.blocks) {
    const blockIndex = timeResolved.blockIndexMap.get(block.id);
    if (blockIndex !== undefined) {
      sorted[blockIndex] = block;
    }
  }

  return sorted;
}

// =============================================================================
// Minimal Patch Tests
// =============================================================================

describe("Pipeline Integration - Minimal Patch", () => {
  it("should compile a minimal patch with TimeRoot only", () => {
    // Create minimal patch: just a TimeRoot
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      inputs: [],
      outputs: [
        createSlot("tAbsMs", "Signal<number>", "output"),
        createSlot("tModelMs", "Signal<number>", "output"),
        createSlot("phase", "Signal<number>", "output"),
      ],
    });

    const patch = createPatch({
      blocks: [timeRoot],
    });

    // Run Pass 1: Normalize
    const normalized = pass1Normalize(patch);
    expect(normalized.blockIndexMap.size).toBe(1);
    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.defaultSources).toHaveLength(0); // No unwired inputs

    // Run Pass 2: Type Graph
    const typed = pass2TypeGraph(normalized);
    expect(typed.busTypes.size).toBe(0); // No buses
    expect(typed.conversionPaths.size).toBe(0); // No wires

    // Run Pass 3: Time Topology
    const timeResolved = pass3TimeTopology(typed);
    expect(timeResolved.timeModel).toEqual({
      kind: "cyclic",
      periodMs: 3000,
      mode: "loop",
      phaseDomain: "0..1",
    });
    expect(timeResolved.timeSignals.tAbsMs).toBeDefined();
    expect(timeResolved.timeSignals.tModelMs).toBeDefined();
    expect(timeResolved.timeSignals.phase01).toBeDefined();
    expect(timeResolved.timeSignals.wrapEvent).toBeDefined();
    expect(timeResolved.timeRootIndex).toBe(0);

    // Run Pass 4: Dependency Graph
    const depGraph = pass4DepGraph(timeResolved);
    expect(depGraph.nodes).toHaveLength(1); // Only the TimeRoot block
    expect(depGraph.edges).toHaveLength(0); // No connections

    // Run Pass 5: Cycle Validation
    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);
    expect(validated.errors).toHaveLength(0); // No cycles
    expect(validated.sccs).toHaveLength(1); // One trivial SCC (the TimeRoot)
  });

  it("should compile a simple chain: TimeRoot -> Oscillator", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    const oscillator = createBlock("osc", "Oscillator", {
      inputs: [createSlot("phase", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const wire = createConnection("timeroot", "phase", "osc", "phase");

    const patch = createPatch({
      blocks: [timeRoot, oscillator],
      connections: [wire],
    });

    // Run full pipeline
    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);
    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);

    // Validate results
    expect(normalized.blockIndexMap.size).toBe(2);
    expect(typed.conversionPaths.size).toBe(0); // No type conversion needed
    expect(timeResolved.timeModel.kind).toBe("cyclic");
    expect(depGraph.nodes).toHaveLength(2); // Two blocks
    expect(depGraph.edges).toHaveLength(1); // One wire edge
    expect(validated.errors).toHaveLength(0); // No illegal cycles
  });

  it("should compile a patch with bus communication", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    const producer = createBlock("producer", "Oscillator", {
      inputs: [createSlot("phase", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const consumer = createBlock("consumer", "Scaler", {
      inputs: [createSlot("in", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const energyBus = createBus("bus1", "energy");
    const wire1 = createConnection("timeroot", "phase", "producer", "phase");
    const pub = createPublisher("pub1", "bus1", "producer", "out");
    const lis = createListener("lis1", "bus1", "consumer", "in");

    const patch = createPatch({
      blocks: [timeRoot, producer, consumer],
      connections: [wire1],
      buses: [energyBus],
      publishers: [pub],
      listeners: [lis],
    });

    // Run full pipeline
    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);
    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);

    // Validate results
    expect(normalized.blockIndexMap.size).toBe(3);
    expect(normalized.publishers).toHaveLength(1);
    expect(normalized.listeners).toHaveLength(1);
    expect(typed.busTypes.get("bus1")).toEqual({
      world: "signal",
      domain: "number",
    });
    expect(depGraph.nodes).toHaveLength(4); // 3 blocks + 1 bus
    expect(depGraph.edges).toHaveLength(3); // 1 wire + 1 publisher + 1 listener
    expect(validated.errors).toHaveLength(0);
  });
});

// =============================================================================
// Error Case Tests
// =============================================================================

describe("Pipeline Integration - Error Cases", () => {
  it("should fail with missing TimeRoot", () => {
    const oscillator = createBlock("osc", "Oscillator", {
      inputs: [createSlot("phase", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const patch = createPatch({
      blocks: [oscillator],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);

    // Pass 3 should fail - no TimeRoot
    expect(() => pass3TimeTopology(typed)).toThrow("MissingTimeRoot");
  });

  it("should fail with multiple TimeRoots", () => {
    const timeRoot1 = createBlock("timeroot1", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
    });

    const timeRoot2 = createBlock("timeroot2", "FiniteTimeRoot", {
      params: { durationMs: 5000 },
    });

    const patch = createPatch({
      blocks: [timeRoot1, timeRoot2],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);

    // Pass 3 should fail - multiple TimeRoots
    expect(() => pass3TimeTopology(typed)).toThrow("MultipleTimeRoots");
  });

  it("should fail with type mismatch on wire", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    const block = createBlock("block", "SomeBlock", {
      inputs: [createSlot("colorIn", "Signal<color>", "input")],
      outputs: [],
    });

    const wire = createConnection("timeroot", "phase", "block", "colorIn");

    const patch = createPatch({
      blocks: [timeRoot, block],
      connections: [wire],
    });

    const normalized = pass1Normalize(patch);

    // Pass 2 should fail - type mismatch
    expect(() => pass2TypeGraph(normalized)).toThrow("NoConversionPath");
  });

  it("should fail with dangling connection", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    // Wire references non-existent block
    const wire = createConnection("timeroot", "phase", "nonexistent", "in");

    const patch = createPatch({
      blocks: [timeRoot],
      connections: [wire],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);

    // Pass 4 should fail - dangling connection
    expect(() => pass4DepGraph(timeResolved)).toThrow("DanglingConnection");
  });

  it("should fail with illegal cycle (no state boundary)", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    // Create a feedback loop without a state boundary
    const block1 = createBlock("block1", "Adder", {
      inputs: [
        createSlot("a", "Signal<number>", "input"),
        createSlot("b", "Signal<number>", "input"),
      ],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const block2 = createBlock("block2", "Multiplier", {
      inputs: [createSlot("in", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const wire1 = createConnection("timeroot", "phase", "block1", "a");
    const wire2 = createConnection("block1", "out", "block2", "in");
    const wire3 = createConnection("block2", "out", "block1", "b"); // Cycle!

    const patch = createPatch({
      blocks: [timeRoot, block1, block2],
      connections: [wire1, wire2, wire3],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);
    const sortedBlocks = getSortedBlocksForPass5(timeResolved);

    // Pass 5 should detect illegal cycle
    const validated = pass5CycleValidation(depGraph, sortedBlocks);
    expect(validated.errors).toHaveLength(1);
    expect(validated.errors[0].kind).toBe("IllegalCycle");
  });

  it("should accept legal cycle with state boundary", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    // Create a feedback loop WITH a state boundary (Delay block)
    const adder = createBlock("adder", "Adder", {
      inputs: [
        createSlot("a", "Signal<number>", "input"),
        createSlot("b", "Signal<number>", "input"),
      ],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const delay = createBlock("delay", "Delay", {
      inputs: [createSlot("in", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const wire1 = createConnection("timeroot", "phase", "adder", "a");
    const wire2 = createConnection("adder", "out", "delay", "in");
    const wire3 = createConnection("delay", "out", "adder", "b"); // Legal cycle via Delay

    const patch = createPatch({
      blocks: [timeRoot, adder, delay],
      connections: [wire1, wire2, wire3],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);
    const sortedBlocks = getSortedBlocksForPass5(timeResolved);

    // Pass 5 should accept this cycle
    const validated = pass5CycleValidation(depGraph, sortedBlocks);
    expect(validated.errors).toHaveLength(0); // Legal cycle with state boundary
  });
});

// =============================================================================
// Pipeline Invariants
// =============================================================================

describe("Pipeline Integration - Invariants", () => {
  it("should preserve block count through all passes", () => {
    const timeRoot = createBlock("timeroot", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<number>", "output")],
    });

    const osc = createBlock("osc", "Oscillator", {
      inputs: [createSlot("phase", "Signal<number>", "input")],
      outputs: [createSlot("out", "Signal<number>", "output")],
    });

    const wire = createConnection("timeroot", "phase", "osc", "phase");

    const patch = createPatch({
      blocks: [timeRoot, osc],
      connections: [wire],
    });

    const normalized = pass1Normalize(patch);
    expect(normalized.blocks).toHaveLength(2);

    const typed = pass2TypeGraph(normalized);
    expect(typed.blocks).toHaveLength(2);

    const timeResolved = pass3TimeTopology(typed);
    expect(timeResolved.blocks).toHaveLength(2);

    const depGraph = pass4DepGraph(timeResolved);
    expect(depGraph.nodes.filter((n) => n.kind === "BlockEval")).toHaveLength(2);
  });

  it("should maintain blockIndexMap stability", () => {
    const blocks = [
      createBlock("z", "Block", {}),
      createBlock("a", "Block", {}),
      createBlock("m", "Block", {}),
    ];

    const patch = createPatch({ blocks });

    const normalized = pass1Normalize(patch);

    // Block indices should be assigned in sorted order
    expect(normalized.blockIndexMap.get("a")).toBe(0);
    expect(normalized.blockIndexMap.get("m")).toBe(1);
    expect(normalized.blockIndexMap.get("z")).toBe(2);

    // Should be stable through all passes
    const typed = pass2TypeGraph(normalized);
    expect(typed.blockIndexMap).toEqual(normalized.blockIndexMap);

    // Can't test pass3 without a TimeRoot, but the map should carry through
  });

  it("should generate correct TimeModel for each TimeRoot type", () => {
    // Finite TimeRoot
    const finiteRoot = createBlock("finite", "FiniteTimeRoot", {
      params: { durationMs: 5000 },
    });

    const finitePatch = createPatch({ blocks: [finiteRoot] });
    const finiteNorm = pass1Normalize(finitePatch);
    const finiteTyped = pass2TypeGraph(finiteNorm);
    const finiteTime = pass3TimeTopology(finiteTyped);

    expect(finiteTime.timeModel).toEqual({
      kind: "finite",
      durationMs: 5000,
    });
    expect(finiteTime.timeSignals.phase01).toBeUndefined();
    expect(finiteTime.timeSignals.wrapEvent).toBeUndefined();

    // Cyclic TimeRoot
    const cyclicRoot = createBlock("cyclic", "CycleTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
    });

    const cyclicPatch = createPatch({ blocks: [cyclicRoot] });
    const cyclicNorm = pass1Normalize(cyclicPatch);
    const cyclicTyped = pass2TypeGraph(cyclicNorm);
    const cyclicTime = pass3TimeTopology(cyclicTyped);

    expect(cyclicTime.timeModel).toEqual({
      kind: "cyclic",
      periodMs: 3000,
      mode: "loop",
      phaseDomain: "0..1",
    });
    expect(cyclicTime.timeSignals.phase01).toBeDefined();
    expect(cyclicTime.timeSignals.wrapEvent).toBeDefined();

    // Infinite TimeRoot
    const infiniteRoot = createBlock("infinite", "InfiniteTimeRoot", {
      params: { windowMs: 10000, periodMs: 8000 },
    });

    const infinitePatch = createPatch({ blocks: [infiniteRoot] });
    const infiniteNorm = pass1Normalize(infinitePatch);
    const infiniteTyped = pass2TypeGraph(infiniteNorm);
    const infiniteTime = pass3TimeTopology(infiniteTyped);

    expect(infiniteTime.timeModel).toEqual({
      kind: "infinite",
      windowMs: 10000,
      suggestedUIWindowMs: 8000,
    });
    expect(infiniteTime.timeSignals.phase01).toBeUndefined();
    expect(infiniteTime.timeSignals.wrapEvent).toBeUndefined();
  });
});
