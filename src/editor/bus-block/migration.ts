/**
 * Edge Migration - Convert Endpoint Union to PortRef Only
 *
 * Sprint: Bus-Block Unification - Sprint 1 (Foundation)
 * Created: 2026-01-01
 *
 * Migrates edges from the old Endpoint discriminated union (port | bus) to
 * using PortRef only. This is the foundational migration that enables the
 * compiler to treat buses as regular blocks.
 *
 * Migration strategy:
 * 1. Convert all buses to BusBlocks
 * 2. Publisher edges (port→bus) become port→BusBlock.in
 * 3. Listener edges (bus→port) become BusBlock.out→port
 * 4. Wire edges (port→port) remain unchanged
 */

import type { Endpoint, Edge, Block, Bus } from '../types';
import { convertBusToBlock } from './conversion';

/**
 * Patch interface with buses array.
 * This represents the old format before bus-block unification.
 */
interface LegacyPatch {
  blocks: Block[];
  buses: Bus[];
  edges: Edge[];
}

/**
 * Patch interface after migration.
 * Buses are now BusBlocks in the blocks array.
 */
interface MigratedPatch {
  blocks: Block[];
  buses: Bus[]; // Empty after migration
  edges: Edge[];
}

/**
 * Simple port reference without Endpoint wrapper.
 * After migration, all edges use this format.
 */
interface SimplePortRef {
  readonly blockId: string;
  readonly slotId: string;
}

/**
 * Migrate an endpoint from the old discriminated union format to simple PortRef.
 *
 * @param endpoint - Original endpoint (port | bus)
 * @param busBlocks - Map of bus IDs to converted BusBlocks
 * @param direction - Whether this endpoint is source ('from') or destination ('to')
 * @returns Simple port reference
 */
function migrateEndpoint(
  endpoint: Endpoint,
  busBlocks: Map<string, Block>,
  direction: 'from' | 'to'
): SimplePortRef {
  if (endpoint.kind === 'port') {
    // Port→Port edges remain unchanged
    return {
      blockId: endpoint.blockId,
      slotId: endpoint.slotId,
    };
  }

  // endpoint.kind === 'bus'
  const busBlock = busBlocks.get(endpoint.busId);
  if (busBlock === undefined) {
    throw new Error(`Cannot migrate endpoint: bus "${endpoint.busId}" not found`);
  }

  // For 'from' (source): use BusBlock output (bus→port becomes BusBlock.out→port)
  // For 'to' (destination): use BusBlock input (port→bus becomes port→BusBlock.in)
  return {
    blockId: busBlock.id,
    slotId: direction === 'from' ? 'out' : 'in',
  };
}

/**
 * Migrate all edges from Endpoint union to PortRef only.
 *
 * This is the core migration function that:
 * 1. Converts all buses to BusBlocks
 * 2. Adds BusBlocks to the blocks array
 * 3. Migrates all edges to use only port references
 * 4. Empties the buses array
 *
 * @param patch - Original patch with buses and Endpoint-based edges
 * @returns Migrated patch with BusBlocks and PortRef-only edges
 */
export function migrateEdgesToPortOnly(patch: LegacyPatch): MigratedPatch {
  // Step 1: Convert all buses to BusBlocks
  const busBlocks = new Map<string, Block>();
  for (const bus of patch.buses) {
    const busBlock = convertBusToBlock(bus);
    busBlocks.set(bus.id, busBlock);
  }

  // Step 2: Add BusBlocks to blocks array
  const blocks = [...patch.blocks, ...Array.from(busBlocks.values())];

  // Step 3: Migrate edges
  const edges = patch.edges.map(edge => {
    // Migrate both endpoints
    const from = migrateEndpoint(edge.from, busBlocks, 'from');
    const to = migrateEndpoint(edge.to, busBlocks, 'to');

    // Create new edge with migrated endpoints
    // The endpoints are now simple { blockId, slotId } objects
    return {
      ...edge,
      from: { kind: 'port' as const, ...from },
      to: { kind: 'port' as const, ...to },
    };
  });

  // Step 4: Return migrated patch (buses array now empty)
  return {
    blocks,
    edges,
    buses: [], // All buses are now BusBlocks
  };
}

/**
 * Check if a patch has already been migrated.
 *
 * A migrated patch has:
 * - No buses in the buses array
 * - All edges with kind='port' endpoints
 *
 * @param patch - Patch to check
 * @returns true if patch has been migrated
 */
export function isMigrated(patch: LegacyPatch | MigratedPatch): boolean {
  // Check if buses array is empty
  if (patch.buses.length > 0) {
    return false;
  }

  // Check if any edge has a bus endpoint
  for (const edge of patch.edges) {
    if (edge.from.kind === 'bus' || edge.to.kind === 'bus') {
      return false;
    }
  }

  return true;
}

/**
 * Safely migrate a patch only if it hasn't been migrated already.
 *
 * This is the recommended entry point for migration to avoid double-migration.
 *
 * @param patch - Patch to migrate
 * @returns Migrated patch (or original if already migrated)
 */
export function safeMigrate(patch: LegacyPatch): MigratedPatch {
  if (isMigrated(patch)) {
    // Already migrated - return as-is
    return patch as MigratedPatch;
  }

  return migrateEdgesToPortOnly(patch);
}
