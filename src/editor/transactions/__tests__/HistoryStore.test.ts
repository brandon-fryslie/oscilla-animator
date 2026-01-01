/**
 * @file HistoryStore Tests
 * @description Tests for revision tree, undo/redo functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { runTx } from '../TxBuilder';
import type { Block } from '../../types';

describe('HistoryStore', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();
    rootStore.clearPatch();
  });

  describe('revision tree basics', () => {
    it('starts at revision 0 (root)', () => {
      expect(rootStore.historyStore.currentRevisionId).toBe(0);
      expect(rootStore.historyStore.canUndo).toBe(false);
      expect(rootStore.historyStore.canRedo).toBe(false);
    });

    it('creates new revision on transaction commit', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(rootStore.historyStore.currentRevisionId).toBe(1);
      expect(rootStore.historyStore.canUndo).toBe(true);
      expect(rootStore.historyStore.canRedo).toBe(false);
    });

    it('stores revision with ops and inverse ops', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      const revision = rootStore.historyStore.getRevision(1);
      expect(revision).toBeDefined();
      expect(revision?.label).toBe('Add Block');
      expect(revision?.ops).toHaveLength(1);
      expect(revision?.ops[0].type).toBe('Add');
      expect(revision?.inverseOps).toHaveLength(1);
      expect(revision?.inverseOps[0].type).toBe('Remove');
    });

    it('creates parent-child links correctly', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      runTx(rootStore, { label: 'Edit 2' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      const revision1 = rootStore.historyStore.getRevision(1);
      const revision2 = rootStore.historyStore.getRevision(2);

      expect(revision1?.parentId).toBe(0); // Child of root
      expect(revision2?.parentId).toBe(1); // Child of revision 1
    });
  });

  describe('undo()', () => {
    it('applies inverse ops and moves to parent', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      // Add block
      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      expect(rootStore.patchStore.userBlocks).toHaveLength(1);
      expect(rootStore.historyStore.currentRevisionId).toBe(1);

      // Undo
      const result = rootStore.historyStore.undo();

      expect(result).toBe(true);
      expect(rootStore.patchStore.userBlocks).toHaveLength(0);
      expect(rootStore.historyStore.currentRevisionId).toBe(0);
    });

    it('returns false if cannot undo (at root)', () => {
      const result = rootStore.historyStore.undo();
      expect(result).toBe(false);
      expect(rootStore.historyStore.currentRevisionId).toBe(0);
    });

    it('sets preferred child for redo', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      rootStore.historyStore.undo();

      // Root (revision 0) has no RevisionNode, check rootPreferredChildId instead
      expect(rootStore.historyStore.rootPreferredChildId).toBe(1);
    });

    it('undoes multiple edits correctly', () => {
      // Create 3 revisions
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      runTx(rootStore, { label: 'Edit 2' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      runTx(rootStore, { label: 'Edit 3' }, tx => {
        tx.add('blocks', {
          id: 'block-3',
          type: 'test',
          label: 'Block 3',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      expect(rootStore.patchStore.userBlocks).toHaveLength(3);
      expect(rootStore.historyStore.currentRevisionId).toBe(3);

      // Undo twice
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(2);
      expect(rootStore.historyStore.currentRevisionId).toBe(2);

      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(1);
      expect(rootStore.historyStore.currentRevisionId).toBe(1);
    });

    it('undoes complex operations (Many op)', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [{ id: 'in', label: 'In', type: 'Signal<float>', direction: 'input' }],
        outputs: [{ id: 'out', label: 'Out', type: 'Signal<float>', direction: 'output' }],
        params: {},
        category: 'Other',
      };

      // Add block with connections (cascade)
      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
        tx.add('connections', {
          id: 'conn-1',
          from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
          to: { blockId: 'block-1', slotId: 'in', direction: 'input' },
        });
      });

      expect(rootStore.patchStore.userBlocks).toHaveLength(1);
      expect(rootStore.patchStore.connections).toHaveLength(1);

      // Undo should remove both
      rootStore.historyStore.undo();

      expect(rootStore.patchStore.userBlocks).toHaveLength(0);
      expect(rootStore.patchStore.connections).toHaveLength(0);
    });
  });

  describe('redo()', () => {
    it('applies forward ops and moves to child', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      // Add block
      runTx(rootStore, { label: 'Add Block' }, tx => {
        tx.add('blocks', block);
      });

      // Undo
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(0);
      expect(rootStore.historyStore.canRedo).toBe(true);

      // Redo
      const result = rootStore.historyStore.redo();

      expect(result).toBe(true);
      expect(rootStore.patchStore.userBlocks).toHaveLength(1);
      expect(rootStore.patchStore.userBlocks[0]).toMatchObject({
        id: 'block-1',
        label: 'Test Block',
      });
      expect(rootStore.historyStore.currentRevisionId).toBe(1);
    });

    it('returns false if cannot redo (no children)', () => {
      const result = rootStore.historyStore.redo();
      expect(result).toBe(false);
    });

    it('uses preferred child when set', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      rootStore.historyStore.undo();

      // Preferred child should be set during undo
      // Root (revision 0) has no RevisionNode, check rootPreferredChildId instead
      expect(rootStore.historyStore.rootPreferredChildId).toBe(1);

      // Redo should use preferred child
      rootStore.historyStore.redo();
      expect(rootStore.historyStore.currentRevisionId).toBe(1);
    });

    it('redoes multiple edits correctly', () => {
      // Create 3 revisions
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      runTx(rootStore, { label: 'Edit 2' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      runTx(rootStore, { label: 'Edit 3' }, tx => {
        tx.add('blocks', {
          id: 'block-3',
          type: 'test',
          label: 'Block 3',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      // Undo all
      rootStore.historyStore.undo();
      rootStore.historyStore.undo();
      rootStore.historyStore.undo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(0);
      expect(rootStore.historyStore.currentRevisionId).toBe(0);

      // Redo all
      rootStore.historyStore.redo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(1);
      expect(rootStore.historyStore.currentRevisionId).toBe(1);

      rootStore.historyStore.redo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(2);
      expect(rootStore.historyStore.currentRevisionId).toBe(2);

      rootStore.historyStore.redo();
      expect(rootStore.patchStore.userBlocks).toHaveLength(3);
      expect(rootStore.historyStore.currentRevisionId).toBe(3);
    });
  });

  describe('canUndo / canRedo', () => {
    it('canUndo is false at root', () => {
      expect(rootStore.historyStore.canUndo).toBe(false);
    });

    it('canUndo is true after edit', () => {
      runTx(rootStore, { label: 'Edit' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      expect(rootStore.historyStore.canUndo).toBe(true);
    });

    it('canRedo is false after edit', () => {
      runTx(rootStore, { label: 'Edit' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      expect(rootStore.historyStore.canRedo).toBe(false);
    });

    it('canRedo is true after undo', () => {
      runTx(rootStore, { label: 'Edit' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      rootStore.historyStore.undo();

      expect(rootStore.historyStore.canRedo).toBe(true);
      expect(rootStore.historyStore.canUndo).toBe(false);
    });
  });

  describe('branching (variations)', () => {
    it('creates new branch after undo + new edit', () => {
      // Create initial revision
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      // Undo
      rootStore.historyStore.undo();

      // Create new variation
      runTx(rootStore, { label: 'Edit 2 (variation)' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      // Both revisions should exist as children of root
      const children = rootStore.historyStore.getChildren(0);
      expect(children).toHaveLength(2);
      expect(children[0].id).toBe(1);
      expect(children[1].id).toBe(2);

      // Current should be at new branch
      expect(rootStore.historyStore.currentRevisionId).toBe(2);
      expect(rootStore.patchStore.userBlocks[0].id).toBe('block-2');
    });

    it('redo uses first child if no preferred child', () => {
      // Create two branches
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      rootStore.historyStore.undo();

      runTx(rootStore, { label: 'Edit 2' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      // Go back to root
      rootStore.historyStore.undo();

      // Clear preferred child (manually for test)
        rootStore.historyStore.rootPreferredChildId = undefined;

      // Redo should use first child (revision 1)
      rootStore.historyStore.redo();
      expect(rootStore.historyStore.currentRevisionId).toBe(1);
      expect(rootStore.patchStore.userBlocks[0].id).toBe('block-1');
    });
  });

  describe('getParent / getChildren', () => {
    it('getParent returns parent revision', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      runTx(rootStore, { label: 'Edit 2' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      const parent = rootStore.historyStore.getParent(2);
      expect(parent).toBeDefined();
      expect(parent?.id).toBe(1);
      expect(parent?.label).toBe('Edit 1');
    });

    it('getParent returns undefined for root', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      const parent = rootStore.historyStore.getParent(1);
      expect(parent).toBeUndefined();
    });

    it('getChildren returns all children sorted by id', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      rootStore.historyStore.undo();

      runTx(rootStore, { label: 'Edit 2' }, tx => {
        tx.add('blocks', {
          id: 'block-2',
          type: 'test',
          label: 'Block 2',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      const children = rootStore.historyStore.getChildren(0);
      expect(children).toHaveLength(2);
      expect(children[0].label).toBe('Edit 1');
      expect(children[1].label).toBe('Edit 2');
    });

    it('getChildren returns empty array if no children', () => {
      runTx(rootStore, { label: 'Edit 1' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      const children = rootStore.historyStore.getChildren(1);
      expect(children).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty transaction (no ops)', () => {
      runTx(rootStore, { label: 'Empty' }, () => {
        // No ops
      });

      expect(rootStore.historyStore.currentRevisionId).toBe(1);
      expect(rootStore.historyStore.canUndo).toBe(true);

      // Undo should work (even though no state changed)
      rootStore.historyStore.undo();
      expect(rootStore.historyStore.currentRevisionId).toBe(0);
    });

    it('handles rapid undo/redo cycles', () => {
      runTx(rootStore, { label: 'Edit' }, tx => {
        tx.add('blocks', {
          id: 'block-1',
          type: 'test',
          label: 'Block 1',
          inputs: [],
          outputs: [],
          params: {},
          category: 'Other',
        });
      });

      // Undo/redo multiple times
      for (let i = 0; i < 5; i++) {
        rootStore.historyStore.undo();
        rootStore.historyStore.redo();
      }

      // Should end up at revision 1
      expect(rootStore.historyStore.currentRevisionId).toBe(1);
      expect(rootStore.patchStore.userBlocks).toHaveLength(1);
    });
  });
});
