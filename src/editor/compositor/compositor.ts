/**
 * Compositor Interface
 *
 * A compositor transforms a RenderTree purely and deterministically.
 * Compositors are the effect system - they add transforms, filters,
 * masks, glows, etc. to existing trees without modifying base logic.
 *
 * Design principles:
 * - Compositor is Tree→Tree (not Program→Program directly)
 * - No side effects, no hidden global state
 * - Compositor does not render - only rewrites tree
 * - Stack runner lifts to Program→Program
 */

import type { DrawNode } from '../runtime/renderTree';
import type { SelectionSpec } from './selection';

// =============================================================================
// Core Types
// =============================================================================

/** Context available to compositor during apply */
export interface CompositorCtx {
  /** Current animation time in milliseconds */
  timeMs: number;

  /** Random seed for deterministic effects */
  seed: number;

  /** Viewport dimensions (if relevant) */
  viewport?: { width: number; height: number };

  /** Allow arbitrary context extensions */
  [k: string]: unknown;
}

/**
 * A compositor transforms a tree in a pure, deterministic way.
 *
 * @template TreeT - The tree type (usually DrawNode for RenderTree)
 */
export interface Compositor<TreeT = DrawNode> {
  /** Unique identifier for this compositor */
  id: string;

  /** Human-readable label */
  label?: string;

  /**
   * Optional selection scope.
   * If provided, compositor only applies to matching nodes.
   * If absent, compositor applies globally.
   */
  selection?: SelectionSpec<TreeT>;

  /**
   * Apply the compositor transform.
   * MUST be pure and deterministic.
   *
   * @param tree - Input tree
   * @param ctx - Context (time, seed, etc.)
   * @returns Transformed tree
   */
  apply(tree: TreeT, ctx: CompositorCtx): TreeT;

  /**
   * Optional: Report capabilities for export safety checks.
   */
  capabilities?: () => CompositorCapabilities;
}

/** Capabilities reported by a compositor */
export interface CompositorCapabilities {
  /** Safe to export as CSS/SVG animation */
  cssSvgSafe?: boolean;

  /** Safe for reduced-motion users */
  reducedMotionSafe?: boolean;

  /** Reasons if not safe */
  reasons?: string[];
}

// =============================================================================
// Compositor Factory Helpers
// =============================================================================

/**
 * Create a simple compositor from an apply function.
 */
export function createCompositor<TreeT = DrawNode>(
  id: string,
  apply: (tree: TreeT, ctx: CompositorCtx) => TreeT,
  options?: {
    label?: string;
    selection?: SelectionSpec<TreeT>;
    capabilities?: () => CompositorCapabilities;
  }
): Compositor<TreeT> {
  return {
    id,
    label: options?.label,
    selection: options?.selection,
    apply,
    capabilities: options?.capabilities,
  };
}

/**
 * Create a compositor that applies only to selected nodes.
 */
export function scopedCompositor<TreeT extends { id: string } = DrawNode>(
  id: string,
  selection: SelectionSpec<TreeT>,
  __nodeTransform: (node: TreeT, ctx: CompositorCtx) => TreeT,
  options?: {
    label?: string;
    capabilities?: () => CompositorCapabilities;
  }
): Compositor<TreeT> {
  // This is a factory - actual selection resolution happens in apply
  // The stack runner or scoped() helper handles selection
  return {
    id,
    label: options?.label,
    selection,
    apply: (tree, _ctx) => {
      // Placeholder: real implementation uses TreeRewrite
      // See scoped() in scoped.ts for full implementation
      return tree;
    },
    capabilities: options?.capabilities,
  };
}

// =============================================================================
// Identity Compositor (useful for testing)
// =============================================================================

/** Compositor that does nothing (identity transform) */
export const identityCompositor: Compositor<DrawNode> = {
  id: 'identity',
  label: 'Identity',
  apply: (tree) => tree,
  capabilities: () => ({
    cssSvgSafe: true,
    reducedMotionSafe: true,
  }),
};
