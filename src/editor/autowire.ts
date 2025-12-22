/**
 * Auto-Wire Algorithm
 *
 * Automatically connects blocks when dropped based on type compatibility.
 *
 * Rules:
 * - Only auto-wire when the connection is unique and safe
 * - Never overwrite existing connections
 * - Never create cycles
 * - Never guess between multiple candidates (ambiguity = no wire)
 *
 * Use cases:
 * 1. User dragged from an output port and dropped a new block
 * 2. User dropped a block after another in a chain lane
 * 3. User dropped a block to satisfy a specific input port
 */

import type { Block, BlockId, Connection, SlotType } from './types';
import { areTypesCompatible } from './portUtils';
import type { BlockDefinition } from './blocks';

// =============================================================================
// Types
// =============================================================================

export interface AutoWireContext {
  /** All blocks in the patch */
  blocks: readonly Block[];

  /** All existing connections */
  connections: readonly Connection[];

  /** The block just created */
  newBlockId: BlockId;

  /** Block definition for the new block */
  newBlockDef: BlockDefinition;

  /** Function to get block definition by type (for cross-lane wiring) */
  getDefinition?: (type: string) => BlockDefinition | undefined;

  /** Optional: user dragged from an existing output port */
  fromPort?: {
    blockId: BlockId;
    slotId: string;
    slotType: SlotType;
  };

  /** Optional: user intended to satisfy a specific input port */
  toPort?: {
    blockId: BlockId;
    slotId: string;
    slotType: SlotType;
  };

  /** Optional: previous block in same lane (for chain wiring) */
  prevBlockInLane?: {
    blockId: BlockId;
    block: Block;
    definition: BlockDefinition;
  };
}

export interface AutoWireResult {
  /** Connections to create (may be multiple for blocks with multiple compatible ports) */
  connections: Array<{
    fromBlockId: BlockId;
    fromSlotId: string;
    toBlockId: BlockId;
    toSlotId: string;
  }>;

  /** Why we didn't auto-wire (for debugging) */
  reason?: string;
}

// =============================================================================
// Main Algorithm
// =============================================================================

/**
 * Compute auto-wire connections for a newly added block.
 *
 * Priority:
 * 1. If toPort is provided: wire newBlock.output -> toPort.input
 * 2. If fromPort is provided: wire fromPort.output -> newBlock.input
 * 3. If prevBlockInLane is provided: wire prev.outputs -> newBlock.inputs
 * 4. Cross-lane: find ALL compatible connections from existing blocks
 */
export function computeAutoWire(ctx: AutoWireContext): AutoWireResult {
  // Case 1: Satisfy an explicit input port
  if (ctx.toPort) {
    return wireToExplicitInput(ctx);
  }

  // Case 2: Coming from an explicit output port
  if (ctx.fromPort) {
    return wireFromExplicitOutput(ctx);
  }

  // Case 3: Chain lane heuristic (previous block in lane)
  if (ctx.prevBlockInLane) {
    const result = wireFromPrevInLane(ctx);
    if (result.connections.length > 0) {
      return result;
    }
  }

  // Case 4: Cross-lane - find ALL compatible connections from any block
  return wireFromAllBlocks(ctx);
}

// =============================================================================
// Case Handlers
// =============================================================================

/**
 * Case 1: User wants to satisfy a specific input port with the new block.
 */
function wireToExplicitInput(ctx: AutoWireContext): AutoWireResult {
  const { toPort, newBlockId, newBlockDef, connections } = ctx;
  if (!toPort) return { connections: [], reason: 'no toPort' };

  // Cannot overwrite existing input connection
  if (hasIncomingConnection(connections, toPort.blockId, toPort.slotId)) {
    return { connections: [], reason: 'toPort already wired' };
  }

  // Find outputs on new block that match the target input type
  const matchingOutputs = newBlockDef.outputs.filter(
    (out) => areTypesCompatible(out.type, toPort.slotType)
  );

  if (matchingOutputs.length === 0) {
    return { connections: [], reason: 'no matching output for toPort' };
  }

  if (matchingOutputs.length > 1) {
    return { connections: [], reason: 'ambiguous: multiple outputs match toPort' };
  }

  const output = matchingOutputs[0]!;
  const candidate = {
    fromBlockId: newBlockId,
    fromSlotId: output.id,
    toBlockId: toPort.blockId,
    toSlotId: toPort.slotId,
  };

  // Check for cycles
  if (wouldCreateCycle(ctx.blocks, ctx.connections, candidate)) {
    return { connections: [], reason: 'would create cycle' };
  }

  return { connections: [candidate] };
}

