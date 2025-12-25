/**
 * Compositor Stack
 *
 * Applies multiple compositors in order.
 * Stack runner is just function composition.
 *
 * Also provides Program→Program lifting.
 */

import type { Compositor, CompositorCtx } from './compositor';
import type { DrawNode, RenderTree } from '../runtime/renderTree';

// =============================================================================
// Stack Types
// =============================================================================

/** A stack of compositors to apply in order */
export interface CompositorStack<TreeT = DrawNode> {
  /** Ordered list of compositors */
  compositors: readonly Compositor<TreeT>[];

  /** Optional stack-level id */
  id?: string;

  /** Optional stack-level label */
  label?: string;
}

// =============================================================================
// Stack Runner
// =============================================================================

/**
 * Apply a stack of compositors to a tree.
 * Compositors are applied in order (first to last).
 *
 * @param tree - Input tree
 * @param stack - Compositors to apply
 * @param ctx - Context for all compositors
 * @returns Transformed tree
 */
export function applyStack<TreeT>(
  tree: TreeT,
  stack: readonly Compositor<TreeT>[],
  ctx: CompositorCtx
): TreeT {
  let result = tree;
  for (const compositor of stack) {
    result = compositor.apply(result, ctx);
  }
  return result;
}

/**
 * Apply a CompositorStack object.
 */
export function runStack<TreeT>(
  tree: TreeT,
  stack: CompositorStack<TreeT>,
  ctx: CompositorCtx
): TreeT {
  return applyStack(tree, stack.compositors, ctx);
}

// =============================================================================
// Stack Utilities
// =============================================================================

/**
 * Create a compositor stack from an array.
 */
export function createStack<TreeT>(
  compositors: readonly Compositor<TreeT>[],
  options?: { id?: string; label?: string }
): CompositorStack<TreeT> {
  return {
    compositors,
    id: options?.id,
    label: options?.label,
  };
}

/**
 * Concatenate multiple stacks.
 */
export function concatStacks<TreeT>(
  ...stacks: readonly CompositorStack<TreeT>[]
): CompositorStack<TreeT> {
  return {
    compositors: stacks.flatMap((s) => s.compositors),
  };
}

/**
 * Check if all compositors in stack are CSS/SVG safe.
 */
export function isStackCssSvgSafe<TreeT>(
  stack: CompositorStack<TreeT>
): { safe: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const c of stack.compositors) {
    const caps = c.capabilities?.();
    if (caps !== null && caps !== undefined && caps.cssSvgSafe === false) {
      reasons.push(`${c.id}: ${caps.reasons?.join(', ') ?? 'not CSS/SVG safe'}`);
    }
  }

  return {
    safe: reasons.length === 0,
    reasons,
  };
}

// =============================================================================
// Program Lifting
// =============================================================================

/**
 * A Program produces a tree at each time point.
 * This is a simplified version - adapt to your actual Program type.
 */
export interface TreeProgram<TreeT> {
  /** Generate tree at time t */
  frame(timeMs: number, ctx: Omit<CompositorCtx, 'timeMs'>): TreeT;
}

/**
 * Lift compositors to work on Programs.
 * Returns a new Program that applies the compositor stack to each frame.
 *
 * @param base - Base program that generates trees
 * @param stack - Compositors to apply
 * @returns New program with compositors applied
 */
export function composeProgram<TreeT>(
  base: TreeProgram<TreeT>,
  stack: readonly Compositor<TreeT>[]
): TreeProgram<TreeT> {
  return {
    frame(timeMs: number, ctx: Omit<CompositorCtx, 'timeMs'>): TreeT {
      const tree = base.frame(timeMs, ctx);
      return applyStack(tree, stack, { ...ctx, timeMs } as CompositorCtx);
    },
  };
}

/**
 * Compose a program with a CompositorStack object.
 */
export function composeProgramWithStack<TreeT>(
  base: TreeProgram<TreeT>,
  stack: CompositorStack<TreeT>
): TreeProgram<TreeT> {
  return composeProgram(base, stack.compositors);
}

// =============================================================================
// Integration with existing Program type
// =============================================================================

import type { Program } from '../../core/types';

/**
 * Adapt a V4 Program<RenderTree> to use compositor stack.
 *
 * This bridges the existing V4 animation system with the compositor middleware.
 * Note: In the editor, RenderTree IS DrawNode (not a wrapper with root property).
 */
export function withCompositors(
  program: Program<RenderTree>,
  stack: readonly Compositor<DrawNode>[],
  baseSeed: number = 42
): Program<RenderTree> {
  return {
    signal: (tMs, rtCtx) => {
      // Editor's RenderTree is DrawNode directly
      const tree = program.signal(tMs, rtCtx);

      // Apply compositors to the tree (which is already a DrawNode)
      const rtViewport = (rtCtx as { viewport?: { w: number; h: number; dpr: number } })?.viewport;
      return applyStack(tree, stack, {
        timeMs: tMs,
        seed: baseSeed,
        viewport: rtViewport ? { width: rtViewport.w, height: rtViewport.h } : undefined,
      });
    },
    event: program.event,
  };
}
