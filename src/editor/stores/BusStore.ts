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
import { getSortedPublishers } from '../semantic/busSemantics';
import { createLensInstanceFromDefinition } from '../lenses/lensInstances';

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

  // =============================================================================
  // Actions - Bus Management
  // =============================================================================

  /**
   * Create default buses for a new patch.
   * Only creates if no buses exist yet.
   *
   * Default buses (Signal world only):
   * - phaseA: signal:phase (primary phase source)
   * - phaseB: signal:phase (secondary phase source)
   * - energy: signal:number (accumulated energy)
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
      world: 'signal';
      domain: 'phase' | 'number' | 'trigger' | 'color';
      combineMode: BusCombineMode;
      defaultValue: unknown;
      semantics?: string;
    }> = [
      { name: 'phaseA', world: 'signal', domain: 'phase', combineMode: 'last', defaultValue: 0, semantics: 'primary' },
      { name: 'phaseB', world: 'signal', domain: 'phase', combineMode: 'last', defaultValue: 0, semantics: 'secondary' },
      { name: 'energy', world: 'signal', domain: 'number', combineMode: 'sum', defaultValue: 0, semantics: 'energy' },
      { name: 'pulse', world: 'signal', domain: 'trigger', combineMode: 'last', defaultValue: false, semantics: 'pulse' },
      { name: 'palette', world: 'signal', domain: 'color', combineMode: 'last', defaultValue: '#000000' }, // No semantics required
      { name: 'progress', world: 'signal', domain: 'number', combineMode: 'last', defaultValue: 0, semantics: 'progress' },
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
    defaultValue?: any
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

    this.buses.push(bus);

    // Emit BusCreated event AFTER bus added to store
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
  deleteBus(busId: string): void {
    // Get bus data before removal (for event)
    const bus = this.buses.find(b => b.id === busId);
    if (!bus) {
      throw new Error(`Bus ${busId} not found`);
    }

    // Emit BusDeleted event BEFORE removing (so event contains bus data)
    this.root.events.emit({
      type: 'BusDeleted',
      busId: bus.id,
      name: bus.name,
    });

    // Remove bus
    this.buses = this.buses.filter(b => b.id !== busId);

    // Remove all publishers and listeners for this bus
    this.publishers = this.publishers.filter(p => p.busId !== busId);
    this.listeners = this.listeners.filter(l => l.busId !== busId);

    // NOTE: Selection clearing moved to event listener in RootStore
    // (decoupling BusStore from UIStateStore)
  }

  /**
   * Update bus properties.
   */
  updateBus(busId: string, updates: Partial<Pick<Bus, 'name' | 'combineMode' | 'defaultValue'>>): void {
    const bus = this.buses.find(b => b.id === busId);
    if (!bus) {
      throw new Error(`Bus ${busId} not found`);
    }

    if (updates.name !== undefined) bus.name = updates.name;
    if (updates.combineMode !== undefined) bus.combineMode = updates.combineMode;
    if (updates.defaultValue !== undefined) bus.defaultValue = updates.defaultValue;
  }

  // =============================================================================
  // Actions - Routing Management
  // =============================================================================

  /**
   * Add a publisher from an output to a bus.
   */
  addPublisher(
    busId: string,
    blockId: BlockId,
    slotId: string,
    adapterChain?: AdapterStep[],
    lensStack?: LensInstance[]
  ): string {
    const bus = this.buses.find(b => b.id === busId);
    if (!bus) {
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
      adapterChain,
      lensStack,
      enabled: true,
      sortKey: maxSortKey + 10,
    };

    this.publishers.push(publisher);

    // Emit BindingAdded event AFTER publisher added to store
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
   */
  updatePublisher(publisherId: string, updates: Partial<Pick<Publisher, 'enabled' | 'sortKey' | 'adapterChain' | 'lensStack'>>): void {
    const publisher = this.publishers.find(p => p.id === publisherId);
    if (!publisher) {
      throw new Error(`Publisher ${publisherId} not found`);
    }

    if (updates.enabled !== undefined) publisher.enabled = updates.enabled;
    if (updates.sortKey !== undefined) publisher.sortKey = updates.sortKey;
    if (updates.adapterChain !== undefined) publisher.adapterChain = updates.adapterChain;
    if (updates.lensStack !== undefined) publisher.lensStack = updates.lensStack;
  }

  /**
   * Remove a publisher.
   */
  removePublisher(publisherId: string): void {
    // Get publisher data before removal (for event)
    const publisher = this.publishers.find(p => p.id === publisherId);
    if (!publisher) {
      return; // Silently ignore if not found (already removed)
    }

    this.publishers = this.publishers.filter(p => p.id !== publisherId);

    // Emit BindingRemoved event AFTER publisher removed
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
   */
  addListener(
    busId: string,
    blockId: BlockId,
    slotId: string,
    adapterChain?: AdapterStep[],
    lensOrStack?: LensDefinition | LensDefinition[] | LensInstance[]
  ): string {
    const bus = this.buses.find(b => b.id === busId);
    if (!bus) {
      throw new Error(`Bus ${busId} not found`);
    }

    const listenerId = this.root.generateId('list');
    let lensStack: LensInstance[] | undefined;
    if (lensOrStack) {
      const lenses = Array.isArray(lensOrStack) ? lensOrStack : [lensOrStack];
      lensStack = lenses.map((lens, index) => {
        if ('lensId' in lens) return lens;
        return createLensInstanceFromDefinition(
          lens,
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
      adapterChain,
      enabled: true,
      lensStack,
    };

    this.listeners.push(listener);

    // Emit BindingAdded event AFTER listener added to store
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
   */
  updateListener(listenerId: string, updates: Partial<Pick<Listener, 'enabled' | 'lensStack'>>): void {
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    if (updates.enabled !== undefined) listener.enabled = updates.enabled;
    if ('lensStack' in updates) {
      listener.lensStack = updates.lensStack ?? undefined;
    }
  }

  /**
   * Add a lens to the listener's stack.
   * @param listenerId - Listener ID
   * @param lens - Lens to add
   * @param index - Optional index (default: append to end)
   */
  addLensToStack(listenerId: string, lens: LensDefinition | LensInstance, index?: number): void {
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    // Ensure listener has lensStack
    const currentStack = listener.lensStack ?? [];

    // Insert at index or append
    const newStack = [...currentStack];
    const insertIndex = index !== undefined && index >= 0 && index <= currentStack.length
      ? index
      : currentStack.length;
    const instance = 'lensId' in lens
      ? lens
      : createLensInstanceFromDefinition(lens, listenerId, insertIndex, this.root.defaultSourceStore);
    newStack.splice(insertIndex, 0, instance);
    listener.lensStack = newStack;
  }

  /**
   * Remove a lens from the listener's stack.
   * @param listenerId - Listener ID
   * @param index - Index of lens to remove
   */
  removeLensFromStack(listenerId: string, index: number): void {
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    const currentStack = listener.lensStack ?? [];
    if (index < 0 || index >= currentStack.length) {
      throw new Error(`Invalid lens index: ${index}`);
    }

    const newStack = [...currentStack];
    newStack.splice(index, 1);

    listener.lensStack = newStack.length > 0 ? newStack : undefined;
  }

  /**
   * Clear all lenses from the listener's stack.
   * @param listenerId - Listener ID
   */
  clearLensStack(listenerId: string): void {
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    listener.lensStack = undefined;
  }

  /**
   * Remove a listener.
   */
  removeListener(listenerId: string): void {
    // Get listener data before removal (for event)
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      return; // Silently ignore if not found (already removed)
    }

    this.listeners = this.listeners.filter(l => l.id !== listenerId);

    // Emit BindingRemoved event AFTER listener removed
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
   * Reorder publishers within a bus.
   */
  reorderPublisher(publisherId: string, newSortKey: number): void {
    const publisher = this.publishers.find(p => p.id === publisherId);
    if (!publisher) {
      throw new Error(`Publisher ${publisherId} not found`);
    }

    const oldSortKey = publisher.sortKey;
    publisher.sortKey = newSortKey;

    // Adjust other publishers in the same bus
    this.publishers
      .filter(p => p.busId === publisher.busId && p.id !== publisherId)
      .forEach(p => {
        if (oldSortKey < newSortKey && p.sortKey > oldSortKey && p.sortKey <= newSortKey) {
          p.sortKey--;
        } else if (oldSortKey > newSortKey && p.sortKey < oldSortKey && p.sortKey >= newSortKey) {
          p.sortKey++;
        }
      });
  }

  // =============================================================================
  // Query Methods - Bus Routing
  // =============================================================================

  /**
   * Get all publishers for a bus, sorted deterministically.
   *
   * CRITICAL: Uses busSemantics module for consistent ordering.
   * Do NOT duplicate sorting logic here.
   */
  getPublishersByBus(busId: string): Publisher[] {
    return getSortedPublishers(busId, this.publishers, false);
  }

  /**
   * Get all listeners for a bus.
   */
  getListenersByBus(busId: string): Listener[] {
    return this.listeners.filter(l => l.busId === busId);
  }

  /**
   * Get publishers for a specific block output port.
   */
  getPublishersByOutput(blockId: BlockId, slotId: string): Publisher[] {
    return this.publishers.filter(
      p => p.from.blockId === blockId && p.from.slotId === slotId
    );
  }

  /**
   * Get listeners for a specific block input port.
   */
  getListenersByInput(blockId: BlockId, slotId: string): Listener[] {
    return this.listeners.filter(
      l => l.to.blockId === blockId && l.to.slotId === slotId
    );
  }

  /**
   * Find all buses matching a type descriptor.
   */
  findBusesByTypeDesc(typeDesc: TypeDesc): Bus[] {
    return this.buses.filter(b =>
      b.type.world === typeDesc.world && b.type.domain === typeDesc.domain
    );
  }
}
