/**
 * Selection Store Tests
 *
 * Tests for multi-select and selection management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import { SelectionStore } from '../SelectionStore';

describe('SelectionStore', () => {
  let root: RootStore;
  let selection: SelectionStore;

  beforeEach(() => {
    root = new RootStore();
    selection = new SelectionStore(root);
  });

  describe('Initial State', () => {
    it('starts with no selection', () => {
      expect(selection.kind).toBe('none');
      expect(selection.selectedBlockIds).toEqual([]);
      expect(selection.selectedBusId).toBeNull();
      expect(selection.selectedPortRef).toBeNull();
    });
  });

  describe('selectBlock', () => {
    it('selects a single block', () => {
      selection.selectBlock('block-1');

      expect(selection.kind).toBe('block');
      expect(selection.selectedBlockIds).toEqual(['block-1']);
    });

    it('replaces previous selection by default', () => {
      selection.selectBlock('block-1');
      selection.selectBlock('block-2');

      expect(selection.selectedBlockIds).toEqual(['block-2']);
    });

    it('adds to selection when additive=true', () => {
      selection.selectBlock('block-1');
      selection.selectBlock('block-2', true);

      expect(selection.selectedBlockIds).toEqual(['block-1', 'block-2']);
    });

    it('does not duplicate blocks in additive mode', () => {
      selection.selectBlock('block-1');
      selection.selectBlock('block-2', true);
      selection.selectBlock('block-1', true);

      expect(selection.selectedBlockIds).toEqual(['block-1', 'block-2']);
    });

    it('starts new selection when additive=true but no prior block selection', () => {
      selection.selectBus('bus-1');
      selection.selectBlock('block-1', true);

      expect(selection.kind).toBe('block');
      expect(selection.selectedBlockIds).toEqual(['block-1']);
    });
  });

  describe('selectBlocks', () => {
    it('selects multiple blocks', () => {
      selection.selectBlocks(['block-1', 'block-2', 'block-3']);

      expect(selection.kind).toBe('block');
      expect(selection.selectedBlockIds).toEqual(['block-1', 'block-2', 'block-3']);
    });

    it('replaces previous selection', () => {
      selection.selectBlocks(['block-1', 'block-2']);
      selection.selectBlocks(['block-3', 'block-4']);

      expect(selection.selectedBlockIds).toEqual(['block-3', 'block-4']);
    });

    it('clears selection when given empty array', () => {
      selection.selectBlocks(['block-1', 'block-2']);
      selection.selectBlocks([]);

      expect(selection.kind).toBe('none');
      expect(selection.selectedBlockIds).toEqual([]);
    });
  });

  describe('toggleBlockSelection', () => {
    it('starts new selection if none exists', () => {
      selection.toggleBlockSelection('block-1');

      expect(selection.kind).toBe('block');
      expect(selection.selectedBlockIds).toEqual(['block-1']);
    });

    it('adds block to existing selection', () => {
      selection.selectBlock('block-1');
      selection.toggleBlockSelection('block-2');

      expect(selection.selectedBlockIds).toEqual(['block-1', 'block-2']);
    });

    it('removes block from selection if already selected', () => {
      selection.selectBlocks(['block-1', 'block-2', 'block-3']);
      selection.toggleBlockSelection('block-2');

      expect(selection.selectedBlockIds).toEqual(['block-1', 'block-3']);
    });

    it('clears selection if removing last block', () => {
      selection.selectBlock('block-1');
      selection.toggleBlockSelection('block-1');

      expect(selection.kind).toBe('none');
    });

    it('converts non-block selection to block selection', () => {
      selection.selectBus('bus-1');
      selection.toggleBlockSelection('block-1');

      expect(selection.kind).toBe('block');
      expect(selection.selectedBlockIds).toEqual(['block-1']);
    });
  });

  describe('selectBus', () => {
    it('selects a bus', () => {
      selection.selectBus('bus-1');

      expect(selection.kind).toBe('bus');
      expect(selection.selectedBusId).toBe('bus-1');
    });

    it('replaces previous bus selection', () => {
      selection.selectBus('bus-1');
      selection.selectBus('bus-2');

      expect(selection.selectedBusId).toBe('bus-2');
    });

    it('clears block selection', () => {
      selection.selectBlock('block-1');
      selection.selectBus('bus-1');

      expect(selection.kind).toBe('bus');
      expect(selection.selectedBlockIds).toEqual([]);
    });
  });

  describe('selectPort', () => {
    it('selects a port', () => {
      const portRef = { blockId: 'block-1', portId: 'input' };
      selection.selectPort(portRef);

      expect(selection.kind).toBe('port');
      expect(selection.selectedPortRef).toEqual(portRef);
    });

    it('replaces previous port selection', () => {
      selection.selectPort({ blockId: 'block-1', portId: 'input' });
      selection.selectPort({ blockId: 'block-2', portId: 'output' });

      expect(selection.selectedPortRef).toEqual({ blockId: 'block-2', portId: 'output' });
    });

    it('clears block selection', () => {
      selection.selectBlock('block-1');
      selection.selectPort({ blockId: 'block-2', portId: 'input' });

      expect(selection.kind).toBe('port');
      expect(selection.selectedBlockIds).toEqual([]);
    });

    it('clears bus selection', () => {
      selection.selectBus('bus-1');
      selection.selectPort({ blockId: 'block-1', portId: 'input' });

      expect(selection.kind).toBe('port');
      expect(selection.selectedBusId).toBeNull();
    });
  });

  describe('clearSelection', () => {
    it('clears block selection', () => {
      selection.selectBlocks(['block-1', 'block-2']);
      selection.clearSelection();

      expect(selection.kind).toBe('none');
      expect(selection.selectedBlockIds).toEqual([]);
    });

    it('clears bus selection', () => {
      selection.selectBus('bus-1');
      selection.clearSelection();

      expect(selection.kind).toBe('none');
      expect(selection.selectedBusId).toBeNull();
    });

    it('clears port selection', () => {
      selection.selectPort({ blockId: 'block-1', portId: 'input' });
      selection.clearSelection();

      expect(selection.kind).toBe('none');
      expect(selection.selectedPortRef).toBeNull();
    });

    it('is idempotent', () => {
      selection.clearSelection();
      selection.clearSelection();

      expect(selection.kind).toBe('none');
    });
  });

  describe('isBlockSelected', () => {
    it('returns true for selected block', () => {
      selection.selectBlock('block-1');

      expect(selection.isBlockSelected('block-1')).toBe(true);
    });

    it('returns false for non-selected block', () => {
      selection.selectBlock('block-1');

      expect(selection.isBlockSelected('block-2')).toBe(false);
    });

    it('returns true for blocks in multi-select', () => {
      selection.selectBlocks(['block-1', 'block-2', 'block-3']);

      expect(selection.isBlockSelected('block-1')).toBe(true);
      expect(selection.isBlockSelected('block-2')).toBe(true);
      expect(selection.isBlockSelected('block-3')).toBe(true);
    });

    it('returns false when no blocks selected', () => {
      expect(selection.isBlockSelected('block-1')).toBe(false);
    });

    it('returns false when other selection types active', () => {
      selection.selectBus('bus-1');

      expect(selection.isBlockSelected('block-1')).toBe(false);
    });
  });

  describe('Computed Values', () => {
    it('kind is reactive', () => {
      expect(selection.kind).toBe('none');

      selection.selectBlock('block-1');
      expect(selection.kind).toBe('block');

      selection.selectBus('bus-1');
      expect(selection.kind).toBe('bus');

      selection.selectPort({ blockId: 'block-1', portId: 'input' });
      expect(selection.kind).toBe('port');

      selection.clearSelection();
      expect(selection.kind).toBe('none');
    });

    it('selectedBlockIds is reactive', () => {
      expect(selection.selectedBlockIds).toEqual([]);

      selection.selectBlock('block-1');
      expect(selection.selectedBlockIds).toEqual(['block-1']);

      selection.selectBlock('block-2', true);
      expect(selection.selectedBlockIds).toEqual(['block-1', 'block-2']);

      selection.clearSelection();
      expect(selection.selectedBlockIds).toEqual([]);
    });

    it('selectedBusId is reactive', () => {
      expect(selection.selectedBusId).toBeNull();

      selection.selectBus('bus-1');
      expect(selection.selectedBusId).toBe('bus-1');

      selection.clearSelection();
      expect(selection.selectedBusId).toBeNull();
    });

    it('selectedPortRef is reactive', () => {
      expect(selection.selectedPortRef).toBeNull();

      const ref = { blockId: 'block-1', portId: 'input' };
      selection.selectPort(ref);
      expect(selection.selectedPortRef).toEqual(ref);

      selection.clearSelection();
      expect(selection.selectedPortRef).toBeNull();
    });
  });

  describe('Mutual Exclusivity', () => {
    it('selecting block clears bus', () => {
      selection.selectBus('bus-1');
      selection.selectBlock('block-1');

      expect(selection.selectedBusId).toBeNull();
    });

    it('selecting bus clears blocks', () => {
      selection.selectBlocks(['block-1', 'block-2']);
      selection.selectBus('bus-1');

      expect(selection.selectedBlockIds).toEqual([]);
    });

    it('selecting port clears blocks and bus', () => {
      selection.selectBlocks(['block-1', 'block-2']);
      selection.selectBus('bus-1');
      selection.selectPort({ blockId: 'block-3', portId: 'input' });

      expect(selection.selectedBlockIds).toEqual([]);
      expect(selection.selectedBusId).toBeNull();
    });
  });
});
