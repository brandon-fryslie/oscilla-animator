/**
 * Common Selectors
 *
 * Ergonomic helpers for building selections.
 * All selectors are pure predicates.
 */

import type { Selector, NodePath } from './selection';
import type { DrawNode } from '../runtime/renderTree';

// =============================================================================
// Basic Selectors
// =============================================================================

/** Select node by exact id */
export const byId = (id: string): Selector<DrawNode> =>
  (node) => node.id === id;

/** Select nodes by kind (group, shape, effect) */
export const byKind = (kind: DrawNode['kind']): Selector<DrawNode> =>
  (node) => node.kind === kind;

/** Select nodes that have a specific tag */
export const hasTag = (tag: string): Selector<DrawNode> =>
  (node) => node.tags?.includes(tag) ?? false;

/** Select nodes that have any of the specified tags */
export const hasAnyTag = (...tags: string[]): Selector<DrawNode> =>
  (node) => tags.some(tag => node.tags?.includes(tag) ?? false);

/** Select nodes that have all of the specified tags */
export const hasAllTags = (...tags: string[]): Selector<DrawNode> =>
  (node) => tags.every(tag => node.tags?.includes(tag) ?? false);

/** Select nodes by meta property predicate */
export const meta = <T>(
  key: string,
  pred: (value: T | undefined) => boolean
): Selector<DrawNode> =>
  (node) => pred(node.meta?.[key] as T | undefined);

/** Select nodes where meta[key] equals value */
export const metaEquals = <T>(key: string, value: T): Selector<DrawNode> =>
  meta(key, (v) => v === value);

// =============================================================================
// Structural Selectors
// =============================================================================

/** Select nodes at a specific depth */
export const atDepth = (depth: number): Selector<DrawNode> =>
  (_node, path) => path.length === depth;

/** Select nodes at depth >= min */
export const minDepth = (min: number): Selector<DrawNode> =>
  (_node, path) => path.length >= min;

/** Select nodes at depth <= max */
export const maxDepth = (max: number): Selector<DrawNode> =>
  (_node, path) => path.length <= max;

/** Select the root node only */
export const isRoot: Selector<DrawNode> = (_node, path) => path.length === 0;

/** Select leaf nodes (no children) */
export const isLeaf: Selector<DrawNode> = (node) => {
  if (node.kind === 'group') return node.children.length === 0;
  if (node.kind === 'effect') return false; // effect always has child
  return true; // shape is always a leaf
};

// =============================================================================
// Kind-Specific Selectors
// =============================================================================

/** Select all group nodes */
export const isGroup = byKind('group');

/** Select all shape nodes */
export const isShape = byKind('shape');

/** Select all effect nodes */
export const isEffect = byKind('effect');

/** Select shape nodes by geometry kind */
export const geomKind = (kind: 'svgPath' | 'circle' | 'rect'): Selector<DrawNode> =>
  (node) => node.kind === 'shape' && node.geom.kind === kind;

/** Select effect nodes by effect kind */
export const effectKind = (
  kind: 'opacityMul' | 'transform2d' | 'transform3d' | 'filter' | 'clip' | 'deform'
): Selector<DrawNode> =>
  (node) => node.kind === 'effect' && node.effect.kind === kind;

// =============================================================================
// Path-Based Selectors
// =============================================================================

/** Select nodes whose path starts with the given prefix */
export const underPath = (prefix: NodePath): Selector<DrawNode> =>
  (_node, path) => {
    if (path.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (path[i] !== prefix[i]) return false;
    }
    return true;
  };

/** Select direct children of a path */
export const childrenOfPath = (parentPath: NodePath): Selector<DrawNode> =>
  (_node, path) => {
    if (path.length !== parentPath.length + 1) return false;
    for (let i = 0; i < parentPath.length; i++) {
      if (path[i] !== parentPath[i]) return false;
    }
    return true;
  };

// =============================================================================
// Context-Aware Selectors
// =============================================================================

/** Select nodes based on context values */
export const whenCtx = <K extends string>(
  key: K,
  pred: (value: unknown) => boolean
): Selector<DrawNode> =>
  (_node, _path, ctx) => pred(ctx[key]);

/** Select all nodes when time is in range */
export const duringTime = (startMs: number, endMs: number): Selector<DrawNode> =>
  (_node, _path, ctx) => {
    const t = ctx.timeMs ?? 0;
    return t >= startMs && t <= endMs;
  };

// =============================================================================
// Utility: Selector from ID list
// =============================================================================

/** Select nodes whose id is in the given set */
export const inIdSet = (ids: ReadonlySet<string>): Selector<DrawNode> =>
  (node) => ids.has(node.id);

/** Select nodes whose id is in the given array */
export const inIdList = (ids: readonly string[]): Selector<DrawNode> =>
  inIdSet(new Set(ids));
