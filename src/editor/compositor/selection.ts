/**
 * Selection API
 *
 * Pure, composable way to refer to subsets of nodes in a RenderTree.
 * A selector is just a predicate: (node, path, ctx) => boolean
 *
 * Design:
 * - Selection is data, not behavior
 * - Queries return stable NodeRefs (id + path)
 * - Combinators enable complex selections
 */

import type { DrawNode } from '../runtime/renderTree';

// =============================================================================
// Core Types
// =============================================================================

export type NodeId = string;

/** Path through the tree as indices down children arrays */
export type NodePath = readonly number[];

/** Reference to a node by id and structural path */
export interface NodeRef {
  id: NodeId;
  path: NodePath;
}

/** Context available during selection */
export interface SelectionCtx {
  timeMs?: number;
  seed?: number;
  [k: string]: unknown;
}

/** A selector is a pure predicate over nodes */
export type Selector<Node = DrawNode> = (
  node: Node,
  path: NodePath,
  ctx: SelectionCtx
) => boolean;

/** Named selector specification */
export interface SelectionSpec<Node = DrawNode> {
  name?: string;
  selector: Selector<Node>;
}

// =============================================================================
// Selection Query Implementation
// =============================================================================

/**
 * Find all nodes matching a selector.
 * Returns stable NodeRefs in traversal order.
 */
export function find<Node extends { id: string }>(
  root: Node,
  spec: SelectionSpec<Node>,
  ctx: SelectionCtx,
  getChildren: (node: Node) => readonly Node[] | null
): NodeRef[] {
  const results: NodeRef[] = [];

  function traverse(node: Node, path: NodePath): void {
    if (spec.selector(node, path, ctx)) {
      results.push({ id: node.id, path });
    }
    const children = getChildren(node);
    if (children) {
      for (let i = 0; i < children.length; i++) {
        traverse(children[i]!, [...path, i]);
      }
    }
  }

  traverse(root, []);
  return results;
}

/**
 * Find first matching node.
 */
export function first<Node extends { id: string }>(
  root: Node,
  spec: SelectionSpec<Node>,
  ctx: SelectionCtx,
  getChildren: (node: Node) => readonly Node[] | null
): NodeRef | null {
  function traverse(node: Node, path: NodePath): NodeRef | null {
    if (spec.selector(node, path, ctx)) {
      return { id: node.id, path };
    }
    const children = getChildren(node);
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const found = traverse(children[i]!, [...path, i]);
        if (found) return found;
      }
    }
    return null;
  }

  return traverse(root, []);
}

// =============================================================================
// Selector Combinators
// =============================================================================

/** Logical AND of two selectors */
export function and<Node>(
  a: Selector<Node>,
  b: Selector<Node>
): Selector<Node> {
  return (node, path, ctx) => a(node, path, ctx) && b(node, path, ctx);
}

/** Logical OR of two selectors */
export function or<Node>(
  a: Selector<Node>,
  b: Selector<Node>
): Selector<Node> {
  return (node, path, ctx) => a(node, path, ctx) || b(node, path, ctx);
}

/** Logical NOT of a selector */
export function not<Node>(s: Selector<Node>): Selector<Node> {
  return (node, path, ctx) => !s(node, path, ctx);
}

/** Select all nodes */
export const all: Selector<unknown> = () => true;

/** Select no nodes */
export const none: Selector<unknown> = () => false;

// =============================================================================
// Selection Query Object (convenience wrapper)
// =============================================================================

export interface SelectionQuery<Node extends { id: string }> {
  find(
    root: Node,
    spec: SelectionSpec<Node>,
    ctx: SelectionCtx
  ): NodeRef[];

  first(
    root: Node,
    spec: SelectionSpec<Node>,
    ctx: SelectionCtx
  ): NodeRef | null;

  and(a: Selector<Node>, b: Selector<Node>): Selector<Node>;
  or(a: Selector<Node>, b: Selector<Node>): Selector<Node>;
  not(s: Selector<Node>): Selector<Node>;
}

/**
 * Create a SelectionQuery bound to a specific getChildren function.
 */
export function createSelectionQuery<Node extends { id: string }>(
  getChildren: (node: Node) => readonly Node[] | null
): SelectionQuery<Node> {
  return {
    find: (root, spec, ctx) => find(root, spec, ctx, getChildren),
    first: (root, spec, ctx) => first(root, spec, ctx, getChildren),
    and,
    or,
    not,
  };
}
