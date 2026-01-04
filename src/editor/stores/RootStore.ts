/**
 * @file Root Store
 * @description Ties all the other stores together.
 */
import { makeObservable, computed, action, runInAction } from 'mobx';
import { PatchStore } from './PatchStore';
import { UIStateStore } from './UIStateStore';
import { ViewStateStore } from './ViewStateStore';
import { CompositeStore } from './CompositeStore';
import { DefaultSourceStore } from './DefaultSourceStore';
import { DiagnosticStore } from './DiagnosticStore';
import { HistoryStore } from './HistoryStore';
import { NavigationStore } from './NavigationStore';
import { ViewportStore } from './ViewportStore';
import { EmphasisStore } from './EmphasisStore';
import { SelectionStore } from './SelectionStore';
import { LogStore } from '../logStore';
import { EventDispatcher } from '../events';
import { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import { ActionExecutor } from '../diagnostics/ActionExecutor';
import { TutorialStore } from './TutorialStore';
import { DebugUIStore } from './DebugUIStore';
import { Kernel } from '../kernel/PatchKernel';
import type { PatchKernel } from '../kernel/types';
import type { Block, Bus, Composite, Patch, SlotDef } from '../types';

export class RootStore {
  // Event dispatcher (created first so stores can set up listeners)
  events: EventDispatcher;

  // Kernel (semantic transaction manager)
  kernel: PatchKernel;

  // Stores
  patchStore: PatchStore;
  uiStore: UIStateStore;
  viewStore: ViewStateStore;
  compositeStore: CompositeStore;
  defaultSourceStore: DefaultSourceStore;
  logStore: LogStore;
  historyStore: HistoryStore;

  // UI Redesign Stores (Phase 1)
  navigationStore: NavigationStore;
  viewportStore: ViewportStore;
  emphasisStore: EmphasisStore;
  selectionStore: SelectionStore;

  // Diagnostics
  diagnosticHub: DiagnosticHub;
  diagnosticStore: DiagnosticStore;
  actionExecutor: ActionExecutor;

  // Tutorial
  tutorialStore: TutorialStore;

  // Debug UI
  debugUIStore: DebugUIStore;

  private nextId = 1;

  constructor() {
    // Create event dispatcher first so stores can set up listeners)
    this.events = new EventDispatcher();

    // Create log store before other stores (they may want to log during init)
    this.logStore = new LogStore();

    // Initialize kernel with empty patch
    const initialPatch: Patch = {
      id: 'default',
      blocks: [],
      edges: [],
      buses: [],
    };
    this.kernel = new Kernel(initialPatch);

    // Create domain stores
    this.patchStore = new PatchStore(this);
    this.uiStore = new UIStateStore(this);
    this.viewStore = new ViewStateStore(this);
    this.compositeStore = new CompositeStore(this);
    this.defaultSourceStore = new DefaultSourceStore();

    // Create history store (after domain stores, before transaction usage)
    this.historyStore = new HistoryStore(this);

    // Create UI Redesign stores (Phase 1)
    this.navigationStore = new NavigationStore(this);
    this.viewportStore = new ViewportStore(this);
    this.emphasisStore = new EmphasisStore(this);
    this.selectionStore = new SelectionStore(this);

    // Create diagnostic infrastructure (after patchStore)
    this.diagnosticHub = new DiagnosticHub(this.events, this.patchStore);
    this.diagnosticStore = new DiagnosticStore(this.diagnosticHub, this);

        // Create action executor (after stores and diagnostic hub)

        this.actionExecutor = new ActionExecutor(
          this.patchStore,
          this.uiStore,
          this.diagnosticHub
        );

    // Create tutorial store
    this.tutorialStore = new TutorialStore(this);

    // Create debug UI store
    this.debugUIStore = new DebugUIStore(this);

    makeObservable(this, {
      selectedBlock: computed,
      selectedBus: computed,
      selectedPortInfo: computed,
      loadPatch: action,
      clearPatch: action,
      loadDemoAnimation: action,
    });

    // Reset history (Sprint 3: Bus-Block Unification)
    // This ensures tests start from a clean history state at revision 0
    this.historyStore.reset();
    // Wire up event listeners
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for cross-store coordination.
   * This decouples stores from each other - they communicate via events.
   */
  private setupEventListeners(): void {
    // MacroExpanded → Auto-clear logs if setting enabled, trigger tutorial if needed
    this.events.on('MacroExpanded', (event) => {
      if (this.logStore.autoClearOnMacro) {
        this.logStore.clear();
      }

      // Start tutorial if this is the tutorial macro
      if (event.macroType === 'macro:tutorial') {
        // Build block ID to label mapping from the created blocks
        const blockIdToLabel = new Map<string, string>();
        for (const blockId of event.createdBlockIds) {
          const block = this.patchStore.blocks.find(b => b.id === blockId);
          if (block != null) {
            blockIdToLabel.set(blockId, block.label);
          }
        }
        this.tutorialStore.start(blockIdToLabel);
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
      if (event.wasSelected) {
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

  /**
   * Synchronize MobX observables from kernel state.
   * Called after kernel transaction commits to trigger MobX reactions.
   *
   * Note: Kernel.doc is typed as PatchDocument (minimal type) but internally
   * stores a full Patch with all fields. Safe to cast here.
   *
   * Sprint 3: Bus-Block Unification
   * Buses from kernel are converted to BusBlocks in PatchStore.
   */
  syncFromKernel(): void {
    runInAction(() => {
      // Kernel.doc is actually a full Patch, safe to cast
      const patch = this.kernel.doc as unknown as Patch;

      // Sync blocks and edges
      this.patchStore.blocks = patch.blocks.map(b => ({ ...b }));
      this.patchStore.edges = patch.edges.map(e => ({ ...e }));

      // Note: defaultSources are not in kernel yet
      // They remain in their respective stores for now
    });
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
    // DELETED: BusStore removed. Buses are now BusBlocks.
    // TODO: Remove this computed entirely - use selectionStore.selectedBusBlock instead
    return null;
  }

  get selectedPortInfo(): { block: Block; slot: SlotDef; direction: 'input' | 'output' } | null {
    const portRef = this.uiStore.uiState.selectedPort;
    if (portRef === null || portRef === undefined) return null;

    const block = this.patchStore.blocks.find((b) => b.id === portRef.blockId);
    if (block === null || block === undefined) return null;

    // Block type doesn't have inputs/outputs - need to get from definition
    // Commenting out for now as this needs refactoring
    // const slots = portRef.direction === 'input' ? block.inputs : block.outputs;
    // const slot = slots.find((s) => s.id === portRef.slotId);
    // if (slot === null || slot === undefined) return null;

    // return { block, slot, direction: portRef.direction };
    return null;
  }

  // =============================================================================
  // Serialization
  // =============================================================================

  toJSON(): Record<string, unknown> {
    // Extended Patch format for serialization
    return {
      id: 'default',
      version: 2,
      blocks: this.patchStore.blocks.map((b) => ({ ...b })),
      edges: this.patchStore.edges.map((e) => ({ ...e })),
      buses: [],
      defaultSources: this.defaultSourceStore.sources.size > 0
        ? Object.fromEntries(this.defaultSourceStore.sources)
        : {},
      settings: {
        ...this.uiStore.settings,
      },
    };
  }

  loadPatch(patch: Patch & { version?: number; settings?: any; defaultSources?: any; defaultSourceAttachments?: any }): void {
    // Load into kernel first
    this.kernel = new Kernel(patch);

    // Sync blocks and edges
    this.patchStore.blocks = patch.blocks.map((block) => ({ ...block }));
    this.patchStore.edges = patch.edges.map((edge) => ({ ...edge }));

    // Load settings if present
    if (patch.settings) {
      this.uiStore.settings = {
        seed: patch.settings.seed ?? 0,
        speed: patch.settings.speed ?? 1,
        autoConnect: patch.settings.autoConnect ?? false,
        showTypeHints: patch.settings.showTypeHints ?? false,
        highlightCompatible: patch.settings.highlightCompatible ?? false,
        warnBeforeDisconnect: patch.settings.warnBeforeDisconnect ?? true,
        filterByConnection: patch.settings.filterByConnection ?? false,
      };
    }

    // Load default sources if present
    if (patch.defaultSources) {
      this.defaultSourceStore.load(patch.defaultSources);
    }

    // Note: defaultSourceAttachments removed - structural blocks now created by GraphNormalizer
    // Old patches with attachments will have their structural blocks regenerated on first compile

    this.historyStore.reset();
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
    const edgeIds = this.patchStore.edges.map((e) => {
      const parsed = parseInt(e.id.split('-')[1], 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
    const hasBlockIds = blockIds.length > 0;
    const hasEdgeIds = edgeIds.length > 0;
    const hasIds = hasBlockIds || hasEdgeIds;
    const maxId = hasIds ? Math.max(...blockIds, ...edgeIds) : 0;
    this.nextId = maxId + 1;

    // Emit PatchLoaded event AFTER all state changes committed
    this.events.emit({
      type: 'PatchLoaded',
      blockCount: this.patchStore.blocks.length,
      connectionCount: this.patchStore.edges.length,
    });
  }

  clearPatch(): void {
    // Clear kernel
    const emptyPatch: Patch = {
      id: 'default',
      blocks: [],
      edges: [],
      buses: [],
    };
    this.kernel = new Kernel(emptyPatch);

    // Clear MobX observables
    this.patchStore.blocks = [];
    this.patchStore.edges = [];
    this.uiStore.uiState.selectedBlockId = null;
    this.uiStore.previewedDefinition = null;

    // Emit PatchCleared event AFTER state changes committed
    this.historyStore.reset();
    this.events.emit({ type: 'PatchCleared' });
  }

  loadDemoAnimation(): void {
    // Load demo animation by expanding the rainbowGrid macro
    this.clearPatch();
    this.patchStore.addBlock('macro:rainbowGrid', {});
  }

  /**
   * DEV: Load minimal steel thread test patch.
   * Creates: TimeRoot + Domain + Positions + Color + RenderInstances2D
   */
  loadSteelThreadTest(): void {
    console.log('[RootStore] Loading steel thread test patch...');
    this.clearPatch();

    // Add blocks for minimal render chain
    const timeRoot = this.patchStore.addBlock('InfiniteTimeRoot', {});
    const domain = this.patchStore.addBlock('DomainN', { n: 25 });
    const positions = this.patchStore.addBlock('PositionMapGrid', { cols: 5, spacing: 40 });
    const color = this.patchStore.addBlock('FieldConstColor', { value: '#ff6600' });
    const radius = this.patchStore.addBlock('FieldConstNumber', { value: 15 });
    const opacity = this.patchStore.addBlock('SignalConst', { value: 1.0 });
    const render = this.patchStore.addBlock('RenderInstances2D', {});

    console.log('[RootStore] Created blocks:', { timeRoot, domain, positions, color, radius, opacity, render });

    // Wire them up using connect() method
    this.patchStore.connect(domain, 'domain', positions, 'domain');
    this.patchStore.connect(positions, 'pos', render, 'positions');
    this.patchStore.connect(domain, 'domain', render, 'domain');
    this.patchStore.connect(color, 'out', render, 'color');
    this.patchStore.connect(radius, 'out', render, 'radius');
    this.patchStore.connect(opacity, 'out', render, 'opacity');

    console.log('[RootStore] Steel thread patch loaded with', this.patchStore.blocks.length, 'blocks and', this.patchStore.edges.length, 'edges');
  }
}
