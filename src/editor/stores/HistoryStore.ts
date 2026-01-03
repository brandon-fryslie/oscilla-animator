/**
 * @file History Store
 * @description Maintains revision tree for undo/redo.
 *
 * Key concepts:
 * - Revisions form a tree (not linear) to support branching
 * - Each revision stores forward ops and inverse ops
 * - currentRevisionId tracks position in the tree
 * - Undo applies inverse ops and moves to parent
 * - Redo applies forward ops and moves to child
 * - preferredChildId enables redo after undo (revisiting the same path)
 *
 * Design principles:
 * - Pure data structure (no complex state mutations)
 * - All revisions are immutable once created
 * - Tree structure enables future features (branching, revision browser)
 * - Fast undo/redo (O(1) for ops application)
 *
 * @see design-docs/6-Transactions/4-History.md
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { Op } from '../transactions/ops';
import type { RootStore } from './RootStore';
import { applyOps } from '../transactions/applyOps';

/**
 * A node in the revision tree.
 *
 * Each revision represents a committed transaction with:
 * - Forward ops (what was applied to create this revision)
 * - Inverse ops (how to undo this revision)
 * - Parent link (where we came from)
 * - Optional preferred child (for redo path selection)
 */
export interface RevisionNode {
  /** Unique revision ID */
  readonly id: number;

  /** Parent revision ID (0 for root, which is implicit) */
  readonly parentId: number;

  /** Forward ops that were applied to create this revision */
  readonly ops: Op[];

  /** Inverse ops to undo this revision */
  readonly inverseOps: Op[];

  /** Human-readable label for history display */
  readonly label: string;

  /** When this revision was created */
  readonly timestamp: number;

  /** Optional snapshot data for faster replay (future optimization) */
  readonly snapshotData?: unknown;

  /** Preferred child for redo (set during undo to revisit same path) */
  preferredChildId?: number;
}

/**
 * History store - maintains revision tree for undo/redo.
 *
 * Revision tree structure:
 * ```
 *        0 (root/initial state - implicit, no RevisionNode)
 *        |
 *        1 (Add Block)
 *       / \
 *      2   3 (two variations)
 *      |
 *      4
 * ```
 *
 * After undo from 4→2→1:
 * - currentRevisionId = 1
 * - Redo will go to 2 (preferred path)
 *
 * After undo then new edit:
 * - Creates new branch (e.g., 5 as child of 1)
 * - Old branch (2,4) still exists in tree
 */
export class HistoryStore {
  /** Map of revision ID to revision node */
  revisions = observable.map<number, RevisionNode>();

  /** Current position in revision tree (0 = initial state) */
  currentRevisionId = 0;

  /** Preferred child ID for the root (revision 0), since root has no RevisionNode */
  rootPreferredChildId: number | undefined = undefined;

  /** Next available revision ID */
  private nextRevisionId = 1;

  /** Reference to root store */
  private readonly rootStore: RootStore;

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeObservable(this, {
      currentRevisionId: observable,
      rootPreferredChildId: observable,
      canUndo: computed,
      canRedo: computed,
      addRevision: action,
      undo: action,
      redo: action,
      reset: action,
    });
  }

  /**
   * Can we undo from current revision?
   * True if current revision is not the root (0).
   */
  get canUndo(): boolean {
    // Can undo if we're not at the root (revision 0 is the implicit initial state)
    return this.currentRevisionId !== 0;
  }

  /**
   * Can we redo from current revision?
   * True if current revision has at least one child.
   */
  get canRedo(): boolean {
    return this.getChildren(this.currentRevisionId).length > 0;
  }

  /**
   * Add a new revision to the tree.
   * Creates a new node as a child of current revision.
   *
   * @param ops Forward ops that were applied
   * @param inverseOps Inverse ops for undo
   * @param label Human-readable label
   * @returns The new revision ID
   */
  addRevision(ops: Op[], inverseOps: Op[], label: string): number {
    const id = this.nextRevisionId++;
    const node: RevisionNode = {
      id,
      parentId: this.currentRevisionId,
      ops,
      inverseOps,
      label,
      timestamp: Date.now(),
    };

    this.revisions.set(id, node);
    this.currentRevisionId = id;
    return id;
  }

  /**
   * Reset the history to initial state (no revisions).
   * Clears all revisions and resets to revision 0 (root).
   *
   * Sprint: Bus-Block Unification - Sprint 3 (Fix Tests)
   * Used after creating default buses to start with a clean history.
   */
  reset(): void {
    this.revisions.clear();
    this.currentRevisionId = 0;
    this.rootPreferredChildId = undefined;
    this.nextRevisionId = 1;
  }

  /**
   * Get a revision by ID.
   */
  getRevision(id: number): RevisionNode | undefined {
    return this.revisions.get(id);
  }

  /**
   * Get all children of a revision.
   * Returns empty array if no children exist.
   *
   * @param parentId The parent revision ID
   * @returns Array of child revisions, sorted by ID (creation order)
   */
  getChildren(parentId: number): RevisionNode[] {
    const children: RevisionNode[] = [];
    this.revisions.forEach(node => {
      if (node.parentId === parentId) {
        children.push(node);
      }
    });
    return children.sort((a, b) => a.id - b.id);
  }

  /**
   * Get the parent of a revision.
   * Returns undefined if revision is root (0) or doesn't exist.
   */
  getParent(id: number): RevisionNode | undefined {
    const node = this.revisions.get(id);
    if (node === null || node === undefined || node.parentId === 0) {
      return undefined;
    }
    return this.revisions.get(node.parentId);
  }

  /**
   * Undo the current revision.
   * Applies inverse ops and moves to parent revision.
   *
   * @returns True if undo succeeded, false if can't undo
   */
  undo(): boolean {
    if (!this.canUndo) {
      return false;
    }

    const current = this.revisions.get(this.currentRevisionId);
    if (current === null || current === undefined) {
      return false;
    }

    // Apply inverse ops to restore previous state
    applyOps(current.inverseOps, this.rootStore);

    // Move to parent
    const parentId = current.parentId;
    this.currentRevisionId = parentId;

    // Set preferred child on parent for future redo
    if (parentId !== 0) {
      const parent = this.revisions.get(parentId);
      if (parent !== null && parent !== undefined) {
        parent.preferredChildId = current.id;
      }
    } else {
      // Parent is root - store preferred child on HistoryStore itself
      this.rootPreferredChildId = current.id;
    }

    return true;
  }

  /**
   * Redo from current revision.
   * Applies forward ops of preferred child and moves to that child.
   *
   * @returns True if redo succeeded, false if can't redo
   */
  redo(): boolean {
    if (!this.canRedo) {
      return false;
    }

    const children = this.getChildren(this.currentRevisionId);

    // Use preferred child if set, otherwise first child
    const preferredId = this.currentRevisionId === 0
      ? this.rootPreferredChildId
      : this.revisions.get(this.currentRevisionId)?.preferredChildId;
    const nextChild = (preferredId !== null && preferredId !== undefined)
      ? children.find(c => c.id === preferredId) ?? children[0]
      : children[0];

    if (nextChild === null || nextChild === undefined) {
      return false;
    }

    // Apply forward ops
    applyOps(nextChild.ops, this.rootStore);

    // Move to child
    this.currentRevisionId = nextChild.id;

    return true;
  }
}
