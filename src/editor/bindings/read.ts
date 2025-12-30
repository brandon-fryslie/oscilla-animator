/**
 * Binding Read Facade
 *
 * Provides unified queries for all binding types (wire/publisher/listener).
 * This is the ONLY place that should branch on binding kind for read operations.
 */

import type { RootStore } from '../stores/RootStore';
import type { PortRef, BlockId } from '../types';
import { SLOT_TYPE_TO_TYPE_DESC } from '../types';
import type {
  BindingRef,
  NormalizedBinding,
  ResolvedBinding,
  ResolvedPortEndpoint,
  ResolvedBusEndpoint,
} from './types';

/**
 * Normalize a binding by converting optional fields to non-optional.
 * - enabled?: boolean → enabled: boolean (default true for wires)
 * - lensStack?: LensInstance[] → lensStack: LensInstance[] (default [])
 * - adapterChain?: AdapterStep[] → adapterChain: AdapterStep[] (default [])
 */
function normalizeBinding(
  kind: 'wire' | 'publisher' | 'listener',
  raw: unknown
): NormalizedBinding | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  if (kind === 'wire') {
    return {
      kind: 'wire',
      id: obj.id as string,
      from: obj.from as PortRef,
      to: obj.to as PortRef,
      enabled: obj.enabled !== undefined ? (obj.enabled as boolean) : true,
      lensStack: (obj.lensStack as NormalizedBinding['lensStack']) || [],
      adapterChain: (obj.adapterChain as NormalizedBinding['adapterChain']) || [],
    };
  } else if (kind === 'publisher') {
    return {
      kind: 'publisher',
      id: obj.id as string,
      busId: obj.busId as string,
      from: obj.from as PortRef,
      enabled: obj.enabled as boolean,
      lensStack: (obj.lensStack as NormalizedBinding['lensStack']) || [],
      adapterChain: (obj.adapterChain as NormalizedBinding['adapterChain']) || [],
      weight: obj.weight as number | undefined,
      sortKey: obj.sortKey as number,
    };
  } else {
    // listener
    return {
      kind: 'listener',
      id: obj.id as string,
      busId: obj.busId as string,
      to: obj.to as PortRef,
      enabled: obj.enabled as boolean,
      lensStack: (obj.lensStack as NormalizedBinding['lensStack']) || [],
      adapterChain: (obj.adapterChain as NormalizedBinding['adapterChain']) || [],
    };
  }
}

/**
 * Resolve a port reference to its full block, slot, and type information.
 */
function resolvePortEndpoint(
  root: RootStore,
  port: PortRef
): ResolvedPortEndpoint | { error: string } {
  const block = root.patchStore.blocks.find((b) => b.id === port.blockId);
  if (!block) {
    return { error: `Block not found: ${port.blockId}` };
  }

  const slot =
    port.direction === 'input'
      ? block.inputs.find((s) => s.id === port.slotId)
      : block.outputs.find((s) => s.id === port.slotId);

  if (!slot) {
    return {
      error: `Slot not found: ${port.slotId} on block ${port.blockId}`,
    };
  }

  const typeDesc = SLOT_TYPE_TO_TYPE_DESC[slot.type];

  return {
    kind: 'port',
    port,
    block,
    slot,
    typeDesc,
  };
}

/**
 * Resolve a bus reference to its full bus and type information.
 */
function resolveBusEndpoint(
  root: RootStore,
  busId: string
): ResolvedBusEndpoint | { error: string } {
  const bus = root.busStore.buses.find((b) => b.id === busId);
  if (!bus) {
    return { error: `Bus not found: ${busId}` };
  }

  return {
    kind: 'bus',
    busId,
    bus,
    typeDesc: bus.type,
  };
}

/**
 * Resolve a binding reference to its full binding object with resolved endpoints.
 * This is the core resolution function that handles all three binding kinds.
 *
 * Returns either:
 * - success: true + binding + from + to endpoints
 * - success: false + ref + error message
 */
