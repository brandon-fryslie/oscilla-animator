/**
 * Canonical Patch Operations (Ops)
 *
 * These ops are the ONLY way to mutate the PatchDocument.
 * They are serializable, reversible, and purely structural.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/8-PatchOpsCompleteSet.md
 */

import type {
  Block,
  BlockId,
  BlockType,
  Connection,
  Bus,
  Publisher,
  Listener,
  Patch,
  BindingEndpoint,
  PortRef,
  AdapterStep,
  LensDefinition,
  BusCombineMode,
} from '../types';

import type { CompositeDefinition } from '../composites';

// =============================================================================
// Block Ops
// =============================================================================

export type BlockAdd = {
  op: 'BlockAdd';
  block: Block; // includes id, type, label, params
};

export type BlockRemove = {
  op: 'BlockRemove';
  blockId: BlockId;
};

export type BlockRetype = {
  op: 'BlockRetype';
  blockId: BlockId;
  nextType: BlockType;
  remap?: { kind: 'byKey' | 'schema'; schemaId?: string };
};

export type BlockSetLabel = {
  op: 'BlockSetLabel';
  blockId: BlockId;
  label: string;
};

export type BlockPatchParams = {
  op: 'BlockPatchParams';
  blockId: BlockId;
  patch: Record<string, unknown>;
};

// =============================================================================
// Wire Ops
// =============================================================================

export type WireAdd = {
  op: 'WireAdd';
  connection: Connection; // includes id, from {blockId, slotId}, to {blockId, slotId}
};

export type WireRemove = {
  op: 'WireRemove';
  connectionId: string;
};

export type WireRetarget = {
  op: 'WireRetarget';
  connectionId: string;
  next: { from?: { blockId: BlockId; slotId: string }; to?: { blockId: BlockId; slotId: string } };
};

// =============================================================================
// Bus Ops
// =============================================================================

export type BusAdd = {
  op: 'BusAdd';
  bus: Bus;
};

export type BusRemove = {
  op: 'BusRemove';
  busId: string;
};

export type BusUpdate = {
  op: 'BusUpdate';
  busId: string;
  patch: Partial<Pick<Bus, 'name' | 'combineMode' | 'defaultValue' | 'sortKey'>>;
};

// =============================================================================
// Binding Ops (Publishers / Listeners)
// =============================================================================

export type PublisherAdd = {
  op: 'PublisherAdd';
  publisher: Publisher;
};

export type PublisherRemove = {
  op: 'PublisherRemove';
  publisherId: string;
};

export type PublisherUpdate = {
  op: 'PublisherUpdate';
  publisherId: string;
  patch: Partial<Pick<Publisher, 'enabled' | 'sortKey' | 'adapterChain'>>;
};

export type ListenerAdd = {
  op: 'ListenerAdd';
  listener: Listener;
};

export type ListenerRemove = {
  op: 'ListenerRemove';
  listenerId: string;
};

export type ListenerUpdate = {
  op: 'ListenerUpdate';
  listenerId: string;
  patch: Partial<Pick<Listener, 'enabled' | 'adapterChain' | 'lensStack'>>;
};

// =============================================================================
// Composite Ops
// =============================================================================

export type CompositeDefAdd = {
  op: 'CompositeDefAdd';
  def: CompositeDefinition;
};

export type CompositeDefRemove = {
  op: 'CompositeDefRemove';
  defId: string;
};

export type CompositeDefUpdate = {
  op: 'CompositeDefUpdate';
  defId: string;
  patch: Partial<CompositeDefinition>;
};

export type CompositeDefReplaceGraph = {
  op: 'CompositeDefReplaceGraph';
  defId: string;
  nextGraph: {
    nodes: Block[];
    edges: Connection[];
    publishers?: Publisher[];
    listeners?: Listener[];
  };
  // TODO: Define ExposedPort type if not in imports
  nextExposed: { inputs: any[]; outputs: any[] };
};

// =============================================================================
// Time Topology Ops
// =============================================================================

export type TimeRootSet = {
  op: 'TimeRootSet';
  blockId: BlockId;
};

export type PatchSettingsUpdate = {
  op: 'PatchSettingsUpdate';
  patch: Partial<Patch['settings']>;
};

// =============================================================================
// Asset Ops (Optional)
// =============================================================================

export type AssetAdd = {
  op: 'AssetAdd';
  asset: { id: string; kind: string; data: any; meta: any };
};

export type AssetRemove = {
  op: 'AssetRemove';
  assetId: string;
};

export type AssetUpdate = {
  op: 'AssetUpdate';
  assetId: string;
  patch: Partial<any>;
};

// =============================================================================
// Union Type
// =============================================================================

export type Op =
  | BlockAdd
  | BlockRemove
  | BlockRetype
  | BlockSetLabel
  | BlockPatchParams
  | WireAdd
  | WireRemove
  | WireRetarget
  | BusAdd
  | BusRemove
  | BusUpdate
  | PublisherAdd
  | PublisherRemove
  | PublisherUpdate
  | ListenerAdd
  | ListenerRemove
  | ListenerUpdate
  | CompositeDefAdd
  | CompositeDefRemove
  | CompositeDefUpdate
  | CompositeDefReplaceGraph
  | TimeRootSet
  | PatchSettingsUpdate
  | AssetAdd
  | AssetRemove
  | AssetUpdate;
