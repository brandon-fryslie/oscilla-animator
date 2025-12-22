/**
 * Modulation Table Types
 *
 * Data structures for the table-based modulation UI.
 * The table is a projection of the Patch, not a separate data store.
 *
 * Columns = Buses (signal sources)
 * Rows = Ports (addressable targets on blocks)
 * Cells = Lens chains binding sources to targets
 */

import type { BlockId, TypeDesc, BusCombineMode, LensDefinition, PortKey } from '../types';
import type { BlockDefinition } from '../blocks/types';

// =============================================================================
// Row Types
// =============================================================================

/**
 * Stable row key for addressing a specific input port.
 * Format: `${blockId}:${portId}`
 */
export type RowKey = string;

/**
 * Group key for organizing rows hierarchically.
 * Format: `${groupKind}:${blockId}` or `${groupKind}:${blockTypeId}`
 */
export type GroupKey = string;

/**
 * How the row's default value is determined.
 */
export type DefaultValueSource = 'blockParam' | 'silent' | 'literal';

/**
 * A row in the modulation table.
 * Represents an input port that can receive modulation from a bus.
 */
export interface TableRow {
  /** Stable key for this row: `${blockId}:${portId}` */
  readonly key: RowKey;

  /** Human-readable label (e.g., "radius") */
  readonly label: string;

  /** Group key for hierarchical display (e.g., "Render: Dots") */
  readonly groupKey: GroupKey;

  /** Owning block ID */
  readonly blockId: BlockId;

  /** Input port ID on the block */
  readonly portId: string;

  /** Expected type for this input */
  readonly type: TypeDesc;

  /** Optional semantic information */
  readonly semantics?: string;

  /** How default value is determined */
  readonly defaultValueSource: DefaultValueSource;
}

/**
 * A group of rows for hierarchical display.
 */
export interface RowGroup {
  /** Group key */
  readonly key: GroupKey;

  /** Display label (e.g., "Render: Dots") */
  readonly label: string;

  /** Block ID this group represents */
  readonly blockId: BlockId;

  /** Block definition for this group */
  readonly blockDef: BlockDefinition;

  /** Row keys in this group */
  readonly rowKeys: readonly RowKey[];

  /** Whether this group is collapsed */
  collapsed: boolean;
}

// =============================================================================
// Column Types
// =============================================================================

/**
 * A column in the modulation table.
 * Represents a bus with computed metadata.
 */
export interface TableColumn {
  /** Bus ID */
  readonly busId: string;

  /** Bus name for display */
  readonly name: string;

  /** Bus type */
  readonly type: TypeDesc;

  /** How multiple publishers are combined */
  readonly combineMode: BusCombineMode;

  /** Whether the bus is active */
  readonly enabled: boolean;

  /** Number of publishers feeding this bus */
  readonly publisherCount: number;

  /** Number of listeners subscribed to this bus */
  readonly listenerCount: number;

  /** Activity level for sorting/UI indication (0-1) */
  readonly activity: number;
}

// =============================================================================
// Cell Types
// =============================================================================

/**
 * Compatibility status of a cell.
 */
export type CellStatus = 'empty' | 'bound' | 'incompatible' | 'convertible';

/**
 * Cost classification for type conversions.
 */
export type CostClass = 'cheap' | 'moderate' | 'heavy';

/**
 * A cell in the modulation table.
 * Represents the intersection of a row (input port) and column (bus).
 */
export interface TableCell {
  /** Row key this cell belongs to */
  readonly rowKey: RowKey;

  /** Bus ID this cell belongs to */
  readonly busId: string;

  /** Listener ID if bound */
  readonly listenerId?: string;

  /** Whether the binding is enabled */
  readonly enabled?: boolean;

  /** Lens chain if bound */
  readonly lensChain?: readonly LensDefinition[];

  /** Compatibility status */
  readonly status: CellStatus;

  /** Suggested lens chain if convertible */
  readonly suggestedChain?: readonly LensDefinition[];

  /** Cost class if conversion required */
  readonly costClass?: CostClass;
}

// =============================================================================
// View State
// =============================================================================

/**
 * Row filter configuration.
 */
