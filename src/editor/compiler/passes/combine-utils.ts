/**
 * Combine Utilities - Shared logic for combining multiple value sources
 *
 * This module extracts the battle-tested combine logic from Pass 7 (bus lowering)
 * to be reusable by Pass 6 (multi-input port resolution).
 *
 * Key responsibilities:
 * - Create combine nodes for Signal/Field/Event worlds
 * - Validate combineMode against world/domain constraints
 * - Handle edge ordering for deterministic combine (sortKey)
 * - Support all combine modes (sum, average, max, min, last, layer)
 *
 * Sprint: Phase 0 - Sprint 3: Multi-Input Blocks
 * Extracted from: pass7-bus-lowering.ts (lines 230-330)
 */

import type { BusCombineMode, Edge, SlotWorld } from "../../types";
import type { TypeDesc, CoreDomain } from "../../../core/types";
import type { IRBuilder } from "../ir/IRBuilder";
import type { ValueRefPacked } from "./pass6-block-lowering";
import type { EventExprId } from "../ir/types";
import type { EventCombineMode } from "../ir/signalExpr";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of combine mode validation.
 */
export interface CombineModeValidation {
  /** Whether the combine mode is valid for this world/domain */
  valid: boolean;
  /** Human-readable reason if invalid */
  reason?: string;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that a combine mode is compatible with a slot's world and domain.
 *
 * Validation rules:
 * - 'last' is always valid (all worlds/domains)
 * - Signal/Field worlds: All modes valid
 * - Config world: Only 'last' valid (stepwise changes)
 * - Scalar world: Multi-input not allowed (should emit error if N > 1)
 * - Numeric domains (float, int, vec2, vec3): All modes valid
 * - Color domain: Only 'last' and 'layer' valid
 * - String/boolean domains: Only 'last' valid
 *
 * @param mode - The combine mode to validate
 * @param world - The slot's world (signal, field, config, scalar)
 * @param domain - The slot's domain (float, color, vec2, etc.)
 * @returns Validation result with reason if invalid
 */
export function validateCombineMode(
  mode: BusCombineMode,
  world: SlotWorld,
  domain: CoreDomain
): CombineModeValidation {
  // 'last' is always valid for all worlds and domains
  if (mode === 'last') {
    return { valid: true };
  }

  // Scalar world doesn't support multi-input at all
  if (world === 'scalar') {
    return {
      valid: false,
      reason: 'Scalar inputs cannot have multiple sources (compile-time constants)',
    };
  }

  // Config world only supports 'last' (stepwise changes)
  if (world === 'config') {
    return {
      valid: false,
      reason: 'Config inputs only support combineMode "last" (stepwise changes)',
    };
  }

  // Domain-specific validation for signal/field worlds
  const numericDomains: CoreDomain[] = ['float', 'int', 'vec2', 'vec3'];
  if (numericDomains.includes(domain)) {
    // Numeric domains support all combine modes
    return { valid: true };
  }

  if (domain === 'color') {
    // Color domain only supports 'last' and 'layer'
    if (mode === 'layer') {
      return { valid: true };
    }
    return {
      valid: false,
      reason: 'Color domain only supports combineMode "last" and "layer"',
    };
  }

  // String, boolean, and other domains only support 'last'
  return {
    valid: false,
    reason: `Domain "${domain}" only supports combineMode "last"`,
  };
}

// =============================================================================
// Combine Node Creation
// =============================================================================

/**
 * Create a combine node for N inputs with the specified combine mode.
 *
 * This is the core combine logic extracted from Pass 7 bus lowering.
 * Handles Signal, Field, and Event worlds with all combine modes.
 *
 * Edge ordering:
 * - Inputs are assumed to be pre-sorted by the caller
 * - For 'last' and 'layer' modes, order matters (last input wins)
 * - For commutative modes (sum, average, max, min), order doesn't affect result
 *
 * Special cases:
 * - N=0: Returns null (caller should use defaultSource)
 * - N=1: Caller should optimize by using direct passthrough
 *
 * @param mode - Combine mode (sum, average, max, min, last, layer)
 * @param inputs - Pre-sorted input ValueRefs (ascending sortKey, ties by edge ID)
 * @param type - Type descriptor (world, domain, category)
 * @param builder - IRBuilder for emitting nodes
 * @param busIndex - Optional bus index for tracking (Pass 7 only)
 * @returns Combined ValueRefPacked or null if no inputs
 */
export function createCombineNode(
  mode: BusCombineMode,
  inputs: readonly ValueRefPacked[],
  type: TypeDesc,
  builder: IRBuilder,
  busIndex?: number
): ValueRefPacked | null {
  // Handle empty inputs - caller should materialize default
  if (inputs.length === 0) {
    return null;
  }

  // Note: Caller should handle N=1 case with direct passthrough for optimization.
  // We still create a combine node here for semantic clarity (e.g., 'last' of 1 item).

  // Collect terms by world type
  const sigTerms: number[] = [];
  const fieldTerms: number[] = [];
  const eventTerms: EventExprId[] = [];

  for (const ref of inputs) {
    if (ref.k === "sig") {
      sigTerms.push(ref.id);
    } else if (ref.k === "field") {
      fieldTerms.push(ref.id);
    } else if (ref.k === "event") {
      eventTerms.push(ref.id);
    }
  }

  // Handle Signal world
  if (type.world === "signal") {
    if (sigTerms.length === 0) {
      return null; // No valid signal terms
    }

    // Map BusCombineMode to Signal combine mode
    const validModes = ["sum", "average", "max", "min", "last"];
    const safeMode = validModes.includes(mode) ? mode : "last";
    const combineMode = safeMode as "sum" | "average" | "max" | "min" | "last";

    const sigId = builder.sigCombine(busIndex ?? -1, sigTerms, combineMode, type);
    const slot = builder.allocValueSlot();
    builder.registerSigSlot(sigId, slot);
    return { k: "sig", id: sigId, slot };
  }

  // Handle Field world
  if (type.world === "field") {
    if (fieldTerms.length === 0) {
      return null; // No valid field terms
    }

    // Map BusCombineMode to Field combine mode
    const validModes = ["sum", "average", "max", "min", "last", "product"];
    const safeMode = validModes.includes(mode) ? mode : "product";
    const combineMode = safeMode as "sum" | "average" | "max" | "min" | "last" | "product";

    const fieldId = builder.fieldCombine(busIndex ?? -1, fieldTerms, combineMode, type);
    const slot = builder.allocValueSlot();
    builder.registerFieldSlot(fieldId, slot);
    return { k: "field", id: fieldId, slot };
  }

  // Handle Event world
  if (type.world === "event") {
    if (eventTerms.length === 0) {
      return null; // No valid event terms
    }

    // Map bus combineMode to event combine semantics
    // For events: 'merge' combines all streams, 'last' takes only last publisher
    const eventMode: EventCombineMode = mode === 'last' ? 'last' : 'merge';
    const eventId = builder.eventCombine(busIndex ?? -1, eventTerms, eventMode, type);
    const slot = builder.allocValueSlot();
    builder.registerEventSlot(eventId, slot);
    return { k: "event", id: eventId, slot };
  }

  // Unsupported world
  return null;
}

/**
 * Sort edges by sortKey (ascending), breaking ties by edge ID.
 *
 * This ensures deterministic ordering for combine modes where order matters
 * ('last', 'layer'). The last edge in the sorted array "wins" for 'last' mode.
 *
 * @param edges - Edges to sort
 * @returns Sorted edges (ascending sortKey, ties broken by ID)
 */
export function sortEdgesBySortKey(edges: readonly Edge[]): Edge[] {
  return [...edges].sort((a, b) => {
    // Sort by sortKey (ascending)
    const sortKeyA = a.sortKey ?? 0;
    const sortKeyB = b.sortKey ?? 0;
    if (sortKeyA !== sortKeyB) {
      return sortKeyA - sortKeyB;
    }
    // Break ties by edge ID (lexicographic)
    return a.id.localeCompare(b.id);
  });
}
