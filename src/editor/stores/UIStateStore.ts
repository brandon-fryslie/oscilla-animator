/**
 * @file UI State Store
 * @description Manages UI-related state like selection, playback, and editor settings.
 */
import { makeObservable, observable, action } from 'mobx';
import type { BlockId, LaneId, LaneKind, PortRef } from '../types';
import type { RootStore } from './RootStore';

export class UIStateStore {
  uiState = {
    selectedBlockId: null as BlockId | null,
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
    isPlaying: true, // Start playing by default (auto-play)
    currentTime: 0, // seconds
  };

  settings = {
    seed: 0,
    speed: 1.0,
    finiteLoopMode: true, // false = 'once' (stop at end), true = 'loop' (rewind and continue)
    advancedLaneMode: false, // Controls lane visibility (Simple vs Detailed)
    autoConnect: false, // Auto-create connections on block drop
    showTypeHints: false, // Show type labels on ports
    highlightCompatible: false, // Highlight compatible ports when dragging
    warnBeforeDisconnect: false, // Confirmation before removing connections
    filterByLane: false, // Filter library by lane compatibility
    filterByConnection: false, // Filter library by connection context
  };

  // Compiled program for preview (cached)
  previewedDefinition: any = null;

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    makeObservable(this, {
      uiState: observable,
      settings: observable,
      previewedDefinition: observable,

      // Actions
      selectBlock: action,
      deselectBlock: action,
      selectBus: action,
      deselectBus: action,
      play: action,
      pause: action,
      seek: action,
      togglePlayPause: action,
      setSeed: action,
      setSpeed: action,
      setFiniteLoopMode: action,
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
    });
  }

  // =============================================================================
  // Actions - Selection
  // =============================================================================

  selectBlock(id: BlockId | null): void {
    this.uiState.selectedBlockId = id;
    if (id !== null) {
      this.uiState.selectedBusId = null; // Deselect bus when block selected
    }
  }

  deselectBlock(): void {
    this.uiState.selectedBlockId = null;
  }

  selectBus(id: string | null): void {
    this.uiState.selectedBusId = id;
    if (id !== null) {
      this.uiState.selectedBlockId = null; // Deselect block when bus selected
    }
  }

  deselectBus(): void {
    this.uiState.selectedBusId = null;
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

  setFiniteLoopMode(enabled: boolean): void {
    this.settings.finiteLoopMode = enabled;
  }

  // =============================================================================
  // Actions - Settings
  // =============================================================================

  setAdvancedLaneMode(enabled: boolean): void {
    this.settings.advancedLaneMode = enabled;

    // Switch layout based on mode
    if (enabled) {
      this.root.patchStore.switchLayout('detailed');
    } else {
      this.root.patchStore.switchLayout('simple');
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

  setPreviewedDefinition(definition: any): void {
    this.previewedDefinition = definition;
  }

  /**
   * Preview a block definition from the library (before placement).
   */
  previewDefinition(definition: any | null): void {
    this.previewedDefinition = definition;
    // Clear selected block when previewing
    if (definition) {
      this.uiState.selectedBlockId = null;
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
