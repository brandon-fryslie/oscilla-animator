/**
 * Semantic Kernel Types
 *
 * Core type definitions for the shared validation and semantics layer.
 * This module provides the single source of truth for graph validation,
 * used by both the editor mutation layer and the compiler.
 *
 * Key principles:
 * - One ruleset, three consumers (UI, Compiler, Diagnostics)
 * - Validation is incremental and local where possible
 * - Clear separation between structural validity (prevent) and runtime warnings (allow)
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/5-DivergentTypes.md
 *
 * NOTE: This module is currently in transition after Bus-Block unification.
 * Many types and functions here are obsolete or need updating to work with
 * the new Edge-based architecture where buses are BusBlocks.
 */

import type { BlockId, Edge } from '../types';
import type { Diagnostic } from '../diagnostics/types';

// =============================================================================
// Validation Result
// =============================================================================

/**
 * Result of a validation operation.
 * Contains errors, warnings, and optional suggested fixes.
 */
export interface ValidationResult {
  /** Whether the operation is allowed (no errors) */
  ok: boolean;

  /** Blocking errors that prevent the operation */
  errors: Diagnostic[];

  /** Non-blocking warnings */
  warnings: Diagnostic[];

  /** Optional suggested fixes for errors */
  fixes?: SuggestedFix[];
}

/**
 * A suggested fix for a validation error.
 */
export interface SuggestedFix {
  /** Human-readable description */
  description: string;

  /** Type of fix */
  kind: 'replace' | 'remove' | 'add' | 'modify';

  /** The fix action (opaque for now, will tie into operation system later) */
  action: unknown;
}

// =============================================================================
// Graph Node Types
// =============================================================================

/**
 * Block node in the semantic graph.
 */
export interface BlockNode {
  kind: 'block';
  blockId: BlockId;
  blockType: string;
}

/**
 * Port identifier within a block.
 * Uses canonical slotId + direction for stable identity.
 */
export interface PortKey {
  blockId: BlockId;
  slotId: string;
  direction: 'input' | 'output';
}

/**
 * Port node in the semantic graph.
 */
export interface PortNode {
  kind: 'port';
  key: PortKey;
  slotType: string;
}

/**
 * Bus node in the semantic graph.
 * NOTE: After Bus-Block unification, buses are now regular blocks with type='BusBlock'.
 * This type may become obsolete.
 */
export interface BusNode {
  kind: 'bus';
  busId: string;
}

/**
 * Union of all graph node types.
 */
export type GraphNode = BlockNode | PortNode | BusNode;

// =============================================================================
// Graph Edge Types
// =============================================================================

/**
 * Wire edge - connects two ports via an Edge.
 * After bus-block unification, ALL edges are wire edges (port-to-port).
 * Buses are now BusBlocks with input/output ports like any other block.
 */
export interface WireEdge {
  kind: 'wire';
  connectionId: string;
  from: PortKey;
  to: PortKey;
}

/**
 * Graph edge type. After bus-block unification, all edges are wire edges.
 */
export type GraphEdge = WireEdge;

// =============================================================================
// Patch Document (Minimal Interface)
// =============================================================================

/**
 * Minimal patch document interface for semantic graph construction.
 * This is a subset of the full Patch type, containing only what's
 * needed for validation.
 *
 * UPDATED: After Bus-Block unification (2026-01-02)
 * - connections → edges
 * - buses/publishers/listeners removed (now just blocks + edges)
 */
export interface PatchDocument {
  blocks: ReadonlyArray<{
    readonly id: BlockId;
    readonly type: string;
    readonly inputs: ReadonlyArray<{ readonly id: string; readonly type: string }>;
    readonly outputs: ReadonlyArray<{ readonly id: string; readonly type: string }>;
  }>;
  edges: readonly Edge[];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a PortKey to a stable string representation.
 * Format: "blockId:slotId:direction"
 */
export function portKeyToString(key: PortKey): string {
  return `${key.blockId}:${key.slotId}:${key.direction}`;
}

/**
 * Parse a port key string back to a PortKey object.
 */
export function stringToPortKey(str: string): PortKey | null {
  const parts = str.split(':');
  if (parts.length !== 3) return null;
  const [blockId, slotId, direction] = parts;
  if (direction !== 'input' && direction !== 'output') return null;
  return { blockId: blockId, slotId: slotId, direction };
}

/**
 * Create a PortKey for an edge endpoint.
 * NOTE: Updated for new Edge structure after unification.
 * Direction is inferred: 'from' is always output, 'to' is always input.
 */
export function portKeyFromEdge(
  edge: Edge,
  end: 'from' | 'to'
): PortKey {
  const endpoint = edge[end];
  return {
    blockId: endpoint.blockId,
    slotId: endpoint.slotId,
    direction: end === 'from' ? 'output' : 'input',
  };
}

