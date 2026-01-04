/**
 * Transaction Builder Implementation
 *
 * Builds atomic transactions with validation and expansion.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md
 */

import type {
  TxBuilder,
  TxView,
  TxResult,
  TxMeta,
  CommittedTx,
  PatchKernel
} from './types';
import type { PatchDocument } from '../semantic/types';
import type { Patch, Block, Edge, PortRef } from '../types';
import { Validator } from '../semantic/validator';
import { applyOp } from './applyOp';
import type { Op } from './ops';
import { generateDiff } from './diff';
import { randomUUID } from '../crypto';
import { getBlockDefinition } from '../blocks/registry';

// Helper to deep clone patch
function clonePatch(patch: Patch): Patch {
  return JSON.parse(JSON.stringify(patch)) as Patch;
}

/**
 * Convert a Patch to PatchDocument format for validation.
 * Similar to patchAdapter.ts but works with a Patch object directly.
 */
function patchToPatchDocument(patch: Patch): PatchDocument {
  return {
    blocks: patch.blocks.map(block => {
      const blockDef = getBlockDefinition(block.type);
      return {
        id: block.id,
        type: block.type,
        inputs: blockDef?.inputs.map(slot => ({ id: slot.id, type: slot.type })) ?? [],
        outputs: blockDef?.outputs.map(slot => ({ id: slot.id, type: slot.type })) ?? [],
      };
    }),
    edges: patch.edges,
  };
}

class TransactionBuilder implements TxBuilder {
  private readonly stagedDoc: Patch; // Mutable working copy
  private stagedOps: Op[] = [];
  private inverseOps: Op[] = []; // Accumulated in REVERSE order of application
  private committed = false;
  private aborted = false;
  private readonly kernel: PatchKernel;
  private readonly meta: TxMeta;

  constructor(kernel: PatchKernel, baseDoc: Patch, meta: TxMeta) {
    this.kernel = kernel;
    this.stagedDoc = clonePatch(baseDoc);
    this.meta = meta;
  }

  // ===========================================================================
  // TxBuilder Interface
  // ===========================================================================