/**
 * Case 2: User dragged from an output port and dropped a new block.
 */
function wireFromExplicitOutput(ctx: AutoWireContext): AutoWireResult {
  const { fromPort, newBlockId, newBlockDef, connections } = ctx;
  if (!fromPort) return { connections: [], reason: 'no fromPort' };

  // Find inputs on new block that match the source output type AND are free
  const matchingInputs = newBlockDef.inputs.filter((inp) => {
    if (!areTypesCompatible(fromPort.slotType, inp.type)) return false;
    // Must not already have an incoming connection
    return !hasIncomingConnection(connections, newBlockId, inp.id);
  });

  if (matchingInputs.length === 0) {
    return { connections: [], reason: 'no free matching input for fromPort' };
  }

  if (matchingInputs.length > 1) {
    return { connections: [], reason: 'ambiguous: multiple inputs match fromPort' };
  }

  const input = matchingInputs[0]!;
  const candidate = {
    fromBlockId: fromPort.blockId,
    fromSlotId: fromPort.slotId,
    toBlockId: newBlockId,
    toSlotId: input.id,
  };

  // Check for cycles
  if (wouldCreateCycle(ctx.blocks, ctx.connections, candidate)) {
    return { connections: [], reason: 'would create cycle' };
  }

  return { connections: [candidate] };
}

/**
 * Case 3: Wire from previous block in lane (chain heuristic).
 *
 * This is more permissive than cases 1 & 2:
 * - We try to wire ALL compatible outputs from prev to inputs on new
 * - But only if each connection is unambiguous (1:1 mapping)
 */
function wireFromPrevInLane(ctx: AutoWireContext): AutoWireResult {
  const { prevBlockInLane, newBlockId, newBlockDef, connections, blocks } = ctx;
  if (!prevBlockInLane) return { connections: [], reason: 'no prevBlockInLane' };

  const prevDef = prevBlockInLane.definition;
  const result: AutoWireResult['connections'] = [];

  // Try to match each output from prev to an input on new
  for (const prevOutput of prevDef.outputs) {
    // Find free inputs on new block that match this output type
    const matchingInputs = newBlockDef.inputs.filter((inp) => {
      if (!areTypesCompatible(prevOutput.type, inp.type)) return false;
      // Must not already have an incoming connection
      if (hasIncomingConnection(connections, newBlockId, inp.id)) return false;
      // Must not already be claimed by another auto-wire in this batch
      if (result.some((r) => r.toSlotId === inp.id)) return false;
      return true;
    });

    // Only wire if exactly one match (no ambiguity)
    if (matchingInputs.length === 1) {
      const input = matchingInputs[0]!;
      const candidate = {
        fromBlockId: prevBlockInLane.blockId,
        fromSlotId: prevOutput.id,
        toBlockId: newBlockId,
        toSlotId: input.id,
      };

      // Check for cycles
      if (!wouldCreateCycle(blocks, [...connections, ...result.map(toConnection)], candidate)) {
        result.push(candidate);
      }
    }
  }

  if (result.length === 0) {
    return { connections: [], reason: 'no unambiguous matches from prevInLane' };
  }

  return { connections: result };
}

/**
 * Case 4: Cross-lane wiring - find ALL compatible connections from any block.
 *
 * For each free input on the new block, find if there's exactly ONE
 * output in the entire patch that can satisfy it (and isn't already connected).
 */
