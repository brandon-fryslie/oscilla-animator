/**
 * Patch Migration Helpers
 *
 * Functions to migrate patches from legacy formats to current formats.
 * These ensure backward compatibility when loading patches from storage.
 *
 * Sprint: Phase 0.5 - Sprint 1: Make Edges Authoritative
 * References:
 * - .agent_planning/phase0.5-compat-cleanup/PLAN-2026-01-01-000000.md
 * - .agent_planning/phase0.5-compat-cleanup/DOD-2026-01-01-000000.md
 */

import type { Patch } from '../types';
import { convertToEdges } from '../edgeMigration';

/**
 * Migrate a patch to edges-authoritative format.
 *
 * This function:
 * 1. Detects patches with empty/missing edges array
 * 2. Converts connections/publishers/listeners to unified edges
 * 3. Preserves all edge metadata (weight, sortKey, enabled, transforms)
 * 4. Handles patches that already have edges (no-op)
 *
 * This migration is called automatically when loading patches from storage,
 * ensuring all patches entering the system have edges populated.
 *
 * @param patch - The patch to migrate
 * @returns Migrated patch with edges populated
 *
 * @example
 * ```typescript
 * // Legacy patch (version 1) with separate arrays
 * const legacyPatch: Patch = {
 *   version: 1,
 *   blocks: [...],
 *   connections: [{ id: 'c1', from: portA, to: portB }],
 *   publishers: [{ id: 'p1', from: portC, busId: 'bus1' }],
 *   listeners: [{ id: 'l1', busId: 'bus1', to: portD }],
 *   edges: [],
 *   // ...
 * };
 *
 * // After migration
 * const migrated = migratePatchToEdges(legacyPatch);
 * // migrated.edges contains 3 edges (converted from connections/publishers/listeners)
 * // migrated.connections/publishers/listeners are preserved for backward compat
 * ```
 */
export function migratePatchToEdges(patch: Patch): Patch {
  // Already migrated? Check if edges array exists and is populated
  if (patch.edges != null && patch.edges.length > 0) {
    // Patch already has edges, no migration needed
    return patch;
  }

  // Check if there are any legacy connections to migrate
  const hasLegacyConnections =
    patch.connections.length > 0 ||
    patch.publishers.length > 0 ||
    patch.listeners.length > 0;

  if (!hasLegacyConnections) {
    // No legacy connections and no edges - this is a fresh/empty patch
    // Ensure edges array exists (may be undefined in old patches)
    return {
      ...patch,
      edges: patch.edges ?? [],
    };
  }

  // Migrate legacy arrays to edges
  const edges = convertToEdges(
    patch.connections ?? [],
    patch.publishers ?? [],
    patch.listeners ?? []
  );

  // Return migrated patch
  // Keep legacy arrays for now - they will be removed in Sprint 4
  return {
    ...patch,
    edges,
  };
}

/**
 * Detect if a patch needs migration.
 * Used for logging/diagnostics during the migration period.
 *
 * @param patch - The patch to check
 * @returns True if the patch needs migration (has legacy connections but no edges)
 */
export function patchNeedsMigration(patch: Patch): boolean {
  const hasEdges = patch.edges != null && patch.edges.length > 0;
  const hasLegacyConnections =
    patch.connections.length > 0 ||
    patch.publishers.length > 0 ||
    patch.listeners.length > 0;

  return !hasEdges && Boolean(hasLegacyConnections);
}

/**
 * Get migration summary for logging/diagnostics.
 *
 * @param patch - The patch to analyze
 * @returns Summary of what would be migrated
 */
export function getMigrationSummary(patch: Patch): {
  needsMigration: boolean;
  legacyConnectionCount: number;
  legacyPublisherCount: number;
  legacyListenerCount: number;
  totalEdgeCount: number;
  existingEdgeCount: number;
} {
  const legacyConnectionCount = patch.connections?.length ?? 0;
  const legacyPublisherCount = patch.publishers?.length ?? 0;
  const legacyListenerCount = patch.listeners?.length ?? 0;
  const existingEdgeCount = patch.edges?.length ?? 0;
  const totalEdgeCount = legacyConnectionCount + legacyPublisherCount + legacyListenerCount;

  return {
    needsMigration: patchNeedsMigration(patch),
    legacyConnectionCount,
    legacyPublisherCount,
    legacyListenerCount,
    totalEdgeCount,
    existingEdgeCount,
  };
}
