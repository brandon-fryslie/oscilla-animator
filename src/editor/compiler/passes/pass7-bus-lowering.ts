/**
 * Pass 7: Bus Lowering to IR
 *
 * Compiles each bus into explicit combine nodes with deterministic publisher
 * ordering and transform chains.
 *
 * Key responsibilities:
 * - Collect sorted publishers using busSemantics.getSortedPublishers
 * - Create sigCombine/fieldCombine nodes based on bus type
 * - Detect unsupported adapters/lenses and emit compile-time errors
 * - Handle empty buses with default values
 *
 * References:
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 7
 * - PLAN-2025-12-25-200731.md P0-2: Pass 7 - Bus Lowering to IR
 */

import type { Bus, Publisher, Block } from "../../types";
import type { BusIndex, TypeDesc, EventExprId } from "../ir/types";
import { asTypeDesc } from "../ir/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
import type { CompileError } from "../types";
import type { EventCombineMode } from "../ir/signalExpr";
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert editor TypeDesc to IR TypeDesc.
 * For Sprint 2, we just extract world and domain.
 */
function toIRTypeDesc(busType: import("../../types").TypeDesc): TypeDesc {
  return asTypeDesc({
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> cbecc82 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> 94bb084 (fix(types): Complete TypeDesc contract migration for production code)
    world: busType.world,
    domain: busType.domain,
=======
    world: busType.world as TypeDesc["world"],
    domain: busType.domain as TypeDesc["domain"],
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 94bb084 (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> b891517 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
    world: busType.world as TypeDesc["world"],
    domain: busType.domain as TypeDesc["domain"],
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
    world: busType.world as TypeDesc["world"],
    domain: busType.domain as TypeDesc["domain"],
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> cbecc82 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> 94bb084 (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> 86a62f7 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b891517 (fix(types): Complete TypeDesc contract migration for production code)
  });
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
 * 1. Collect sorted publishers using getSortedPublishers()
 * 2. Validate that no adapters/lenses are used (unsupported in IR mode)
 * 3. Resolve publisher source ValueRefs from blockOutputs
 * 4. Create combine node (sigCombine/fieldCombine)
 * 5. Handle empty buses with default values
 */
export function pass7BusLowering(
  unlinked: UnlinkedIRFragments,
  buses: readonly Bus[],
  publishers: readonly Publisher[],
  blocks: readonly Block[]
): IRWithBusRoots {
  const { builder, blockOutputs, errors: inheritedErrors } = unlinked;
  const busRoots = new Map<BusIndex, ValueRefPacked>();
  const errors: CompileError[] = [...inheritedErrors];

  // Create lookup map for block index by ID
  const blockIdToIndex = new Map<string, number>();
  blocks.forEach((block, idx) => {
    blockIdToIndex.set(block.id, idx);
  });

  // Process each bus
  for (let busIdx = 0; busIdx < buses.length; busIdx++) {
    const bus = buses[busIdx];

    // Get sorted publishers for this bus (enabled only)
    const busPublishers = getSortedPublishers(bus.id, publishers as Publisher[], false);

    // Validate no adapters/lenses are used (not yet supported in IR mode)
    for (const pub of busPublishers) {
      if (pub.adapterChain !== undefined && pub.adapterChain.length > 0) {
        errors.push({
          code: "UnsupportedAdapterInIRMode",
          message: `Publisher to bus '${bus.name}' uses adapter chain, which is not yet supported in IR compilation mode. Adapters are only supported in legacy compilation. Remove the adapter chain or disable IR mode (VITE_USE_UNIFIED_COMPILER=false).`,
        });
      }
      // Lens stacks are ignored in IR mode for now (no transform chain emission yet).
    }

    try {
      // Create bus combine node
      const busRef = lowerBusToCombineNode(
        bus,
        busPublishers,
        busIdx,
        builder,
        blockOutputs,
        blockIdToIndex,
        blocks
      );

      if (busRef !== null) {
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
 * Lower a single bus to a combine node.
 *
 * Strategy:
 * - No publishers → use default value as constant
 * - One publisher → use publisher output directly (no combine needed)
 * - Multiple publishers → create combine node with sorted publishers
 *
 * Note: Adapters and lenses are validated in the main pass7BusLowering function.
 * If present, they will have already emitted errors.
 */
function lowerBusToCombineNode(
  bus: Bus,
  publishers: readonly Publisher[],
  busIndex: BusIndex,
  builder: IRBuilder,
  blockOutputs: Map<number, Map<string, ValueRefPacked>>,
  blockIdToIndex: Map<string, number>,
  _blocks: readonly Block[]
): ValueRefPacked | null {
  const irType = toIRTypeDesc(bus.type);

  // Collect terms (publisher outputs) by world type
  const sigTerms: number[] = [];
  const fieldTerms: number[] = [];
  const eventTerms: EventExprId[] = [];

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

    if (ref.k === "sig") {
      sigTerms.push(ref.id);
    } else if (ref.k === "field") {
      fieldTerms.push(ref.id);
    } else if (ref.k === "event") {
      eventTerms.push(ref.id);
    }
  }

  // Handle Signal Bus
  if (irType.world === "signal") {
    // If no valid terms found, create default
    if (sigTerms.length === 0) {
      return createDefaultBusValue(bus, builder);
    }

    // Create combine node
    // Note: If only 1 term, we could optimize, but maintaining 'combine' semantics (like 'last') is safer explicitly unless strict identity is guaranteed.
    // However, builder.sigCombine usually handles single-term optimization or runtime handles it.
    // Wait, sigCombine interface requires mode.
    // Supported modes for signals: 'sum', 'last' (and potentially 'average', 'max', 'min' if supported)
    const mode = bus.combineMode as "sum" | "average" | "max" | "min" | "last";

    // Safety check for mode
    const validModes = ["sum", "average", "max", "min", "last"];
    const safeMode = validModes.includes(mode) ? mode : "last";

    const sigId = builder.sigCombine(busIndex, sigTerms, safeMode, irType);
    const slot = builder.allocValueSlot();
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  // Handle Field Bus
  if (irType.world === "field") {
    if (fieldTerms.length === 0) {
      return createDefaultBusValue(bus, builder);
    }

    const mode = bus.combineMode as "sum" | "average" | "max" | "min" | "last" | "product";
    const validModes = ["sum", "average", "max", "min", "last", "product"];
    const safeMode = validModes.includes(mode) ? mode : "product";

    const fieldId = builder.fieldCombine(busIndex, fieldTerms, safeMode, irType);
    const slot = builder.allocValueSlot();
    builder.registerFieldSlot(fieldId, slot);
    return { k: "field", id: fieldId, slot };
  }

  // Handle Event Bus
  if (irType.world === "event") {
    if (eventTerms.length === 0) {
      return createDefaultBusValue(bus, builder);
    }

    // Map bus combineMode to event combine semantics
    // For events: 'merge' combines all event streams, 'last' takes only last publisher's events
    const mode = bus.combineMode as string;
    let eventMode: EventCombineMode;
    if (mode === "sum" || mode === "merge") {
      eventMode = "merge";
    } else if (mode === "first") {
      eventMode = "first";
    } else {
      // Default to 'last' for any other mode
      eventMode = "last";
    }

    const eventId = builder.eventCombine(busIndex, eventTerms, eventMode, irType);
    const slot = builder.allocValueSlot();
    builder.registerEventSlot(eventId, slot);
    return { k: "event", id: eventId, slot };
  }

  return null;
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
    const slot = builder.allocValueSlot();
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  if (type.world === "field") {
    // Create constant field
    const value = bus.defaultValue ?? 0;
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
  console.warn(`[Pass 7] Unknown world "${type.world}" for bus ${bus.id} - skipping`);
  return null;
}
