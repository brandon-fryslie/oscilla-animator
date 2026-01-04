/**
 * Pass 7: Bus Lowering to IR
 *
 * Compiles each bus into explicit combine nodes with deterministic publisher
 * ordering and transform chains.
 *
 * Key responsibilities:
 * - Collect sorted publishers (TODO: Update for edge-based architecture)
 * - Create sigCombine/fieldCombine nodes based on bus type
 * - Detect unsupported adapters/lenses and emit compile-time errors
 * - Handle empty buses with default values
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 7
 * - PLAN-2025-12-25-200731.md P0-2: Pass 7 - Bus Lowering to IR
 *
 * TODO: This file needs to be updated to work with the new edge-based bus architecture.
 * Publisher/Listener types have been removed. Buses are now BusBlocks with regular edges.
 * Edge sorting is handled by edge.sortKey properties, not getSortedPublishers().
 */

import type { Bus, Block } from "../../types";
import type { TypeDesc } from "../../../core/types";
import type { EventExprId } from "../ir/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
import type { CompileError } from "../types";
import type { EventCombineMode } from "../ir/signalExpr";

// Re-export ValueRefPacked for downstream consumers
export type { ValueRefPacked } from "./pass6-block-lowering";

// =============================================================================
// Types
// =============================================================================

/**
 * BusIndex - index into the buses array.
 * This type was removed from ir/types but is needed here.
 * Redefined for compiler internal use.
 */
export type BusIndex = number;

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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert editor TypeDesc (string) to IR TypeDesc (object).
 * For Sprint 2, we extract world and domain and add missing fields.
 */
function toIRTypeDesc(busType: import("../../types").TypeDesc): TypeDesc {
  // busType is now a string in editor/types.ts
  // We need to parse it or have metadata
  // For now, create a minimal TypeDesc - this is a stub
  // TODO: Proper TypeDesc conversion from string format
  return {
    world: "signal",
    domain: "float",
    category: "core",
    busEligible: true,
  };
}

// =============================================================================
// Pass 7 Implementation
// =============================================================================

/**
 * Pass 7: Bus Lowering
 *
 * Translates each bus into an explicit combine node.
 *
 * Input: UnlinkedIRFragments (from Pass 6) + buses + publishers + blocks
 * Output: IRWithBusRoots with bus combine nodes
 *
 * For each bus:
 * 1. Collect sorted publishers (TODO: Update to use edges with sortKey)
 * 2. Validate that no adapters/lenses are used (unsupported in IR mode)
 * 3. Resolve publisher source ValueRefs from blockOutputs
 * 4. Create combine node (sigCombine/fieldCombine)
 * 5. Handle empty buses with default values
 *
 * NOTE: After Sprint 2 migration, Publisher type has been removed.
 * This pass is deprecated and will be replaced by BusBlock lowering in Pass 6.
 * For now, we stub it out to avoid breaking the pipeline.
 */
export function pass7BusLowering(
  unlinked: UnlinkedIRFragments,
  buses: readonly Bus[],
  _publishers: readonly unknown[], // Publisher type removed
  _blocks: readonly Block[]
): IRWithBusRoots {
  const { builder, blockOutputs, errors: inheritedErrors } = unlinked;
  const busRoots = new Map<BusIndex, ValueRefPacked>();
  const errors: CompileError[] = [...inheritedErrors];

  // Stub: After Sprint 2, buses are BusBlocks, not separate entities
  // This pass is effectively deprecated
  // BusBlocks are lowered in Pass 6 like any other block

  // For now, create default values for each bus to avoid breaking downstream
  for (let busIdx = 0; busIdx < buses.length; busIdx++) {
    const bus = buses[busIdx];

    try {
      const busRef = createDefaultBusValue(bus, builder);
      if (busRef) {
        busRoots.set(busIdx, busRef);
      }
    } catch (error) {
      errors.push({
        code: "BusLoweringFailed",
        message: `Failed to lower bus ${bus.id}: ${error instanceof Error ? error.message : String(error)}`,
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
 * Create a default bus value from bus.defaultValue.
 */
function createDefaultBusValue(bus: Bus, builder: IRBuilder): ValueRefPacked | null {
  const type = toIRTypeDesc(bus.type);

  // Handle different worlds
  if (type.world === "signal") {
    // Create constant signal
    const value = typeof bus.defaultValue === "number" ? bus.defaultValue : 0;
    const sigId = builder.sigConst(value, type);
    const slot = builder.allocValueSlot(type);
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  if (type.world === "field") {
    // Create constant field
    const value = bus.defaultValue ?? 0;
    const fieldId = builder.fieldConst(value, type);
    const slot = builder.allocValueSlot(type);
    builder.registerFieldSlot(fieldId, slot);
    return { k: "field", id: fieldId, slot };
  }

  if (type.world === "event") {
    // Create empty event stream (no events)
    const eventId = builder.eventEmpty(type);
    const slot = builder.allocValueSlot(type);
    builder.registerEventSlot(eventId, slot);
    return { k: "event", id: eventId, slot };
  }

  // Unknown world - skip
  console.warn(`[Pass 7] Unknown world "${type.world}" for bus ${bus.id} - skipping`);
  return null;
}
