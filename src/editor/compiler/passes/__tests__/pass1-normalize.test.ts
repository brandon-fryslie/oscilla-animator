/**
 * Pass 1 Normalize Tests
 *
 * Tests for the pass1Normalize function.
 * Verifies block ID freezing, default source attachment, and publisher/listener canonicalization.
 */

import { describe, it, expect } from "vitest";
import { pass1Normalize } from "../pass1-normalize";
import type {
  Patch,
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
  Slot,
} from "../../../types";

// Helper to create a minimal patch
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
  direction: "input" | "output",
  overrides?: Partial<Slot>
): Slot {
  return {
    id,
    label: id,
    type: "Signal<number>",
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

// Helper to create a publisher
function createPublisher(
  id: string,
  busId: string,
  fromBlock: string,
  fromSlot: string,
  sortKey: number,
  enabled = true
): Publisher {
  return {
    id,
    busId,
    from: { blockId: fromBlock, slotId: fromSlot, direction: "output" as const },
    enabled,
    sortKey,
  };
}

// Helper to create a listener
function createListener(
  id: string,
  busId: string,
  toBlock: string,
  toSlot: string,
  enabled = true
): Listener {
  return {
    id,
    busId,
    to: { blockId: toBlock, slotId: toSlot, direction: "input" as const },
    enabled,
  };
}

// Helper to create a bus
function createBus(id: string): Bus {
  return {
    id,
    name: id,
    type: {
      world: "signal",
      domain: "number",
      category: "core",
      busEligible: true,
    },
    combineMode: "last",
    defaultValue: 0,
    sortKey: 0,
  };
}

describe("pass1Normalize", () => {
  describe("Block ID Freezing", () => {
    it("freezes block IDs to indices in stable sorted order", () => {
      const patch = createPatch({
        blocks: [
          createBlock("block-3"),
          createBlock("block-1"),
          createBlock("block-2"),
        ],
      });

      const normalized = pass1Normalize(patch);

      // Sorted order: block-1 (0), block-2 (1), block-3 (2)
      expect(normalized.blockIndexMap.get("block-1")).toBe(0);
      expect(normalized.blockIndexMap.get("block-2")).toBe(1);
      expect(normalized.blockIndexMap.get("block-3")).toBe(2);
    });

    it("creates dense indices starting from 0", () => {
      const patch = createPatch({
        blocks: [createBlock("a"), createBlock("b"), createBlock("c")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.blockIndexMap.get("a")).toBe(0);
      expect(normalized.blockIndexMap.get("b")).toBe(1);
      expect(normalized.blockIndexMap.get("c")).toBe(2);
    });
  });

  describe("Default Source Attachment", () => {
    it("attaches default sources for unwired inputs", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
            ],
          }),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaultSources).toHaveLength(1);
      expect(normalized.defaultSources[0]).toEqual({
        blockId: "b1",
        slotId: "in1",
        constId: 0,
        type: {
          world: "signal",
          domain: "number",
        },
      });
    });

    it("does not attach default sources for wired inputs", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            outputs: [createSlot("out1", "output")],
          }),
          createBlock("b2", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
            ],
          }),
        ],
        connections: [createConnection("b1", "out1", "b2", "in1")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaultSources).toHaveLength(0);
    });

    it("does not attach default sources for inputs with bus listeners", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
            ],
          }),
        ],
        buses: [createBus("bus1")],
        listeners: [createListener("l1", "bus1", "b1", "in1", true)],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaultSources).toHaveLength(0);
    });

    it("assigns sequential constId to default sources", () => {
      const patch = createPatch({
        blocks: [
          createBlock("b1", {
            inputs: [
              createSlot("in1", "input", {
                defaultSource: {
                  world: "signal",
                  value: 0.5,
                },
              }),
              createSlot("in2", "input", {
                defaultSource: {
                  world: "signal",
                  value: 1.0,
                },
              }),
            ],
          }),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.defaultSources).toHaveLength(2);
      expect(normalized.defaultSources[0].constId).toBe(0);
      expect(normalized.defaultSources[1].constId).toBe(1);
    });
  });

  describe("Publisher Canonicalization", () => {
    it("filters disabled publishers", () => {
      const patch = createPatch({
        blocks: [createBlock("b1", { outputs: [createSlot("out1", "output")] })],
        buses: [createBus("bus1")],
        publishers: [
          createPublisher("p1", "bus1", "b1", "out1", 0, true),
          createPublisher("p2", "bus1", "b1", "out1", 1, false),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.publishers).toHaveLength(1);
      expect(normalized.publishers[0].id).toBe("p1");
    });

    it("sorts publishers by sortKey", () => {
      const patch = createPatch({
        blocks: [createBlock("b1", { outputs: [createSlot("out1", "output")] })],
        buses: [createBus("bus1")],
        publishers: [
          createPublisher("p1", "bus1", "b1", "out1", 2, true),
          createPublisher("p2", "bus1", "b1", "out1", 0, true),
          createPublisher("p3", "bus1", "b1", "out1", 1, true),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.publishers).toHaveLength(3);
      expect(normalized.publishers[0].id).toBe("p2");
      expect(normalized.publishers[1].id).toBe("p3");
      expect(normalized.publishers[2].id).toBe("p1");
    });

    it("sorts publishers by id when sortKey is equal", () => {
      const patch = createPatch({
        blocks: [createBlock("b1", { outputs: [createSlot("out1", "output")] })],
        buses: [createBus("bus1")],
        publishers: [
          createPublisher("p3", "bus1", "b1", "out1", 0, true),
          createPublisher("p1", "bus1", "b1", "out1", 0, true),
          createPublisher("p2", "bus1", "b1", "out1", 0, true),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.publishers).toHaveLength(3);
      expect(normalized.publishers[0].id).toBe("p1");
      expect(normalized.publishers[1].id).toBe("p2");
      expect(normalized.publishers[2].id).toBe("p3");
    });
  });

  describe("Listener Canonicalization", () => {
    it("filters disabled listeners", () => {
      const patch = createPatch({
        blocks: [createBlock("b1", { inputs: [createSlot("in1", "input")] })],
        buses: [createBus("bus1")],
        listeners: [
          createListener("l1", "bus1", "b1", "in1", true),
          createListener("l2", "bus1", "b1", "in1", false),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.listeners).toHaveLength(1);
      expect(normalized.listeners[0].id).toBe("l1");
    });

    it("preserves listener order", () => {
      const patch = createPatch({
        blocks: [createBlock("b1", { inputs: [createSlot("in1", "input")] })],
        buses: [createBus("bus1")],
        listeners: [
          createListener("l1", "bus1", "b1", "in1", true),
          createListener("l2", "bus1", "b1", "in1", true),
          createListener("l3", "bus1", "b1", "in1", true),
        ],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.listeners).toHaveLength(3);
      expect(normalized.listeners[0].id).toBe("l1");
      expect(normalized.listeners[1].id).toBe("l2");
      expect(normalized.listeners[2].id).toBe("l3");
    });
  });

  describe("Preserves Patch Structure", () => {
    it("preserves blocks, wires, and buses", () => {
      const patch = createPatch({
        blocks: [createBlock("b1"), createBlock("b2")],
        connections: [createConnection("b1", "out1", "b2", "in1")],
        buses: [createBus("bus1"), createBus("bus2")],
      });

      const normalized = pass1Normalize(patch);

      expect(normalized.blocks).toBe(patch.blocks);
      expect(normalized.wires).toBe(patch.connections);
      expect(normalized.buses).toBe(patch.buses);
    });
  });
});