  get view(): TxView {
    return {
      doc: patchToPatchDocument(this.stagedDoc),
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
    if (inverseOp != null) {
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
    const id = spec.id ?? randomUUID();

    // Look up block definition to get the form
    const blockDef = getBlockDefinition(spec.type);
    const form = blockDef?.compositeDefinition ? 'composite' :
                 spec.type.startsWith('macro:') ? 'macro' :
                 'primitive';

    const block: Block = {
      id,
      type: spec.type,
      label: spec.label ?? spec.type,
      params: spec.params ?? {},
      position: { x: 0, y: 0 }, // Default position
      form,
      role: { kind: 'user' },
    };

    const op: Op = { op: 'BlockAdd', block };
    const inv: Op = { op: 'BlockRemove', blockId: id };

    this.op(op, inv);
    return id;
  }

  removeBlock(blockId: string): void {
    // 1. Capture state for inverse
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (block == null) return; // Already gone

    // 2. Cascade: remove edges connected to this block
    // All connections are now edges (unified model)
    const edgesToRemove = this.stagedDoc.edges.filter(
      e => e.from.blockId === blockId || e.to.blockId === blockId
    );
    for (const edge of edgesToRemove) {
      this.removeEdge(edge.id);
    }

    // 3. Remove Block
    const op: Op = { op: 'BlockRemove', blockId };
    const inv: Op = { op: 'BlockAdd', block: { ...block } }; // Clone block state
    this.op(op, inv);
  }

  retypeBlock(blockId: string, nextType: string, remap?: { kind: 'byKey' | 'schema'; schemaId?: string }): void {
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (block == null) return;

    const prevType = block.type;
    const op: Op = { op: 'BlockRetype', blockId, nextType, remap };
    const inv: Op = { op: 'BlockRetype', blockId, nextType: prevType }; // TODO: inverse remap?

    this.op(op, inv);
  }

  setBlockLabel(blockId: string, label: string): void {
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (block == null) return;

    const prevLabel = block.label;
    const op: Op = { op: 'BlockSetLabel', blockId, label };
    const inv: Op = { op: 'BlockSetLabel', blockId, label: prevLabel };

    this.op(op, inv);
  }

  patchBlockParams(blockId: string, patch: Record<string, unknown>): void {
    const block = this.stagedDoc.blocks.find(b => b.id === blockId);
    if (block == null) return;

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
    const edgeId = id ?? randomUUID();
    const edge: Edge = {
      id: edgeId,
      from: { kind: 'port', blockId: from.blockId, slotId: from.slotId },
      to: { kind: 'port', blockId: to.blockId, slotId: to.slotId },
      enabled: true,
    role: { kind: 'user' },
    };

    const op: Op = { op: 'WireAdd', edge };
    const inv: Op = { op: 'WireRemove', edgeId };

    this.op(op, inv);
    return edgeId;
  }

  removeWire(edgeId: string): void {
    // Look up in edges array (unified model)
    const edge = this.stagedDoc.edges.find(e => e.id === edgeId);
    if (edge == null) return;

    const op: Op = { op: 'WireRemove', edgeId };
    const inv: Op = { op: 'WireAdd', edge: { ...edge } };

    this.op(op, inv);
  }

  retargetWire(edgeId: string, next: { from?: PortRef; to?: PortRef }): void {
    const edge = this.stagedDoc.edges.find(e => e.id === edgeId);
    if (edge == null) return;

    const prev: { from?: PortRef; to?: PortRef } = {};
    if (next.from != null) prev.from = { blockId: edge.from.blockId, slotId: edge.from.slotId, direction: 'output' };
    if (next.to != null) prev.to = { blockId: edge.to.blockId, slotId: edge.to.slotId, direction: 'input' };

    const op: Op = { op: 'WireRetarget', edgeId, next };
    const inv: Op = { op: 'WireRetarget', edgeId, next: prev };

    this.op(op, inv);
  }

  // ---------------------------------------------------------------------------
  // Edge Ops
  // ---------------------------------------------------------------------------
  // Note: Buses are implemented as BusBlocks (regular blocks with ports).
  // Use addBlock with type='BusBlock' and addEdge for connections.

  /**
   * Add an edge connecting two block ports.
   * This is the unified connection type that replaces Connection, Publisher, and Listener.
   */
  addEdge(spec: {
    from: { blockId: string; slotId: string };
    to: { blockId: string; slotId: string };
    enabled?: boolean;
    sortKey?: number;
    transforms?: import('../types').TransformStep[];
    id?: string;
  }): string {
    const id = spec.id ?? randomUUID();

    const edge: Edge = {
      id,
      from: { kind: 'port', blockId: spec.from.blockId, slotId: spec.from.slotId },
      to: { kind: 'port', blockId: spec.to.blockId, slotId: spec.to.slotId },
      enabled: spec.enabled ?? true,
      transforms: spec.transforms,
      sortKey: spec.sortKey,
      role: { kind: 'user' },
    };

    const op: Op = { op: 'WireAdd', edge };
    const inv: Op = { op: 'WireRemove', edgeId: id };

    this.op(op, inv);
    return id;
  }

  removeEdge(edgeId: string): void {
    // Use removeWire which now operates on edges
    this.removeWire(edgeId);
  }

  // ---------------------------------------------------------------------------
  // Time Ops
  // ---------------------------------------------------------------------------

  setTimeRoot(blockId: string): void {
    // Inverse: we don't track prev time root easily without full scan.
    // Assuming we can find it in stagedDoc (or baseDoc).
    // For now, simpler to not invert or require lookup.
    // Let's iterate.
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
    const settings = (this.stagedDoc as any).settings as Record<string, unknown> | undefined;
    for (const key of Object.keys(patch)) {
      undoPatch[key] = settings?.[key];
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

  abort(_reason?: string): void {
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

    // Validate stagedDoc - convert to PatchDocument format first
    const patchDoc = patchToPatchDocument(this.stagedDoc);
    const validator = new Validator(patchDoc);
    const report = validator.validateAll(patchDoc);

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
        id: randomUUID(),
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

export default TransactionBuilder;
