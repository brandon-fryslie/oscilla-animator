/**
 * Emphasis Store Tests
 *
 * Tests for focus and highlight management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import { EmphasisStore } from '../EmphasisStore';

describe('EmphasisStore', () => {
  let root: RootStore;
  let emphasis: EmphasisStore;

  beforeEach(() => {
    root = new RootStore();
    emphasis = new EmphasisStore(root);
  });

  describe('Initial State', () => {
    it('starts with no emphasis', () => {
      expect(emphasis.mode).toBe('none');
      expect(emphasis.focusedBlockId).toBeNull();
      expect(emphasis.focusedBusId).toBeNull();
      expect(emphasis.emphasis.highlightedBlockIds.size).toBe(0);
      expect(emphasis.emphasis.highlightedPortRefs.size).toBe(0);
      expect(emphasis.emphasis.connectorGlowEdges.size).toBe(0);
    });
  });

  describe('focusBlock', () => {
    it('sets block focus mode', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(blockId);

      expect(emphasis.mode).toBe('blockFocus');
      expect(emphasis.focusedBlockId).toBe(blockId);
      expect(emphasis.focusedBusId).toBeNull();
    });

    it('highlights the focused block', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(blockId);

      expect(emphasis.emphasis.highlightedBlockIds.has(blockId)).toBe(true);
    });

    it('highlights upstream blocks', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      // Connect block1 -> block2
      root.patchStore.connect(block1, 'value', block2, 'value');

      emphasis.focusBlock(block2);

      expect(emphasis.emphasis.highlightedBlockIds.has(block1)).toBe(true);
      expect(emphasis.emphasis.highlightedBlockIds.has(block2)).toBe(true);
    });

    it('highlights downstream blocks', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      // Connect block1 -> block2
      root.patchStore.connect(block1, 'value', block2, 'value');

      emphasis.focusBlock(block1);

      expect(emphasis.emphasis.highlightedBlockIds.has(block1)).toBe(true);
      expect(emphasis.emphasis.highlightedBlockIds.has(block2)).toBe(true);
    });

    it('highlights related ports', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      root.patchStore.connect(block1, 'value', block2, 'value');

      emphasis.focusBlock(block1);

      expect(emphasis.emphasis.highlightedPortRefs.has(`${block1}:value`)).toBe(true);
      expect(emphasis.emphasis.highlightedPortRefs.has(`${block2}:value`)).toBe(true);
    });

    it('highlights connector edges', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      root.patchStore.connect(block1, 'value', block2, 'value');

      emphasis.focusBlock(block1);

      const edgeId = `${block1}:value->${block2}:value`;
      expect(emphasis.emphasis.connectorGlowEdges.has(edgeId)).toBe(true);
    });

    it('replaces previous block focus', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(block1);
      emphasis.focusBlock(block2);

      expect(emphasis.focusedBlockId).toBe(block2);
      expect(emphasis.emphasis.highlightedBlockIds.has(block2)).toBe(true);
    });
  });

  describe('focusBus', () => {
    it('sets bus focus mode', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      emphasis.focusBus(busId);

      expect(emphasis.mode).toBe('busFocus');
      expect(emphasis.focusedBusId).toBe(busId);
      expect(emphasis.focusedBlockId).toBeNull();
    });

    it('highlights publisher blocks', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      root.busStore.addPublisher(busId, blockId, 'value');

      emphasis.focusBus(busId);

      expect(emphasis.emphasis.highlightedBlockIds.has(blockId)).toBe(true);
    });

    it('highlights subscriber blocks', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      root.busStore.addListener(busId, blockId, 'value');

      emphasis.focusBus(busId);

      expect(emphasis.emphasis.highlightedBlockIds.has(blockId)).toBe(true);
    });

    it('highlights both publishers and subscribers', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );
      const publisher = root.patchStore.addBlock('FieldConstNumber', {});
      const subscriber = root.patchStore.addBlock('FieldConstNumber', {});

      root.busStore.addPublisher(busId, publisher, 'value');
      root.busStore.addListener(busId, subscriber, 'value');

      emphasis.focusBus(busId);

      expect(emphasis.emphasis.highlightedBlockIds.has(publisher)).toBe(true);
      expect(emphasis.emphasis.highlightedBlockIds.has(subscriber)).toBe(true);
    });

    it('highlights bus-related ports', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      root.busStore.addPublisher(busId, blockId, 'value');

      emphasis.focusBus(busId);

      expect(emphasis.emphasis.highlightedPortRefs.has(`${blockId}:value`)).toBe(true);
    });

    it('replaces previous bus focus', () => {
      const bus1 = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'bus1',
        'last'
      );
      const bus2 = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'bus2',
        'last'
      );

      emphasis.focusBus(bus1);
      emphasis.focusBus(bus2);

      expect(emphasis.focusedBusId).toBe(bus2);
    });

    it('clears block focus when focusing bus', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      emphasis.focusBlock(blockId);
      emphasis.focusBus(busId);

      expect(emphasis.focusedBlockId).toBeNull();
      expect(emphasis.mode).toBe('busFocus');
    });
  });

  describe('hoverBlock', () => {
    it('sets hover mode when nothing focused', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.hoverBlock(blockId);

      expect(emphasis.mode).toBe('hover');
      expect(emphasis.focusedBlockId).toBe(blockId);
    });

    it('highlights related blocks', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      root.patchStore.connect(block1, 'value', block2, 'value');

      emphasis.hoverBlock(block1);

      expect(emphasis.emphasis.highlightedBlockIds.has(block1)).toBe(true);
      expect(emphasis.emphasis.highlightedBlockIds.has(block2)).toBe(true);
    });

    it('does not override focus mode', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(block1);
      emphasis.hoverBlock(block2);

      expect(emphasis.mode).toBe('blockFocus');
      expect(emphasis.focusedBlockId).toBe(block1); // Still focused on block1
    });

    it('does not override bus focus mode', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      emphasis.focusBus(busId);
      emphasis.hoverBlock(blockId);

      expect(emphasis.mode).toBe('busFocus');
      expect(emphasis.focusedBusId).toBe(busId);
    });
  });

  describe('clearFocus', () => {
    it('clears block focus', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(blockId);
      emphasis.clearFocus();

      expect(emphasis.mode).toBe('none');
      expect(emphasis.focusedBlockId).toBeNull();
      expect(emphasis.emphasis.highlightedBlockIds.size).toBe(0);
    });

    it('clears bus focus', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      emphasis.focusBus(busId);
      emphasis.clearFocus();

      expect(emphasis.mode).toBe('none');
      expect(emphasis.focusedBusId).toBeNull();
      expect(emphasis.emphasis.highlightedBlockIds.size).toBe(0);
    });

    it('clears all highlights', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      root.patchStore.connect(block1, 'value', block2, 'value');
      emphasis.focusBlock(block1);

      emphasis.clearFocus();

      expect(emphasis.emphasis.highlightedBlockIds.size).toBe(0);
      expect(emphasis.emphasis.highlightedPortRefs.size).toBe(0);
      expect(emphasis.emphasis.connectorGlowEdges.size).toBe(0);
    });
  });

  describe('clearHover', () => {
    it('clears hover mode', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.hoverBlock(blockId);
      emphasis.clearHover();

      expect(emphasis.mode).toBe('none');
      expect(emphasis.focusedBlockId).toBeNull();
    });

    it('does not clear focus mode', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(blockId);
      emphasis.clearHover();

      expect(emphasis.mode).toBe('blockFocus');
      expect(emphasis.focusedBlockId).toBe(blockId);
    });

    it('does not clear bus focus mode', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      emphasis.focusBus(busId);
      emphasis.clearHover();

      expect(emphasis.mode).toBe('busFocus');
      expect(emphasis.focusedBusId).toBe(busId);
    });
  });

  describe('clearAll', () => {
    it('clears all emphasis state', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(blockId);
      emphasis.clearAll();

      expect(emphasis.mode).toBe('none');
      expect(emphasis.focusedBlockId).toBeNull();
      expect(emphasis.focusedBusId).toBeNull();
      expect(emphasis.emphasis.highlightedBlockIds.size).toBe(0);
    });
  });

  describe('Mutual Exclusivity', () => {
    it('only one block focused at a time', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber', {});
      const block2 = root.patchStore.addBlock('FieldConstNumber', {});

      emphasis.focusBlock(block1);
      emphasis.focusBlock(block2);

      expect(emphasis.focusedBlockId).toBe(block2);
      expect(emphasis.emphasis.highlightedBlockIds.has(block1)).toBe(false);
    });

    it('only one bus focused at a time', () => {
      const bus1 = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'bus1',
        'last'
      );
      const bus2 = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'bus2',
        'last'
      );

      emphasis.focusBus(bus1);
      emphasis.focusBus(bus2);

      expect(emphasis.focusedBusId).toBe(bus2);
    });

    it('block focus clears bus focus', () => {
      const blockId = root.patchStore.addBlock('FieldConstNumber', {});
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      emphasis.focusBus(busId);
      emphasis.focusBlock(blockId);

      expect(emphasis.focusedBusId).toBeNull();
      expect(emphasis.focusedBlockId).toBe(blockId);
    });
  });
});
