/**
 * @file Bus Store
 * @description Manages signal buses and routing (publishers/listeners).
 */
import { makeObservable, observable, action } from 'mobx';
import type {
  Bus,
  Publisher,
  Listener,
  AdapterStep,
  TypeDesc,
  BusCombineMode,
  BlockId,
  LensDefinition,
  LensInstance,
} from '../types';
import type { RootStore } from './RootStore';
import { createLensInstanceFromDefinition } from '../lenses/lensInstances';
import { runTx } from '../transactions/TxBuilder';

export class BusStore {
  buses: Bus[] = [];
  publishers: Publisher[] = [];
  listeners: Listener[] = [];

  root: RootStore;

  constructor(root: RootStore) {
    this.root = root;
    makeObservable(this, {
      buses: observable,
      publishers: observable,
      listeners: observable,
      createBus: action,
      deleteBus: action,
      updateBus: action,
      addPublisher: action,
      updatePublisher: action,
      removePublisher: action,
      addListener: action,
      updateListener: action,
      removeListener: action,
      addLensToStack: action,
      removeLensFromStack: action,
      clearLensStack: action,
      reorderPublisher: action,
      createDefaultBuses: action,
    });
  }

  /**
   * Get bus by ID.
   */
  getBusById(id: string): Bus | null {
    return this.buses.find((b) => b.id === id) ?? null;
  }

  /**
   * Get all publishers for a specific bus, sorted by sortKey.
   */
  getPublishersByBus(busId: string): Publisher[] {
    return this.publishers
      .filter((p) => p.busId === busId)
      .sort((a, b) => a.sortKey - b.sortKey);
  }

  /**
   * Get all listeners for a specific bus.
   */
  getListenersByBus(busId: string): Listener[] {
    return this.listeners.filter((l) => l.busId === busId);
  }

  // =============================================================================
  // Actions - Bus Management
  // =============================================================================

  /**
   * Create default buses for a new patch.
   * Only creates if no buses exist yet.
   *
   * Default buses (Signal world only):
   * - phaseA: signal:float (primary phase source)
   * - phaseB: signal:float (secondary phase source)
   * - energy: signal:float (accumulated energy)
   * - pulse: signal:trigger (discrete trigger events)
   * - palette: signal:color (color bias/palette signal)
   */
  createDefaultBuses(): void {
    // Only create if no buses exist
    if (this.buses.length > 0) {
      return;
    }

    const defaults: Array<{
      name: string;
      world: 'signal' | 'event';
      domain: 'float' | 'trigger' | 'color';
      combineMode: BusCombineMode;
      defaultValue: unknown;
      semantics?: string;
    }> = [
      { name: 'phaseA', world: 'signal', domain: 'float', combineMode: 'last', defaultValue: 0, semantics: 'phase(primary)' },
      { name: 'phaseB', world: 'signal', domain: 'float', combineMode: 'last', defaultValue: 0, semantics: 'phase(secondary)' },
      { name: 'energy', world: 'signal', domain: 'float', combineMode: 'sum', defaultValue: 0, semantics: 'energy' },
      // pulse is event<trigger>, NOT signal<trigger> - discrete events, not continuous
      { name: 'pulse', world: 'event', domain: 'trigger', combineMode: 'last', defaultValue: null, semantics: 'pulse' },
      { name: 'palette', world: 'signal', domain: 'color', combineMode: 'last', defaultValue: '#000000' }, // No semantics required
      { name: 'progress', world: 'signal', domain: 'float', combineMode: 'last', defaultValue: 0, semantics: 'progress' },
    ];

    defaults.forEach((def) => {
      const typeDesc: TypeDesc = {
        world: def.world,
        domain: def.domain,
        category: 'core',
        busEligible: true,
        semantics: def.semantics,
      };

      const bus: Bus = {
        id: this.root.generateId('bus'),
        name: def.name,
        type: typeDesc,
        combineMode: def.combineMode,
        defaultValue: def.defaultValue,
        sortKey: this.buses.length,
        origin: 'built-in',
      };

      this.buses.push(bus);

      // Emit BusCreated event AFTER bus added to store
      this.root.events.emit({
        type: 'BusCreated',
        busId: bus.id,
        name: bus.name,
        busType: typeDesc,
      });
    });
  }

