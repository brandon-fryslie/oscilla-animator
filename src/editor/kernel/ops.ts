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
  Edge,
  Patch,
  PortRef,
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
  edge: Edge; // includes id, from/to Endpoint, transforms
};

export type WireRemove = {
  op: 'WireRemove';
  edgeId: string;
};

export type WireRetarget = {
  op: 'WireRetarget';
  edgeId: string;
  next: { from?: PortRef; to?: PortRef };
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
    edges: Edge[];
  };
  // TODO: Define ExposedPort type if not in imports
  nextExposed: { inputs: unknown[]; outputs: unknown[] };
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
  asset: { id: string; kind: string; data: unknown; meta: Record<string, unknown> };
};

export type AssetRemove = {
  op: 'AssetRemove';
  assetId: string;
};

export type AssetUpdate = {
  op: 'AssetUpdate';
  assetId: string;
  patch: Record<string, unknown>;
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
  | CompositeDefAdd
  | CompositeDefRemove
  | CompositeDefUpdate
  | CompositeDefReplaceGraph
  | TimeRootSet
  | PatchSettingsUpdate
  | AssetAdd
  | AssetRemove
  | AssetUpdate;
