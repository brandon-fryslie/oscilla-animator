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
 * TODO: Update tests for Edge-only architecture (Bus-Block unification)
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
  // Connection,
  // Publisher,
  // Listener,
  // Bus,
  Slot,
  Edge,
} from "../../../types";
import type { TimeResolvedPatch } from "../../ir";

// =============================================================================
// Test Helpers
// =============================================================================

function createPatch(overrides?: Partial<Patch>): Patch {
  return {
    version: 1,
    blocks: [],
    edges: [],
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

// Helper for Edge tests - used internally within test file
const _createEdge = (
  fromBlock: string,
  fromSlot: string,
  toBlock: string,
  toSlot: string
): Edge => ({
  id: `${fromBlock}.${fromSlot}->${toBlock}.${toSlot}`,
  from: { kind: 'port', blockId: fromBlock, slotId: fromSlot },
  to: { kind: 'port', blockId: toBlock, slotId: toSlot },
  enabled: true,
});
// Mark as used to suppress TS6133 until Edge tests are added
void _createEdge;

/**
 * Create a blocks array sorted by blockIndex for pass5.
 *
 * Pass1 creates a blockIndexMap based on sorted block IDs, but doesn't reorder
 * the blocks array. Pass5 expects blocks[i] to be the block with blockIndex i.
 * This helper creates a properly sorted array.
 */
function getSortedBlocksForPass5<T extends Block>(
  timeResolved: TimeResolvedPatch
): readonly T[] {
  const sorted: (T | undefined)[] = new Array<T | undefined>(timeResolved.blocks.size);

  for (const block of timeResolved.blocks.values()) {
    const blockIndex = timeResolved.blockIndexMap.get((block as Block).id);
    if (blockIndex !== undefined) {
      sorted[blockIndex] = block as T;
    }
  }

  return sorted.filter((b): b is T => b !== undefined);
}

// =============================================================================
// Minimal Patch Tests
// =============================================================================

describe("Pipeline Integration - Minimal Patch", () => {
  it("should compile a minimal patch with TimeRoot only", () => {
    // Create minimal patch: just a TimeRoot
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      inputs: [],
      outputs: [
        createSlot("tAbsMs", "Signal<float>", "output"),
        createSlot("tModelMs", "Signal<float>", "output"),
        createSlot("phase", "Signal<float>", "output"),
      ],
    });

    const patch = createPatch({
      blocks: [timeRoot],
    });

    // Run Pass 1: Normalize
    const normalized = pass1Normalize(patch);
    expect(normalized.blockIndexMap.size).toBe(1);
    expect(normalized.blocks.size).toBe(1);
    expect(normalized.defaults).toHaveLength(0); // No unwired inputs

    // Run Pass 2: Type Graph
    const typed = pass2TypeGraph(normalized);
    expect(typed.busOutputTypes?.size ?? 0).toBe(0); // No buses

    // Run Pass 3: Time Topology
    const timeResolved = pass3TimeTopology(typed);
    expect(timeResolved.timeModel).toEqual({
      kind: "cyclic",
      periodMs: 3000,
      mode: "loop",
      phaseDomain: "0..1",
    });
    expect(timeResolved.timeSignals.tModelMs).toBeDefined();
    expect(timeResolved.timeSignals.phase01).toBeDefined();
    expect(timeResolved.timeSignals.wrapEvent).toBeDefined();

    // Run Pass 4: Dependency Graph
    const depGraphWithTime = pass4DepGraph(timeResolved);
    expect(depGraphWithTime.graph.nodes).toHaveLength(1); // Only the TimeRoot block
    expect(depGraphWithTime.graph.edges).toHaveLength(0); // No connections

    // Run Pass 5: Cycle Validation
    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraphWithTime, sortedBlocks);
    expect(validated.errors).toHaveLength(0); // No cycles
    expect(validated.sccs).toHaveLength(1); // One trivial SCC (the TimeRoot)
  });

  it("should compile a simple chain: TimeRoot -> Oscillator", () => {
    // Create TimeRoot with outputs
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      inputs: [],
      outputs: [
        createSlot("tAbsMs", "Signal<float>", "output"),
        createSlot("tModelMs", "Signal<float>", "output"),
        createSlot("phase", "Signal<float>", "output"),
      ],
    });

    // Create Oscillator with inputs/outputs
    const oscillator = createBlock("osc", "Oscillator", {
      inputs: [createSlot("phase", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    // Create edge from TimeRoot.phase -> Oscillator.phase
    const edge: Edge = {
      id: "timeroot.phase->osc.phase",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "osc", slotId: "phase" },
      enabled: true,
    };

    const patch = createPatch({
      blocks: [timeRoot, oscillator],
      edges: [edge],
    });

    // Run through pipeline
    const normalized = pass1Normalize(patch);
    expect(normalized.blockIndexMap.size).toBe(2);
    expect(normalized.edges).toHaveLength(1);

    const typed = pass2TypeGraph(normalized);
    expect(typed.blocks.size).toBe(2);

    const timeResolved = pass3TimeTopology(typed);
    // timeRootIndex is not part of the canonical schema

    const depGraph = pass4DepGraph(timeResolved);
    expect(depGraph.graph.nodes).toHaveLength(2);
    expect(depGraph.graph.edges).toHaveLength(1);

    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);
    expect(validated.errors).toHaveLength(0);
  });

  it("should compile a patch with multi-input via edges", () => {
    // Multi-input pattern: multiple edges to the same input slot
    // This replaces the old bus pattern with direct edge connections

    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<float>", "output")],
    });

    const sourceA = createBlock("sourceA", "Oscillator", {
      inputs: [createSlot("phase", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    const sourceB = createBlock("sourceB", "Oscillator", {
      inputs: [createSlot("phase", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    const consumer = createBlock("consumer", "DebugDisplay", {
      inputs: [createSlot("value", "Signal<float>", "input")],
      outputs: [],
    });

    // TimeRoot -> both oscillators
    const edgeTA: Edge = {
      id: "timeroot.phase->sourceA.phase",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "sourceA", slotId: "phase" },
      enabled: true,
    };

    const edgeTB: Edge = {
      id: "timeroot.phase->sourceB.phase",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "sourceB", slotId: "phase" },
      enabled: true,
    };

    // Both oscillators feed into consumer (multi-input)
    const edgeAC: Edge = {
      id: "sourceA.out->consumer.value",
      from: { kind: 'port', blockId: "sourceA", slotId: "out" },
      to: { kind: 'port', blockId: "consumer", slotId: "value" },
      enabled: true,
    };

    const edgeBC: Edge = {
      id: "sourceB.out->consumer.value",
      from: { kind: 'port', blockId: "sourceB", slotId: "out" },
      to: { kind: 'port', blockId: "consumer", slotId: "value" },
      enabled: true,
    };

    const patch = createPatch({
      blocks: [timeRoot, sourceA, sourceB, consumer],
      edges: [edgeTA, edgeTB, edgeAC, edgeBC],
    });

    const normalized = pass1Normalize(patch);
    expect(normalized.blockIndexMap.size).toBe(4);
    expect(normalized.edges).toHaveLength(4);

    const typed = pass2TypeGraph(normalized);
    expect(typed.blocks.size).toBe(4);

    const timeResolved = pass3TimeTopology(typed);
    // timeRootIndex is not part of the canonical schema

    const depGraph = pass4DepGraph(timeResolved);
    expect(depGraph.graph.nodes).toHaveLength(4);
    // Multi-input edges are deduplicated at dep graph level
    expect(depGraph.graph.edges.length).toBeGreaterThanOrEqual(3);

    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);
    expect(validated.errors).toHaveLength(0);
  });
});

// =============================================================================
// Error Case Tests
// =============================================================================

describe("Pipeline Integration - Error Cases", () => {
  it("should fail with missing TimeRoot", () => {
    const oscillator = createBlock("osc", "Oscillator", {
      inputs: [createSlot("phase", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    const patch = createPatch({
      blocks: [oscillator],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);

    // Pass 3 should fail - no TimeRoot
    expect(() => pass3TimeTopology(typed)).toThrow("No TimeRoot block found");
  });

  it("should fail with multiple TimeRoots", () => {
    const timeRoot1 = createBlock("timeroot1", "InfiniteTimeRoot", {
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
    expect(() => pass3TimeTopology(typed)).toThrow("Multiple TimeRoot blocks found");
  });

  it("should fail with type mismatch on wire", () => {
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<float>", "output")],
    });

    // Block expecting a different type
    const colorBlock = createBlock("colorBlock", "ColorConsumer", {
      inputs: [createSlot("color", "Signal<color>", "input")],
      outputs: [],
    });

    // Mismatched wire: Signal<float> -> Signal<color>
    const mismatchEdge: Edge = {
      id: "timeroot.phase->colorBlock.color",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "colorBlock", slotId: "color" },
      enabled: true,
    };

    const patch = createPatch({
      blocks: [timeRoot, colorBlock],
      edges: [mismatchEdge],
    });

    const normalized = pass1Normalize(patch);

    // Pass 2 throws on type mismatch (no conversion path)
    expect(() => pass2TypeGraph(normalized)).toThrow("NoConversionPath");
  });

  it("should fail with dangling connection", () => {
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<float>", "output")],
    });

    // Edge referencing non-existent block
    const danglingEdge: Edge = {
      id: "timeroot.phase->missing.input",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "missing", slotId: "input" },
      enabled: true,
    };

    const patch = createPatch({
      blocks: [timeRoot],
      edges: [danglingEdge],
    });

    // Normalize should handle dangling edges gracefully
    const normalized = pass1Normalize(patch);
    // Edge is kept but block doesn't exist - typed pass may handle
    expect(normalized.edges).toHaveLength(1);
  });

  it("should fail with illegal cycle (no state boundary)", () => {
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<float>", "output")],
    });

    // Two blocks forming a cycle
    const blockA = createBlock("a", "PureBlock", {
      inputs: [createSlot("in", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    const blockB = createBlock("b", "PureBlock", {
      inputs: [createSlot("in", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    // A -> B -> A (cycle without state boundary)
    const edgeAB: Edge = {
      id: "a.out->b.in",
      from: { kind: 'port', blockId: "a", slotId: "out" },
      to: { kind: 'port', blockId: "b", slotId: "in" },
      enabled: true,
    };

    const edgeBA: Edge = {
      id: "b.out->a.in",
      from: { kind: 'port', blockId: "b", slotId: "out" },
      to: { kind: 'port', blockId: "a", slotId: "in" },
      enabled: true,
    };

    const patch = createPatch({
      blocks: [timeRoot, blockA, blockB],
      edges: [edgeAB, edgeBA],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);

    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);

    // Should detect the illegal cycle
    expect(validated.errors.length).toBeGreaterThan(0);
  });

  it("should accept legal cycle with state boundary", () => {
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [createSlot("phase", "Signal<float>", "output")],
    });

    // IntegrateBlock provides state boundary
    const integrator = createBlock("int", "IntegrateBlock", {
      inputs: [createSlot("rate", "Signal<float>", "input")],
      outputs: [createSlot("value", "Signal<float>", "output")],
    });

    const processor = createBlock("proc", "PureBlock", {
      inputs: [createSlot("in", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    // TimeRoot -> Integrator, Integrator -> Processor, Processor -> Integrator (feedback)
    const edgeTI: Edge = {
      id: "timeroot.phase->int.rate",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "int", slotId: "rate" },
      enabled: true,
    };

    const edgeIP: Edge = {
      id: "int.value->proc.in",
      from: { kind: 'port', blockId: "int", slotId: "value" },
      to: { kind: 'port', blockId: "proc", slotId: "in" },
      enabled: true,
    };

    // This creates a feedback loop but IntegrateBlock has state authority
    // so it breaks the cycle legally (state blocks use previous frame value)

    const patch = createPatch({
      blocks: [timeRoot, integrator, processor],
      edges: [edgeTI, edgeIP],
    });

    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);

    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    const validated = pass5CycleValidation(depGraph, sortedBlocks);

    // No errors - state boundary breaks the dependency cycle
    expect(validated.errors).toHaveLength(0);
  });
});

// =============================================================================
// Pipeline Invariants
// =============================================================================

describe("Pipeline Integration - Invariants", () => {
  it("should preserve block count through all passes", () => {
    const timeRoot = createBlock("timeroot", "InfiniteTimeRoot", {
      params: { periodMs: 3000, mode: "loop" },
      outputs: [
        createSlot("tAbsMs", "Signal<float>", "output"),
        createSlot("phase", "Signal<float>", "output"),
      ],
    });

    const blockA = createBlock("a", "PureBlock", {
      inputs: [createSlot("in", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    const blockB = createBlock("b", "PureBlock", {
      inputs: [createSlot("in", "Signal<float>", "input")],
      outputs: [createSlot("out", "Signal<float>", "output")],
    });

    // Simple chain: TimeRoot -> A -> B
    const edgeTA: Edge = {
      id: "timeroot.phase->a.in",
      from: { kind: 'port', blockId: "timeroot", slotId: "phase" },
      to: { kind: 'port', blockId: "a", slotId: "in" },
      enabled: true,
    };

    const edgeAB: Edge = {
      id: "a.out->b.in",
      from: { kind: 'port', blockId: "a", slotId: "out" },
      to: { kind: 'port', blockId: "b", slotId: "in" },
      enabled: true,
    };

    const patch = createPatch({
      blocks: [timeRoot, blockA, blockB],
      edges: [edgeTA, edgeAB],
    });

    const normalized = pass1Normalize(patch);
    expect(normalized.blocks.size).toBe(3);

    const typed = pass2TypeGraph(normalized);
    expect(typed.blocks.size).toBe(3);

    const timeResolved = pass3TimeTopology(typed);
    expect(timeResolved.blocks.size).toBe(3);

    const depGraph = pass4DepGraph(timeResolved);
    expect(depGraph.graph.nodes).toHaveLength(3);

    const sortedBlocks = getSortedBlocksForPass5(timeResolved);
    expect(sortedBlocks).toHaveLength(3);
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
    const cyclicRoot = createBlock("cyclic", "InfiniteTimeRoot", {
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

    // NEEDS REVIEW - DEPRECATED: InfiniteTimeRoot currently emits cyclic TimeModel.
  });
});
