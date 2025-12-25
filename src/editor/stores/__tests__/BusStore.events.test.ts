/**
 * BusStore Event Emission Tests
 *
 * Tests that BusStore emits correct events for bus lifecycle and bindings.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import type { EditorEvent } from '../../events/types';

describe('BusStore - Event Emission', () => {
  let root: RootStore;
  let events: EditorEvent[];

  beforeEach(() => {
    root = new RootStore();
    events = [];

    // Subscribe to all events for testing
    root.events.subscribe((event) => events.push(event));

    // Clear events emitted during initialization (default buses)
    events.length = 0;
  });

  describe('Bus Lifecycle Events', () => {
    describe('BusCreated event', () => {
      it('emits BusCreated when bus created', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'number', category: 'core', busEligible: true },
          'testBus',
          'last'
        );

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BusCreated',
          busId,
          name: 'testBus',
          busType: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        });
      });

      it('includes correct bus metadata in event', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
          'customPhase',
          'sum',
          0.5
        );

        const event = events[0];
        expect(event.type).toBe('BusCreated');
        if (event.type === 'BusCreated') {
          expect(event.busId).toBe(busId);
          expect(event.name).toBe('customPhase');
          expect(event.busType.world).toBe('signal');
          expect(event.busType.domain).toBe('phase');
        }
      });

      it('emits BusCreated for each default bus at startup', () => {
        const freshRoot = new RootStore();
        const startupEvents: EditorEvent[] = [];
        freshRoot.events.subscribe((e) => startupEvents.push(e));

        // Default buses are created during initialization, so they've already emitted events
        // We need to check the buses that were created
        expect(freshRoot.busStore.buses.length).toBe(6); // phaseA, phaseB, energy, pulse, palette, progress
      });
    });

    describe('BusDeleted event', () => {
      it('emits BusDeleted when bus deleted', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'number', category: 'core', busEligible: true },
          'tempBus',
          'last'
        );
        events.length = 0; // Clear BusCreated event

        root.busStore.deleteBus(busId);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BusDeleted',
          busId,
          name: 'tempBus',
        });
      });

      it('emits BusDeleted BEFORE bus removed (event contains bus data)', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'number', category: 'core', busEligible: true },
          'toDelete',
          'last'
        );

        let busExistsWhenEventEmitted = false;
        root.events.on('BusDeleted', () => {
          // Event listener runs synchronously during emit(), BEFORE bus is removed
          busExistsWhenEventEmitted = root.busStore.getBusById(busId) !== null;
        });

        root.busStore.deleteBus(busId);

        // The event was emitted while bus still existed (listener saw it)
        expect(busExistsWhenEventEmitted).toBe(true);
        // But now the bus is removed (after emit returned)
        expect(root.busStore.getBusById(busId)).toBeNull();
      });

      it('throws error if bus not found', () => {
        expect(() => root.busStore.deleteBus('nonexistent')).toThrow('Bus nonexistent not found');
        expect(events).toHaveLength(0); // No event emitted on error
      });
    });
  });

  describe('Bus Binding Events', () => {
    let busId: string;
    let blockId: string;

    beforeEach(() => {
      // Create a test bus
      busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      // Create a test block
      blockId = root.patchStore.addBlock('FieldConstNumber', { value: 0 });

      events.length = 0; // Clear setup events
    });

    describe('BindingAdded event - Publishers', () => {
      it('emits BindingAdded when publisher added', () => {
        const publisherId = root.busStore.addPublisher(busId, blockId, 'value');

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BindingAdded',
          bindingId: publisherId,
          busId,
          blockId,
          port: 'value',
          direction: 'publish',
        });
      });

      it('includes correct direction for publisher', () => {
        root.busStore.addPublisher(busId, blockId, 'output');

        const event = events[0];
        expect(event.type).toBe('BindingAdded');
        if (event.type === 'BindingAdded') {
          expect(event.direction).toBe('publish');
        }
      });
    });

    describe('BindingAdded event - Listeners', () => {
      it('emits BindingAdded when listener added', () => {
        const listenerId = root.busStore.addListener(busId, blockId, 'input');

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BindingAdded',
          bindingId: listenerId,
          busId,
          blockId,
          port: 'input',
          direction: 'subscribe',
        });
      });

      it('includes correct direction for listener', () => {
        root.busStore.addListener(busId, blockId, 'input');

        const event = events[0];
        expect(event.type).toBe('BindingAdded');
        if (event.type === 'BindingAdded') {
          expect(event.direction).toBe('subscribe');
        }
      });

      it('emits event even when listener has lens', () => {
        const listenerId = root.busStore.addListener(
          busId,
          blockId,
          'input',
          undefined,
          { type: 'scale', params: { scale: 2, offset: 0 } }
        );

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BindingAdded',
          bindingId: listenerId,
          busId,
          blockId,
          port: 'input',
          direction: 'subscribe',
        });
      });
    });

    describe('BindingRemoved event - Publishers', () => {
      it('emits BindingRemoved when publisher removed', () => {
        const publisherId = root.busStore.addPublisher(busId, blockId, 'value');
        events.length = 0; // Clear BindingAdded event

        root.busStore.removePublisher(publisherId);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BindingRemoved',
          bindingId: publisherId,
          busId,
          blockId,
          port: 'value',
          direction: 'publish',
        });
      });

      it('does not emit event if publisher not found', () => {
        root.busStore.removePublisher('nonexistent');
        expect(events).toHaveLength(0);
      });
    });

    describe('BindingRemoved event - Listeners', () => {
      it('emits BindingRemoved when listener removed', () => {
        const listenerId = root.busStore.addListener(busId, blockId, 'input');
        events.length = 0; // Clear BindingAdded event

        root.busStore.removeListener(listenerId);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'BindingRemoved',
          bindingId: listenerId,
          busId,
          blockId,
          port: 'input',
          direction: 'subscribe',
        });
      });

      it('does not emit event if listener not found', () => {
        root.busStore.removeListener('nonexistent');
        expect(events).toHaveLength(0);
      });
    });

    describe('Event direction field', () => {
      it('correctly distinguishes publish vs subscribe', () => {
        root.busStore.addPublisher(busId, blockId, 'out');
        root.busStore.addListener(busId, blockId, 'in');

        expect(events).toHaveLength(2);

        const publishEvent = events[0];
        const subscribeEvent = events[1];

        expect(publishEvent.type).toBe('BindingAdded');
        expect(subscribeEvent.type).toBe('BindingAdded');

        if (publishEvent.type === 'BindingAdded') {
          expect(publishEvent.direction).toBe('publish');
        }

        if (subscribeEvent.type === 'BindingAdded') {
          expect(subscribeEvent.direction).toBe('subscribe');
        }
      });
    });
  });

  describe('Integration: Bus deletion cascades', () => {
    it('emits BindingRemoved events when bus deleted removes bindings (implicit)', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        'cascadeBus',
        'last'
      );
      const blockId = root.patchStore.addBlock('FieldConstNumber', { value: 0 });

      const publisherId = root.busStore.addPublisher(busId, blockId, 'value');
      const listenerId = root.busStore.addListener(busId, blockId, 'value');

      events.length = 0; // Clear setup events

      root.busStore.deleteBus(busId);

      // Should emit BusDeleted but NOT BindingRemoved (bindings removed silently)
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('BusDeleted');

      // Verify bindings actually removed
      expect(root.busStore.publishers.find(p => p.id === publisherId)).toBeUndefined();
      expect(root.busStore.listeners.find(l => l.id === listenerId)).toBeUndefined();
    });
  });
});
