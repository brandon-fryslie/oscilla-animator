/**
 * Transaction Builder Implementation
 *
 * Builds atomic transactions with validation and expansion.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md
 */

import {
  TxBuilder,
  TxView,
  TxResult,
  TxMeta,
  CommittedTx,
  PreviewTx,
  TxError,
  PatchKernel
} from './types';
import type {
  PatchDocument,
  ValidationResult
} from '../semantic/types';
import type { SemanticGraph } from '../semantic';
import type { Patch, Block, Connection, Bus, Publisher, Listener } from '../types';
import { Validator } from '../semantic/validator';
import { applyOp } from './applyOp';
import { Op } from './ops';
import { generateDiff } from './diff';

// Helper to deep clone patch
function clonePatch(patch: Patch): Patch {
  return JSON.parse(JSON.stringify(patch));
}

export class TransactionBuilder implements TxBuilder {
  private baseDoc: Patch;
  private stagedDoc: Patch; // Mutable working copy
  private stagedOps: Op[] = [];
  private inverseOps: Op[] = []; // Accumulated in REVERSE order of application
  private committed = false;
  private aborted = false;
  private kernel: PatchKernel;
  private meta: TxMeta;

  constructor(kernel: PatchKernel, baseDoc: Patch, meta: TxMeta) {
    this.kernel = kernel;
    this.baseDoc = baseDoc;
    this.stagedDoc = clonePatch(baseDoc);
    this.meta = meta;
  }

  // ===========================================================================
  // TxBuilder Interface
  // ===========================================================================

  get view(): TxView {
    return {
      doc: this.stagedDoc as PatchDocument,
      // TODO: SemanticGraph incremental update not yet implemented.
      // For now, we return the base graph. Validation will rebuild graph from stagedDoc at commit time.
      graph: this.kernel.graph, 
    };
  }

  op(op: Op, inverseOp?: Op): void {
    if (this.committed || this.aborted) {
      throw new Error('Transaction already sealed');
    }
    this.stagedOps.push(op);
    if (inverseOp) {
      this.inverseOps.unshift(inverseOp); // Prepend to maintain reverse order
    } else {
      // If no inverse provided, we can't undo this op easily.
      // For now we allow it but warn or assume non-invertible.
      // In production, all ops MUST have inverses.
    }
    
    // Apply to staged doc immediately to keep view consistent
    applyOp(this.stagedDoc, op);
  }

  // ---------------------------------------------------------------------------
  // Block Ops
  // ---------------------------------------------------------------------------

  addBlock(spec: { type: string; label?: string; params?: Record<string, unknown>; id?: string }): string {
    const id = spec.id ?? crypto.randomUUID();
    const block: Block = {
      id,
      type: spec.type,
      label: spec.label ?? spec.type,
      params: spec.params ?? {},
      inputs: [], // Should be populated from registry
      outputs: [], // Should be populated from registry
      category: 'Other', // Should be populated from registry
    };

    const op: Op = { op: 'BlockAdd', block };
    const inv: Op = { op: 'BlockRemove', blockId: id };
    
    this.op(op, inv);
    return id;
  }

  removeBlock(blockId: string): void {
    // 1. Capture state for inverse
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (!block) return; // Already gone

    // 2. Cascade: remove connections
    // Iterate ALL connections in stagedDoc
    // (In a real implementation, SemanticGraph would make this fast)
    const wiresToRemove = this.stagedDoc.connections.filter(
      c => c.from.blockId === blockId || c.to.blockId === blockId
    );
    for (const wire of wiresToRemove) {
      this.removeWire(wire.id);
    }

    // 3. Cascade: bindings
    if (this.stagedDoc.publishers) {
      const pubsToRemove = this.stagedDoc.publishers.filter(p => p.from.blockId === blockId);
      for (const pub of pubsToRemove) {
        this.removePublisher(pub.id);
      }
    }
    if (this.stagedDoc.listeners) {
      const listenersToRemove = this.stagedDoc.listeners.filter(l => l.to.blockId === blockId);
      for (const list of listenersToRemove) {
        this.removeListener(list.id);
      }
    }

    // 4. Remove Block
    const op: Op = { op: 'BlockRemove', blockId };
    const inv: Op = { op: 'BlockAdd', block: { ...block } }; // Clone block state
    this.op(op, inv);
  }

  retypeBlock(blockId: string, nextType: string, remap?: { kind: 'byKey' | 'schema'; schemaId?: string }): void {
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (!block) return;
    
    const prevType = block.type;
    const op: Op = { op: 'BlockRetype', blockId, nextType, remap };
    const inv: Op = { op: 'BlockRetype', blockId, nextType: prevType }; // TODO: inverse remap?
    
    this.op(op, inv);
  }

