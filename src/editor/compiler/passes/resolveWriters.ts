/**
 * Writer Resolution - Shared logic for resolving multiple value sources to inputs
 *
 * This module implements the canonical writer resolution model from the
 * Multi-Input Blocks specification. It handles:
 * - Enumerating all writers to an input endpoint (wires, bus listeners, defaults)
 * - Deterministic ordering for stable combine semantics
 * - Combine policy resolution and validation
 *
 * Used by:
 * - pass6-block-lowering.ts (IR compilation path)
 * - compileBusAware.ts (legacy path, to be deprecated)
 *
 * Sprint: Multi-Input Blocks Phase 1
 * References:
 * - design-docs/now/01-MultiBlock-Input.md §2-3 (Writer types and ordering)
 * - design-docs/now/01-MultiBlock-Input.md §9.1 (Implementation plan)
 */

import type {
  Edge,
  Slot,
  Block,
  TypeDesc,
} from '../../types';
import { getBlockDefinition } from '../../blocks/registry';
import type { CombinePolicy } from './combine-utils';

// =============================================================================
// Types
// =============================================================================

/**
 * Input endpoint identifier.
 */
export interface InputEndpoint {
  readonly blockId: string;
  readonly slotId: string;
}

/**
 * Writer discriminated union.
 *
 * Represents a single source that writes to an input endpoint.
 * Can be:
 * - Wire: Direct connection from another block's output (includes BusBlock.out edges)
 * - Default: Compiler-injected default source
 *
 * After Sprint 2 migration, all edges are port→port. BusBlock.out edges are
 * wire writers like any other port edge. The 'bus' kind is no longer needed.
 */
export type Writer =
  | { kind: 'wire'; from: { blockId: string; slotId: string }; connId: string }
  | { kind: 'default'; defaultId: string; type: TypeDesc };

/**
 * Resolved input specification.
 *
 * Contains all writers to an input endpoint, sorted deterministically,
 * plus the combine policy for merging them.
 */
export interface ResolvedInputSpec {
  /** Target input endpoint */
  readonly endpoint: InputEndpoint;

  /** Type of the input port */
  readonly portType: TypeDesc;

  /** All writers to this input (length >= 1 after defaults injected) */
  readonly writers: readonly Writer[];

  /** Combine policy (from Slot.combine or default) */
  readonly combine: CombinePolicy;
}

// =============================================================================
// Writer Sort Key (Deterministic Ordering)
// =============================================================================

/**
 * Get deterministic sort key for a writer.
 *
 * Sort order (ascending):
 * 1. Wires: "0:{from.blockId}:{from.slotId}:{connId}"
 * 2. Bus listeners: "1:{busId}:{listenerId}"
 * 3. Defaults: "2:{defaultId}"
 *
 * This ensures:
 * - Order-dependent modes ('last', 'first', 'layer') are deterministic
 * - Not dependent on insertion order, UI quirks, or JSON array order
 *
 * @see design-docs/now/01-MultiBlock-Input.md §3.1
 */
export function writerSortKey(w: Writer): string {
  switch (w.kind) {
    case 'wire':
      // Wire includes BusBlock.out edges after Sprint 2 migration
      return `0:${w.from.blockId}:${w.from.slotId}:${w.connId}`;
    case 'default':
      return `1:${w.defaultId}`;
  }
}

/**
 * Sort writers deterministically.
 *
 * Sorts by ascending writerSortKey(), ensuring stable order for
 * order-dependent combine modes.
 */
export function sortWriters(writers: readonly Writer[]): Writer[] {
  return [...writers].sort((a, b) => {
    const keyA = writerSortKey(a);
    const keyB = writerSortKey(b);
    return keyA.localeCompare(keyB);
  });
}

// =============================================================================
// Writer Enumeration
// =============================================================================

/**
 * Enumerate all writers to an input endpoint.
 *
 * Collects writers from:
 * 1. Wires (direct port → port connections)
 * 2. Bus listeners (bus → port connections)
 * 3. Default sources (if N=0 writers, inject default)
 *
 * Writers are NOT sorted here - call sortWriters() separately.
 *
 * @param endpoint - Target input endpoint
 * @param edges - All edges in the patch
 * @param inputSlot - The input slot definition (for default source)
 * @returns Array of writers (unsorted, may be empty)
 */
