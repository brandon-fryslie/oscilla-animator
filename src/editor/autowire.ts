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
 * 2. User dropped a block near another and wants sensible wiring
 * 3. User dropped a block to satisfy a specific input port
 */

import type { Block, BlockId, Edge, SlotType } from './types';
import { areTypesCompatible } from './portUtils';
import type { BlockDefinition } from './blocks';

// =============================================================================
// Types
// =============================================================================

export interface AutoWireContext {
  /** All blocks in the patch */
  blocks: readonly Block[];

  /** All existing edges */
  edges: readonly Edge[];

  /** The block just created */
  newBlockId: BlockId;

  /** Block definition for the new block */
  newBlockDef: BlockDefinition;

  /** Function to get block definition by type */
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
 * 3. Find compatible connections from existing blocks
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

  // Case 3: Find compatible connections from any block
  return wireFromAllBlocks(ctx);
}

// =============================================================================
// Case Handlers
// =============================================================================

/**
 * Case 1: User wants to satisfy a specific input port with the new block.
 */
function wireToExplicitInput(ctx: AutoWireContext): AutoWireResult {
  const { toPort, newBlockId, newBlockDef, edges } = ctx;
  if (toPort === undefined) return { connections: [], reason: 'no toPort' };

  // Cannot overwrite existing input connection
  if (hasIncomingConnection(edges, toPort.blockId, toPort.slotId)) {
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

  const output = matchingOutputs[0];
  if (output == null) {
    return { connections: [], reason: 'no output found' };
  }

  const candidate = {
    fromBlockId: newBlockId,
    fromSlotId: output.id,
    toBlockId: toPort.blockId,
    toSlotId: toPort.slotId,
  };

  // Check for cycles
  if (wouldCreateCycle(ctx.blocks, ctx.edges, candidate)) {
    return { connections: [], reason: 'would create cycle' };
  }

  return { connections: [candidate] };
}

/**
 * Case 2: User dragged from an output port and dropped a new block.
 */
function wireFromExplicitOutput(ctx: AutoWireContext): AutoWireResult {
  const { fromPort, newBlockId, newBlockDef, edges } = ctx;
  if (fromPort === undefined) return { connections: [], reason: 'no fromPort' };

  // Find inputs on new block that match the source output type AND are free
  const matchingInputs = newBlockDef.inputs.filter((inp) => {
    if (!areTypesCompatible(fromPort.slotType, inp.type)) return false;
    // Must not already have an incoming connection
    return !hasIncomingConnection(edges, newBlockId, inp.id);
  });

  if (matchingInputs.length === 0) {
    return { connections: [], reason: 'no free matching input for fromPort' };
  }

  if (matchingInputs.length > 1) {
    return { connections: [], reason: 'ambiguous: multiple inputs match fromPort' };
  }

  const input = matchingInputs[0];
  if (input == null) {
    return { connections: [], reason: 'no input found' };
  }

  const candidate = {
    fromBlockId: fromPort.blockId,
    fromSlotId: fromPort.slotId,
    toBlockId: newBlockId,
    toSlotId: input.id,
  };

  // Check for cycles
  if (wouldCreateCycle(ctx.blocks, ctx.edges, candidate)) {
    return { connections: [], reason: 'would create cycle' };
  }

  return { connections: [candidate] };
}

/**
 * Case 3: Find ALL compatible connections from any block.
 *
 * For each free input on the new block, find if there's exactly ONE
 * output in the entire patch that can satisfy it (and isn't already connected).
 */
function wireFromAllBlocks(ctx: AutoWireContext): AutoWireResult {
  const { blocks, edges, newBlockId, newBlockDef, getDefinition } = ctx;
  const result: AutoWireResult['connections'] = [];

  if (getDefinition === undefined) {
    return { connections: [], reason: 'no getDefinition provided for autowire' };
  }

  // For each input on the new block
  for (const newInput of newBlockDef.inputs) {
    // Skip if already has an incoming connection
    if (hasIncomingConnection(edges, newBlockId, newInput.id)) continue;
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
        const alreadyConnected = edges.some(
          (e) => e.from.blockId === block.id && e.from.slotId === output.id
        );
        if (alreadyConnected) continue;

        // Check wouldn't create cycle
        const candidate = {
          fromBlockId: block.id,
          fromSlotId: output.id,
          toBlockId: newBlockId,
          toSlotId: newInput.id,
        };
        if (wouldCreateCycle(blocks, [...edges, ...result.map(toEdge)], candidate)) {
          continue;
        }

        candidates.push({ blockId: block.id, slotId: output.id });
      }
    }

    // Only wire if exactly ONE candidate (no ambiguity)
    if (candidates.length === 1) {
      const source = candidates[0];
      if (source == null) continue;

      result.push({
        fromBlockId: source.blockId,
        fromSlotId: source.slotId,
        toBlockId: newBlockId,
        toSlotId: newInput.id,
      });
    }
  }

  if (result.length === 0) {
    return { connections: [], reason: 'no unambiguous matches' };
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
  edges: readonly Edge[],
  blockId: BlockId,
  slotId: string
): boolean {
  return edges.some(
    (e) => e.to.blockId === blockId && e.to.slotId === slotId
  );
}

/**
 * Convert our simple connection format to an Edge-like shape for cycle check.
 */
function toEdge(c: AutoWireResult['connections'][0]): Edge {
  return {
    id: 'temp',
    from: { kind: 'port', blockId: c.fromBlockId, slotId: c.fromSlotId },
    to: { kind: 'port', blockId: c.toBlockId, slotId: c.toSlotId },
    enabled: true,
    role: { kind: 'auto', meta: { reason: 'portMoved' } },
  };
}

/**
 * Check if adding a connection would create a cycle in the graph.
 *
 * Strategy: If there's already a path from dst -> src, adding src -> dst creates a cycle.
 */
function wouldCreateCycle(
  blocks: readonly Block[],
  existingEdges: readonly Edge[],
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
  for (const edge of existingEdges) {
    adj.get(edge.from.blockId)?.add(edge.to.blockId);
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
    const current = stack.pop();
    if (current == null) continue;

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
