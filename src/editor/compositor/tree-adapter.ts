/**
 * Tree Adapter
 *
 * Renderer-agnostic interface for tree operations.
 * Allows rewrite utilities to work with any tree structure.
 */

// =============================================================================
// Generic Tree Adapter Interface
// =============================================================================

export interface TreeAdapter<Node> {
  /** Get children of a node, or null if leaf */
  getChildren(node: Node): readonly Node[] | null;

  /** Return a shallow clone with children replaced */
  withChildren(node: Node, children: readonly Node[]): Node;

  /** Read stable identity */
  getId(node: Node): string;

  /** Generic property patch (returns new node) */
  update<K extends keyof Node>(node: Node, patch: Pick<Node, K>): Node;

  /** Create a wrapper group node */
  makeGroup(args: { id: string; children: readonly Node[]; props?: Partial<Node> }): Node;
}

// =============================================================================
// DrawNode Adapter (for editor/runtime/renderTree.ts)
// =============================================================================

import type {
  DrawNode,
  GroupNode,
  ShapeNode,
  EffectNode,
} from '../runtime/renderTree';

/**
 * Adapter for the Editor RenderTree's DrawNode type.
 *
 * Handles the three node kinds:
 * - group: has children array
 * - shape: leaf node
 * - effect: has single child (treated as array of 1 for consistency)
 */
export const drawNodeAdapter: TreeAdapter<DrawNode> = {
  getChildren(node: DrawNode): readonly DrawNode[] | null {
    switch (node.kind) {
      case 'group':
        return node.children;
      case 'effect':
        // Treat effect's single child as a 1-element array for consistency
        return [node.child];
      case 'shape':
        return null;
    }
  },

  withChildren(node: DrawNode, children: readonly DrawNode[]): DrawNode {
    switch (node.kind) {
      case 'group':
        return { ...node, children };
      case 'effect':
        // Effect has exactly one child
        if (children.length !== 1) {
          throw new Error('EffectNode must have exactly one child');
        }
        return { ...node, child: children[0]! };
      case 'shape':
        throw new Error('ShapeNode has no children');
    }
  },

  getId(node: DrawNode): string {
    return node.id;
  },

  update<K extends keyof DrawNode>(
    node: DrawNode,
    patch: Pick<DrawNode, K>
  ): DrawNode {
    return { ...node, ...patch };
  },

  makeGroup(args: {
    id: string;
    children: readonly DrawNode[];
    props?: Partial<GroupNode>;
  }): GroupNode {
    return {
      kind: 'group',
      id: args.id,
      children: args.children,
      tags: args.props?.tags,
      meta: args.props?.meta,
    };
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a node is a group (has multiple children).
 */
export function isGroupNode(node: DrawNode): node is GroupNode {
  return node.kind === 'group';
}

/**
 * Check if a node is a shape (leaf).
 */
export function isShapeNode(node: DrawNode): node is ShapeNode {
  return node.kind === 'shape';
}

/**
 * Check if a node is an effect wrapper.
 */
export function isEffectNode(node: DrawNode): node is EffectNode {
  return node.kind === 'effect';
}

/**
 * Get child count for any node type.
 */
export function childCount(node: DrawNode): number {
  switch (node.kind) {
    case 'group':
      return node.children.length;
    case 'effect':
      return 1;
    case 'shape':
      return 0;
  }
}
