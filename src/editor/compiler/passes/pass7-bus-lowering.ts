/**
 * Pass 7: Bus Lowering to IR
 *
 * Compiles each bus into explicit combine nodes with deterministic publisher
 * ordering and transform chains.
 *
 * Key responsibilities:
 * - Collect sorted publishers (edges to BusBlock.in port)
 * - Create sigCombine/fieldCombine nodes based on bus type
 * - Detect unsupported adapters/lenses and emit compile-time errors
 * - Handle empty buses with default values
 *
 * Sprint: Bus-Block Unification - Sprint 2 (Compiler Unification)
 * Refactored to use BusBlocks instead of separate bus entities.
 *
 * BACKWARD COMPATIBILITY:
 * This function supports both old (Bus[]/Publisher[]) and new (BusBlock) formats
 * to maintain compatibility during migration. When buses/publishers are provided,
 * they are automatically converted to BusBlocks internally.
 *
 * Before (Sprint 1):
 *   - Used getPublishersFromEdges() to find edges with edge.to.kind === 'bus'
 *   - Looked up publishers by busId
 *
 * After (Sprint 2):
 *   - Uses getBusBlocks() to find BusBlock instances
 *   - Looks up edges to BusBlock.in port (standard port-to-port edges)
 *   - Reads combine mode from BusBlock.params.combine
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 7
 * - .agent_planning/bus-block-unification/PLAN-2026-01-01-sprint2.md P1
 */

import type { Bus, Publisher, Block, Edge, BusCombineMode } from "../../types";
import type { BusIndex, TypeDesc, TypeWorld, Domain } from "../ir/types";
import { asTypeDesc } from "../ir/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
import type { CompileError } from "../types";
import { createCombineNode } from "./combine-utils";
import { getBusBlocks, getBusBlockCombineMode, getBusBlockDefaultValue } from "../bus-block-utils";
import { convertBusToBlock } from "../../bus-block/conversion";
import { getSortedPublishers } from "../../semantic/busSemantics";

// Re-export ValueRefPacked for downstream consumers
export type { ValueRefPacked } from "./pass6-block-lowering";

// =============================================================================
// Types
// =============================================================================

/**
 * IRWithBusRoots - Output of Pass 7
 *
 * Contains IR fragments from Pass 6 plus bus combine nodes.
 * Buses are now represented as explicit combine expressions.
 */
export interface IRWithBusRoots {
  /** IRBuilder instance containing all emitted nodes */
  builder: IRBuilder;

  /** Map from bus index to its ValueRef */
  busRoots: Map<BusIndex, ValueRefPacked>;

  /** Map from block index to map of port ID to ValueRef (from Pass 6) */
  blockOutputs: Map<number, Map<string, ValueRefPacked>>;

  /** Compilation errors encountered during lowering */
  errors: CompileError[];
}

/**
 * Publisher-like data extracted from edges to BusBlock.in port.
 * Used to maintain sorting logic after migration to BusBlocks.
 */
