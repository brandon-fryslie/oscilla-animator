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

import type { BlockId, Connection, Publisher, Listener, Bus, PortRef, PortKey } from '../types';
import { portRefToKey, portKeyToRef } from '../types';
import type { Diagnostic } from '../diagnostics/types';

// Export utilities from here as well for convenience
export { portRefToKey, portKeyToRef };
export type { PortKey };

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
 * Port node in the semantic graph.
 */
export interface PortNode {
  kind: 'port';
  key: PortRef;
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
  from: PortRef;
  to: PortRef;
}

/**
 * Publisher edge - connects a port to a bus.
 */
export interface PublisherEdge {
  kind: 'publisher';
  publisherId: string;
  from: PortRef;
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
  to: PortRef;
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
  buses?: readonly Bus[];
  publishers?: readonly Publisher[];
  listeners?: readonly Listener[];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a PortRef for a connection endpoint.
 */
export function portRefFromConnection(
  connection: Connection,
  end: 'from' | 'to'
): PortRef {
  const endpoint = connection[end];
  return {
    blockId: endpoint.blockId,
    slotId: endpoint.slotId,
    direction: end === 'from' ? 'output' : 'input',
  };
}

/**
 * Create a PortRef from a Publisher endpoint.
 */
export function portRefFromPublisher(publisher: Publisher): PortRef {
  return publisher.from;
}

/**
 * Create a PortRef from a Listener endpoint.
 */
export function portRefFromListener(listener: Listener): PortRef {
  return listener.to;
}
