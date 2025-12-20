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
  TypeDescriptor,
  BusCombineMode,
  BlockId,
  LensDefinition,
} from '../types';
import type { RootStore } from './RootStore';

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
    }> = [
      { name: 'phaseA', world: 'signal', domain: 'phase', combineMode: 'last', defaultValue: 0 },
      { name: 'phaseB', world: 'signal', domain: 'phase', combineMode: 'last', defaultValue: 0 },
      { name: 'energy', world: 'signal', domain: 'number', combineMode: 'sum', defaultValue: 0 },
      { name: 'pulse', world: 'signal', domain: 'trigger', combineMode: 'last', defaultValue: false },
      { name: 'palette', world: 'signal', domain: 'color', combineMode: 'last', defaultValue: '#000000' },
    ];

    defaults.forEach((def) => {
      const typeDesc: TypeDescriptor = {
        world: def.world,
        domain: def.domain,
        category: 'core',
        busEligible: true,
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
    typeDesc: TypeDescriptor,
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
    port: string,
    adapterChain?: AdapterStep[]
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
      from: { blockId, port },
      adapterChain,
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
      port,
      direction: 'publish',
    });

    return publisher.id;
  }

  /**
   * Update publisher properties.
   */
  updatePublisher(publisherId: string, updates: Partial<Pick<Publisher, 'enabled' | 'sortKey'>>): void {
    const publisher = this.publishers.find(p => p.id === publisherId);
    if (!publisher) {
      throw new Error(`Publisher ${publisherId} not found`);
    }

    if (updates.enabled !== undefined) publisher.enabled = updates.enabled;
    if (updates.sortKey !== undefined) publisher.sortKey = updates.sortKey;
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
      port: publisher.from.port,
      direction: 'publish',
    });
  }

  /**
   * Add a listener from a bus to an input.
   * Supports both legacy single lens and new lens stack.
   */
  addListener(
    busId: string,
    blockId: BlockId,
    port: string,
    adapterChain?: AdapterStep[],
    lensOrStack?: LensDefinition | LensDefinition[]
  ): string {
    const bus = this.buses.find(b => b.id === busId);
    if (!bus) {
      throw new Error(`Bus ${busId} not found`);
    }

    // Convert lens parameter to lensStack
    let lensStack: LensDefinition[] | undefined;
    if (lensOrStack) {
      lensStack = Array.isArray(lensOrStack) ? lensOrStack : [lensOrStack];
    }

    const listener: Listener = {
      id: this.root.generateId('list'),
      busId,
      to: { blockId, port },
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
      port,
      direction: 'subscribe',
    });

    return listener.id;
  }

  /**
   * Update listener properties.
   * Handles both legacy lens and new lensStack.
   */
  updateListener(listenerId: string, updates: Partial<Pick<Listener, 'enabled' | 'lens' | 'lensStack'>>): void {
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    if (updates.enabled !== undefined) listener.enabled = updates.enabled;

    // Handle lens update - undefined means keep current, null means remove
    if ('lens' in updates) {
      // Legacy lens API - convert to lensStack
      if (updates.lens) {
        (listener as { lensStack?: LensDefinition[] }).lensStack = [updates.lens];
      } else {
        (listener as { lensStack?: LensDefinition[] }).lensStack = undefined;
      }
      // Remove legacy lens field if it exists
      delete (listener as { lens?: LensDefinition }).lens;
    }

    // Handle direct lensStack update
    if ('lensStack' in updates) {
      (listener as { lensStack?: LensDefinition[] }).lensStack = updates.lensStack ?? undefined;
      // Remove legacy lens field if it exists
      delete (listener as { lens?: LensDefinition }).lens;
    }
  }

  /**
   * Add a lens to the listener's stack.
   * @param listenerId - Listener ID
   * @param lens - Lens to add
   * @param index - Optional index (default: append to end)
   */
  addLensToStack(listenerId: string, lens: LensDefinition, index?: number): void {
    const listener = this.listeners.find(l => l.id === listenerId);
    if (!listener) {
      throw new Error(`Listener ${listenerId} not found`);
    }

    // Ensure listener has lensStack
    const currentStack = listener.lensStack ?? [];

    // Insert at index or append
    const newStack = [...currentStack];
    if (index !== undefined && index >= 0 && index <= currentStack.length) {
      newStack.splice(index, 0, lens);
    } else {
      newStack.push(lens);
    }

    (listener as { lensStack?: LensDefinition[] }).lensStack = newStack;

    // Remove legacy lens field if it exists
    delete (listener as { lens?: LensDefinition }).lens;
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

    (listener as { lensStack?: LensDefinition[] }).lensStack = newStack.length > 0 ? newStack : undefined;
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

    (listener as { lensStack?: LensDefinition[] }).lensStack = undefined;
    delete (listener as { lens?: LensDefinition }).lens;
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
      port: listener.to.port,
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

  /**
   * Migrate legacy listeners with single lens to lensStack.
   * Call this after loading a patch to ensure compatibility.
   */
  migrateLegacyLenses(): void {
    this.listeners.forEach(listener => {
      const mutableListener = listener as { lens?: LensDefinition; lensStack?: LensDefinition[] };

      // If listener has legacy lens but no lensStack, migrate it
      if (mutableListener.lens && !mutableListener.lensStack) {
        mutableListener.lensStack = [mutableListener.lens];
        delete mutableListener.lens;
      } else if (mutableListener.lens && mutableListener.lensStack) {
        // If both exist (shouldn't happen but handle it), prefer lensStack
        delete mutableListener.lens;
      }
    });
  }

  // =============================================================================
  // Query Methods - Bus Routing
  // =============================================================================

  /**
   * Get all publishers for a bus.
   */
  getPublishersByBus(busId: string): Publisher[] {
    return this.publishers
      .filter(p => p.busId === busId)
      .sort((a, b) => a.sortKey - b.sortKey);
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
  getPublishersByOutput(blockId: BlockId, port: string): Publisher[] {
    return this.publishers.filter(
      p => p.from.blockId === blockId && p.from.port === port
    );
  }

  /**
   * Get listeners for a specific block input port.
   */
  getListenersByInput(blockId: BlockId, port: string): Listener[] {
    return this.listeners.filter(
      l => l.to.blockId === blockId && l.to.port === port
    );
  }

  /**
   * Find all buses matching a type descriptor.
   */
  findBusesByTypeDesc(typeDesc: TypeDescriptor): Bus[] {
    return this.buses.filter(b =>
      b.type.world === typeDesc.world && b.type.domain === typeDesc.domain
    );
  }
}
