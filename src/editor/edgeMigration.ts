/**
 * Edge Migration Helpers
 *
 * Conversion functions between the unified Edge type and deprecated
 * Connection/Publisher/Listener types.
 *
 * Sprint: Phase 0 - Sprint 1: Unify Connections → Edge Type
 * References:
 * - .agent_planning/phase0-architecture-refactoring/PLAN-2025-12-31-170000-sprint1-connections.md
 * - .agent_planning/phase0-architecture-refactoring/DOD-2025-12-31-170000-sprint1-connections.md
 */

import type {
  Edge,
  Endpoint,
  Connection,
  Publisher,
  Listener,
  PortRef,
} from './types';
import { convertLegacyTransforms } from './transforms/migrate';

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate an edge - ensures bus→bus connections are rejected.
 *
 * @param edge - The edge to validate
 * @throws Error if edge is invalid (bus→bus connection)
 */
export function validateEdge(edge: Edge): void {
  if (edge.from.kind === 'bus' && edge.to.kind === 'bus') {
    throw new Error(
      `Invalid edge ${edge.id}: bus→bus connections are not allowed. ` +
      `Use intermediate blocks to connect buses.`
    );
  }
}

// =============================================================================
// Forward Migration: Old Types → Edge
// =============================================================================

/**
 * Convert a Connection (port→port) to an Edge.
 *
 * @param conn - The connection to convert
 * @returns An Edge with port endpoints
 */
export function connectionToEdge(conn: Connection): Edge {
  const from: Endpoint = {
    kind: 'port',
    blockId: conn.from.blockId,
    slotId: conn.from.slotId,
  };

  const to: Endpoint = {
    kind: 'port',
    blockId: conn.to.blockId,
    slotId: conn.to.slotId,
  };

  const edge: Edge = {
    id: conn.id,
    from,
    to,
    lensStack: conn.lensStack,
    adapterChain: conn.adapterChain,
    enabled: conn.enabled ?? true,
    transforms: convertLegacyTransforms(conn.lensStack, conn.adapterChain),
  };

  validateEdge(edge);
  return edge;
}

/**
 * Convert a Publisher (port→bus) to an Edge.
 *
 * @param pub - The publisher to convert
 * @returns An Edge with port source and bus destination
 */
export function publisherToEdge(pub: Publisher): Edge {
  const from: Endpoint = {
    kind: 'port',
    blockId: pub.from.blockId,
    slotId: pub.from.slotId,
  };

  const to: Endpoint = {
    kind: 'bus',
    busId: pub.busId,
  };

  const edge: Edge = {
    id: pub.id,
    from,
    to,
    lensStack: pub.lensStack,
    adapterChain: pub.adapterChain,
    enabled: pub.enabled,
    weight: pub.weight,
    sortKey: pub.sortKey,
    transforms: convertLegacyTransforms(pub.lensStack, pub.adapterChain),
  };

  validateEdge(edge);
  return edge;
}

/**
 * Convert a Listener (bus→port) to an Edge.
 *
 * @param listener - The listener to convert
 * @returns An Edge with bus source and port destination
 */
export function listenerToEdge(listener: Listener): Edge {
  const from: Endpoint = {
    kind: 'bus',
    busId: listener.busId,
  };

  const to: Endpoint = {
    kind: 'port',
    blockId: listener.to.blockId,
    slotId: listener.to.slotId,
  };

  const edge: Edge = {
    id: listener.id,
    from,
    to,
    lensStack: listener.lensStack,
    adapterChain: listener.adapterChain,
    enabled: listener.enabled,
    transforms: convertLegacyTransforms(listener.lensStack, listener.adapterChain),
  };

  validateEdge(edge);
  return edge;
}

// =============================================================================
// Reverse Migration: Edge → Old Types
// =============================================================================

/**
 * Convert an Edge to a Connection if it's a port→port edge.
 * Returns null if the edge is not a port→port connection.
 *
 * @param edge - The edge to convert
 * @returns A Connection or null
 */
