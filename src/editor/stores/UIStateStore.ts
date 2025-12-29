/**
 * @file UI State Store
 * @description Manages UI-related state like selection, playback, and editor settings.
 */
import { makeObservable, observable, action, computed } from 'mobx';
import type { BlockId, LaneId, LaneKind, PortRef } from '../types';
import type { RootStore } from './RootStore';
import type { BlockDefinition } from '../blocks';

/**
 * Selected connection - can be wire, publisher, listener, or a cell (potential connection)
 */
export type SelectedConnection = {
  type: 'wire' | 'publisher' | 'listener';
  id: string;
} | {
  type: 'cell';
  rowKey: string;  // RowKey from ModulationTable (blockId:slotId)
  busId: string;
  direction: 'input' | 'output';
} | null;

/**
 * Inspector history entry - tracks where we came from for back navigation
 */
export type InspectorHistoryEntry = {
  type: 'block' | 'bus' | 'port';
  blockId?: string | null;
  busId?: string | null;
  portRef?: PortRef | null;
};

/**
 * Selection rectangle for drag-select
 */
export interface SelectionRectangle {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export class UIStateStore {
  uiState = {
    selectedBlockId: null as BlockId | null,
    selectedBlockIds: new Set<BlockId>(), // Multi-select support
    selectedBusId: null as string | null,
    draggingBlockType: null as string | null,
    draggingLaneKind: null as LaneKind | null,
    activeLaneId: null as LaneId | null,
    hoveredPort: null as PortRef | null,
    selectedPort: null as PortRef | null,
    contextMenu: {
      isOpen: false,
      x: 0,
      y: 0,
      portRef: null as PortRef | null,
    },
    blockContextMenu: {
      isOpen: false,
      x: 0,
      y: 0,
      blockId: null as BlockId | null,
    },
    // Selection rectangle for drag-select
    selectionRectangle: null as SelectionRectangle | null,
    // DO NOT CHANGE THIS DEFAULT VALUE. The app MUST auto-play on load.
    // If you change this, you will break the user experience and the demo.
    // Seriously, don't fucking touch it.
    isPlaying: true,
    currentTime: 0, // seconds
    // Connection selection - mutually exclusive with block/bus selection
    selectedConnection: null as SelectedConnection,
  };

  // Inspector history stack for back navigation (max 10 entries)
  inspectorHistory: InspectorHistoryEntry[] = [];

  settings = {
    seed: 0,
    speed: 1.0,
    currentLayoutId: 'default' as string,
    advancedLaneMode: false, // Controls lane visibility (Simple vs Detailed)
    autoConnect: false, // Auto-create connections on block drop
    showTypeHints: false, // Show type labels on ports
    highlightCompatible: false, // Highlight compatible ports when dragging
    warnBeforeDisconnect: false, // Confirmation before removing connections
    filterByLane: false, // Filter library by lane compatibility
    filterByConnection: false, // Filter library by connection context
  };

  // Compiled program for preview (cached)
  previewedDefinition: BlockDefinition | null = null;

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    makeObservable(this, {
      uiState: observable,
      settings: observable,
      previewedDefinition: observable,
      inspectorHistory: observable,

      // Computed
      hasMultiSelection: computed,

      // Actions
      selectBlock: action,
      deselectBlock: action,
      toggleBlockSelection: action,
      setBlockSelection: action,
      clearBlockSelection: action,
      selectBus: action,
      deselectBus: action,
      selectConnection: action,
      selectCell: action,
      deselectConnection: action,
      pushInspectorHistory: action,
      popInspectorHistory: action,
      clearInspectorHistory: action,
      play: action,
      pause: action,
      seek: action,
      togglePlayPause: action,
      setSeed: action,
      setSpeed: action,
      setAdvancedLaneMode: action,
      setAutoConnect: action,
      setShowTypeHints: action,
      setHighlightCompatible: action,
      setWarnBeforeDisconnect: action,
      setFilterByLane: action,
      setFilterByConnection: action,
      setPreviewedDefinition: action,
      previewDefinition: action,
      setPlaying: action,
      setActiveLane: action,
      setHoveredPort: action,
      setSelectedPort: action,
      openContextMenu: action,
      closeContextMenu: action,
      openBlockContextMenu: action,
      closeBlockContextMenu: action,
      setDraggingLaneKind: action,
      startSelectionRectangle: action,
      updateSelectionRectangle: action,
      endSelectionRectangle: action,
    });
  }

  // =============================================================================
  // Computed
  // =============================================================================

  /**
   * Returns true if more than one block is selected
   */
  get hasMultiSelection(): boolean {
    return this.uiState.selectedBlockIds.size > 1;
  }

