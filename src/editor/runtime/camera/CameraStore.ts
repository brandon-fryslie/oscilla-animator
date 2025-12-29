/**
 * @file CameraStore - Camera Evaluation Cache
 * @description Runtime cache for evaluated camera matrices
 *
 * Cache key: (cameraId, viewportKey)
 * Invalidated on: viewport resize, camera table update
 */

import type { CameraEval, CameraTable } from '../../compiler/ir/types3d';
import { evaluateCamera, type ViewportInfo } from './evaluateCamera';

/**
 * Cache entry for evaluated camera
 */
interface CameraEvalCacheEntry {
  /** Cached evaluation result */
  eval: CameraEval;

  /** Viewport key used for this evaluation */
  viewportKey: string;
}

/**
 * Camera evaluation cache
 *
 * This store caches evaluated camera matrices to avoid recomputing them
 * every frame. Cache is keyed by (cameraId, viewportKey).
 *
 * Invalidation:
 * - Call invalidateAll() on viewport resize
 * - Call setCameraTable() when camera definitions change
 */
export class CameraStore {
  /** Camera table (source of camera definitions) */
  private cameraTable: CameraTable | null = null;

  /** Cache: cameraId -> viewportKey -> CameraEval */
  private cache: Map<string, Map<string, CameraEvalCacheEntry>> = new Map();

  /**
   * Set camera table for lookups
   * @param table - Camera table from compiled program IR
   */
  setCameraTable(table: CameraTable): void {
    this.cameraTable = table;
    // Invalidate cache when camera table changes
    this.cache.clear();
  }

  /**
   * Get or evaluate camera
   * @param cameraId - Camera identifier
   * @param viewport - Viewport dimensions and DPR
   * @returns Evaluated camera matrices
   * @throws Error if camera not found in table
   */
  getOrEvaluate(cameraId: string, viewport: ViewportInfo): CameraEval {
    // Check camera table is set
    if (this.cameraTable === null) {
      throw new Error('CameraStore: camera table not set');
    }

    // Look up camera in table
    const cameraIndex = this.cameraTable.cameraIdToIndex[cameraId];
    if (cameraIndex === undefined) {
      throw new Error(`CameraStore: camera not found: ${cameraId}`);
    }
    const camera = this.cameraTable.cameras[cameraIndex];
    if (camera === undefined) {
      throw new Error(`CameraStore: invalid camera index: ${cameraIndex}`);
    }

    // Build viewport cache key
    const viewportKey = this.buildViewportKey(viewport);

    // Check cache
    let cameraCache = this.cache.get(cameraId);
    if (cameraCache === undefined) {
      cameraCache = new Map();
      this.cache.set(cameraId, cameraCache);
    }

    const cached = cameraCache.get(viewportKey);
    if (cached !== undefined) {
      return cached.eval;
    }

    // Cache miss - evaluate camera
    const eval_ = evaluateCamera(camera, viewport);

    // Store in cache
    cameraCache.set(viewportKey, {
      eval: eval_,
      viewportKey,
    });

    return eval_;
  }

  /**
   * Invalidate all cached evaluations
   * Call this on viewport resize or when camera definitions change
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Invalidate specific camera
   * @param cameraId - Camera identifier to invalidate
   */
  invalidateCamera(cameraId: string): void {
    this.cache.delete(cameraId);
  }

  /**
   * Get cache statistics
   * @returns Cache stats for debugging
   */
  getStats(): {
    totalCameras: number;
    totalEntries: number;
    entriesPerCamera: Record<string, number>;
  } {
    const entriesPerCamera: Record<string, number> = {};
    let totalEntries = 0;

    for (const [cameraId, cameraCache] of this.cache.entries()) {
      const count = cameraCache.size;
      entriesPerCamera[cameraId] = count;
      totalEntries += count;
    }

    return {
      totalCameras: this.cache.size,
      totalEntries,
      entriesPerCamera,
    };
  }

  /**
   * Build viewport cache key
   * @param viewport - Viewport info
   * @returns String key for caching
   */
  private buildViewportKey(viewport: ViewportInfo): string {
    // Round to avoid floating point issues
    const w = Math.round(viewport.width);
    const h = Math.round(viewport.height);
    const dpr = viewport.dpr;

    return `${w}x${h}@${dpr}`;
  }
}
