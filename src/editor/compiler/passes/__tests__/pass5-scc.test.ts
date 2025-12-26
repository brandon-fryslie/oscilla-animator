/**
 * Pass 5 SCC/Cycle Validation Tests
 *
 * Tests for the pass5CycleValidation function.
 * Verifies Tarjan's SCC algorithm and cycle validation with state boundaries.
 */

import { describe, it, expect } from "vitest";
import { pass5CycleValidation } from "../pass5-scc";
import type { Block } from "../../../types";
import type { DepGraph, DepNode, DepEdge, BlockIndex } from "../../ir";
import type { BusIndex } from "../../ir/types";

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

// Helper to create a BlockEval node
function blockNode(index: number): DepNode {
  return { kind: "BlockEval", blockIndex: index as BlockIndex };
}

// Helper to create a BusValue node
function busNode(index: number): DepNode {
  return { kind: "BusValue", busIndex: index as BusIndex };
}

// Helper to create an edge
function edge(from: DepNode, to: DepNode): DepEdge {
  return { from, to };
}

describe("pass5CycleValidation", () => {
  describe("Trivial SCCs", () => {
    it("accepts single node with no self-loop (trivial SCC)", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [],
      };

      const blocks = [createBlock("b1")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
      expect(result.sccs).toHaveLength(1);
      expect(result.sccs[0].nodes).toHaveLength(1);
      expect(result.sccs[0].hasStateBoundary).toBe(true);
    });

    it("accepts multiple disconnected nodes (trivial SCCs)", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1), blockNode(2)],
        edges: [],
      };

      const blocks = [
        createBlock("b1"),
        createBlock("b2"),
        createBlock("b3"),
      ];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
      expect(result.sccs).toHaveLength(3);
    });

    it("accepts acyclic chain (trivial SCCs)", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1), blockNode(2)],
        edges: [edge(blockNode(0), blockNode(1)), edge(blockNode(1), blockNode(2))],
      };

      const blocks = [
        createBlock("b1"),
        createBlock("b2"),
        createBlock("b3"),
      ];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Self-Loops", () => {
    it("rejects self-loop without state boundary", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "PureBlock")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].kind).toBe("IllegalCycle");
      expect(result.errors[0].nodes).toContain(0);
    });

    it("accepts self-loop with state boundary", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "SampleDelay")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
      expect(result.sccs[0].hasStateBoundary).toBe(true);
    });
  });

  describe("Simple Cycles", () => {
    it("rejects 2-node cycle without state boundary", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1)],
        edges: [edge(blockNode(0), blockNode(1)), edge(blockNode(1), blockNode(0))],
      };

      const blocks = [createBlock("b1"), createBlock("b2")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].kind).toBe("IllegalCycle");
      expect(result.errors[0].nodes).toHaveLength(2);
    });

    it("accepts 2-node cycle with state boundary in first block", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1)],
        edges: [edge(blockNode(0), blockNode(1)), edge(blockNode(1), blockNode(0))],
      };

      const blocks = [
        createBlock("b1", "Integrator"),
        createBlock("b2", "Multiply"),
      ];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
    });

    it("accepts 2-node cycle with state boundary in second block", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1)],
        edges: [edge(blockNode(0), blockNode(1)), edge(blockNode(1), blockNode(0))],
      };

      const blocks = [
        createBlock("b1", "Multiply"),
        createBlock("b2", "FeedbackBuffer"),
      ];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
    });

    it("rejects 3-node cycle without state boundary", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1), blockNode(2)],
        edges: [
          edge(blockNode(0), blockNode(1)),
          edge(blockNode(1), blockNode(2)),
          edge(blockNode(2), blockNode(0)),
        ],
      };

      const blocks = [
        createBlock("b1"),
        createBlock("b2"),
        createBlock("b3"),
      ];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].nodes).toHaveLength(3);
    });

    it("accepts 3-node cycle with state boundary", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1), blockNode(2)],
        edges: [
          edge(blockNode(0), blockNode(1)),
          edge(blockNode(1), blockNode(2)),
          edge(blockNode(2), blockNode(0)),
        ],
      };

      const blocks = [
        createBlock("b1", "Add"),
        createBlock("b2", "SampleAndHold"),
        createBlock("b3", "Multiply"),
      ];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Multiple SCCs", () => {
    it("validates multiple independent cycles", () => {
      // Two separate cycles: (0 → 1 → 0) and (2 → 3 → 2)
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1), blockNode(2), blockNode(3)],
        edges: [
          edge(blockNode(0), blockNode(1)),
          edge(blockNode(1), blockNode(0)),
          edge(blockNode(2), blockNode(3)),
          edge(blockNode(3), blockNode(2)),
        ],
      };

      const blocks = [
        createBlock("b1", "Delay"), // Has state
        createBlock("b2", "Multiply"),
        createBlock("b3", "Add"), // No state
        createBlock("b4", "Sin"),
      ];

      const result = pass5CycleValidation(graph, blocks);

      // First cycle has state, second doesn't
      expect(result.errors).toHaveLength(1);
      expect(result.sccs).toHaveLength(2);
    });

    it("accepts multiple valid cycles", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1), blockNode(2), blockNode(3)],
        edges: [
          edge(blockNode(0), blockNode(1)),
          edge(blockNode(1), blockNode(0)),
          edge(blockNode(2), blockNode(3)),
          edge(blockNode(3), blockNode(2)),
        ],
      };

      const blocks = [
        createBlock("b1", "DelayBlock"),
        createBlock("b2", "Multiply"),
        createBlock("b3", "IntegratorBlock"),
        createBlock("b4", "Add"),
      ];

      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
      expect(result.sccs).toHaveLength(2);
    });
  });

  describe("Bus Cycles", () => {
    it("handles cycles through buses", () => {
      // Block 0 → Bus 0 → Block 1 → Block 0 (cycle via bus)
      const graph: DepGraph = {
        nodes: [blockNode(0), busNode(0), blockNode(1)],
        edges: [
          edge(blockNode(0), busNode(0)),
          edge(busNode(0), blockNode(1)),
          edge(blockNode(1), blockNode(0)),
        ],
      };

      const blocks = [
        createBlock("b1", "Add"),
        createBlock("b2", "Multiply"),
      ];

      const result = pass5CycleValidation(graph, blocks);

      // Cycle without state boundary should error
      expect(result.errors).toHaveLength(1);
    });

    it("accepts bus cycle with state boundary", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), busNode(0), blockNode(1)],
        edges: [
          edge(blockNode(0), busNode(0)),
          edge(busNode(0), blockNode(1)),
          edge(blockNode(1), blockNode(0)),
        ],
      };

      const blocks = [
        createBlock("b1", "FeedbackDelay"),
        createBlock("b2", "Multiply"),
      ];

      const result = pass5CycleValidation(graph, blocks);

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("State Boundary Detection", () => {
    it("recognizes Delay blocks as state boundaries", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "SampleDelay")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.sccs[0].hasStateBoundary).toBe(true);
    });

    it("recognizes Integrator blocks as state boundaries", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "IntegratorBlock")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.sccs[0].hasStateBoundary).toBe(true);
    });

    it("recognizes Feedback blocks as state boundaries", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "FeedbackBuffer")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.sccs[0].hasStateBoundary).toBe(true);
    });

    it("recognizes Hold blocks as state boundaries", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "SampleAndHold")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.sccs[0].hasStateBoundary).toBe(true);
    });

    it("does not recognize pure blocks as state boundaries", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [edge(blockNode(0), blockNode(0))],
      };

      const blocks = [createBlock("b1", "Multiply")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.sccs[0].hasStateBoundary).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("SCC Structure", () => {
    it("returns SCCs with nodes array", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0), blockNode(1)],
        edges: [edge(blockNode(0), blockNode(1))],
      };

      const blocks = [createBlock("b1"), createBlock("b2")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.sccs.length).toBeGreaterThan(0);
      result.sccs.forEach((scc) => {
        expect(scc.nodes).toBeDefined();
        expect(Array.isArray(scc.nodes)).toBe(true);
        expect(scc.hasStateBoundary).toBeDefined();
      });
    });

    it("preserves the dependency graph in result", () => {
      const graph: DepGraph = {
        nodes: [blockNode(0)],
        edges: [],
      };

      const blocks = [createBlock("b1")];
      const result = pass5CycleValidation(graph, blocks);

      expect(result.graph).toBe(graph);
    });
  });
});