  // =============================================================================
  // Actions - Selection
  // =============================================================================

  /**
   * Select a single block (clears multi-selection)
   */
  selectBlock(id: BlockId | null): void {
    this.uiState.selectedBlockId = id;
    this.uiState.selectedBlockIds.clear();
    if (id !== null) {
      this.uiState.selectedBlockIds.add(id);
      this.uiState.selectedBusId = null; // Deselect bus when block selected
      this.uiState.selectedConnection = null; // Deselect connection when block selected
      this.clearInspectorHistory(); // Clear history on direct selection
    }
  }

  deselectBlock(): void {
    this.uiState.selectedBlockId = null;
    this.uiState.selectedBlockIds.clear();
  }

  /**
   * Toggle a block in the multi-selection (for Shift+Click)
   */
  toggleBlockSelection(id: BlockId): void {
    if (this.uiState.selectedBlockIds.has(id)) {
      this.uiState.selectedBlockIds.delete(id);
    } else {
      this.uiState.selectedBlockIds.add(id);
    }

    // Update selectedBlockId to the last selected block (for inspector)
    if (this.uiState.selectedBlockIds.size > 0) {
      // Use the most recently added block as the "primary" selection
      this.uiState.selectedBlockId = id;
    } else {
      this.uiState.selectedBlockId = null;
    }
  }

  /**
   * Set the entire block selection (for drag-select)
   */
  setBlockSelection(ids: Set<BlockId>): void {
    this.uiState.selectedBlockIds = new Set(ids);
    if (ids.size > 0) {
      // Set the first ID as the primary selection for inspector
      this.uiState.selectedBlockId = Array.from(ids)[0];
      this.uiState.selectedBusId = null;
      this.uiState.selectedConnection = null;
    } else {
      this.uiState.selectedBlockId = null;
    }
  }

  /**
   * Clear all block selections
   */
  clearBlockSelection(): void {
    this.uiState.selectedBlockId = null;
    this.uiState.selectedBlockIds.clear();
  }

  selectBus(id: string | null): void {
    this.uiState.selectedBusId = id;
    if (id !== null) {
      this.uiState.selectedBlockId = null; // Deselect block when bus selected
      this.uiState.selectedBlockIds.clear();
      this.uiState.selectedConnection = null; // Deselect connection when bus selected
      this.clearInspectorHistory(); // Clear history on direct selection
    }
  }

  deselectBus(): void {
    this.uiState.selectedBusId = null;
  }

  /**
   * Select a connection (wire, publisher, or listener).
   * Clears block/bus selection - mutually exclusive.
   */
  selectConnection(type: 'wire' | 'publisher' | 'listener', id: string): void {
    // Push current state to history before navigating to connection
    this.pushInspectorHistory();

    this.uiState.selectedConnection = { type, id };
    this.uiState.selectedBlockId = null;
    this.uiState.selectedBlockIds.clear();
    this.uiState.selectedBusId = null;
    this.uiState.selectedPort = null;
  }

  /**
   * Select a modulation table cell (potential or existing connection).
   */
  selectCell(rowKey: string, busId: string, direction: 'input' | 'output'): void {
    // Push current state to history before navigating
    this.pushInspectorHistory();

    this.uiState.selectedConnection = { type: 'cell', rowKey, busId, direction };
    this.uiState.selectedBlockId = null;
    this.uiState.selectedBlockIds.clear();
    this.uiState.selectedBusId = null;
    this.uiState.selectedPort = null;
  }

  deselectConnection(): void {
    this.uiState.selectedConnection = null;
  }

  /**
   * Push current inspector state to history for back navigation.
   */
  pushInspectorHistory(): void {
    const entry: InspectorHistoryEntry = {
      type: this.uiState.selectedBusId !== null ? 'bus' :
            this.uiState.selectedPort !== null ? 'port' : 'block',
      blockId: this.uiState.selectedBlockId,
      busId: this.uiState.selectedBusId,
      portRef: this.uiState.selectedPort,
    };

    // Only push if there's something to go back to
    if (entry.blockId !== null || entry.busId !== null || entry.portRef !== null) {
      this.inspectorHistory.push(entry);
      // Limit to 10 entries
      if (this.inspectorHistory.length > 10) {
        this.inspectorHistory.shift();
      }
    }
  }