export interface RowFilter {
  /** Filter by text (searches labels) */
  text?: string;

  /** Filter by block type */
  blockTypes?: readonly string[];

  /** Only show rows with bindings */
  boundOnly?: boolean;
}

/**
 * Column filter configuration.
 */
export interface ColFilter {
  /** Filter by text (searches names) */
  text?: string;

  /** Filter by domain type */
  domains?: readonly string[];

  /** Only show columns with listeners */
  activeOnly?: boolean;
}

/**
 * Sort mode for buses (columns).
 */
export type BusSortMode = 'alpha' | 'activity' | 'type' | 'custom';

/**
 * Sort mode for rows.
 */
export type RowSortMode = 'rendererFirst' | 'alpha' | 'custom';

/**
 * Table view state - UI preferences and filtering.
 * Stored separately from Patch data.
 */
export interface TableViewState {
  /** View ID */
  readonly id: string;

  /** View name */
  readonly name: string;

  // === Focus ===

  /** Currently focused block ID */
  focusedBlockId?: BlockId;

  /** Currently focused bus ID */
  focusedBusId?: string;

  /** Currently focused cell (row:bus) */
  focusedCell?: { rowKey: RowKey; busId: string };

  // === Column behavior ===

  /** Pinned bus IDs (always visible) */
  pinnedBusIds: string[];

  /** Hidden bus IDs */
  hiddenBusIds: string[];

  // === Row behavior ===

  /** Collapsed group keys */
  collapsedGroups: Record<GroupKey, boolean>;

  /** Hidden row keys */
  hiddenRowKeys: Record<RowKey, boolean>;

  // === Filters ===

  /** Row filter configuration */
  rowFilter: RowFilter;

  /** Column filter configuration */
  colFilter: ColFilter;

  // === Sorting ===

  /** Bus (column) sort mode */
  busSort: BusSortMode;

  /** Row sort mode */
  rowSort: RowSortMode;

  // === UX options ===

  /** Only show cells with bindings */
  showOnlyBoundCells: boolean;

  /** Only show compatible columns for focused row */
  showOnlyCompatibleColumnsForFocusedRow: boolean;
}

// =============================================================================
// Performance Indexes
// =============================================================================

/**
 * Derived indexes for O(1) lookups.
 * Rebuilt on patch load / each transaction.
 */
export interface PatchIndex {
  /** Listener by input port (one listener per port max) */
  listenersByInputPort: Map<PortKey, string>;

  /** Publisher IDs by bus */
  publishersByBus: Map<string, readonly string[]>;

  /** Listener IDs by bus */
  listenersByBus: Map<string, readonly string[]>;

  /** Port IDs by block */
  portsByBlock: Map<BlockId, { inputs: readonly string[]; outputs: readonly string[] }>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a row key from block and port IDs.
 */
export function createRowKey(blockId: BlockId, portId: string): RowKey {
  return `${blockId}:${portId}`;
}

/**
 * Parse a row key into block and port IDs.
 */
export function parseRowKey(key: RowKey): { blockId: BlockId; portId: string } | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) return null;
  return {
    blockId: key.slice(0, colonIndex),
    portId: key.slice(colonIndex + 1),
  };
}

/**
 * Create a group key from group kind and block ID.
 */
export function createGroupKey(groupKind: string, blockId: BlockId): GroupKey {
  return `${groupKind}:${blockId}`;
}

/**
 * Parse a group key into kind and block ID.
 */
export function parseGroupKey(key: GroupKey): { kind: string; blockId: BlockId } | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) return null;
  return {
    kind: key.slice(0, colonIndex),
    blockId: key.slice(colonIndex + 1),
  };
}

/**
 * Create default table view state.
 */
export function createDefaultViewState(id: string, name: string = 'Default'): TableViewState {
  return {
    id,
    name,
    pinnedBusIds: [],
    hiddenBusIds: [],
    collapsedGroups: {},
    hiddenRowKeys: {},
    rowFilter: {},
    colFilter: {},
    busSort: 'alpha',
    rowSort: 'rendererFirst',
    showOnlyBoundCells: false,
    showOnlyCompatibleColumnsForFocusedRow: false,
  };
}
