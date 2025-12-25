/**
 * Tree Rewrite Utilities
 *
 * Pure, persistent tree transformation operations.
 * All operations return new trees (structural sharing where possible).
 *
 * Design:
 * - Purely functional (no mutation)
 * - Operate by NodePath for unambiguous targeting
 * - Preserve stable ids unless explicitly changed
 * - Deterministic given same inputs
 */

import type { TreeAdapter } from './tree-adapter';
import type { NodePath, NodeRef } from './selection';

// =============================================================================
// Core Types
// =============================================================================

export interface RewriteCtx {
  timeMs: number;
  seed: number;
  [k: string]: unknown;
}

// =============================================================================
// Tree Rewrite Interface
// =============================================================================

export interface TreeRewrite<Node> {
  /** Map a function over all nodes (post-order) */
  mapNodes(
    root: Node,
    f: (node: Node, path: NodePath) => Node
  ): Node;

  /** Update nodes matching a predicate */
  updateWhere(
    root: Node,
    pred: (node: Node, path: NodePath) => boolean,
    update: (node: Node, path: NodePath) => Node
  ): Node;

  /** Get node at a specific path */
  getAt(root: Node, path: NodePath): Node;

  /** Replace a node at a known path */
  replaceAt(root: Node, path: NodePath, next: Node): Node;

  /** Wrap selected nodes in a group */
  wrap(
    root: Node,
    refs: readonly NodeRef[],
    wrapper: (children: readonly Node[]) => Node
  ): Node;

  /** Insert a sibling before the node at path */
  insertBefore(root: Node, path: NodePath, newNode: Node): Node;

