/**
 * @file Root Store
 * @description Ties all the other stores together.
 */
import { makeObservable, computed, action } from 'mobx';
import { PatchStore } from './PatchStore';
import { BusStore } from './BusStore';
import { UIStateStore } from './UIStateStore';
import { ViewStateStore } from './ViewStateStore';
import { CompositeStore } from './CompositeStore';
import { DefaultSourceStore } from './DefaultSourceStore';
import { DiagnosticStore } from './DiagnosticStore';
import { LogStore } from '../logStore';
import { EventDispatcher } from '../events';
import { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import { ActionExecutor } from '../diagnostics/ActionExecutor';
import type { Block, Bus, Composite, Lane, Patch, Slot } from '../types';

export class RootStore {
  // Event dispatcher (created first so stores can set up listeners)
  events: EventDispatcher;

  // Stores
  patchStore: PatchStore;
  busStore: BusStore;
  uiStore: UIStateStore;
  viewStore: ViewStateStore;
  compositeStore: CompositeStore;
  defaultSourceStore: DefaultSourceStore;
  logStore: LogStore;

  // Diagnostics
  diagnosticHub: DiagnosticHub;
  diagnosticStore: DiagnosticStore;
  actionExecutor: ActionExecutor;

  private nextId = 1;

  constructor() {
    // Create event dispatcher first so stores can set up listeners)
    this.events = new EventDispatcher();

    // Create log store before other stores (they may want to log during init)
    this.logStore = new LogStore();

    // Create domain stores
    this.patchStore = new PatchStore(this);
    this.busStore = new BusStore(this);
    this.uiStore = new UIStateStore(this);
    this.viewStore = new ViewStateStore(this);
    this.compositeStore = new CompositeStore(this);
    this.defaultSourceStore = new DefaultSourceStore();

    // Create diagnostic infrastructure (after patchStore)
    this.diagnosticHub = new DiagnosticHub(this.events, this.patchStore);
    this.diagnosticStore = new DiagnosticStore(this.diagnosticHub);

        // Create action executor (after stores and diagnostic hub)

        this.actionExecutor = new ActionExecutor(

          this.patchStore,

          this.uiStore,

          this.viewStore,

          this.diagnosticHub

        );

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

    // Invalidate diagnostic store on key lifecycle events
    this.events.on('CompileFinished', () => this.diagnosticStore.invalidate());
    this.events.on('ProgramSwapped', () => this.diagnosticStore.invalidate());
    this.events.on('GraphCommitted', () => this.diagnosticStore.invalidate());
    this.events.on('RuntimeHealthSnapshot', () => this.diagnosticStore.invalidate());
  }

  generateId(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  get selectedBlock(): Block | null {
    const { selectedBlockId } = this.uiStore.uiState;
    if (selectedBlockId === null || selectedBlockId === undefined) return null;
    return this.patchStore.blocks.find((b) => b.id === selectedBlockId) ?? null;
  }

  get selectedBus(): Bus | null {
    const { selectedBusId } = this.uiStore.uiState;
    if (selectedBusId === null || selectedBusId === undefined) return null;
    return this.busStore.buses.find((b) => b.id === selectedBusId) ?? null;
  }

  get activeLane(): Lane | null {
    const { activeLaneId } = this.uiStore.uiState;
    if (activeLaneId === null || activeLaneId === undefined) return null;
    return this.viewStore.lanes.find((l) => l.id === activeLaneId) ?? null;
  }

  get selectedPortInfo(): { block: Block; slot: Slot; direction: 'input' | 'output' } | null {
    const portRef = this.uiStore.uiState.selectedPort;
    if (portRef === null || portRef === undefined) return null;

    const block = this.patchStore.blocks.find((b) => b.id === portRef.blockId);
    if (block === null || block === undefined) return null;

    const slots = portRef.direction === 'input' ? block.inputs : block.outputs;
    const slot = slots.find((s) => s.id === portRef.slotId);
    if (slot === null || slot === undefined) return null;

    return { block, slot, direction: portRef.direction };
  }

  // =============================================================================
  // Serialization
  // =============================================================================

  toJSON(): Patch {
    return {
      version: 2,
      blocks: this.patchStore.blocks.map((b) => ({ ...b })),
      connections: this.patchStore.connections.map((c) => ({ ...c })),
      lanes: this.viewStore.lanes.map((l) => ({ ...l })),
      buses: this.busStore.buses.map((b) => ({ ...b })),
      publishers: this.busStore.publishers.map((p) => ({ ...p })),
      listeners: this.busStore.listeners.map((l) => ({ ...l })),
      defaultSources: Array.from(this.defaultSourceStore.sources.values()).map((s) => ({ ...s })),
      settings: { 
        ...this.uiStore.settings,
        currentLayoutId: this.viewStore.currentLayoutId,
      },
    };
  }

    loadPatch(patch: Patch): void {
    this.patchStore.blocks = patch.blocks.map((block) => ({ ...block }));
    this.patchStore.connections = patch.connections.map((connection) => ({ ...connection }));

    // View state
    if (patch.lanes !== undefined && patch.lanes !== null) {
      this.viewStore.lanes = patch.lanes;
    }
    if (patch.settings !== null && patch.settings !== undefined && patch.settings.currentLayoutId !== null && patch.settings.currentLayoutId !== undefined && patch.settings.currentLayoutId !== '') {
      this.viewStore.currentLayoutId = patch.settings.currentLayoutId;
    }

    this.uiStore.settings = {
      seed: patch.settings.seed,
      speed: patch.settings.speed,
      currentLayoutId: (patch.settings.currentLayoutId !== null && patch.settings.currentLayoutId !== undefined && patch.settings.currentLayoutId !== '') ? patch.settings.currentLayoutId : 'default',
      advancedLaneMode: patch.settings.advancedLaneMode ?? false,
      autoConnect: patch.settings.autoConnect ?? false,
      showTypeHints: patch.settings.showTypeHints ?? false,
      highlightCompatible: patch.settings.highlightCompatible ?? false,
      warnBeforeDisconnect: patch.settings.warnBeforeDisconnect ?? true,
      filterByLane: patch.settings.filterByLane ?? false,
      filterByConnection: patch.settings.filterByConnection ?? false,
    };

    this.busStore.buses = patch.buses.map((bus) => ({ ...bus }));
    this.busStore.publishers = patch.publishers.map((publisher) => ({ ...publisher }));
    this.busStore.listeners = patch.listeners.map((listener) => ({ ...listener }));

    this.defaultSourceStore.load(patch.defaultSources);

    // Create default buses if none exist in loaded patch
    this.busStore.createDefaultBuses();

    // Load legacy composites if present
    type PatchWithComposites = Patch & { composites?: Composite[] };
    const patchWithComposites = patch as PatchWithComposites;
    if ('composites' in patchWithComposites && Array.isArray(patchWithComposites.composites)) {
      this.compositeStore.composites = patchWithComposites.composites;
    } else {
      this.compositeStore.composites = [];
    }
    this.uiStore.uiState.selectedBlockId = null;

    const blockIds = this.patchStore.blocks.map((b) => {
      const parsed = parseInt(b.id.split('-')[1], 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
    const connectionIds = this.patchStore.connections.map((c) => {
      const parsed = parseInt(c.id.split('-')[1], 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
    const hasBlockIds = blockIds.length > 0;
    const hasConnectionIds = connectionIds.length > 0;
    const hasIds = hasBlockIds || hasConnectionIds;
    const maxId = hasIds ? Math.max(...blockIds, ...connectionIds) : 0;
    this.nextId = maxId + 1;

    // Emit PatchLoaded event AFTER all state changes committed
    this.events.emit({
      type: 'PatchLoaded',
      blockCount: this.patchStore.blocks.length,
      connectionCount: this.patchStore.connections.length,
    });
  }

  clearPatch(): void {
    this.patchStore.blocks = [];
    this.patchStore.connections = [];
    this.busStore.buses = [];
    this.busStore.publishers = [];
    this.busStore.listeners = [];
    this.uiStore.uiState.selectedBlockId = null;
    this.uiStore.previewedDefinition = null;

    for (const lane of this.viewStore.lanes) {
      lane.blockIds = [];
    }

    // Create default buses for new empty patch
    this.busStore.createDefaultBuses();

    // Emit PatchCleared event AFTER state changes committed
    this.events.emit({ type: 'PatchCleared' });
  }

  loadDemoAnimation(): void {
    // Load demo animation by expanding the breathingDots macro
    this.clearPatch();
    this.patchStore.addBlock('macro:breathingDots', {});
  }
}
