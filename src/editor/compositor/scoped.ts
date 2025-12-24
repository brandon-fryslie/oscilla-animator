/**
 * Scoped Compositor Helper
 *
 * Applies transformations only to selected nodes.
 * This is the bridge between Selection API and TreeRewrite.
 */

import type { DrawNode } from '../runtime/renderTree';
import type { Compositor, CompositorCtx, CompositorCapabilities } from './compositor';
import type { SelectionSpec, SelectionCtx, NodeRef } from './selection';
import { find } from './selection';
import { drawNodeAdapter } from './tree-adapter';
import { drawNodeRewrite } from './rewrite';

// =============================================================================
// Scoped Compositor Factory
// =============================================================================

/**
 * Create a compositor that applies a transform only to selected nodes.
 *
 * @param id - Compositor identifier
 * @param selection - Which nodes to transform
 * @param transform - Transform to apply to each selected node
 * @param options - Additional options
 */
export function scoped(
  id: string,
  selection: SelectionSpec<DrawNode>,
  transform: (node: DrawNode, ctx: CompositorCtx, ref: NodeRef) => DrawNode,
  options?: {
    label?: string;
    capabilities?: () => CompositorCapabilities;
  }
): Compositor<DrawNode> {
  return {
    id,
    label: options?.label,
    selection,
    capabilities: options?.capabilities,

    apply(tree: DrawNode, ctx: CompositorCtx): DrawNode {
      // Build selection context from compositor context
      const selCtx: SelectionCtx = {
        timeMs: ctx.timeMs,
        seed: ctx.seed,
      };

      // Find matching nodes
      const getChildrenFn = drawNodeAdapter.getChildren.bind(drawNodeAdapter);
      const refs = find(
        tree,
        selection,
        selCtx,
        getChildrenFn
      );

      if (refs.length === 0) {
        return tree;
      }

      // Apply transform to each selected node
      // Process in reverse order to avoid path invalidation
      const sortedRefs = [...refs].sort((a, b) => {
        // Sort by path descending (deepest first, rightmost first)
        for (let i = 0; i < Math.max(a.path.length, b.path.length); i++) {
          const ai = a.path[i] ?? -1;
          const bi = b.path[i] ?? -1;
          if (ai !== bi) return bi - ai;
        }
        return b.path.length - a.path.length;
      });

      let result = tree;
      for (const ref of sortedRefs) {
        const node = drawNodeRewrite.getAt(result, ref.path);
        const transformed = transform(node, ctx, ref);
        if (transformed !== node) {
          result = drawNodeRewrite.replaceAt(result, ref.path, transformed);
        }
      }

      return result;
    },
  };
}

// =============================================================================
// Common Scoped Transforms
// =============================================================================

/**
 * Create a compositor that updates style on selected nodes.
 */
export function scopedStyle(
  id: string,
  selection: SelectionSpec<DrawNode>,
  getStyle: (node: DrawNode, ctx: CompositorCtx) => Partial<DrawNode> | null,
  options?: { label?: string }
): Compositor<DrawNode> {
  return scoped(
    id,
    selection,
    (node, ctx, _ref) => {
      const patch = getStyle(node, ctx);
      if (!patch) return node;
      return { ...node, ...patch } as DrawNode;
    },
    options
  );
}

/**
 * Create a compositor that wraps selected nodes with an effect.
 */
export function scopedWrap(
  id: string,
  selection: SelectionSpec<DrawNode>,
  wrap: (node: DrawNode, ctx: CompositorCtx) => DrawNode,
  options?: {
    label?: string;
    capabilities?: () => CompositorCapabilities;
  }
): Compositor<DrawNode> {
  return scoped(id, selection, wrap, options);
}

// =============================================================================
// Effect Wrappers (common patterns)
// =============================================================================

import {
  withOpacity,
  withTransform2D,
  withTransform3D,
  type Transform2D,
  type Transform3D,
} from '../runtime/renderTree';

/**
 * Create an opacity compositor for selected nodes.
 */
export function opacityCompositor(
  id: string,
  selection: SelectionSpec<DrawNode>,
  getOpacity: (node: DrawNode, ctx: CompositorCtx) => number
): Compositor<DrawNode> {
  return scoped(
    id,
    selection,
    (node, ctx) => {
      const opacity = getOpacity(node, ctx);
      if (opacity === 1) return node;
      return withOpacity(`${node.id}:opacity`, opacity, node);
    },
    {
      label: 'Opacity',
      capabilities: () => ({ cssSvgSafe: true, reducedMotionSafe: true }),
    }
  );
}

/**
 * Create a 2D transform compositor for selected nodes.
 */
export function transform2DCompositor(
  id: string,
  selection: SelectionSpec<DrawNode>,
  getTransform: (node: DrawNode, ctx: CompositorCtx) => Transform2D | null
): Compositor<DrawNode> {
  return scoped(
    id,
    selection,
    (node, ctx) => {
      const t = getTransform(node, ctx);
      if (!t) return node;
      return withTransform2D(`${node.id}:t2d`, t, node);
    },
    {
      label: '2D Transform',
      capabilities: () => ({ cssSvgSafe: true, reducedMotionSafe: false }),
    }
  );
}

/**
 * Create a 3D transform compositor for selected nodes.
 */
export function transform3DCompositor(
  id: string,
  selection: SelectionSpec<DrawNode>,
  getTransform: (node: DrawNode, ctx: CompositorCtx) => Transform3D | null
): Compositor<DrawNode> {
  return scoped(
    id,
    selection,
    (node, ctx) => {
      const t = getTransform(node, ctx);
      if (!t) return node;
      return withTransform3D(`${node.id}:t3d`, t, node);
    },
    {
      label: '3D Transform',
      capabilities: () => ({ cssSvgSafe: false, reducedMotionSafe: false }),
    }
  );
}
