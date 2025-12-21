/**
 * @file Root Store
 * @description Ties all the other stores together.
 */
import { makeObservable, computed, action } from 'mobx';
import { PatchStore } from './PatchStore';
import { BusStore } from './BusStore';
import { UIStateStore } from './UIStateStore';
import { CompositeStore } from './CompositeStore';
import { LogStore } from '../logStore';
import { EventDispatcher } from '../events';
import type { Block, Bus, Lane, Patch, Slot } from '../types';
import breathingDotsPatch from '../demo-patches/breathing-dots.json';

export class RootStore {
  // Event dispatcher (created first so stores can set up listeners)
  events: EventDispatcher;

  // Stores
  patchStore: PatchStore;
  busStore: BusStore;
  uiStore: UIStateStore;
  compositeStore: CompositeStore;
  logStore: LogStore;

  private nextId = 1;

  constructor() {
    // Create event dispatcher first so stores can subscribe in their constructors
    this.events = new EventDispatcher();

    // Create log store before other stores (they may want to log during init)
    this.logStore = new LogStore();

    // Create domain stores
    this.patchStore = new PatchStore(this);
    this.busStore = new BusStore(this);
    this.uiStore = new UIStateStore(this);
    this.compositeStore = new CompositeStore(this);

    makeObservable(this, {
      selectedBlock: computed,
      selectedBus: computed,
      activeLane: computed,
      selectedPortInfo: computed,
      loadPatch: action,
      clearPatch: action,
      loadDemoAnimation: action,
    });

    // Initialize default buses for a new patch
    this.busStore.createDefaultBuses();

    // Wire up event listeners
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for cross-store coordination.
   * This decouples stores from each other - they communicate via events.
   */
  private setupEventListeners(): void {
    // MacroExpanded → Auto-clear logs if setting enabled
    this.events.on('MacroExpanded', () => {
      if (this.logStore.autoClearOnMacro) {
        this.logStore.clear();
      }
    });

    // BusDeleted → Clear selection if deleted bus was selected
    this.events.on('BusDeleted', (event) => {
      if (this.uiStore.uiState.selectedBusId === event.busId) {
        this.uiStore.uiState.selectedBusId = null;
      }
    });

    // BlockRemoved → Clear selection if removed block was selected
    this.events.on('BlockRemoved', (event) => {
      if (this.uiStore.uiState.selectedBlockId === event.blockId) {
        this.uiStore.uiState.selectedBlockId = null;
      }
    });

    // BlockReplaced → Update selection if replaced block was selected
    this.events.on('BlockReplaced', (event) => {
      if (this.uiStore.uiState.selectedBlockId === event.oldBlockId) {
        this.uiStore.selectBlock(event.newBlockId);
      }
    });
  }

  generateId(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  get selectedBlock(): Block | null {
    const { selectedBlockId } = this.uiStore.uiState;
    if (!selectedBlockId) return null;
    return this.patchStore.blocks.find((b) => b.id === selectedBlockId) ?? null;
  }

  get selectedBus(): Bus | null {
    const { selectedBusId } = this.uiStore.uiState;
    if (!selectedBusId) return null;
    return this.busStore.buses.find((b) => b.id === selectedBusId) ?? null;
  }

  get activeLane(): Lane | null {
    const { activeLaneId } = this.uiStore.uiState;
    if (!activeLaneId) return null;
    return this.patchStore.lanes.find((l) => l.id === activeLaneId) ?? null;
  }

  get selectedPortInfo(): { block: Block; slot: Slot; direction: 'input' | 'output' } | null {
    const portRef = this.uiStore.uiState.selectedPort;
    if (!portRef) return null;

    const block = this.patchStore.blocks.find((b) => b.id === portRef.blockId);
    if (!block) return null;

    const slots = portRef.direction === 'input' ? block.inputs : block.outputs;
    const slot = slots.find((s) => s.id === portRef.slotId);
    if (!slot) return null;

    return { block, slot, direction: portRef.direction };
  }

  // =============================================================================
  // Serialization
  // =============================================================================

  toJSON(): Patch {
    const hasBuses = this.busStore.buses.length > 0 || this.busStore.publishers.length > 0 || this.busStore.listeners.length > 0;

    return {
      version: hasBuses ? 2 : 1,
      features: hasBuses ? { buses: true } : undefined,
      blocks: this.patchStore.blocks.map((b) => ({ ...b })),
      connections: this.patchStore.connections.map((c) => ({ ...c })),
      lanes: this.patchStore.lanes.map((l) => ({ ...l })),
      ...(hasBuses && {
        buses: this.busStore.buses.map((b) => ({ ...b })),
        publishers: this.busStore.publishers.map((p) => ({ ...p })),
        listeners: this.busStore.listeners.map((l) => ({ ...l })),
      }),
      settings: { ...this.uiStore.settings },
    };
  }

  loadPatch(patch: Patch): void {
    const migratedBlocks = patch.blocks.map(block => ({
      ...block,
      params: this.migrateBlockParams(block.type, block.params),
    }));

    this.patchStore.blocks = migratedBlocks;
    this.patchStore.connections = patch.connections;
    this.patchStore.lanes = patch.lanes;
    this.uiStore.settings = {
      seed: patch.settings?.seed || 0,
      speed: patch.settings?.speed || 1,
      finiteLoopMode: patch.settings?.finiteLoopMode ?? true,
      advancedLaneMode: patch.settings?.advancedLaneMode || false,
      autoConnect: patch.settings?.autoConnect || false,
      showTypeHints: patch.settings?.showTypeHints || false,
      highlightCompatible: patch.settings?.highlightCompatible || false,
      warnBeforeDisconnect: patch.settings?.warnBeforeDisconnect || true,
      filterByLane: patch.settings?.filterByLane || false,
      filterByConnection: patch.settings?.filterByConnection || false,
    };

    if (patch.version >= 2 || (patch.features?.buses)) {
      this.busStore.buses = patch.buses || [];
      this.busStore.publishers = patch.publishers || [];
      this.busStore.listeners = patch.listeners || [];
    } else {
      this.busStore.buses = [];
      this.busStore.publishers = [];
      this.busStore.listeners = [];
    }

    // Create default buses if none exist in loaded patch
    this.busStore.createDefaultBuses();

    if ('composites' in patch && Array.isArray((patch as any).composites)) {
      this.compositeStore.composites = (patch as any).composites;
    } else {
      this.compositeStore.composites = [];
    }
    this.uiStore.uiState.selectedBlockId = null;

    const maxId = Math.max(
      ...this.patchStore.blocks.map((b) => parseInt(b.id.split('-')[1]) || 0),
      ...this.patchStore.connections.map((c) => parseInt(c.id.split('-')[1]) || 0)
    );
    this.nextId = maxId + 1;

    // Emit PatchLoaded event AFTER all state changes committed
    this.events.emit({
      type: 'PatchLoaded',
      blockCount: this.patchStore.blocks.length,
      connectionCount: this.patchStore.connections.length,
    });
  }

  private migrateBlockParams(type: string, params: Record<string, unknown>): Record<string, unknown> {
    if (type === 'SVGPathSource' && params.target) {
        const target = String(params.target);
        if (target === 'logo') return { ...params, target: 'builtin:logo' };
        if (target === 'text') return { ...params, target: 'builtin:text' };
        if (target === 'heart') return { ...params, target: 'builtin:heart' };
    }
    return params;
  }

  clearPatch(): void {
    this.patchStore.blocks = [];
    this.patchStore.connections = [];
    this.busStore.buses = [];
    this.busStore.publishers = [];
    this.busStore.listeners = [];
    this.uiStore.uiState.selectedBlockId = null;
    this.uiStore.previewedDefinition = null;

    for (const lane of this.patchStore.lanes) {
      lane.blockIds = [];
    }

    // Create default buses for new empty patch
    this.busStore.createDefaultBuses();

    // Emit PatchCleared event AFTER state changes committed
    this.events.emit({ type: 'PatchCleared' });
  }

  loadDemoAnimation(): void {
    this.loadPatch(breathingDotsPatch as Patch);
  }
}
