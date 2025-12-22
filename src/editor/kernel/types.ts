/**
 * Patch Kernel Types
 *
 * Core interfaces for the Transaction Kernel.
 * The Kernel is the only authority for mutating the PatchDocument.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md
 */

import type { PatchDocument, ValidationResult } from '../semantic/types';
import type { SemanticGraph } from '../semantic';
import type { Op } from './ops';
import type { Diagnostic } from '../diagnostics/types';
import type { BlockId, Connection, Bus, Publisher, Listener } from '../types';

// =============================================================================
// Diff Summary
// =============================================================================

export interface EntityRef {
  kind: 'block' | 'wire' | 'bus' | 'publisher' | 'listener' | 'compositeDef' | 'asset';
  id: string;
}

export interface UpdatedEntity {
  ref: EntityRef;
  keys: readonly string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface EntityDiff {
  created: readonly EntityRef[];
  removed: readonly EntityRef[];
  updated: readonly UpdatedEntity[];
}

export interface DiffSummary {
  txId?: string;
  kind: 'structural' | 'param' | 'time' | 'composite' | 'asset' | 'mixed';
  entities: EntityDiff;
  // TODO: SemanticDiff, RuntimeImpact (Phase 2 additions)
  summaryLines: readonly string[];
  stableKey: string;
}

// =============================================================================
// Transaction Types
// =============================================================================

export type TxId = string;

export interface TxMeta {
  label: string;
  source: 'ui' | 'import' | 'remote' | 'test';
  timeMs: number;
  actorId?: string;
  tags?: string[];
}

export interface PreviewTx {
  meta: TxMeta;
  ops: readonly Op[];
}

export interface CommittedTx {
  id: TxId;
  parentId: TxId | null;
  meta: TxMeta;
  ops: readonly Op[];
  inverseOps: readonly Op[];
  diff: DiffSummary;
  report: ValidationResult;
  kernelVersion: number;
}

export type TxError = {
  kind: 'validation' | 'internal';
  message: string;
  diagnostics?: Diagnostic[];
};

export type TxResult<R> =
  | { ok: true; committed: true; value: R; tx: CommittedTx; report: ValidationResult; diff: DiffSummary }
  | { ok: true; committed: false; value: R; preview: PreviewTx; report: ValidationResult; diff: DiffSummary }
  | { ok: false; error: TxError; report: ValidationResult; diff?: DiffSummary };

// =============================================================================
// Transaction Builder Interface
// =============================================================================

export interface TxView {
  readonly doc: PatchDocument;
  readonly graph: SemanticGraph;
  // TODO: Add query methods (canWire, etc.)
}

export interface TxBuilder {
  readonly view: TxView;

  // Escape hatch
  op(op: Op): void;

  // Block Ops
  addBlock(spec: { type: string; label?: string; params?: Record<string, unknown>; id?: string }): string;
  removeBlock(blockId: string): void;
  retypeBlock(blockId: string, nextType: string, remap?: { kind: 'byKey' | 'schema'; schemaId?: string }): void;
  setBlockLabel(blockId: string, label: string): void;
  patchBlockParams(blockId: string, patch: Record<string, unknown>): void;

  // Wire Ops
  addWire(from: { blockId: string; slotId: string }, to: { blockId: string; slotId: string }, id?: string): string;
  removeWire(connectionId: string): void;
  
  // Bus Ops
  addBus(spec: { name: string; type: any; combineMode: any; defaultValue: unknown; sortKey?: number; id?: string }): string;
  removeBus(busId: string): void;
  updateBus(busId: string, patch: Partial<any>): void; // Use Partial<Bus>

  // Binding Ops
  addPublisher(spec: { busId: string; from: { blockId: string; slotId: string; dir: 'output' }; enabled?: boolean; sortKey?: number; adapterChain?: any[]; id?: string }): string;
  removePublisher(publisherId: string): void;
  updatePublisher(publisherId: string, patch: Partial<any>): void;

  addListener(spec: { busId: string; to: { blockId: string; slotId: string; dir: 'input' }; enabled?: boolean; adapterChain?: any[]; lensStack?: any[]; id?: string }): string;
  removeListener(listenerId: string): void;
  updateListener(listenerId: string, patch: Partial<any>): void;

  // Time Ops
  setTimeRoot(blockId: string): void;
  
  // Settings Ops
  updatePatchSettings(patch: Record<string, unknown>): void;

  // Lifecycle
  commit(): void;
  abort(reason?: string): void;
}

// =============================================================================
// Patch Kernel Interface
// =============================================================================

export interface PatchKernel {
  readonly doc: PatchDocument;
  readonly graph: SemanticGraph;
  readonly report: ValidationResult;

  transaction<R>(
    meta: TxMeta,
    build: (tx: TxBuilder) => R
  ): TxResult<R>;

  applyTx(tx: CommittedTx): void; // Simplified return type for now
  
  undo(): void;
  redo(): void;
}
