/**
 * Pass 7: Bus Lowering to IR
 *
 * Compiles each bus into explicit combine nodes with deterministic publisher
 * ordering and transform chains.
 *
 * Key responsibilities:
 * - Collect sorted publishers using busSemantics.getSortedPublishers
 * - Create sigCombine/fieldCombine nodes based on bus type
 * - Apply publisher transform chains (adapters/lenses)
 * - Handle empty buses with default values
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 7
 * - PLAN-2025-12-25-200731.md P0-2: Pass 7 - Bus Lowering to IR
 */

import type { Bus, Publisher } from "../../types";
import type { BusIndex, TypeDesc } from "../ir/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
import type { CompileError } from "../types";
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

  /** Map from block index to its output port ValueRefs (from Pass 6) */
  blockOutputs: Map<number, ValueRefPacked[]>;

  /** Compilation errors encountered during lowering */
  errors: CompileError[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert editor TypeDesc to IR TypeDesc.
 * For Sprint 2, we just extract world and domain.
 */
function toIRTypeDesc(busType: import("../../types").TypeDesc): TypeDesc {
  return {
    world: busType.world as TypeDesc["world"],
    domain: busType.domain as TypeDesc["domain"],
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
 * Input: UnlinkedIRFragments (from Pass 6) + buses + publishers
 * Output: IRWithBusRoots with bus combine nodes
 *
 * For each bus:
 * 1. Collect sorted publishers using getSortedPublishers()
 * 2. Resolve publisher source ValueRefs from blockOutputs
 * 3. Apply transform chains (if present)
 * 4. Create combine node (sigCombine/fieldCombine)
 * 5. Handle empty buses with default values
 */
export function pass7BusLowering(
  unlinked: UnlinkedIRFragments,
  buses: readonly Bus[],
  publishers: readonly Publisher[]
): IRWithBusRoots {
  const { builder, blockOutputs, errors: inheritedErrors } = unlinked;
  const busRoots = new Map<BusIndex, ValueRefPacked>();
  const errors: CompileError[] = [...inheritedErrors];

  // Process each bus
  for (let busIdx = 0; busIdx < buses.length; busIdx++) {
    const bus = buses[busIdx];

    // Get sorted publishers for this bus (enabled only)
    const busPublishers = getSortedPublishers(bus.id, publishers as Publisher[], false);

    try {
      // Create bus combine node
      const busRef = lowerBusToCombineNode(
        bus,
        busPublishers,
        busIdx as BusIndex,
        builder
      );

      if (busRef) {
        busRoots.set(busIdx as BusIndex, busRef);
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
 * Lower a single bus to a combine node.
 *
 * Strategy:
 * - No publishers → use default value as constant
 * - One publisher → use publisher output directly (no combine needed)
 * - Multiple publishers → create combine node with sorted publishers
 */
function lowerBusToCombineNode(
  bus: Bus,
  _publishers: readonly Publisher[],
  _busIndex: BusIndex,
  builder: IRBuilder
): ValueRefPacked | null {
  // For Sprint 2, we skip publisher resolution (Phase 4 work)
  // Just create default bus values
  // TODO (Phase 4): Resolve publishers and create combine nodes

  // Case 1: No publishers - use default value
  return createDefaultBusValue(bus, builder);
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
    return { k: "sig", id: sigId };
  }

  if (type.world === "field") {
    // Create constant field
    const value = bus.defaultValue ?? 0;
    const fieldId = builder.fieldConst(value, type);
    return { k: "field", id: fieldId };
  }

  // Unknown world - skip
  console.warn(`[Pass 7] Unknown world "${type.world}" for bus ${bus.id} - skipping`);
  return null;
}