  /**
   * Create a new bus.
   */
  createBus(
    typeDesc: TypeDesc,
    name: string,
    combineMode: BusCombineMode,
    defaultValue?: unknown
  ): string {
    // Check for duplicate name (case-insensitive)
    const normalizedName = name.toLowerCase();
    if (this.buses.some(b => b.name.toLowerCase() === normalizedName)) {
      throw new Error(`Bus name "${name}" already exists`);
    }

    const bus: Bus = {
      id: this.root.generateId('bus'),
      name,
      type: typeDesc,
      combineMode,
      defaultValue,
      sortKey: this.buses.length,
      origin: 'user', // User-created buses
    };

    // Use transaction system for undo/redo
    runTx(this.root, { label: `Create Bus "${name}"` }, tx => {
      tx.add('buses', bus);
    });

    // Emit BusCreated event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BusCreated',
      busId: bus.id,
      name: bus.name,
      busType: typeDesc,
    });

    return bus.id;
  }

  /**
   * Delete a bus and all its routing.
   */
  /**
   * Delete a bus and all its routing.
   *
   * P1-1 MIGRATED: Now uses tx.removeBusCascade() for undo/redo support.
   */
  deleteBus(busId: string): void {
    // Get bus data before removal (for event)
    const bus = this.buses.find(b => b.id === busId);
    if (bus === undefined) {
      throw new Error(`Bus ${busId} not found`);
    }

    runTx(this.root, { label: 'Delete Bus' }, tx => {
      tx.removeBusCascade(busId);
    });

    // Emit BusDeleted event AFTER state changes committed
    this.root.events.emit({
      type: 'BusDeleted',
      busId: bus.id,
      name: bus.name,
    });
  }

  /**
   * Update bus properties.
   *
   * P1-2 MIGRATED: Now uses runTx() for undo/redo support.
   */
  updateBus(busId: string, updates: Partial<Pick<Bus, 'name' | 'combineMode' | 'defaultValue'>>): void {
    runTx(this.root, { label: 'Update Bus' }, tx => {
      const bus = this.root.busStore.buses.find(b => b.id === busId);
      if (bus === null || bus === undefined) {
        throw new Error(`Bus ${busId} not found`);
      }

      const next = { ...bus, ...updates };
      tx.replace('buses', busId, next);
    });
  }

  // =============================================================================
  // Actions - Routing Management
  // =============================================================================

  /**
   * Add a publisher from an output to a bus.
   * @param options.suppressGraphCommitted - Suppress GraphCommitted event (for compound operations)
   */
  addPublisher(
    busId: string,
    blockId: BlockId,
    slotId: string,
    adapterChain?: AdapterStep[],
    lensStack?: LensInstance[],
    options?: { suppressGraphCommitted?: boolean }
  ): string {
    const bus = this.buses.find(b => b.id === busId);
    if (bus === null || bus === undefined) {
      throw new Error(`Bus ${busId} not found`);
    }

    // Get next sort key
    const maxSortKey = this.publishers
      .filter(p => p.busId === busId)
      .reduce((max, p) => Math.max(max, p.sortKey), 0);

    const publisher: Publisher = {
      id: this.root.generateId('pub'),
      busId,
      from: { blockId, slotId, direction: 'output' },
      adapterChain: (adapterChain !== null && adapterChain !== undefined) ? [...adapterChain] : undefined,
      lensStack: (lensStack !== null && lensStack !== undefined) ? [...lensStack] : undefined,
      enabled: true,
      sortKey: maxSortKey + 10,
    };

    // Use transaction system for undo/redo
    runTx(this.root, { label: 'Add Publisher', suppressGraphCommitted: options?.suppressGraphCommitted }, tx => {
      tx.add('publishers', publisher);
    });

    // Emit BindingAdded event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BindingAdded',
      bindingId: publisher.id,
      busId,
      blockId,
      port: slotId,
      direction: 'publish',
    });

    return publisher.id;
  }

  /**
   * Update publisher properties.
   * Replaces the entire publisher object to avoid mutating readonly fields.
   */
  /**
   * Update a publisher's properties.
   *
   * P1-3 MIGRATED: Now uses runTx() for undo/redo support.
   */
  updatePublisher(publisherId: string, updates: Partial<Pick<Publisher, 'enabled' | 'sortKey' | 'adapterChain' | 'lensStack'>>): void {
    runTx(this.root, { label: 'Update Publisher' }, tx => {
      const existing = this.root.busStore.publishers.find(p => p.id === publisherId);
      if (existing === null || existing === undefined) {
        throw new Error(`Publisher ${publisherId} not found`);
      }

      const next = { ...existing, ...updates };
      tx.replace('publishers', publisherId, next);
    });
  }

  /**
   * Remove a publisher.
   */
  removePublisher(publisherId: string): void {
    // Get publisher data before removal (for event)
    const publisher = this.publishers.find(p => p.id === publisherId);
    if (publisher === null || publisher === undefined) {
      return; // Silently ignore if not found (already removed)
    }

    // Use transaction system for undo/redo
    runTx(this.root, { label: 'Remove Publisher' }, tx => {
      tx.remove('publishers', publisherId);
    });

    // Emit BindingRemoved event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BindingRemoved',
      bindingId: publisher.id,
      busId: publisher.busId,
      blockId: publisher.from.blockId,
      port: publisher.from.slotId,
      direction: 'publish',
    });
  }

  /**
   * Add a listener from a bus to an input.
   * Automatically disconnects any existing wire or listener to the target input.
   */
  addListener(
    busId: string,
    blockId: BlockId,
    slotId: string,
    adapterChain?: AdapterStep[],
    lensOrStack?: LensDefinition | LensDefinition[] | LensInstance[],
    options?: { suppressGraphCommitted?: boolean }
  ): string {
    const bus = this.buses.find(b => b.id === busId);
    if (bus === null || bus === undefined) {
      throw new Error(`Bus ${busId} not found`);
    }


    const listenerId = this.root.generateId('list');
    let lensStack: LensInstance[] | undefined;
    if (lensOrStack !== null && lensOrStack !== undefined) {
      const lenses = Array.isArray(lensOrStack) ? lensOrStack : [lensOrStack];
      lensStack = lenses.map((lens, index): LensInstance => {
        // Type guard: check if it's already a LensInstance
        const maybeInstance = lens as LensDefinition & Partial<LensInstance>;
        if (typeof maybeInstance.lensId === 'string') {
          return maybeInstance as LensInstance;
        }
        return createLensInstanceFromDefinition(
          lens as LensDefinition,
          listenerId,
          index,
          this.root.defaultSourceStore
        );
      });
    }

    const listener: Listener = {
      id: listenerId,
      busId,
      to: { blockId, slotId, direction: 'input' },
      adapterChain: (adapterChain !== null && adapterChain !== undefined) ? [...adapterChain] : undefined,
      enabled: true,
      lensStack,
    };

    // Use transaction system for undo/redo
    runTx(this.root, { label: 'Add Listener', suppressGraphCommitted: options?.suppressGraphCommitted }, tx => {
      tx.add('listeners', listener);
    });

    // Emit BindingAdded event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BindingAdded',
      bindingId: listener.id,
      busId,
      blockId,
      port: slotId,
      direction: 'subscribe',
    });

    return listener.id;
  }

  /**
   * Update listener properties.
   * Replaces the entire listener object to avoid mutating readonly fields.
   */
  /**
   * Update a listener's properties.
   *
   * P1-3 MIGRATED: Now uses runTx() for undo/redo support.
   */
  updateListener(listenerId: string, updates: Partial<Pick<Listener, 'enabled' | 'lensStack' | 'adapterChain'>>): void {
    runTx(this.root, { label: 'Update Listener' }, tx => {
      const existing = this.root.busStore.listeners.find(l => l.id === listenerId);
      if (existing === null || existing === undefined) {
        throw new Error(`Listener ${listenerId} not found`);
      }

      const next = { ...existing, ...updates };
      tx.replace('listeners', listenerId, next);
    });
  }

  /**
   * Add a lens to the listener's stack.
   * Replaces the entire listener object to avoid mutating readonly fields.
   * @param listenerId - Listener ID
   * @param lens - Lens to add
   * @param index - Optional index (default: append to end)
   */
  addLensToStack(listenerId: string, lens: Readonly<LensDefinition | LensInstance>, index?: number): void {
    const listenerIndex = this.listeners.findIndex(l => l.id === listenerId);
    if (listenerIndex === -1) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    const existing = this.listeners[listenerIndex];
    const currentStack = existing.lensStack ?? [];

    // Insert at index or append
    const newStack = [...currentStack];
    const insertIndex = index !== undefined && index >= 0 && index <= currentStack.length
      ? index
      : currentStack.length;
    const instance = 'lensId' in lens
      ? lens
      : createLensInstanceFromDefinition(lens, listenerId, insertIndex, this.root.defaultSourceStore);
    newStack.splice(insertIndex, 0, instance);

    this.listeners[listenerIndex] = {
      ...existing,
      lensStack: newStack,
    };
  }

  /**
   * Remove a lens from the listener's stack.
   * Replaces the entire listener object to avoid mutating readonly fields.
   * @param listenerId - Listener ID
   * @param index - Index of lens to remove
   */
  removeLensFromStack(listenerId: string, index: number): void {
    const listenerIndex = this.listeners.findIndex(l => l.id === listenerId);
    if (listenerIndex === -1) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    const existing = this.listeners[listenerIndex];
    const currentStack = existing.lensStack ?? [];
    if (index < 0 || index >= currentStack.length) {
      throw new Error(`Invalid lens index: ${index}`);
    }

    const newStack = [...currentStack];
    newStack.splice(index, 1);

    this.listeners[listenerIndex] = {
      ...existing,
      lensStack: newStack.length > 0 ? newStack : undefined,
    };
  }

  /**
   * Clear all lenses from the listener's stack.
   * Replaces the entire listener object to avoid mutating readonly fields.
   * @param listenerId - Listener ID
   */
  clearLensStack(listenerId: string): void {
    const listenerIndex = this.listeners.findIndex(l => l.id === listenerId);
    if (listenerIndex === -1) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    const existing = this.listeners[listenerIndex];
    this.listeners[listenerIndex] = {
      ...existing,
      lensStack: undefined,
    };
  }

  /**
   * Remove a listener.
   * @param listenerId - Listener ID
   * @param options - Optional settings
   * @param options.suppressGraphCommitted - If true, suppress GraphCommitted event (for internal use)
   */
  removeListener(listenerId: string, options?: { suppressGraphCommitted?: boolean }): void {
    // Get listener data before removal (for event)
    const listener = this.listeners.find(l => l.id === listenerId);
    if (listener === null || listener === undefined) {
      return; // Silently ignore if not found (already removed)
    }

    // Use transaction system for undo/redo
    runTx(this.root, { label: 'Remove Listener', suppressGraphCommitted: options?.suppressGraphCommitted }, tx => {
      tx.remove('listeners', listenerId);
    });

    // Emit BindingRemoved event (fine-grained event, coexists with GraphCommitted)
    this.root.events.emit({
      type: 'BindingRemoved',
      bindingId: listener.id,
      busId: listener.busId,
      blockId: listener.to.blockId,
      port: listener.to.slotId,
      direction: 'subscribe',
    });
  }

  /**
   * Reorder a publisher's sort key (for combine ordering).
   */
  reorderPublisher(publisherId: string, newSortKey: number): void {
    const publisher = this.publishers.find(p => p.id === publisherId);
    if (publisher === null || publisher === undefined) {
      throw new Error(`Publisher ${publisherId} not found`);
    }

    publisher.sortKey = newSortKey;
  }
}