export function edgeToConnection(edge: Edge): Connection | null {
  if (edge.from.kind !== 'port' || edge.to.kind !== 'port') {
    return null;
  }

  const from: PortRef = {
    blockId: edge.from.blockId,
    slotId: edge.from.slotId,
    direction: 'output',
  };

  const to: PortRef = {
    blockId: edge.to.blockId,
    slotId: edge.to.slotId,
    direction: 'input',
  };

  return {
    id: edge.id,
    from,
    to,
    lensStack: edge.lensStack,
    adapterChain: edge.adapterChain,
    enabled: edge.enabled,
  };
}

/**
 * Convert an Edge to a Publisher if it's a port→bus edge.
 * Returns null if the edge is not a port→bus connection.
 *
 * @param edge - The edge to convert
 * @returns A Publisher or null
 */
export function edgeToPublisher(edge: Edge): Publisher | null {
  if (edge.from.kind !== 'port' || edge.to.kind !== 'bus') {
    return null;
  }

  const from: PortRef = {
    blockId: edge.from.blockId,
    slotId: edge.from.slotId,
    direction: 'output',
  };

  return {
    id: edge.id,
    busId: edge.to.busId,
    from,
    lensStack: edge.lensStack,
    adapterChain: edge.adapterChain,
    enabled: edge.enabled,
    weight: edge.weight,
    sortKey: edge.sortKey ?? 0,
  };
}

/**
 * Convert an Edge to a Listener if it's a bus→port edge.
 * Returns null if the edge is not a bus→port connection.
 *
 * @param edge - The edge to convert
 * @returns A Listener or null
 */
export function edgeToListener(edge: Edge): Listener | null {
  if (edge.from.kind !== 'bus' || edge.to.kind !== 'port') {
    return null;
  }

  const to: PortRef = {
    blockId: edge.to.blockId,
    slotId: edge.to.slotId,
    direction: 'input',
  };

  return {
    id: edge.id,
    busId: edge.from.busId,
    to,
    lensStack: edge.lensStack,
    adapterChain: edge.adapterChain,
    enabled: edge.enabled,
  };
}

// =============================================================================
// Batch Conversion Helpers
// =============================================================================

/**
 * Convert all old-style connections to edges.
 *
 * @param connections - Array of connections
 * @param publishers - Array of publishers
 * @param listeners - Array of listeners
 * @returns Array of unified edges
 */
export function convertToEdges(
  connections: Connection[],
  publishers: Publisher[],
  listeners: Listener[]
): Edge[] {
  const edges: Edge[] = [];

  // Convert all connections
  for (const conn of connections) {
    edges.push(connectionToEdge(conn));
  }

  // Convert all publishers
  for (const pub of publishers) {
    edges.push(publisherToEdge(pub));
  }

  // Convert all listeners
  for (const listener of listeners) {
    edges.push(listenerToEdge(listener));
  }

  return edges;
}

/**
 * Convert edges back to old-style connection arrays.
 * Used for backward compatibility during migration.
 *
 * @param edges - Array of unified edges
 * @returns Object with separated connections, publishers, and listeners
 */
export function convertFromEdges(edges: Edge[]): {
  connections: Connection[];
  publishers: Publisher[];
  listeners: Listener[];
} {
  const connections: Connection[] = [];
  const publishers: Publisher[] = [];
  const listeners: Listener[] = [];

  for (const edge of edges) {
    const conn = edgeToConnection(edge);
    if (conn) {
      connections.push(conn);
      continue;
    }

    const pub = edgeToPublisher(edge);
    if (pub) {
      publishers.push(pub);
      continue;
    }

    const listener = edgeToListener(edge);
    if (listener) {
      listeners.push(listener);
      continue;
    }

    // This should never happen if validateEdge is working correctly
    console.warn(`Edge ${edge.id} could not be converted to any old type`);
  }

  return { connections, publishers, listeners };
}
