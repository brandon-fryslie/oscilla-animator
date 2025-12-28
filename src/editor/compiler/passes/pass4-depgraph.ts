/**
 * Pass 4: Dependency Graph Construction
 *
 * Transforms a TimeResolvedPatch into a DepGraph by:
 * 1. Creating BlockEval nodes for all blocks
 * 2. Creating BusValue nodes for all buses
 * 3. Adding Wire edges (block → block)
 * 4. Adding Publisher edges (block → bus)
 * 5. Adding Listener edges (bus → block)
 *
 * This graph is used for topological scheduling and cycle validation.
 *
 * References:
 * - HANDOFF.md Topic 5: Pass 4 - Dependency Graph
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 4
 */

import type {
  Block,
  Connection,
  Publisher,
  Listener,
  Bus,
} from "../../types";
import type {
  TimeResolvedPatch,
  DepGraph,
  DepNode,
  DepEdge,
} from "../ir";

/**
 * Error types emitted by Pass 4.
 */
export interface DanglingConnectionError {
  kind: "DanglingConnection";
  connectionId: string;
  fromBlockId?: string;
  toBlockId?: string;
  message: string;
}

export interface DanglingBindingEndpointError {
  kind: "DanglingBindingEndpoint";
  bindingId: string;
  busId: string;
  blockId?: string;
  message: string;
}

export type Pass4Error =
  | DanglingConnectionError
  | DanglingBindingEndpointError;

/**
 * Pass 4: Dependency Graph Construction
 *
 * Builds a unified dependency graph with BlockEval and BusValue nodes,
 * and edges for wires, publishers, and listeners.
 *
 * @param timeResolved - The time-resolved patch from Pass 3
 * @returns A dependency graph ready for cycle validation
 */
export function pass4DepGraph(
  timeResolved: TimeResolvedPatch<
    Block,
    Connection,
    Publisher,
    Listener,
    Bus
  >
): DepGraph {
  const errors: Pass4Error[] = [];
  const nodes: DepNode[] = [];
  const edges: DepEdge[] = [];

  // Step 1: Create BlockEval nodes for all blocks
  for (const block of timeResolved.blocks) {
    const blockIndex = timeResolved.blockIndexMap.get(block.id);
    if (blockIndex === undefined) {
      // This should never happen - blockIndexMap is created in Pass 1
      throw new Error(
        `Block ${block.id} not found in blockIndexMap (internal error)`
      );
    }

    nodes.push({
      kind: "BlockEval",
      blockIndex,
    });
  }

  // Step 2: Create BusValue nodes for all buses
  for (let busIdx = 0; busIdx < timeResolved.buses.length; busIdx++) {
    nodes.push({
      kind: "BusValue",
      busIndex: busIdx,
    });
  }

  // Step 3: Add Wire edges (block → block)
  for (const wire of timeResolved.wires) {
    const fromBlockIndex = timeResolved.blockIndexMap.get(wire.from.blockId);
    const toBlockIndex = timeResolved.blockIndexMap.get(wire.to.blockId);

    // Validate both endpoints exist
    if (fromBlockIndex === undefined || toBlockIndex === undefined) {
      errors.push({
        kind: "DanglingConnection",
        connectionId: wire.id,
        fromBlockId:
          fromBlockIndex === undefined ? wire.from.blockId : undefined,
        toBlockId: toBlockIndex === undefined ? wire.to.blockId : undefined,
        message: `Wire ${wire.id} references non-existent block(s): ${
          fromBlockIndex === undefined ? `from=${wire.from.blockId} ` : ""
        }${toBlockIndex === undefined ? `to=${wire.to.blockId}` : ""}`,
      });
      continue;
    }

    edges.push({
      from: { kind: "BlockEval", blockIndex: fromBlockIndex },
      to: { kind: "BlockEval", blockIndex: toBlockIndex },
    });
  }

  // Step 4: Add Publisher edges (block → bus)
  for (const publisher of timeResolved.publishers) {
    const fromBlockIndex = timeResolved.blockIndexMap.get(
      publisher.from.blockId
    );
    const busIdx = timeResolved.buses.findIndex(
      (b: Bus) => b.id === publisher.busId
    );

    // Validate block exists
    if (fromBlockIndex === undefined) {
      errors.push({
        kind: "DanglingBindingEndpoint",
        bindingId: publisher.id,
        busId: publisher.busId,
        blockId: publisher.from.blockId,
        message: `Publisher ${publisher.id} references non-existent block ${publisher.from.blockId}`,
      });
      continue;
    }

    // Validate bus exists
    if (busIdx === -1) {
      errors.push({
        kind: "DanglingBindingEndpoint",
        bindingId: publisher.id,
        busId: publisher.busId,
        message: `Publisher ${publisher.id} references non-existent bus ${publisher.busId}`,
      });
      continue;
    }

    edges.push({
      from: { kind: "BlockEval", blockIndex: fromBlockIndex },
      to: { kind: "BusValue", busIndex: busIdx },
    });
  }

  // Step 5: Add Listener edges (bus → block)
  for (const listener of timeResolved.listeners) {
    const toBlockIndex = timeResolved.blockIndexMap.get(listener.to.blockId);
    const busIdx = timeResolved.buses.findIndex((b: Bus) => b.id === listener.busId);

    // Validate block exists
    if (toBlockIndex === undefined) {
      errors.push({
        kind: "DanglingBindingEndpoint",
        bindingId: listener.id,
        busId: listener.busId,
        blockId: listener.to.blockId,
        message: `Listener ${listener.id} references non-existent block ${listener.to.blockId}`,
      });
      continue;
    }

    // Validate bus exists
    if (busIdx === -1) {
      errors.push({
        kind: "DanglingBindingEndpoint",
        bindingId: listener.id,
        busId: listener.busId,
        message: `Listener ${listener.id} references non-existent bus ${listener.busId}`,
      });
      continue;
    }

    edges.push({
      from: { kind: "BusValue", busIndex: busIdx },
      to: { kind: "BlockEval", blockIndex: toBlockIndex },
    });
  }

  // Throw if there are any errors
  if (errors.length > 0) {
    const errorSummary = errors
      .map((e) => `  - ${e.kind}: ${e.message}`)
      .join("\n");
    throw new Error(
      `Pass 4 (Dependency Graph) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  // Return dependency graph
  return {
    nodes,
    edges,
  };
}
