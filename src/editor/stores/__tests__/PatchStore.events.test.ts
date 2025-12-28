/**
 * PatchStore Event Tests
 *
 * Tests that PatchStore emits WireAdded and WireRemoved events correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RootStore } from '../RootStore';
import type { WireAddedEvent, WireRemovedEvent, BlockReplacedEvent } from '../../events/types';
import type { BlockDefinition } from '../../blocks';

describe('PatchStore - Wire Events', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  describe('WireAdded event', () => {
    it('emits WireAdded when connection created via connect()', () => {
      const listener = vi.fn();
      root.events.on('WireAdded', listener);

      // Create two blocks
      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      // Connect blocks
      root.patchStore.connect(block1, 'value', block2, 'value');

      // Event should be emitted
      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as WireAddedEvent;
      expect(event.type).toBe('WireAdded');
      expect(event.from.blockId).toBe(block1);
      expect(event.from.slotId).toBe('value');
      expect(event.to.blockId).toBe(block2);
      expect(event.to.slotId).toBe('value');
      expect(event.wireId).toBeDefined();
    });

    it('does NOT emit WireAdded when duplicate connection attempted', () => {
      const listener = vi.fn();
      root.events.on('WireAdded', listener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      // Connect blocks first time
      root.patchStore.connect(block1, 'value', block2, 'value');
      expect(listener).toHaveBeenCalledTimes(1);

      // Try to connect same blocks again
      root.patchStore.connect(block1, 'value', block2, 'value');

      // Event should NOT be emitted second time
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits WireAdded for each connection in macro expansion', () => {
      const listener = vi.fn();
      root.events.on('WireAdded', listener);

      // Load a macro that creates multiple connections
      // The 'PulsingGrid' macro creates 4-5 connections typically
      root.patchStore.addBlock('macro:pulsingGrid');

      // Should emit multiple WireAdded events (at least 3 connections in pulsing grid)
      expect(listener).toHaveBeenCalled();
      const callCount = listener.mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(3);

      // All events should be WireAdded
      listener.mock.calls.forEach((call) => {
        const event = call[0] as WireAddedEvent;
        expect(event.type).toBe('WireAdded');
      });
    });

    it('includes valid connection data in event payload', () => {
      const listener = vi.fn();
      root.events.on('WireAdded', listener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      root.patchStore.connect(block1, 'value', block2, 'value');

      const event = listener.mock.calls[0][0] as WireAddedEvent;

      // Verify connection exists in store
      const connection = root.patchStore.connections.find(c => c.id === event.wireId);
      expect(connection).toBeDefined();
      expect(connection?.from.blockId).toBe(event.from.blockId);
      expect(connection?.from.slotId).toBe(event.from.slotId);
      expect(connection?.to.blockId).toBe(event.to.blockId);
      expect(connection?.to.slotId).toBe(event.to.slotId);
    });
  });

  describe('WireRemoved event', () => {
    it('emits WireRemoved when connection removed via disconnect()', () => {
      const addListener = vi.fn();
      const removeListener = vi.fn();
      root.events.on('WireAdded', addListener);
      root.events.on('WireRemoved', removeListener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      // Connect blocks
      root.patchStore.connect(block1, 'value', block2, 'value');
      const wireId = (addListener.mock.calls[0][0] as WireAddedEvent).wireId;

      // Disconnect
      root.patchStore.disconnect(wireId);

      // WireRemoved event should be emitted
      expect(removeListener).toHaveBeenCalledTimes(1);
      const event = removeListener.mock.calls[0][0] as WireRemovedEvent;
      expect(event.type).toBe('WireRemoved');
      expect(event.wireId).toBe(wireId);
      expect(event.from.blockId).toBe(block1);
      expect(event.from.slotId).toBe('value');
      expect(event.to.blockId).toBe(block2);
      expect(event.to.slotId).toBe('value');
    });

    it('does NOT emit WireRemoved when disconnecting non-existent connection', () => {
      const listener = vi.fn();
      root.events.on('WireRemoved', listener);

      // Try to disconnect non-existent connection
      root.patchStore.disconnect('conn-99999');

      // Event should NOT be emitted
      expect(listener).not.toHaveBeenCalled();
    });

    it('emits WireRemoved via removeConnection() (consolidated)', () => {
      const removeListener = vi.fn();
      root.events.on('WireRemoved', removeListener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      root.patchStore.connect(block1, 'value', block2, 'value');
      const wireId = root.patchStore.connections[0]?.id ?? '';

      // Use removeConnection() which should delegate to disconnect()
      root.patchStore.removeConnection(wireId);

      // Event should be emitted
      expect(removeListener).toHaveBeenCalledTimes(1);
    });

    it('includes connection data in WireRemoved event payload', () => {
      const listener = vi.fn();
      root.events.on('WireRemoved', listener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      root.patchStore.connect(block1, 'value', block2, 'value');
      const wireId = root.patchStore.connections[0]?.id ?? '';

      root.patchStore.disconnect(wireId);

      const event = listener.mock.calls[0][0] as WireRemovedEvent;

      // Verify event has all connection data
      expect(event.wireId).toBe(wireId);
      expect(event.from.blockId).toBe(block1);
      expect(event.from.slotId).toBe('value');
      expect(event.to.blockId).toBe(block2);
      expect(event.to.slotId).toBe('value');

      // Connection should no longer exist in store
      const connection = root.patchStore.connections.find(c => c.id === wireId);
      expect(connection).toBeUndefined();
    });
  });

  describe('WireRemoved - cascade deletion on block removal', () => {
    // NOTE: When a block is removed, all its connections are also removed and
    // WireRemoved events are emitted for each. BlockRemoved is also emitted.

    it('emits WireRemoved for each connection when block removed', () => {
      const wireRemovedListener = vi.fn();
      const blockRemovedListener = vi.fn();
      root.events.on('WireRemoved', wireRemovedListener);
      root.events.on('BlockRemoved', blockRemovedListener);

      // Use Oscillator blocks (output: 'out') and AddSignal (inputs: 'a', 'b')
      // to allow multiple connections without input conflicts
      const block1 = root.patchStore.addBlock('Oscillator');
      const block2 = root.patchStore.addBlock('Oscillator');
      const block3 = root.patchStore.addBlock('AddSignal');

      // Create 3 connections: 2 involving block2, 1 not
      root.patchStore.connect(block1, 'out', block2, 'freq');  // block2 involved
      root.patchStore.connect(block2, 'out', block3, 'a');     // block2 involved
      root.patchStore.connect(block1, 'out', block3, 'b');     // block2 NOT involved

      expect(root.patchStore.connections.length).toBe(3);

      // Remove block2
      root.patchStore.removeBlock(block2);

      // Cascade deletion emits WireRemoved for each removed connection
      // 2 connections involve block2: (block1->block2) and (block2->block3)
      expect(wireRemovedListener).toHaveBeenCalledTimes(2);
      expect(blockRemovedListener).toHaveBeenCalledTimes(1);

      // But connections ARE actually removed
      // Only 1 connection should remain (block1 -> block3)
      expect(root.patchStore.connections.length).toBe(1);
    });

    it('emits correct number of WireRemoved events for complex block', () => {
      // Use blocks with multiple inputs to avoid triggering disconnectInputPort
      const block1 = root.patchStore.addBlock('Oscillator');  // out output
      const block2 = root.patchStore.addBlock('AddSignal');   // a, b inputs
      const block3 = root.patchStore.addBlock('AddSignal');   // a, b inputs

      // Create connections - all involving block2
      root.patchStore.connect(block1, 'out', block2, 'a');    // block2 involved (1)
      root.patchStore.connect(block1, 'out', block2, 'b');    // block2 involved (2)
      root.patchStore.connect(block2, 'value', block3, 'a');  // block2 involved (3)

      expect(root.patchStore.connections.length).toBe(3);

      // Subscribe AFTER setup to only capture cascade events
      const wireRemovedListener = vi.fn();
      root.events.on('WireRemoved', wireRemovedListener);

      // Remove block2 (has 3 connections)
      root.patchStore.removeBlock(block2);

      // Cascade deletion emits WireRemoved for each removed connection
      expect(wireRemovedListener).toHaveBeenCalledTimes(3);

      // But connections ARE removed (all involved block2)
      expect(root.patchStore.connections.length).toBe(0);
    });

    it('does not emit WireRemoved when removing block with no connections', () => {
      const listener = vi.fn();
      root.events.on('WireRemoved', listener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');

      // Remove block with no connections
      root.patchStore.removeBlock(block1);

      // Should NOT emit any WireRemoved events
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Event order and consistency', () => {
    it('emits events in correct order: WireAdded after creation', () => {
      let connectionExistsAtEventTime = false;
      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      root.events.on('WireAdded', (event) => {
        // Connection should already exist in store when event fires
        const exists = root.patchStore.connections.some(c => c.id === event.wireId);
        connectionExistsAtEventTime = exists;
      });

      root.patchStore.connect(block1, 'value', block2, 'value');

      expect(connectionExistsAtEventTime).toBe(true);
    });

    it('emits events in correct order: WireRemoved after deletion', () => {
      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('FieldConstNumber');

      root.patchStore.connect(block1, 'value', block2, 'value');
      const wireId = root.patchStore.connections[0]?.id ?? '';

      let connectionExistsAtEventTime = true;

      root.events.on('WireRemoved', (event) => {
        // Connection should NOT exist in store when event fires
        const exists = root.patchStore.connections.some(c => c.id === event.wireId);
        connectionExistsAtEventTime = exists;
      });

      root.patchStore.disconnect(wireId);

      expect(connectionExistsAtEventTime).toBe(false);
    });
  });
});

describe('PatchStore - BlockReplaced Events', () => {
  let root: RootStore;

  beforeEach(() => {
    root = new RootStore();
  });

  describe('BlockReplaced event', () => {
    it('emits BlockReplaced when block successfully replaced', () => {
      const listener = vi.fn();
      root.events.on('BlockReplaced', listener);

      const oldBlockId = root.patchStore.addBlock('Oscillator');
      const oldBlock = root.patchStore.blocks.find(b => b.id === oldBlockId);
      const oldType = oldBlock?.type ?? '';

      // Replace block with another signal block
      const result = root.patchStore.replaceBlock(oldBlockId, 'Shaper');

      // Event should be emitted
      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as BlockReplacedEvent;
      expect(event.type).toBe('BlockReplaced');
      expect(event.oldBlockId).toBe(oldBlockId);
      expect(event.oldBlockType).toBe(oldType);
      expect(event.newBlockId).toBe(result.newBlockId);
      expect(event.newBlockType).toBe('Shaper');
      expect(event.preservedConnections).toBeDefined();
      expect(event.droppedConnections).toBeDefined();
    });

    it('does NOT emit BlockReplaced when replacement fails (block not found)', () => {
      const listener = vi.fn();
      root.events.on('BlockReplaced', listener);

      // Try to replace non-existent block
      root.patchStore.replaceBlock('block-99999', 'Shaper');

      // Event should NOT be emitted
      expect(listener).not.toHaveBeenCalled();
    });

    it('does NOT emit BlockReplaced when replacement fails (invalid new type)', () => {
      const listener = vi.fn();
      root.events.on('BlockReplaced', listener);

      const oldBlockId = root.patchStore.addBlock('FieldConstNumber');

      // Try to replace with invalid block type
      // Using a block type that doesn't exist in the registry
      root.patchStore.replaceBlock(oldBlockId, 'NonExistentBlockType' as BlockDefinition['type']);

      // Event should NOT be emitted
      expect(listener).not.toHaveBeenCalled();
    });

    it('includes correct connection metrics in event payload', () => {
      const listener = vi.fn();
      root.events.on('BlockReplaced', listener);

      const block1 = root.patchStore.addBlock('FieldConstNumber');
      const block2 = root.patchStore.addBlock('AddSignal');
      const block3 = root.patchStore.addBlock('FieldConstNumber');

      // Connect blocks: block1 -> block2 -> block3
      root.patchStore.connect(block1, 'value', block2, 'a');
      root.patchStore.connect(block2, 'value', block3, 'value');

      // Replace block2 with MulSignal (compatible slots)
      const result = root.patchStore.replaceBlock(block2, 'MulSignal');

      const event = listener.mock.calls[0][0] as BlockReplacedEvent;

      // Verify event matches replacement result
      expect(event.preservedConnections).toBe(result.preservedConnections);
      expect(event.droppedConnections.length).toBe(result.droppedConnections.length);
    });

    it('emits event before removing old block (allows listeners to see selection)', () => {
      let newBlockExistsAtEventTime = false;
      let oldBlockExistsAtEventTime = false;

      const oldBlockId = root.patchStore.addBlock('Oscillator');

      root.events.on('BlockReplaced', (event) => {
        // New block should exist
        newBlockExistsAtEventTime = root.patchStore.blocks.some(b => b.id === event.newBlockId);
        // Old block should STILL exist (event fires before removal)
        oldBlockExistsAtEventTime = root.patchStore.blocks.some(b => b.id === event.oldBlockId);
      });

      root.patchStore.replaceBlock(oldBlockId, 'Shaper');

      expect(newBlockExistsAtEventTime).toBe(true);
      expect(oldBlockExistsAtEventTime).toBe(true); // Still exists at event time

      // But after the full replacement, old block should be gone
      const oldBlockStillExists = root.patchStore.blocks.some(b => b.id === oldBlockId);
      expect(oldBlockStillExists).toBe(false);
    });

    it('event payload includes dropped connections with reasons', () => {
      const listener = vi.fn();
      root.events.on('BlockReplaced', listener);

      // CycleTimeRoot outputs Signal<phase> on 'phase'
      const block1 = root.patchStore.addBlock('CycleTimeRoot');
      // Oscillator accepts Signal<phase> on 'phase' input
      const block2 = root.patchStore.addBlock('Oscillator');

      // Connect CycleTimeRoot.phase -> Oscillator.phase (valid Signal<phase> connection)
      root.patchStore.connect(block1, 'phase', block2, 'phase');

      // Replace Oscillator with AddSignal which only accepts Signal<number> inputs
      // Signal<phase> (domain: 'phase') is NOT compatible with Signal<number> (domain: 'number')
      root.patchStore.replaceBlock(block2, 'AddSignal');

      const event = listener.mock.calls[0][0] as BlockReplacedEvent;

      // Should have dropped connections (Signal<phase> can't connect to Signal<number>)
      expect(event.droppedConnections.length).toBeGreaterThan(0);

      // Each dropped connection should have a connectionId and reason
      event.droppedConnections.forEach(dropped => {
        expect(dropped.connectionId).toBeDefined();
        expect(typeof dropped.connectionId).toBe('string');
        expect(dropped.reason).toBeDefined();
        expect(typeof dropped.reason).toBe('string');
      });
    });
  });
});
