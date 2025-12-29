/**
 * @file MeshStore - Runtime cache for materialized meshes
 * @description Caches mesh buffers by recipe hash
 *
 * Mesh generation is expensive, so caching is critical.
 * Cache key: full recipe hash (profile + extrude params + attributes)
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md §3
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md §2
 */

import type { MeshIR, MeshBufferRef, MeshTable } from '../../compiler/ir/types3d';
import { materializeMesh } from './materializeMesh';

// ============================================================================
// Cache Entry
// ============================================================================

/**
 * Cache entry for materialized mesh
 */
interface MeshCacheEntry {
  /** Mesh buffer reference */
  buffer: MeshBufferRef;

  /** Recipe hash (for cache validation) */
  recipeHash: string;
}

// ============================================================================
// MeshStore
// ============================================================================

/**
 * Mesh buffer cache, keyed by recipe hash
 *
 * Meshes are expensive to generate, so caching is critical.
 * Cache is invalidated when mesh recipes change.
 *
 * Usage:
 * 1. setMeshTable() at program load
 * 2. getOrMaterialize() to fetch/generate mesh
 * 3. invalidateMesh() or invalidateAll() on recipe changes
 */
export class MeshStore {
  /** Mesh table (source of mesh recipes) */
  private meshTable: MeshTable | null = null;

  /** Cache: meshId -> MeshCacheEntry */
  private cache: Map<string, MeshCacheEntry> = new Map();

  /** Cache statistics */
  private stats = {
    hits: 0,
    misses: 0,
  };

  /**
   * Set mesh table for lookups
   *
   * @param table - Mesh table from compiled program IR
   */
  setMeshTable(table: MeshTable): void {
    this.meshTable = table;
    // Don't clear cache here - we validate recipe hash on lookup
  }

  /**
   * Get or materialize mesh
   *
   * @param meshId - Mesh identifier
   * @returns Mesh buffer reference
   * @throws Error if mesh not found in table
   */
  getOrMaterialize(meshId: string): MeshBufferRef {
    // Check mesh table is set
    if (this.meshTable === null) {
      throw new Error('MeshStore: mesh table not set');
    }

    // Look up mesh in table
    const meshIndex = this.meshTable.meshIdToIndex[meshId];
    if (meshIndex === undefined) {
      throw new Error(`MeshStore: mesh not found: ${meshId}`);
    }
    const mesh = this.meshTable.meshes[meshIndex];
    if (mesh === undefined) {
      throw new Error(`MeshStore: invalid mesh index: ${meshIndex}`);
    }

    // Compute recipe hash
    const recipeHash = computeRecipeHash(mesh);

    // Check cache
    const cached = this.cache.get(meshId);
    if (cached !== undefined && cached.recipeHash === recipeHash) {
      this.stats.hits++;
      return cached.buffer;
    }

    // Cache miss - materialize mesh
    this.stats.misses++;
    const buffer = materializeMesh(mesh);

    // Store in cache
    this.cache.set(meshId, {
      buffer,
      recipeHash,
    });

    return buffer;
  }

  /**
   * Invalidate specific mesh
   *
   * @param meshId - Mesh identifier to invalidate
   */
  invalidateMesh(meshId: string): void {
    this.cache.delete(meshId);
  }

  /**
   * Clear all cached meshes
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   *
   * @returns Cache stats for debugging
   */
  getStats(): {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }
}

// ============================================================================
// Recipe Hashing
// ============================================================================

/**
 * Compute hash of mesh recipe for cache key
 *
 * This must be deterministic and include all parameters that affect
 * the generated geometry.
 *
 * @param mesh - Mesh IR
 * @returns Hash string
 */
function computeRecipeHash(mesh: MeshIR): string {
  // Simple JSON hash (could be replaced with better hash function)
  const recipeData = {
    profile: mesh.recipe.profile,
    extrude: mesh.recipe.extrude,
    bevel: mesh.recipe.bevel,
    attributes: mesh.attributes,
    winding: mesh.winding,
    indexType: mesh.indexType,
  };

  return JSON.stringify(recipeData);
}
