/**
 * Patch Kernel Implementation
 *
 * The Brain of the editor. Manages state, history, and validation.
 *
 * Reference: design-docs/10-Refactor-for-UI-prep/9-TransactionBuilderContract.md
 */

import type {
  PatchKernel,
  TxMeta,
  TxResult,
  TxBuilder,
  CommittedTx,
  TxId
} from './types';
import type { PatchDocument, ValidationResult } from '../semantic/types';
import type { SemanticGraph } from '../semantic';
import type { Patch } from '../types';
import { SemanticGraph as GraphImpl } from '../semantic/graph';
import { Validator } from '../semantic/validator';
import { TransactionBuilder } from './TransactionBuilder';
import { applyOp } from './applyOp';

export class Kernel implements PatchKernel {
  // State
  private readonly _doc: Patch;
  private _graph: GraphImpl;
  private _report: ValidationResult;

  // History
  private history: {
    nodes: Map<TxId, CommittedTx>;
    children: Map<TxId, TxId[]>; // Adjacency list for tree
    head: TxId | null;
  } = {
    nodes: new Map(),
    children: new Map(),
    head: null
  };

  constructor(initialPatch: Patch) {
    this._doc = JSON.parse(JSON.stringify(initialPatch));
    this._graph = GraphImpl.fromPatch(this._doc as any);
    this._report = { ok: true, errors: [], warnings: [] }; // Initial assumption
  }

  get doc(): PatchDocument {
    return this._doc as any;
  }

  get graph(): SemanticGraph {
    return this._graph;
  }

  get report(): ValidationResult {
    return this._report;
  }

  transaction<R>(meta: TxMeta, build: (tx: TxBuilder) => R): TxResult<R> {
    const builder = new TransactionBuilder(this, this._doc, meta);
    const value = build(builder);
    const result = builder.buildResult();

    if (result.ok && result.committed) {
      this.applyTx(result.tx);
    }

    if (result.ok) {
      return { ...result, value } as TxResult<R>;
    }

    return result;
  }

  applyTx(tx: CommittedTx): void {
    // 1. Link to parent
    tx.parentId = this.history.head;

    // 2. Apply ops to canonical doc
    for (const op of tx.ops) {
      applyOp(this._doc, op);
    }

    // 3. Update graph and validation
    this._graph = GraphImpl.fromPatch(this._doc as any);
    const validator = new Validator(this._doc as any);
    this._report = validator.validateAll(this._doc as any);

    // 4. Update history
    this.history.nodes.set(tx.id, tx);

    // Update parent's children
    if (tx.parentId) {
      const children = this.history.children.get(tx.parentId) ?? [];
      children.push(tx.id);
      this.history.children.set(tx.parentId, children);
    }

    this.history.head = tx.id;

    // 5. Emit events (via RootStore integration, handled by caller for now)
  }

  undo(): void {
    if (!this.history.head) return;

    const tx = this.history.nodes.get(this.history.head);
    if (!tx) return;

    // Apply inverse ops
    for (const op of tx.inverseOps) {
      applyOp(this._doc, op);
    }

    // Update graph/validation
    this._graph = GraphImpl.fromPatch(this._doc as any);
    const validator = new Validator(this._doc as any);
    this._report = validator.validateAll(this._doc as any);

    // Move head pointer
    this.history.head = tx.parentId;
  }

  redo(): void {
    if (this.history.head === null && this.history.nodes.size > 0) {
      // If head is null but we have nodes, find roots?
      // Not implemented for now.
      return;
    }

    if (!this.history.head) return; // Should handle empty history case better

    // Find children of current head
    const children = this.history.children.get(this.history.head);
    if (children && children.length > 0) {
      // Default to last child (most recent branch)
      const nextId = children[children.length - 1];
      const tx = this.history.nodes.get(nextId);

      if (tx) {
        // Re-apply ops
        for (const op of tx.ops) {
          applyOp(this._doc, op);
        }

        // Update graph/validation
        this._graph = GraphImpl.fromPatch(this._doc as any);
        const validator = new Validator(this._doc as any);
        this._report = validator.validateAll(this._doc as any);

        // Move head
        this.history.head = nextId;
      }
    }
  }
}
