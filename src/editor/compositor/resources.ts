/**
 * Resources / Defs Channel
 *
 * SVG-like effects need definitions (filters, masks, gradients).
 * This module provides a standard pattern for compositors to
 * register resources without interfering with each other.
 *
 * Pattern:
 * - Resources are keyed by unique id
 * - Duplicates are deduplicated automatically
 * - Resources live in a separate "defs" channel on the tree
 */

import type { DrawNode } from '../runtime/renderTree';

// =============================================================================
// Resource Types
// =============================================================================

/** A filter definition (SVG-style) */
export interface FilterResource {
  kind: 'filter';
  id: string;
  effects: readonly FilterEffect[];
}

/** Individual filter effect */
export interface FilterEffect {
  type: string;
  [k: string]: unknown;
}

/** A mask definition */
export interface MaskResource {
  kind: 'mask';
  id: string;
  content: DrawNode;
}

/** A gradient definition */
export interface GradientResource {
  kind: 'gradient';
  id: string;
  type: 'linear' | 'radial';
  stops: readonly GradientStop[];
  [k: string]: unknown;
}

export interface GradientStop {
  offset: number;
  color: string;
  opacity?: number;
}

/** Union of all resource types */
export type Resource = FilterResource | MaskResource | GradientResource;

// =============================================================================
// Resource Registry
// =============================================================================

/**
 * Immutable resource registry.
 * Compositors add resources; renderer consumes them.
 */
export interface ResourceRegistry {
  readonly filters: ReadonlyMap<string, FilterResource>;
  readonly masks: ReadonlyMap<string, MaskResource>;
  readonly gradients: ReadonlyMap<string, GradientResource>;
}

/** Empty registry */
export const emptyRegistry: ResourceRegistry = {
  filters: new Map(),
  masks: new Map(),
  gradients: new Map(),
};

/**
 * Add a resource to the registry (immutable).
 * Returns same registry if resource already exists with same id.
 */
export function addResource(
  registry: ResourceRegistry,
  resource: Resource
): ResourceRegistry {
  switch (resource.kind) {
    case 'filter': {
      if (registry.filters.has(resource.id)) {
        return registry;
      }
      return {
        ...registry,
        filters: new Map([...registry.filters, [resource.id, resource]]),
      };
    }
    case 'mask': {
      if (registry.masks.has(resource.id)) {
        return registry;
      }
      return {
        ...registry,
        masks: new Map([...registry.masks, [resource.id, resource]]),
      };
    }
    case 'gradient': {
      if (registry.gradients.has(resource.id)) {
        return registry;
      }
      return {
        ...registry,
        gradients: new Map([...registry.gradients, [resource.id, resource]]),
      };
    }
  }
}

/**
 * Merge multiple registries.
 */
export function mergeRegistries(
  ...registries: readonly ResourceRegistry[]
): ResourceRegistry {
  let result = emptyRegistry;

  for (const reg of registries) {
    for (const f of reg.filters.values()) {
      result = addResource(result, f);
    }
    for (const m of reg.masks.values()) {
      result = addResource(result, m);
    }
    for (const g of reg.gradients.values()) {
      result = addResource(result, g);
    }
  }

  return result;
}

// =============================================================================
// Common Filter Factories
// =============================================================================

/**
 * Create a glow filter resource.
 */
export function glowFilter(id: string, radius: number): FilterResource {
  return {
    kind: 'filter',
    id,
    effects: [
      { type: 'gaussianBlur', stdDeviation: radius, result: 'blur' },
      { type: 'merge', nodes: ['blur', 'SourceGraphic'] },
    ],
  };
}

/**
 * Create a drop shadow filter resource.
 */
export function dropShadowFilter(
  id: string,
  dx: number,
  dy: number,
  blur: number,
  color: string = 'rgba(0,0,0,0.5)'
): FilterResource {
  return {
    kind: 'filter',
    id,
    effects: [
      { type: 'dropShadow', dx, dy, stdDeviation: blur, color },
    ],
  };
}

/**
 * Create a color matrix filter resource.
 */
export function colorMatrixFilter(
  id: string,
  matrix: readonly number[]
): FilterResource {
  return {
    kind: 'filter',
    id,
    effects: [
      { type: 'colorMatrix', values: matrix },
    ],
  };
}

// =============================================================================
// Registry Context (for compositor pipelines)
// =============================================================================

/**
 * Extended compositor context with resource registry.
 * Compositors can read and contribute resources.
 */
export interface ResourceCtx {
  registry: ResourceRegistry;
}

/**
 * Create a resource-aware compositor context.
 */
export function withResources<Ctx extends object>(
  ctx: Ctx,
  registry: ResourceRegistry = emptyRegistry
): Ctx & ResourceCtx {
  return { ...ctx, registry };
}