export function resolveBinding(
  root: RootStore,
  ref: BindingRef
): ResolvedBinding {
  // Find the raw binding based on kind
  let rawBinding: unknown = null;

  if (ref.kind === 'wire') {
    rawBinding = root.patchStore.connections.find((c) => c.id === ref.id);
  } else if (ref.kind === 'publisher') {
    rawBinding = root.busStore.publishers.find((p) => p.id === ref.id);
  } else {
    // listener
    rawBinding = root.busStore.listeners.find((l) => l.id === ref.id);
  }

  if (!rawBinding) {
    return {
      success: false,
      ref,
      error: `${ref.kind} not found: ${ref.id}`,
    };
  }

  // Normalize the binding
  const binding = normalizeBinding(ref.kind, rawBinding);
  if (!binding) {
    return {
      success: false,
      ref,
      error: `Failed to normalize ${ref.kind}: ${ref.id}`,
    };
  }

  // Resolve endpoints based on kind
  let fromEndpoint: ResolvedPortEndpoint | ResolvedBusEndpoint | { error: string };
  let toEndpoint: ResolvedPortEndpoint | ResolvedBusEndpoint | { error: string };

  if (binding.kind === 'wire') {
    fromEndpoint = resolvePortEndpoint(root, binding.from);
    toEndpoint = resolvePortEndpoint(root, binding.to);
  } else if (binding.kind === 'publisher') {
    fromEndpoint = resolvePortEndpoint(root, binding.from);
    toEndpoint = resolveBusEndpoint(root, binding.busId);
  } else {
    // listener
    fromEndpoint = resolveBusEndpoint(root, binding.busId);
    toEndpoint = resolvePortEndpoint(root, binding.to);
  }

  // Check for resolution errors
  if ('error' in fromEndpoint) {
    return {
      success: false,
      ref,
      error: `Failed to resolve 'from' endpoint: ${fromEndpoint.error}`,
    };
  }

  if ('error' in toEndpoint) {
    return {
      success: false,
      ref,
      error: `Failed to resolve 'to' endpoint: ${toEndpoint.error}`,
    };
  }

  return {
    success: true,
    binding,
    from: fromEndpoint,
    to: toEndpoint,
  };
}

/**
 * Get the incoming binding for an input port (if any).
 * Returns the wire OR listener connected to this input, or null if none.
 *
 * Enforces single-writer invariant: an input has at most one incoming binding.
 */
export function getIncomingBindingForInputPort(
  root: RootStore,
  blockId: BlockId,
  slotId: string
): NormalizedBinding | null {
  // Check for wire
  const wire = root.patchStore.connections.find(
    (c) => c.to.blockId === blockId && c.to.slotId === slotId
  );

  if (wire) {
    return normalizeBinding('wire', wire);
  }

  // Check for listener
  const listener = root.busStore.listeners.find(
    (l) => l.to.blockId === blockId && l.to.slotId === slotId
  );

  if (listener) {
    return normalizeBinding('listener', listener);
  }

  return null;
}

/**
 * Get all outgoing bindings for an output port.
 * Returns wires AND publishers from this output (can have multiple).
 */
export function getOutgoingBindingsForOutputPort(
  root: RootStore,
  blockId: BlockId,
  slotId: string
): NormalizedBinding[] {
  const bindings: NormalizedBinding[] = [];

  // Collect wires
  for (const wire of root.patchStore.connections) {
    if (wire.from.blockId === blockId && wire.from.slotId === slotId) {
      const normalized = normalizeBinding('wire', wire);
      if (normalized) bindings.push(normalized);
    }
  }

  // Collect publishers
  for (const publisher of root.busStore.publishers) {
    if (publisher.from.blockId === blockId && publisher.from.slotId === slotId) {
      const normalized = normalizeBinding('publisher', publisher);
      if (normalized) bindings.push(normalized);
    }
  }

  return bindings;
}

/**
 * Get all publishers for a bus.
 * Returns only publishers (not listeners).
 */
export function getPublishersForBus(
  root: RootStore,
  busId: string
): NormalizedBinding[] {
  const bindings: NormalizedBinding[] = [];

  for (const publisher of root.busStore.publishers) {
    if (publisher.busId === busId) {
      const normalized = normalizeBinding('publisher', publisher);
      if (normalized) bindings.push(normalized);
    }
  }

  return bindings;
}

/**
 * Get all listeners for a bus.
 * Returns only listeners (not publishers).
 */
export function getListenersForBus(
  root: RootStore,
  busId: string
): NormalizedBinding[] {
  const bindings: NormalizedBinding[] = [];

  for (const listener of root.busStore.listeners) {
    if (listener.busId === busId) {
      const normalized = normalizeBinding('listener', listener);
      if (normalized) bindings.push(normalized);
    }
  }

  return bindings;
}

/**
 * Check if an output port is publishing to a specific bus.
 */
export function isPortPublishingToBus(
  root: RootStore,
  portRef: PortRef,
  busId: string
): boolean {
  return root.busStore.publishers.some(
    (p) =>
      p.busId === busId &&
      p.from.blockId === portRef.blockId &&
      p.from.slotId === portRef.slotId
  );
}

/**
 * Check if an input port is subscribed to a specific bus.
 */
export function isPortSubscribedToBus(
  root: RootStore,
  portRef: PortRef,
  busId: string
): boolean {
  return root.busStore.listeners.some(
    (l) =>
      l.busId === busId &&
      l.to.blockId === portRef.blockId &&
      l.to.slotId === portRef.slotId
  );
}
