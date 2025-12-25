/**
 * Compiler Context Utilities
 *
 * Provides CompileCtx and GeometryCache implementations.
 */

import type { CompileCtx, Env, GeometryCache } from './types';

// =============================================================================
// Simple Geometry Cache
// =============================================================================

/**
 * Simple in-memory geometry cache.
 * Uses WeakMap for object keys to allow garbage collection.
 */
export class SimpleGeometryCache implements GeometryCache {
  private cache = new Map<string, unknown>();
  private objectCache = new WeakMap<object, unknown>();

  get<K extends object, V>(key: K, compute: () => V): V {
    // Check if we already have this key
    if (this.objectCache.has(key)) {
      return this.objectCache.get(key) as V;
    }

    // Compute and cache
    const value = compute();
    this.objectCache.set(key, value);
    return value;
  }

  /**
   * Get by string key (simpler API for many use cases).
   */
  getByKey<V>(key: string, compute: () => V): V {
    if (this.cache.has(key)) {
      return this.cache.get(key) as V;
    }
    const value = compute();
    this.cache.set(key, value);
    return value;
  }

  invalidate(scope?: unknown): void {
    if (scope === undefined) {
      // Clear everything
      this.cache.clear();
      // WeakMap doesn't need clearing, GC handles it
    } else {
      // Selective invalidation by prefix (for string keys)
      if (typeof scope === 'string') {
        for (const key of this.cache.keys()) {
          if (key.startsWith(scope)) {
            this.cache.delete(key);
          }
        }
      }
    }
  }
}

// =============================================================================
// Context Factory
// =============================================================================

/**
 * Create a CompileCtx with default implementations.
 */
export function createCompileCtx(env: Partial<Env> = {}): CompileCtx {
  return {
    env: { ...env } as Env,
    geom: new SimpleGeometryCache(),
  };
}

/**
 * Create a RuntimeCtx with default values.
 */
export function createRuntimeCtx(opts: {
  width?: number;
  height?: number;
  dpr?: number;
  reducedMotion?: boolean;
} = {}): { viewport: { w: number; h: number; dpr: number }; reducedMotion: boolean } {
  return {
    viewport: {
      w: opts.width ?? 800,
      h: opts.height ?? 600,
      dpr: opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1),
    },
    reducedMotion: opts.reducedMotion ?? false,
  };
}