  /**
   * Pop from history and restore previous inspector state.
   * Returns the popped entry or null if history is empty.
   */
  popInspectorHistory(): InspectorHistoryEntry | null {
    const entry = this.inspectorHistory.pop();
    if (entry === undefined) {
      // No history - just clear connection
      this.uiState.selectedConnection = null;
      return null;
    }

    // Restore state from history entry
    this.uiState.selectedConnection = null;
    this.uiState.selectedBlockId = entry.blockId ?? null;
    this.uiState.selectedBusId = entry.busId ?? null;
    this.uiState.selectedPort = entry.portRef ?? null;

    return entry;
  }

  /**
   * Clear inspector history (called on direct selection).
   */
  clearInspectorHistory(): void {
    this.inspectorHistory = [];
  }

  // =============================================================================
  // Actions - Selection Rectangle (Drag-Select)
  // =============================================================================

  /**
   * Start a selection rectangle drag
   */
  startSelectionRectangle(x: number, y: number): void {
    this.uiState.selectionRectangle = {
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    };
  }

  /**
   * Update the selection rectangle during drag
   */
  updateSelectionRectangle(x: number, y: number): void {
    if (this.uiState.selectionRectangle !== null) {
      this.uiState.selectionRectangle.currentX = x;
      this.uiState.selectionRectangle.currentY = y;
    }
  }

  /**
   * End the selection rectangle drag
   */
  endSelectionRectangle(): void {
    this.uiState.selectionRectangle = null;
  }

  // =============================================================================
  // Actions - Transport
  // =============================================================================

  play(): void {
    this.uiState.isPlaying = true;
  }

  pause(): void {
    this.uiState.isPlaying = false;
  }

  seek(time: number): void {
    this.uiState.currentTime = time;
  }

  togglePlayPause(): void {
    this.uiState.isPlaying = !this.uiState.isPlaying;
  }

  setSeed(seed: number): void {
    this.settings.seed = seed;
  }

  setSpeed(speed: number): void {
    this.settings.speed = speed;
  }

  // =============================================================================
  // Actions - Settings
  // =============================================================================

  setAdvancedLaneMode(enabled: boolean): void {
    this.settings.advancedLaneMode = enabled;

    // Switch layout based on mode
    if (enabled) {
      this.root.viewStore.switchLayout('detailed');
    } else {
      this.root.viewStore.switchLayout('simple');
    }
  }

  setAutoConnect(enabled: boolean): void {
    this.settings.autoConnect = enabled;
  }

  setShowTypeHints(enabled: boolean): void {
    this.settings.showTypeHints = enabled;
  }

  setHighlightCompatible(enabled: boolean): void {
    this.settings.highlightCompatible = enabled;
  }

  setWarnBeforeDisconnect(enabled: boolean): void {
    this.settings.warnBeforeDisconnect = enabled;
  }

  setFilterByLane(enabled: boolean): void {
    this.settings.filterByLane = enabled;
  }

  setFilterByConnection(enabled: boolean): void {
    this.settings.filterByConnection = enabled;
  }

  // =============================================================================
  // Actions - Preview Management
  // =============================================================================

  setPreviewedDefinition(definition: Readonly<BlockDefinition | null>): void {
    this.previewedDefinition = definition;
  }

  /**
   * Preview a block definition from the library (before placement).
   */
  previewDefinition(definition: Readonly<BlockDefinition | null>): void {
    this.previewedDefinition = definition;
    // Clear selected block when previewing
    if (definition !== null && definition !== undefined) {
      this.uiState.selectedBlockId = null;
      this.uiState.selectedBlockIds.clear();
    }
  }

  setPlaying(playing: boolean): void {
    this.uiState.isPlaying = playing;
  }

  setActiveLane(laneId: LaneId | null): void {
    this.uiState.activeLaneId = laneId;
  }

  setHoveredPort(port: PortRef | null): void {
    this.uiState.hoveredPort = port;
  }

  setSelectedPort(port: PortRef | null): void {
    this.uiState.selectedPort = port;
  }

  openContextMenu(x: number, y: number, portRef: PortRef): void {
    this.uiState.contextMenu = {
      isOpen: true,
      x,
      y,
      portRef,
    };
  }

  closeContextMenu(): void {
    this.uiState.contextMenu = {
      isOpen: false,
      x: 0,
      y: 0,
      portRef: null,
    };
  }

  openBlockContextMenu(x: number, y: number, blockId: BlockId): void {
    this.uiState.blockContextMenu = {
      isOpen: true,
      x,
      y,
      blockId,
    };
  }

  closeBlockContextMenu(): void {
    this.uiState.blockContextMenu = {
      isOpen: false,
      x: 0,
      y: 0,
      blockId: null,
    };
  }

  setDraggingLaneKind(laneKind: LaneKind | null): void {
    this.uiState.draggingLaneKind = laneKind;
  }
}