  /** Insert a sibling after the node at path */
  insertAfter(root: Node, path: NodePath, newNode: Node): Node;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a TreeRewrite bound to a specific TreeAdapter.
 */
export function createTreeRewrite<Node>(
  adapter: TreeAdapter<Node>
): TreeRewrite<Node> {
  // ---------------------------------------------------------------------------
  // Core traversal
  // ---------------------------------------------------------------------------

  function mapNodes(
    root: Node,
    f: (node: Node, path: NodePath) => Node
  ): Node {
    function traverse(node: Node, path: NodePath): Node {
      const children = adapter.getChildren(node);

      if (children === null) {
        // Leaf node
        return f(node, path);
      }

      // Process children first (post-order for bottom-up transforms)
      const newChildren = children.map((child, i) =>
        traverse(child, [...path, i])
      );

      // Check if any children changed (structural sharing)
      const childrenChanged = newChildren.some((c, i) => c !== children[i]);

      const updatedNode = childrenChanged
        ? adapter.withChildren(node, newChildren)
        : node;

      return f(updatedNode, path);
    }

    return traverse(root, []);
  }

  // ---------------------------------------------------------------------------
  // Predicate-based update
  // ---------------------------------------------------------------------------

  function updateWhere(
    root: Node,
    pred: (node: Node, path: NodePath) => boolean,
    update: (node: Node, path: NodePath) => Node
  ): Node {
    return mapNodes(root, (node, path) =>
      pred(node, path) ? update(node, path) : node
    );
  }

  // ---------------------------------------------------------------------------
  // Path-based operations
  // ---------------------------------------------------------------------------

  function getAt(root: Node, path: NodePath): Node {
    let current = root;

    for (let i = 0; i < path.length; i++) {
      const idx = path[i];
      const children = adapter.getChildren(current);

      if (children === null) {
        throw new Error(`getAt: hit leaf at depth ${i}, path: [${path.join(',')}]`);
      }

      if (idx < 0 || idx >= children.length) {
        throw new Error(`getAt: index ${idx} out of bounds at depth ${i}`);
      }

      current = children[idx]!;
    }

    return current;
  }

  function replaceAt(root: Node, path: NodePath, next: Node): Node {
    if (path.length === 0) {
      return next;
    }

    const [head, ...tail] = path;
    const children = adapter.getChildren(root);

    if (children === null) {
      throw new Error('replaceAt: cannot descend into leaf node');
    }

    if (head < 0 || head >= children.length) {
      throw new Error(`replaceAt: index ${head} out of bounds`);
    }

    const child = children[head];
    const newChild = replaceAt(child, tail, next);

    // Structural sharing: if child unchanged, return same root
    if (newChild === child) {
      return root;
    }

    const newChildren = [...children];
    newChildren[head] = newChild;
    return adapter.withChildren(root, newChildren);
  }

  // ---------------------------------------------------------------------------
  // Wrap operation
  // ---------------------------------------------------------------------------

  function wrap(
    root: Node,
    refs: readonly NodeRef[],
    wrapper: (children: readonly Node[]) => Node
  ): Node {
    if (refs.length === 0) {
      return root;
    }

    // For single node, simple wrap
    if (refs.length === 1) {
      const ref = refs[0];
      const node = getAt(root, ref.path);
      const wrapped = wrapper([node]);
      return replaceAt(root, ref.path, wrapped);
    }

    // For multiple nodes, we need to check if they're siblings
    // (share same parent path except last index)
    const parentPath = refs[0].path.slice(0, -1);
    const allSiblings = refs.every((ref) => {
      const rParent = ref.path.slice(0, -1);
      return (
        rParent.length === parentPath.length &&
        rParent.every((v, i) => v === parentPath[i])
      );
    });

    if (allSiblings) {
      // All refs are siblings - wrap them together
      return wrapSiblings(root, refs, parentPath, wrapper);
    }

    // Non-siblings: wrap each individually
    // Process in reverse path order to avoid path invalidation
    const sortedRefs = [...refs].sort((a, b) => {
      // Sort by path length descending, then by indices descending
      if (a.path.length !== b.path.length) {
        return b.path.length - a.path.length;
      }
      for (let i = 0; i < a.path.length; i++) {
        if (a.path[i] !== b.path[i]) {
          return b.path[i] - a.path[i];
        }
      }
      return 0;
    });

    let result = root;
    for (const ref of sortedRefs) {
      const node = getAt(result, ref.path);
      const wrapped = wrapper([node]);
      result = replaceAt(result, ref.path, wrapped);
    }
    return result;
  }

  function wrapSiblings(
    root: Node,
    refs: readonly NodeRef[],
    parentPath: NodePath,
    wrapper: (children: readonly Node[]) => Node
  ): Node {
    // Get indices within parent
    const indices = refs.map((r) => r.path[r.path.length - 1]).sort((a, b) => a - b);

    // Get parent node
    const parent = parentPath.length === 0 ? root : getAt(root, parentPath);
    const parentChildren = adapter.getChildren(parent);

    if (parentChildren === null) {
      throw new Error('wrapSiblings: parent has no children');
    }

    // Collect the nodes to wrap
    const toWrap = indices.map((i) => parentChildren[i]);

    // Create wrapper
    const wrappedGroup = wrapper(toWrap);

    // Build new children array: replace the range with the wrapper
    const minIdx = indices[0];
    const maxIdx = indices[indices.length - 1];

    const newChildren: Node[] = [];
    for (let i = 0; i < parentChildren.length; i++) {
      if (i === minIdx) {
        newChildren.push(wrappedGroup);
      } else if (i > minIdx && i <= maxIdx && indices.includes(i)) {
        // Skip - already included in wrapper
        continue;
      } else if (!indices.includes(i)) {
        newChildren.push(parentChildren[i]);
      }
    }

    // Replace parent with updated children
    const newParent = adapter.withChildren(parent, newChildren);

    if (parentPath.length === 0) {
      return newParent;
    }

    return replaceAt(root, parentPath, newParent);
  }

  // ---------------------------------------------------------------------------
  // Sibling insertion
  // ---------------------------------------------------------------------------

  function insertBefore(root: Node, path: NodePath, newNode: Node): Node {
    return insertRelative(root, path, newNode, 'before');
  }

  function insertAfter(root: Node, path: NodePath, newNode: Node): Node {
    return insertRelative(root, path, newNode, 'after');
  }

  function insertRelative(
    root: Node,
    path: NodePath,
    newNode: Node,
    position: 'before' | 'after'
  ): Node {
    if (path.length === 0) {
      throw new Error('insertRelative: cannot insert relative to root');
    }

    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1];

    const parent = parentPath.length === 0 ? root : getAt(root, parentPath);
    const children = adapter.getChildren(parent);

    if (children === null) {
      throw new Error('insertRelative: parent has no children');
    }

    const newChildren = [...children];
    const insertIdx = position === 'before' ? idx : idx + 1;
    newChildren.splice(insertIdx, 0, newNode);

    const newParent = adapter.withChildren(parent, newChildren);

    if (parentPath.length === 0) {
      return newParent;
    }

    return replaceAt(root, parentPath, newParent);
  }

  // ---------------------------------------------------------------------------
  // Return interface
  // ---------------------------------------------------------------------------

  return {
    mapNodes,
    updateWhere,
    getAt,
    replaceAt,
    wrap,
    insertBefore,
    insertAfter,
  };
}

// =============================================================================
// Pre-bound rewrite for DrawNode
// =============================================================================

import { drawNodeAdapter } from './tree-adapter';
import type { DrawNode } from '../runtime/renderTree';

/** TreeRewrite pre-bound to DrawNode adapter */
export const drawNodeRewrite: TreeRewrite<DrawNode> = createTreeRewrite(drawNodeAdapter);