export function enumerateWriters(
  endpoint: InputEndpoint,
  edges: readonly Edge[],
  inputSlot: Slot
): Writer[] {
  const writers: Writer[] = [];

  // Enumerate edges to this endpoint
  for (const edge of edges) {
    // Skip disabled edges
    if (!edge.enabled) continue;

    // Check if this edge targets our endpoint
    if (edge.to.kind !== 'port') continue;
    if (edge.to.blockId !== endpoint.blockId) continue;
    if (edge.to.slotId !== endpoint.slotId) continue;

    // After Sprint 2 migration, all edges are port→port (including BusBlock.out edges)
    if (edge.from.kind === 'port') {
      writers.push({
        kind: 'wire',
        from: { blockId: edge.from.blockId, slotId: edge.from.slotId },
        connId: edge.id,
      });
    }
    // Note: edge.from.kind === 'bus' no longer exists after migration
  }

  // If no writers, inject default source
  if (writers.length === 0 && inputSlot.defaultSource !== undefined) {
    const defaultId = `default:${endpoint.blockId}:${endpoint.slotId}`;
    // inputSlot.type is now TypeDesc object
    const slotTypeDesc = inputSlot.type;

    writers.push({
      kind: 'default',
      defaultId,
      type: slotTypeDesc,
    });
  }

  return writers;
}

// =============================================================================
// Combine Policy Resolution
// =============================================================================

/**
 * Get default combine policy.
 *
 * Default: { when: 'multi', mode: 'last' }
 *
 * This keeps "plumbing" painless and preserves deterministic behavior.
 *
 * @see design-docs/now/01-MultiBlock-Input.md §1.2
 */
export function getDefaultCombinePolicy(): CombinePolicy {
  return { when: 'multi', mode: 'last' };
}

/**
 * Resolve combine policy for an input slot.
 *
 * NOTE: Slot no longer has a 'combine' property after Bus interface simplification.
 * All slots now use the default combine policy.
 *
 * @param _inputSlot - The input slot definition (unused after Slot.combine removal)
 * @returns Combine policy (always default)
 */
export function resolveCombinePolicy(_inputSlot: Slot): CombinePolicy {
  // Slot.combine was removed - all regular slots use default policy
  // Bus-specific combine logic is handled separately in bus lowering
  return getDefaultCombinePolicy();
}

// =============================================================================
// Full Resolution
// =============================================================================

/**
 * Resolve all inputs for a block.
 *
 * For each input slot:
 * 1. Enumerate writers (wires, bus listeners, defaults)
 * 2. Sort writers deterministically
 * 3. Resolve combine policy
 * 4. Return ResolvedInputSpec
 *
 * @param block - Block instance
 * @param edges - All edges in the patch
 * @returns Map of slotId → ResolvedInputSpec
 */
export function resolveBlockInputs(
  block: Block,
  edges: readonly Edge[]
): Map<string, ResolvedInputSpec> {
  const resolved = new Map<string, ResolvedInputSpec>();

  const blockDef = getBlockDefinition(block.type);
  if (!blockDef) return resolved;

  for (const inputSlot of blockDef.inputs) {
    const endpoint: InputEndpoint = {
      blockId: block.id,
      slotId: inputSlot.id,
    };

    // Enumerate writers
    const writers = enumerateWriters(endpoint, edges, inputSlot);

    // Sort deterministically
    const sortedWriters = sortWriters(writers);

    // Resolve combine policy
    const combine = resolveCombinePolicy(inputSlot);

    // Get port type - inputSlot.type is now TypeDesc object
    const portType = inputSlot.type;

    // Build resolved spec
    resolved.set(inputSlot.id, {
      endpoint,
      portType,
      writers: sortedWriters,
      combine,
    });
  }

  return resolved;
}

/**
 * Resolve a single input endpoint.
 *
 * Convenience function for resolving a specific input port.
 *
 * @param endpoint - Target input endpoint
 * @param edges - All edges in the patch
 * @param inputSlot - The input slot definition
 * @returns Resolved input spec
 */
export function resolveInput(
  endpoint: InputEndpoint,
  edges: readonly Edge[],
  inputSlot: Slot
): ResolvedInputSpec {
  // Enumerate writers
  const writers = enumerateWriters(endpoint, edges, inputSlot);

  // Sort deterministically
  const sortedWriters = sortWriters(writers);

  // Resolve combine policy
  const combine = resolveCombinePolicy(inputSlot);

  // Get port type - inputSlot.type is now TypeDesc object
  const portType = inputSlot.type;

  return {
    endpoint,
    portType,
    writers: sortedWriters,
    combine,
  };
}
