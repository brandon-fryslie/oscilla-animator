/**
 * RuntimeStateTree Component
 *
 * Expandable tree view for exploring runtime state snapshots.
 * Displays:
 * - ValueStore slots with values, types, and metadata
 * - StateBuffer cells with values and ownership
 * - Search/filter by slot index, type, or node ID
 *
 * References:
 * - .agent_planning/debug-export/PLAN-2025-12-30-031000.md Sprint 8
 * - .agent_planning/debug-export/DOD-2025-12-30-031000.md Deliverable 8.2
 */

import { useState, useMemo } from 'react';
import type { RuntimeSnapshot, SlotSnapshot, StateCellSnapshot } from '../debug/RuntimeSnapshot';
import './RuntimeStateTree.css';

/**
 * Tree node data structure
 */
interface TreeNode {
  id: string;
  label: string;
  type: 'root' | 'category' | 'slot' | 'stateCell';
  children?: TreeNode[];
  data?: SlotSnapshot | StateCellSnapshot;
  expanded?: boolean;
}

/**
 * RuntimeStateTree Props
 */
export interface RuntimeStateTreeProps {
  /** Runtime snapshot to display */
  snapshot: RuntimeSnapshot | null;

  /** Optional search filter */
  searchFilter?: string;
}

/**
 * RuntimeStateTree - Expandable tree view for runtime state
 */
export function RuntimeStateTree({ snapshot, searchFilter = '' }: RuntimeStateTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root', 'valueStore']));

  // Build tree structure from snapshot
  const tree = useMemo(() => {
    if (!snapshot) return null;
    return buildTreeFromSnapshot(snapshot);
  }, [snapshot]);

  // Filter tree based on search
  const filteredTree = useMemo(() => {
    if (!tree || !searchFilter) return tree;
    return filterTree(tree, searchFilter.toLowerCase());
  }, [tree, searchFilter]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  if (!snapshot) {
    return (
      <div className="runtime-state-tree-empty">
        <p>No snapshot captured yet.</p>
        <p>Click "Capture Snapshot" to inspect runtime state.</p>
      </div>
    );
  }

  if (!filteredTree) {
    return (
      <div className="runtime-state-tree-empty">
        <p>No results found for "{searchFilter}"</p>
      </div>
    );
  }

  return (
    <div className="runtime-state-tree">
      <TreeNodeView node={filteredTree} expandedNodes={expandedNodes} onToggle={toggleNode} depth={0} />
    </div>
  );
}

/**
 * TreeNodeView - Renders a single tree node
 */
interface TreeNodeViewProps {
  node: TreeNode;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  depth: number;
}

function TreeNodeView({ node, expandedNodes, onToggle, depth }: TreeNodeViewProps) {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="tree-node">
      <div
        className={`tree-node-label ${node.type}`}
        style={{ paddingLeft: `${depth * 20}px` }}
        onClick={() => hasChildren && onToggle(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            hasChildren && onToggle(node.id);
          }
        }}
      >
        {hasChildren && (
          <span className="tree-node-expand">{isExpanded ? '▼' : '▶'}</span>
        )}
        {!hasChildren && <span className="tree-node-expand-placeholder" />}
        <span className="tree-node-text">{node.label}</span>
      </div>

      {isExpanded && hasChildren && (
        <div className="tree-node-children">
          {node.children!.map((child) => (
            <TreeNodeView
              key={child.id}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Build tree structure from snapshot
 */
function buildTreeFromSnapshot(snapshot: RuntimeSnapshot): TreeNode {
  const valueStoreNode: TreeNode = {
    id: 'valueStore',
    label: `ValueStore (${snapshot.valueStore.slots.length} slots)`,
    type: 'category',
    children: snapshot.valueStore.slots.map((slot) => buildSlotNode(slot)),
  };

  const stateBufferNode: TreeNode = {
    id: 'stateBuffer',
    label: `StateBuffer (${snapshot.stateBuffer.cells.length} cells)`,
    type: 'category',
    children: snapshot.stateBuffer.cells.map((cell) => buildStateCellNode(cell)),
  };

  return {
    id: 'root',
    label: `Runtime State (Frame ${snapshot.metadata.frameId})`,
    type: 'root',
    children: [valueStoreNode, stateBufferNode],
  };
}

/**
 * Build tree node for a ValueStore slot
 */
function buildSlotNode(slot: SlotSnapshot): TreeNode {
  const valueStr = formatValue(slot.value);
  const label = `Slot ${slot.slot}: ${slot.type.world}/${slot.type.domain} = ${valueStr}`;

  return {
    id: `slot-${slot.slot}`,
    label,
    type: 'slot',
    data: slot,
  };
}

/**
 * Build tree node for a StateBuffer cell
 */
function buildStateCellNode(cell: StateCellSnapshot): TreeNode {
  const valueStr = cell.values.length === 1
    ? formatValue(cell.values[0])
    : `[${cell.values.map(formatValue).join(', ')}]`;
  const label = `${cell.nodeId}:${cell.role} = ${valueStr}`;

  return {
    id: `state-${cell.stateId}`,
    label,
    type: 'stateCell',
    data: cell,
  };
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? '+Inf' : '-Inf';
    // Round to 4 decimal places
    return value.toFixed(4);
  }
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return String(value);

  // Handle serialized typed arrays
  if (typeof value === 'object' && value !== null && '_type' in value) {
    const obj = value as { _type: string; length?: number };
    if ('length' in obj) {
      return `${obj._type}[${obj.length}]`;
    }
    return obj._type;
  }

  return JSON.stringify(value);
}

/**
 * Filter tree to only show nodes matching search
 */
function filterTree(node: TreeNode, search: string): TreeNode | null {
  // Check if this node matches
  const matchesThis = node.label.toLowerCase().includes(search);

  // Recursively filter children
  const filteredChildren = node.children
    ?.map((child) => filterTree(child, search))
    .filter((child): child is TreeNode => child !== null);

  // Include node if it matches OR has matching children
  if (matchesThis || (filteredChildren && filteredChildren.length > 0)) {
    return {
      ...node,
      children: filteredChildren,
    };
  }

  return null;
}