  setBlockLabel(blockId: string, label: string): void {
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (!block) return;

    const prevLabel = block.label;
    const op: Op = { op: 'BlockSetLabel', blockId, label };
    const inv: Op = { op: 'BlockSetLabel', blockId, label: prevLabel };
    
    this.op(op, inv);
  }

  patchBlockParams(blockId: string, patch: Record<string, unknown>): void {
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (!block) return;

    // Capture old values for inverse
    const undoPatch: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      undoPatch[key] = block.params[key];
    }

    const op: Op = { op: 'BlockPatchParams', blockId, patch };
    const inv: Op = { op: 'BlockPatchParams', blockId, patch: undoPatch };
    
    this.op(op, inv);
  }

  // ---------------------------------------------------------------------------
  // Wire Ops
  // ---------------------------------------------------------------------------

  addWire(from: PortRef, to: PortRef, id?: string): string {
    const connectionId = id ?? crypto.randomUUID();
    const connection: Connection = {
      id: connectionId,
      from,
      to
    };

    const op: Op = { op: 'WireAdd', connection };
    const inv: Op = { op: 'WireRemove', connectionId };
    
    this.op(op, inv);
    return connectionId;
  }

  removeWire(connectionId: string): void {
    const conn = this.stagedDoc.connections.find(c => c.id === connectionId);
    if (!conn) return;

    const op: Op = { op: 'WireRemove', connectionId };
    const inv: Op = { op: 'WireAdd', connection: { ...conn } };
    
    this.op(op, inv);
  }

  retargetWire(connectionId: string, next: { from?: PortRef; to?: PortRef }): void {
    const conn = this.stagedDoc.connections.find(c => c.id === connectionId);
    if (!conn) return;

    const prev: typeof next = {};
    if (next.from) prev.from = conn.from;
    if (next.to) prev.to = conn.to;

    const op: Op = { op: 'WireRetarget', connectionId, next };
    const inv: Op = { op: 'WireRetarget', connectionId, next: prev };
    
    this.op(op, inv);
  }

  // ---------------------------------------------------------------------------
  // Bus Ops
  // ---------------------------------------------------------------------------

  addBus(spec: { name: string; type: any; combineMode: any; defaultValue: unknown; sortKey?: number; id?: string }): string {
    const id = spec.id ?? crypto.randomUUID();
    const bus: Bus = {
      id,
      name: spec.name,
      type: spec.type,
      combineMode: spec.combineMode,
      defaultValue: spec.defaultValue,
      sortKey: spec.sortKey ?? 0,
      origin: 'user'
    };

    const op: Op = { op: 'BusAdd', bus };
    const inv: Op = { op: 'BusRemove', busId: id };
    
    this.op(op, inv);
    return id;
  }

  removeBus(busId: string): void {
    const bus = this.stagedDoc.buses?.find(b => b.id === busId);
    if (!bus) return;

    // Cascade: remove bindings
    if (this.stagedDoc.publishers) {
      const pubs = this.stagedDoc.publishers.filter(p => p.busId === busId);
      for (const p of pubs) this.removePublisher(p.id);
    }
    if (this.stagedDoc.listeners) {
      const listeners = this.stagedDoc.listeners.filter(l => l.busId === busId);
      for (const l of listeners) this.removeListener(l.id);
    }

    const op: Op = { op: 'BusRemove', busId };
    const inv: Op = { op: 'BusAdd', bus: { ...bus } };
    
    this.op(op, inv);
  }

  updateBus(busId: string, patch: Partial<any>): void {
    const bus = this.stagedDoc.buses?.find(b => b.id === busId);
    if (!bus) return;

    const undoPatch: Partial<Bus> = {};
    for (const key of Object.keys(patch)) {
      (undoPatch as any)[key] = (bus as any)[key];
    }

    const op: Op = { op: 'BusUpdate', busId, patch };
    const inv: Op = { op: 'BusUpdate', busId, patch: undoPatch };
    
    this.op(op, inv);
  }

  // ---------------------------------------------------------------------------
  // Binding Ops
  // ---------------------------------------------------------------------------

  addPublisher(spec: { busId: string; from: PortRef; enabled?: boolean; sortKey?: number; adapterChain?: any[]; id?: string }): string {
    const id = spec.id ?? crypto.randomUUID();
    const publisher: Publisher = {
      id,
      busId: spec.busId,
      from: spec.from,
      enabled: spec.enabled ?? true,
      sortKey: spec.sortKey ?? 0,
      adapterChain: spec.adapterChain
    };

    const op: Op = { op: 'PublisherAdd', publisher };
    const inv: Op = { op: 'PublisherRemove', publisherId: id };
    
    this.op(op, inv);
    return id;
  }

  removePublisher(publisherId: string): void {
    const pub = this.stagedDoc.publishers?.find(p => p.id === publisherId);
    if (!pub) return;

    const op: Op = { op: 'PublisherRemove', publisherId };
    const inv: Op = { op: 'PublisherAdd', publisher: { ...pub } };
    
    this.op(op, inv);
  }

  updatePublisher(publisherId: string, patch: Partial<any>): void {
    const pub = this.stagedDoc.publishers?.find(p => p.id === publisherId);
    if (!pub) return;

    const undoPatch: Partial<Publisher> = {};
    for (const key of Object.keys(patch)) {
      (undoPatch as any)[key] = (pub as any)[key];
    }

    const op: Op = { op: 'PublisherUpdate', publisherId, patch };
    const inv: Op = { op: 'PublisherUpdate', publisherId, patch: undoPatch };
    
    this.op(op, inv);
  }

  addListener(spec: { busId: string; to: PortRef; enabled?: boolean; adapterChain?: any[]; lensStack?: any[]; id?: string }): string {
    const id = spec.id ?? crypto.randomUUID();
    const listener: Listener = {
      id,
      busId: spec.busId,
      to: spec.to,
      enabled: spec.enabled ?? true,
      adapterChain: spec.adapterChain,
      lensStack: spec.lensStack
    };

    const op: Op = { op: 'ListenerAdd', listener };
    const inv: Op = { op: 'ListenerRemove', listenerId: id };
    
    this.op(op, inv);
    return id;
  }

  removeListener(listenerId: string): void {
    const list = this.stagedDoc.listeners?.find(l => l.id === listenerId);
    if (!list) return;

    const op: Op = { op: 'ListenerRemove', listenerId };
    const inv: Op = { op: 'ListenerAdd', listener: { ...list } };
    
    this.op(op, inv);
  }

  updateListener(listenerId: string, patch: Partial<any>): void {
    const list = this.stagedDoc.listeners?.find(l => l.id === listenerId);
    if (!list) return;

    const undoPatch: Partial<Listener> = {};
    for (const key of Object.keys(patch)) {
      (undoPatch as any)[key] = (list as any)[key];
    }

    const op: Op = { op: 'ListenerUpdate', listenerId, patch };
    const inv: Op = { op: 'ListenerUpdate', listenerId, patch: undoPatch };
    
    this.op(op, inv);
  }

  // ---------------------------------------------------------------------------
  // Time Ops
  // ---------------------------------------------------------------------------

  setTimeRoot(blockId: string): void {
    // Inverse: we don't track prev time root easily without full scan.
    // Assuming we can find it in stagedDoc (or baseDoc).
    // For now, simpler to not invert or require lookup.
    // Let's iterate.
    let prevTimeRoot: string | undefined;
    // Find TimeRoot blocks in stagedDoc? No specific flag.
    // Rely on caller?
    // Actually applyOp('TimeRootSet') currently does nothing (TODO in applyOp.ts).
    // So this is a placeholder.
    this.op({ op: 'TimeRootSet', blockId });
  }

  // ---------------------------------------------------------------------------
  // Settings Ops
  // ---------------------------------------------------------------------------

  updatePatchSettings(patch: Record<string, unknown>): void {
    const undoPatch: Record<string, unknown> = {};
    for (const key of Object.keys(patch)) {
      undoPatch[key] = (this.stagedDoc.settings as any)[key];
    }
    
    const op: Op = { op: 'PatchSettingsUpdate', patch };
    const inv: Op = { op: 'PatchSettingsUpdate', patch: undoPatch };
    
    this.op(op, inv);
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  commit(): void {
    this.committed = true;
  }

  abort(reason?: string): void {
    this.aborted = true;
  }

  // ===========================================================================
  // Internal (Kernel Access)
  // ===========================================================================

  /**
   * Build the final result. Called by Kernel.
   */
  buildResult(): TxResult<void> {
    if (this.aborted) {
      return { ok: false, error: { kind: 'internal', message: 'Transaction aborted' }, report: { ok: false, errors: [], warnings: [] } };
    }

    // Validate stagedDoc
    const validator = new Validator(this.stagedDoc as any); // Cast patch to PatchDocument
    const report = validator.validateAll(this.stagedDoc as any);

    if (this.committed && !report.ok) {
      return {
        ok: false,
        error: { kind: 'validation', message: 'Validation failed', diagnostics: report.errors },
        report
      };
    }

    const diff = generateDiff(this.stagedOps);

    // Construct CommittedTx if committed
    if (this.committed) {
      const tx: CommittedTx = {
        id: crypto.randomUUID(),
        parentId: null, // Kernel will set this
        meta: this.meta,
        ops: this.stagedOps,
        inverseOps: this.inverseOps,
        diff,
        report,
        kernelVersion: 1
      };

      return {
        ok: true,
        committed: true,
        value: undefined,
        tx,
        report,
        diff
      };
    } else {
      // Preview
      return {
        ok: true,
        committed: false,
        value: undefined,
        preview: {
          meta: this.meta,
          ops: this.stagedOps
        },
        report,
        diff
      };
    }
  }
}