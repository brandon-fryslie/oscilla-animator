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
 */

import type { BlockId, Connection, Publisher, Listener, Bus } from '../types';
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
 * Wire edge - connects two ports via a Connection.
 */
export interface WireEdge {
  kind: 'wire';
  connectionId: string;
  from: PortKey;
  to: PortKey;
}

/**
 * Publisher edge - connects a port to a bus.
 */
export interface PublisherEdge {
  kind: 'publisher';
  publisherId: string;
  from: PortKey;
  busId: string;
  sortKey: number;
}

/**
 * Listener edge - connects a bus to a port.
 */
export interface ListenerEdge {
  kind: 'listener';
  listenerId: string;
  busId: string;
  to: PortKey;
}

/**
 * Union of all graph edge types.
 */
export type GraphEdge = WireEdge | PublisherEdge | ListenerEdge;

// =============================================================================
// Patch Document (Minimal Interface)
// =============================================================================

/**
 * Minimal patch document interface for semantic graph construction.
 * This is a subset of the full Patch type, containing only what's
 * needed for validation.
 */
export interface PatchDocument {
  blocks: ReadonlyArray<{
    readonly id: BlockId;
    readonly type: string;
    readonly inputs: ReadonlyArray<{ readonly id: string; readonly type: string }>;
    readonly outputs: ReadonlyArray<{ readonly id: string; readonly type: string }>;
  }>;
  connections: readonly Connection[];
  buses: readonly Bus[];
  publishers: readonly Publisher[];
  listeners: readonly Listener[];
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
  return { blockId: blockId!, slotId: slotId!, direction };
}

/**
 * Create a PortKey for a connection endpoint.
 */
export function portKeyFromConnection(
  connection: Connection,
  end: 'from' | 'to'
): PortKey {
  const endpoint = connection[end];
  return {
    blockId: endpoint.blockId,
    slotId: endpoint.slotId,
    direction: endpoint.direction,
  };
}

/**
 * Create a PortKey from a Publisher endpoint.
 */
export function portKeyFromPublisher(publisher: Publisher): PortKey {
  return {
    blockId: publisher.from.blockId,
    slotId: publisher.from.slotId,
    direction: 'output',
  };
}

/**
 * Create a PortKey from a Listener endpoint.
 */
export function portKeyFromListener(listener: Listener): PortKey {
  return {
    blockId: listener.to.blockId,
    slotId: listener.to.slotId,
    direction: 'input',
  };
}
