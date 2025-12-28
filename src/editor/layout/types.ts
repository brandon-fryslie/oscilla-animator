/**
 * Layout Engine Types
 *
 * Type definitions for the deterministic layout engine.
 * All types are immutable and serializable for debugging and caching.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md
 */

import type { BlockId as EditorBlockId } from '../types';

// Re-export BlockId for convenience
export type BlockId = EditorBlockId;

// =============================================================================
// Geometry Primitives
// =============================================================================

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

// =============================================================================
// Role System
// =============================================================================

/**
 * Block roles determine column assignment and ordering priority.
 * Derived from block capabilities and registry metadata.
 */
export type Role =
  | 'time'
  | 'identity'
  | 'state'
  | 'operator'
  | 'render'
  | 'io';

/**
 * Column assignment based on role.
 */
export type ColumnIndex = number;

// =============================================================================
// Layout Result
// =============================================================================

/**
 * Complete layout result for rendering.
 * Pure function output - no side effects, fully deterministic.
 */
export interface LayoutResult {
  /** Positioned blocks keyed by BlockId */
  readonly nodes: Record<BlockId, LayoutNodeView>;

  /** Short connectors that can be drawn (d <= Lmax) */
  readonly connectors: LayoutConnector[];

  /** Long edges that overflow to chips (d > Lmax) */
  readonly overflowLinks: OverflowLink[];

  /** World-space bounding box for zoom-to-fit */
  readonly boundsWorld: Rect;

  /** Column metadata for debug visualization */
  readonly columns: ColumnLayoutMeta[];

  /** Optional debug information */
  readonly debug?: LayoutDebugInfo;
}

/**
 * Positioned block node with layout metadata.
 */
export interface LayoutNodeView {
  readonly blockId: BlockId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;

  /** Column index (0, 1, 2, ...) */
  readonly column: ColumnIndex;

  /** Deterministic ordering key for this row */
  readonly rowKey: string;

  /** Block role */
  readonly role: Role;

  /** Depth in dependency graph (after SCC collapse) */
  readonly depth: number;

  /** Cluster grouping key (for proximity) */
  readonly clusterKey: string;

  /** SCC identifier if in a cycle */
  readonly sccId?: string;

  /** True if this block is the leader of its SCC */
  readonly isCycleGroupLeader?: boolean;
}

/**
 * Drawable connector between blocks.
 * Only emitted for short edges (distance <= Lmax).
 */
export interface LayoutConnector {
  readonly id: string;
  readonly from: PortAnchor;
  readonly to: PortAnchor;
  readonly style: ConnectorStyle;
}

export type ConnectorStyle = 'straight' | 'elbow' | 'curve';

export interface PortAnchor {
  readonly blockId: BlockId;
  readonly portId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Overflow link for edges too long to draw.
 * Rendered as a chip on the destination port.
 */
export interface OverflowLink {
  readonly id: string;
  readonly to: PortAnchor;
  readonly from: {
    readonly blockId: BlockId;
    readonly portId: string;
    readonly blockName: string;
  };
  readonly reason: OverflowReason;
}

export type OverflowReason = 'tooLong' | 'densityCollapsed' | 'culled';

/**
 * Column metadata for layout.
 */
export interface ColumnLayoutMeta {
  readonly columnIndex: ColumnIndex;
  readonly x: number;
  readonly width: number;
  readonly roles: Role[];
}

/**
 * Debug information for visualization and diagnostics.
 */
export interface LayoutDebugInfo {
  readonly totalBlocks: number;
  readonly totalConnectors: number;
  readonly totalOverflowLinks: number;
  readonly columnCount: number;
  readonly sccCount: number;
  readonly maxDepth: number;
  readonly clusterCount: number;
}

// =============================================================================
// Input Data Structures
// =============================================================================

/**
 * Graph data required for layout computation.
 * Minimal projection from full patch state.
 */
export interface GraphData {
  readonly blocks: LayoutBlockData[];
  readonly directBindings: DirectBinding[];
  readonly busBindings: BusBinding[];
}

/**
 * Block data needed for layout.
 */
export interface LayoutBlockData {
  readonly id: BlockId;
  readonly type: string;
  readonly label: string;
  readonly role: Role;
  readonly inputs: PortInfo[];
  readonly outputs: PortInfo[];
}

export interface PortInfo {
  readonly id: string;
  readonly label: string;
  readonly direction: 'input' | 'output';
}

/**
 * Direct connection between blocks (wire).
 */
export interface DirectBinding {
  readonly id: string;
  readonly from: { blockId: BlockId; portId: string };
  readonly to: { blockId: BlockId; portId: string };
}

/**
 * Bus binding (publisher or listener).
 */
export interface BusBinding {
  readonly blockId: BlockId;
  readonly portId: string;
  readonly busId: string;
  readonly direction: 'publish' | 'subscribe';
}

// =============================================================================
// UI State
// =============================================================================

/**
 * UI state that affects layout.
 */
export interface UILayoutState {
  /** Density mode affects block sizing and connector visibility */
  readonly density: DensityMode;

  /** Focused block ID (if any) */
  readonly focusedBlockId?: BlockId;

  /** Focused bus ID (if any) */
  readonly focusedBusId?: string;

  /** Hovered block ID (if any) */
  readonly hoveredBlockId?: BlockId;

  /** Viewport rect in world coordinates (for culling) */
  readonly viewportRectWorld?: Rect;
}

export type DensityMode = 'overview' | 'normal' | 'detail';

// =============================================================================
// Internal Layout Structures
// =============================================================================

/**
 * Block placement data (internal).
 */
export interface BlockPlacement {
  readonly blockId: BlockId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly column: ColumnIndex;
  readonly clusterKey: string;
}

/**
 * SCC (Strongly Connected Component) representing a cycle in the dependency graph.
 */
export interface SCC {
  readonly id: string;
  readonly blocks: BlockId[];
  readonly leader: BlockId; // Block with minimum ID
}

/**
 * Meta-node in the collapsed DAG (either a single block or an SCC).
 */
export type MetaNode =
  | { kind: 'single'; blockId: BlockId }
  | { kind: 'scc'; scc: SCC };

/**
 * Bus signature for cluster key calculation.
 */
export interface BusSignature {
  readonly items: BusSignatureItem[];
}

export interface BusSignatureItem {
  readonly busId: string;
  readonly direction: 'P' | 'S'; // Publish or Subscribe
}