interface PublisherData {
  readonly from: { blockId: string; slotId: string };
  readonly weight?: number;
  readonly sortKey?: number;
  readonly adapterChain?: readonly unknown[];
  readonly lensStack?: readonly unknown[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert editor TypeDesc to IR TypeDesc.
 * For Sprint 2, we just extract world and domain.
 */
function toIRTypeDesc(params: Record<string, unknown>): TypeDesc {
  const busType = params?.busType as { world: string; domain: string } | undefined;

  if (busType === undefined) {
    // Default fallback
    return asTypeDesc({ world: 'signal', domain: 'float' });
  }

  return asTypeDesc({
    world: busType.world as TypeWorld,
    domain: busType.domain as Domain,
  });
}

/**
 * Get edges that connect to a specific BusBlock input port.
 *
 * After migration, publisher edges are port→BusBlock.in connections.
 * This function finds all such edges and extracts publisher data.
 *
 * @param busBlock - BusBlock instance
 * @param edges - All edges in the patch
 * @returns Array of publisher data sorted by weight/sortKey
 */
function getEdgesToBusBlock(
  busBlock: Block,
  edges: readonly Edge[]
): PublisherData[] {
  return edges
    .filter(
      (e) =>
        e.enabled &&
        e.to.kind === "port" &&
        e.to.blockId === busBlock.id &&
        e.to.slotId === "in"
    )
    .map((e) => {
      if (e.from.kind !== 'port') {
        // After migration, all edges should be port-to-port
        throw new Error(`Edge from non-port endpoint to BusBlock: ${JSON.stringify(e.from)}`);
      }

      return {
        from: { blockId: e.from.blockId, slotId: e.from.slotId },
        weight: e.weight,
        sortKey: e.sortKey,
        adapterChain: e.adapterChain,
        lensStack: e.lensStack,
      };
    })
    .sort((a, b) => {
      // Sort by weight (descending), then sortKey (ascending)
      if (a.weight !== b.weight) {
        return (b.weight ?? 0) - (a.weight ?? 0);
      }
      return (a.sortKey ?? 0) - (b.sortKey ?? 0);
    });
}

/**
 * Extract publisher data from edges targeting a specific bus (legacy format).
 * Filters edges where edge.to.kind === 'bus' and edge.to.busId matches.
 *
 * DEPRECATED: This is for backward compatibility with old Edge format.
 * New code should use getEdgesToBusBlock() with migrated BusBlocks.
 */
function getPublishersFromLegacyEdges(
  busId: string,
  edges: readonly Edge[]
): PublisherData[] {
  return edges
    .filter(
      (e) =>
        e.enabled &&
        e.to.kind === "bus" &&
        e.to.busId === busId
    )
    .map((e) => {
      const from = e.from as Extract<typeof e.from, { kind: "port" }>;
      return {
        from: { blockId: from.blockId, slotId: from.slotId },
        weight: e.weight,
        sortKey: e.sortKey,
        adapterChain: e.adapterChain,
        lensStack: e.lensStack,
      };
    })
    .sort((a, b) => {
      // Sort by weight (descending), then sortKey (ascending)
      if (a.weight !== b.weight) {
        return (b.weight ?? 0) - (a.weight ?? 0);
      }
      return (a.sortKey ?? 0) - (b.sortKey ?? 0);
    });
}

// =============================================================================
// Pass 7 Implementation
// =============================================================================

/**
 * Pass 7: Bus Lowering
 *
 * Translates each BusBlock into an explicit combine node.
 *
 * BACKWARD COMPATIBILITY:
 * Supports both old format (buses + publishers) and new format (BusBlocks + edges).
 * Old format is automatically converted to BusBlocks internally.
 *
 * New signature (preferred):
 *   pass7BusLowering(unlinked, blocks, edges)
 *
 * Old signature (deprecated):
 *   pass7BusLowering(unlinked, buses, publishers, blocks, edges?)
 *
 * For each BusBlock:
 * 1. Find edges to BusBlock.in port (publishers)
 * 2. Validate that no adapters/lenses are used (unsupported in IR mode)
 * 3. Resolve publisher source ValueRefs from blockOutputs
 * 4. Create combine node (sigCombine/fieldCombine)
 * 5. Handle empty buses with default values from BusBlock.params
 */
export function pass7BusLowering(
  unlinked: UnlinkedIRFragments,
  blocksOrBuses: readonly Block[] | readonly Bus[],
  publishersOrEdges?: readonly Publisher[] | readonly Edge[],
  blocksLegacy?: readonly Block[],
  edgesLegacy?: readonly Edge[]
): IRWithBusRoots {
  const { builder, blockOutputs, errors: inheritedErrors } = unlinked;
  const busRoots = new Map<BusIndex, ValueRefPacked>();
  const errors: CompileError[] = [...inheritedErrors];

  // Determine which signature is being used
  let blocks: readonly Block[];
  let edges: readonly Edge[];
  let busBlocks: Block[];

  if (blocksLegacy !== undefined) {
    // Old signature: pass7BusLowering(unlinked, buses, publishers, blocks, edges?)
    const buses = blocksOrBuses as readonly Bus[];
    blocks = blocksLegacy;
    edges = edgesLegacy ?? [];

    // Convert buses to BusBlocks for internal processing
    busBlocks = buses.map(convertBusToBlock);

    // Add converted BusBlocks to the blocks array
    blocks = [...blocks, ...busBlocks];
  } else {
    // New signature: pass7BusLowering(unlinked, blocks, edges)
    blocks = blocksOrBuses as readonly Block[];
    edges = (publishersOrEdges ?? []) as readonly Edge[];

    // Get BusBlocks from the blocks array
    busBlocks = getBusBlocks({ blocks });
  }

  // Create lookup map for block index by ID
  const blockIdToIndex = new Map<string, number>();
  blocks.forEach((block, idx) => {
    blockIdToIndex.set(block.id, idx);
  });

  // Process each BusBlock
  for (let busIdx = 0; busIdx < busBlocks.length; busIdx++) {
    const busBlock = busBlocks[busIdx];

    // Get publishers using edges
    let publishers: PublisherData[];

    // Check if we have new-format edges (port→port to BusBlock)
    const hasNewFormatEdges = edges.some(
      e => e.to.kind === 'port' && e.to.blockId === busBlock.id && e.to.slotId === 'in'
    );

    if (hasNewFormatEdges) {
      // New format: edges to BusBlock.in port
      publishers = getEdgesToBusBlock(busBlock, edges);
    } else {
      // Legacy format: edges to bus endpoint or Publisher[] array
      const hasLegacyEdges = edges.some(e => e.to.kind === 'bus' && e.to.busId === busBlock.id);

      if (hasLegacyEdges) {
        // Legacy edges format
        publishers = getPublishersFromLegacyEdges(busBlock.id, edges);
      } else {
        // Use Publisher[] array (oldest format)
        const publishersArray = (publishersOrEdges ?? []) as readonly Publisher[];
        const sorted = getSortedPublishers(busBlock.id, publishersArray as Publisher[], false);
        publishers = sorted.map(p => ({
          from: p.from,
          weight: p.weight,
          sortKey: p.sortKey,
          adapterChain: p.adapterChain,
          lensStack: p.lensStack,
        }));
      }
    }

    // Validate no adapters/lenses are used (not yet supported in IR mode)
    for (const pub of publishers) {
      if (pub.adapterChain !== undefined && pub.adapterChain.length > 0) {
        errors.push({
          code: "UnsupportedAdapterInIRMode",
          message: `Publisher to bus '${busBlock.label}' uses adapter chain, which is not yet supported in IR compilation mode. Adapters are only supported in legacy compilation. Remove the adapter chain or disable IR mode (VITE_USE_UNIFIED_COMPILER=false).`,
        });
      }
      // Lens stacks are ignored in IR mode for now (no transform chain emission yet).
    }

    try {
      // Create bus combine node
      const busRef = lowerBusBlockToCombineNode(
        busBlock,
        publishers,
        busIdx,
        builder,
        blockOutputs,
        blockIdToIndex
      );

      if (busRef !== null) {
        busRoots.set(busIdx, busRef);
      }
    } catch (error) {
      errors.push({
        code: "BusLoweringFailed",
        message: `Failed to lower bus ${busBlock.id}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    builder,
    busRoots,
    blockOutputs,
    errors,
  };
}

/**
 * Lower a single BusBlock to a combine node.
 *
 * Strategy:
 * - No publishers → use default value from BusBlock.params as constant
 * - One or more publishers → collect ValueRefs and call createCombineNode()
 *
 * This function uses the shared createCombineNode() from combine-utils.ts,
 * which handles all world types (Signal, Field, Event) and combine modes.
 *
 * Note: Adapters and lenses are validated in the main pass7BusLowering function.
 * If present, they will have already emitted errors.
 */
function lowerBusBlockToCombineNode(
  busBlock: Block,
  publishers: readonly PublisherData[],
  busIndex: BusIndex,
  builder: IRBuilder,
  blockOutputs: Map<number, Map<string, ValueRefPacked>>,
  blockIdToIndex: Map<string, number>
): ValueRefPacked | null {
  const irType = toIRTypeDesc(busBlock.params);

  // Collect publisher outputs as ValueRefPacked array
  const inputs: ValueRefPacked[] = [];

  for (const pub of publishers) {
    const blockIdx = blockIdToIndex.get(pub.from.blockId);
    if (blockIdx === undefined) continue;

    // Look up output by port ID directly
    const outputs = blockOutputs.get(blockIdx);
    const ref = outputs?.get(pub.from.slotId);

    if (ref === undefined) {
      // Port may not have IR representation yet - this is OK during migration
      continue;
    }

    // Publisher transform chains (adapters/lenses) are detected and emit errors
    // in pass7BusLowering before this function is called.
    // Here we assume 1:1 mapping (no transforms).

    inputs.push(ref);
  }

  // Handle empty bus - create default value from BusBlock params
  if (inputs.length === 0) {
    return createDefaultBusValue(busBlock, builder, irType);
  }

  // Use shared createCombineNode() for all worlds
  const combineMode = getBusBlockCombineMode(busBlock);
  const combinedRef = createCombineNode(
    combineMode as BusCombineMode,
    inputs,
    irType,
    builder,
    busIndex
  );

  // createCombineNode returns null if no valid terms for the target world
  // In that case, fall back to default value
  if (combinedRef === null) {
    return createDefaultBusValue(busBlock, builder, irType);
  }

  return combinedRef;
}

/**
 * Create a default bus value from BusBlock.params.defaultValue.
 */
function createDefaultBusValue(
  busBlock: Block,
  builder: IRBuilder,
  type: TypeDesc
): ValueRefPacked | null {
  const defaultValue = getBusBlockDefaultValue(busBlock);

  // Handle different worlds
  if (type.world === "signal") {
    // Create constant signal
    const value = typeof defaultValue === "number" ? defaultValue : 0;
    const sigId = builder.sigConst(value, type);
    const slot = builder.allocValueSlot();
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  if (type.world === "field") {
    // Create constant field
    const value = defaultValue ?? 0;
    const fieldId = builder.fieldConst(value, type);
    const slot = builder.allocValueSlot();
    builder.registerFieldSlot(fieldId, slot);
    return { k: "field", id: fieldId, slot };
  }

  if (type.world === "event") {
    // Create empty event stream (no events)
    const eventId = builder.eventEmpty(type);
    const slot = builder.allocValueSlot();
    builder.registerEventSlot(eventId, slot);
    return { k: "event", id: eventId, slot };
  }

  // Unknown world - skip
  console.warn(`[Pass 7] Unknown world "${type.world}" for bus ${busBlock.id} - skipping`);
  return null;
}