function wireFromAllBlocks(ctx: AutoWireContext): AutoWireResult {
  const { blocks, connections, newBlockId, newBlockDef, getDefinition } = ctx;
  const result: AutoWireResult['connections'] = [];

  if (!getDefinition) {
    return { connections: [], reason: 'no getDefinition provided for cross-lane wiring' };
  }

  // For each input on the new block
  for (const newInput of newBlockDef.inputs) {
    // Skip if already has an incoming connection
    if (hasIncomingConnection(connections, newBlockId, newInput.id)) continue;
    // Skip if already claimed by earlier autowire in this batch
    if (result.some((r) => r.toSlotId === newInput.id)) continue;

    // Find ALL outputs across ALL blocks that could satisfy this input
    const candidates: Array<{ blockId: BlockId; slotId: string }> = [];

    for (const block of blocks) {
      // Don't wire to self
      if (block.id === newBlockId) continue;

      const blockDef = getDefinition(block.type);
      if (!blockDef) continue;

      for (const output of blockDef.outputs) {
        if (!areTypesCompatible(output.type, newInput.type)) continue;

        // Check this output isn't already connected to something
        // (optional: we could allow fan-out, but for now keep it simple)
        const alreadyConnected = connections.some(
          (c) => c.from.blockId === block.id && c.from.slotId === output.id
        );
        if (alreadyConnected) continue;

        // Check wouldn't create cycle
        const candidate = {
          fromBlockId: block.id,
          fromSlotId: output.id,
          toBlockId: newBlockId,
          toSlotId: newInput.id,
        };
        if (wouldCreateCycle(blocks, [...connections, ...result.map(toConnection)], candidate)) {
          continue;
        }

        candidates.push({ blockId: block.id, slotId: output.id });
      }
    }

    // Only wire if exactly ONE candidate (no ambiguity)
    if (candidates.length === 1) {
      const source = candidates[0]!;
      result.push({
        fromBlockId: source.blockId,
        fromSlotId: source.slotId,
        toBlockId: newBlockId,
        toSlotId: newInput.id,
      });
    }
  }

  if (result.length === 0) {
    return { connections: [], reason: 'no unambiguous cross-lane matches' };
  }

  return { connections: result };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if an input port already has an incoming connection.
 */
function hasIncomingConnection(
  connections: readonly Connection[],
  blockId: BlockId,
  slotId: string
): boolean {
  return connections.some(
    (c) => c.to.blockId === blockId && c.to.slotId === slotId
  );
}

/**
 * Convert our simple connection format to a Connection-like shape for cycle check.
 */
function toConnection(c: AutoWireResult['connections'][0]): Connection {
  return {
    id: 'temp',
    from: { blockId: c.fromBlockId, slotId: c.fromSlotId, direction: 'output' },
    to: { blockId: c.toBlockId, slotId: c.toSlotId, direction: 'input' },
  };
}

/**
 * Check if adding a connection would create a cycle in the graph.
 *
 * Strategy: If there's already a path from dst -> src, adding src -> dst creates a cycle.
 */
function wouldCreateCycle(
  blocks: readonly Block[],
  existingConnections: readonly Connection[],
  candidate: { fromBlockId: BlockId; toBlockId: BlockId }
): boolean {
  const src = candidate.fromBlockId;
  const dst = candidate.toBlockId;

  // Self-loop
  if (src === dst) return true;

  // Build adjacency list: blockId -> set of blocks it connects TO
  const adj = new Map<string, Set<string>>();
  for (const block of blocks) {
    adj.set(block.id, new Set());
  }
  for (const conn of existingConnections) {
    adj.get(conn.from.blockId)?.add(conn.to.blockId);
  }

  // Add the candidate edge
  adj.get(src)?.add(dst);

  // Check if there's a path from dst back to src (would form cycle)
  return isReachable(adj, dst, src);
}

/**
 * BFS/DFS to check if `goal` is reachable from `start`.
 */
function isReachable(adj: Map<string, Set<string>>, start: string, goal: string): boolean {
  const stack = [start];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === goal) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    const neighbors = adj.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

// =============================================================================
// Utility: Find previous block in lane
// =============================================================================

/**
 * Find the block that comes before a given position in a lane.
 * Used to determine the "prevInLane" for chain wiring.
 */
export function findPrevBlockInLane(
  laneBlockIds: readonly BlockId[],
  newBlockIndex: number,
  blocks: readonly Block[],
  getDefinition: (type: string) => BlockDefinition | undefined
): AutoWireContext['prevBlockInLane'] | undefined {
  if (newBlockIndex <= 0) return undefined;

  const prevBlockId = laneBlockIds[newBlockIndex - 1];
  if (!prevBlockId) return undefined;

  const prevBlock = blocks.find((b) => b.id === prevBlockId);
  if (!prevBlock) return undefined;

  const prevDef = getDefinition(prevBlock.type);
  if (!prevDef) return undefined;

  return {
    blockId: prevBlockId,
    block: prevBlock,
    definition: prevDef,
  };
}
