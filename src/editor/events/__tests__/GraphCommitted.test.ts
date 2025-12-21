/**
 * @file GraphCommitted Event Tests
 * @description Tests for GraphCommitted event emission from PatchStore.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { getMacroExpansion } from '../../macros';
import type { GraphCommittedEvent } from '../types';

describe('GraphCommitted Event', () => {
  let rootStore: RootStore;
  let events: GraphCommittedEvent[];

  beforeEach(() => {
    rootStore = new RootStore();
    events = [];
    rootStore.events.on('GraphCommitted', (e) => events.push(e));
  });

  describe('GraphCommitted payload structure', () => {
    it('should include patchRevision', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0]).toHaveProperty('patchRevision');
      expect(typeof events[0].patchRevision).toBe('number');
    });

    it('should include reason field', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0]).toHaveProperty('reason');
      expect(events[0].reason).toBe('userEdit');
    });

    it('should include diffSummary with all required fields', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0]).toHaveProperty('diffSummary');
      expect(events[0].diffSummary).toHaveProperty('blocksAdded');
      expect(events[0].diffSummary).toHaveProperty('blocksRemoved');
      expect(events[0].diffSummary).toHaveProperty('busesAdded');
      expect(events[0].diffSummary).toHaveProperty('busesRemoved');
      expect(events[0].diffSummary).toHaveProperty('bindingsChanged');
      expect(events[0].diffSummary).toHaveProperty('timeRootChanged');
    });

    it('should include patchId', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0]).toHaveProperty('patchId');
      expect(events[0].patchId).toBe(rootStore.patchStore.patchId);
    });

    it('should include affectedBlockIds when blocks are affected', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockId = rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0]).toHaveProperty('affectedBlockIds');
      expect(events[0].affectedBlockIds).toContain(blockId);
    });
  });

  describe('addBlock', () => {
    it('should emit GraphCommitted with blocksAdded=1', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events).toHaveLength(1);
      expect(events[0].diffSummary.blocksAdded).toBe(1);
      expect(events[0].diffSummary.blocksRemoved).toBe(0);
      expect(events[0].reason).toBe('userEdit');
    });

    it('should include affectedBlockIds', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockId = rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0].affectedBlockIds).toContain(blockId);
    });

    it('should set timeRootChanged=true for TimeRoot blocks', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('CycleTimeRoot', lane.id);

      expect(events[0].diffSummary.timeRootChanged).toBe(true);
    });

    it('should set timeRootChanged=false for non-TimeRoot blocks', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0].diffSummary.timeRootChanged).toBe(false);
    });
  });

  describe('removeBlock', () => {
    it('should emit GraphCommitted with blocksRemoved=1', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockId = rootStore.patchStore.addBlock('Oscillator', lane.id);
      events.length = 0; // Clear addBlock event

      rootStore.patchStore.removeBlock(blockId);

      expect(events).toHaveLength(1);
      expect(events[0].diffSummary.blocksAdded).toBe(0);
      expect(events[0].diffSummary.blocksRemoved).toBe(1);
    });

    it('should include affectedBlockIds', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockId = rootStore.patchStore.addBlock('Oscillator', lane.id);
      events.length = 0;

      rootStore.patchStore.removeBlock(blockId);

      expect(events[0].affectedBlockIds).toContain(blockId);
    });

    it('should set timeRootChanged=true when removing TimeRoot block', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockId = rootStore.patchStore.addBlock('CycleTimeRoot', lane.id);
      events.length = 0;

      rootStore.patchStore.removeBlock(blockId);

      expect(events[0].diffSummary.timeRootChanged).toBe(true);
    });
  });

  describe('connect/disconnect', () => {
    it('should emit GraphCommitted with bindingsChanged=1 on connect', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockA = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const blockB = rootStore.patchStore.addBlock('Oscillator', lane.id);
      events.length = 0;

      rootStore.patchStore.connect(blockA, 'out', blockB, 'phase');

      expect(events).toHaveLength(1);
      expect(events[0].diffSummary.bindingsChanged).toBe(1);
    });

    it('should emit GraphCommitted with bindingsChanged=1 on disconnect', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockA = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const blockB = rootStore.patchStore.addBlock('Oscillator', lane.id);
      rootStore.patchStore.connect(blockA, 'out', blockB, 'phase');
      events.length = 0;

      const conn = rootStore.patchStore.connections[0];
      rootStore.patchStore.disconnect(conn.id);

      expect(events).toHaveLength(1);
      expect(events[0].diffSummary.bindingsChanged).toBe(1);
    });

    it('should include affectedBlockIds on connect', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockA = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const blockB = rootStore.patchStore.addBlock('Oscillator', lane.id);
      events.length = 0;

      rootStore.patchStore.connect(blockA, 'out', blockB, 'phase');

      expect(events[0].affectedBlockIds).toContain(blockA);
      expect(events[0].affectedBlockIds).toContain(blockB);
    });
  });

  describe('patchRevision', () => {
    it('should increment monotonically on each mutation', () => {
      const lane = rootStore.patchStore.lanes[0];

      const id1 = rootStore.patchStore.addBlock('Oscillator', lane.id);
      expect(events[0].patchRevision).toBe(1);

      rootStore.patchStore.addBlock('Oscillator', lane.id);
      expect(events[1].patchRevision).toBe(2);

      rootStore.patchStore.removeBlock(id1);
      expect(events[2].patchRevision).toBe(3);
    });

    it('should match patchStore.patchRevision after emission', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0].patchRevision).toBe(rootStore.patchStore.patchRevision);
    });

    it('should increment on connect', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockA = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const blockB = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const revisionBeforeConnect = rootStore.patchStore.patchRevision;

      rootStore.patchStore.connect(blockA, 'out', blockB, 'phase');

      expect(rootStore.patchStore.patchRevision).toBe(revisionBeforeConnect + 1);
    });

    it('should increment on disconnect', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockA = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const blockB = rootStore.patchStore.addBlock('Oscillator', lane.id);
      rootStore.patchStore.connect(blockA, 'out', blockB, 'phase');
      const revisionBeforeDisconnect = rootStore.patchStore.patchRevision;

      const conn = rootStore.patchStore.connections[0];
      rootStore.patchStore.disconnect(conn.id);

      expect(rootStore.patchStore.patchRevision).toBe(revisionBeforeDisconnect + 1);
    });
  });

  describe('replaceBlock', () => {
    it('should emit exactly one GraphCommitted event', () => {
      const lane = rootStore.patchStore.lanes[0];
      // Use CycleTimeRoot which has defined inputs/outputs
      const blockId = rootStore.patchStore.addBlock('CycleTimeRoot', lane.id);
      events.length = 0;

      // Replace with FiniteTimeRoot (similar block type for successful replacement)
      const result = rootStore.patchStore.replaceBlock(blockId, 'FiniteTimeRoot');
      expect(result.success).toBe(true);

      // Should emit exactly ONE GraphCommitted (not multiple from internal operations)
      expect(events).toHaveLength(1);
    });

    it('should have blocksAdded=1 and blocksRemoved=1', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockId = rootStore.patchStore.addBlock('CycleTimeRoot', lane.id);
      events.length = 0;

      const result = rootStore.patchStore.replaceBlock(blockId, 'FiniteTimeRoot');
      expect(result.success).toBe(true);

      expect(events[0].diffSummary.blocksAdded).toBe(1);
      expect(events[0].diffSummary.blocksRemoved).toBe(1);
    });

    it('should include both old and new block IDs in affectedBlockIds', () => {
      const lane = rootStore.patchStore.lanes[0];
      const oldBlockId = rootStore.patchStore.addBlock('CycleTimeRoot', lane.id);
      events.length = 0;

      const result = rootStore.patchStore.replaceBlock(oldBlockId, 'FiniteTimeRoot');
      expect(result.success).toBe(true);

      expect(events[0].affectedBlockIds).toContain(oldBlockId);
      expect(events[0].affectedBlockIds).toContain(result.newBlockId);
    });
  });

  describe('expandMacro', () => {
    it('should emit GraphCommitted with macroExpand reason', () => {
      // Get a real macro expansion
      const expansion = getMacroExpansion('macro:breathingPulse');
      if (!expansion) {
        // Skip if macro not available
        return;
      }

      events.length = 0;
      rootStore.patchStore.expandMacro(expansion);

      // The event should be from macro expansion
      const macroEvent = events.find((e) => e.reason === 'macroExpand');
      expect(macroEvent).toBeDefined();
      expect(macroEvent!.diffSummary.blocksAdded).toBeGreaterThan(0);
    });

    it('should include created block IDs in affectedBlockIds', () => {
      const expansion = getMacroExpansion('macro:breathingPulse');
      if (!expansion) {
        return;
      }

      events.length = 0;
      rootStore.patchStore.expandMacro(expansion);

      const macroEvent = events.find((e) => e.reason === 'macroExpand');
      expect(macroEvent).toBeDefined();
      expect(macroEvent!.affectedBlockIds).toBeDefined();
      expect(macroEvent!.affectedBlockIds!.length).toBeGreaterThan(0);
    });
  });

  describe('patchId', () => {
    it('should be included in all GraphCommitted events', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0].patchId).toBe(rootStore.patchStore.patchId);
    });

    it('should remain consistent across multiple operations', () => {
      const lane = rootStore.patchStore.lanes[0];
      const patchId = rootStore.patchStore.patchId;

      rootStore.patchStore.addBlock('Oscillator', lane.id);
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0].patchId).toBe(patchId);
      expect(events[1].patchId).toBe(patchId);
    });
  });

  describe('diffSummary completeness', () => {
    it('should have all fields zeroed when adding a single block', () => {
      const lane = rootStore.patchStore.lanes[0];
      rootStore.patchStore.addBlock('Oscillator', lane.id);

      expect(events[0].diffSummary).toEqual({
        blocksAdded: 1,
        blocksRemoved: 0,
        busesAdded: 0,
        busesRemoved: 0,
        bindingsChanged: 0,
        timeRootChanged: false,
      });
    });

    it('should track bindingsChanged correctly for removeBlock with connections', () => {
      const lane = rootStore.patchStore.lanes[0];
      const blockA = rootStore.patchStore.addBlock('Oscillator', lane.id);
      const blockB = rootStore.patchStore.addBlock('Oscillator', lane.id);
      rootStore.patchStore.connect(blockA, 'out', blockB, 'phase');
      events.length = 0;

      // Removing blockA should cascade-remove the connection
      rootStore.patchStore.removeBlock(blockA);

      expect(events[0].diffSummary.bindingsChanged).toBeGreaterThan(0);
    });
  });
});
