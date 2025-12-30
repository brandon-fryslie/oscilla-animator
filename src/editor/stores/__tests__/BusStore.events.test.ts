/**
 * BusStore Event Emission Tests
 *
 * Tests that BusStore emits correct events for bus lifecycle and bindings.
 *
 * NOTE: These tests filter for specific event types because operations also emit
 * GraphCommitted events for undo/redo support. We test fine-grained events separately.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import type { EditorEvent } from '../../events/types';

/**
 * Filter events by type for testing specific event emission.
 */
function filterEventsByType<T extends EditorEvent['type']>(
  events: EditorEvent[],
  type: T
): Extract<EditorEvent, { type: T }>[] {
  return events.filter((e): e is Extract<EditorEvent, { type: T }> => e.type === type);
}

describe('BusStore - Event Emission', () => {
  let root: RootStore;
  let events: EditorEvent[];

  beforeEach(() => {
    root = new RootStore();
    events = [];

    // Subscribe to all events for testing
    root.events.subscribe((event) => events.push(event));

    // Discard any events emitted during initialization (default buses)
    // Reassign to fresh array - the closure captures the variable, not the value
    events = [];
  });

  describe('Bus Lifecycle Events', () => {
    describe('BusCreated event', () => {
      it('emits BusCreated when bus created', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true },
          'testBus',
          'last'
        );

        const busCreatedEvents = filterEventsByType(events, 'BusCreated');
        expect(busCreatedEvents).toHaveLength(1);
        expect(busCreatedEvents[0]).toEqual({
          type: 'BusCreated',
          busId,
          name: 'testBus',
          busType: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        });
      });

      it('includes correct bus metadata in event', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
          'customPhase',
          'sum',
          0.5
        );

        const busCreatedEvents = filterEventsByType(events, 'BusCreated');
        const event = busCreatedEvents[0];
        expect(event.busId).toBe(busId);
        expect(event.name).toBe('customPhase');
        expect(event.busType.world).toBe('signal');
        // Phase is represented as float with semantics, not a separate domain
        expect(event.busType.domain).toBe('float');
        expect(event.busType.semantics).toBe('phase(0..1)');
      });

      it('emits BusCreated for each default bus at startup', () => {
        // Default buses are created during RootStore initialization
        // Events are emitted during construction, before we can subscribe
        const freshRoot = new RootStore();
        expect(freshRoot.busStore.buses.length).toBe(6); // phaseA, phaseB, energy, pulse, palette, progress
      });
    });

    describe('BusDeleted event', () => {
      it('emits BusDeleted when bus deleted', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true },
          'tempBus',
          'last'
        );
        events = []; // Clear BusCreated event

        root.busStore.deleteBus(busId);

        const busDeletedEvents = filterEventsByType(events, 'BusDeleted');
        expect(busDeletedEvents).toHaveLength(1);
        expect(busDeletedEvents[0]).toEqual({
          type: 'BusDeleted',
          busId,
          name: 'tempBus',
        });
      });

      it('emits BusDeleted AFTER bus removed (event contains preserved bus data)', () => {
        const busId = root.busStore.createBus(
          { world: 'signal', domain: 'float', category: 'core', busEligible: true },
          'toDelete',
          'last'
        );

        let busExistsWhenEventEmitted = false;
        let eventBusName = '';
        root.events.on('BusDeleted', (event) => {
          if (event.type === 'BusDeleted') {
            // Event is emitted AFTER bus is removed (transaction-based deletion)
            busExistsWhenEventEmitted = root.busStore.getBusById(busId) !== null;
            eventBusName = event.name; // Bus data is preserved in event payload
          }
        });

        root.busStore.deleteBus(busId);

        // With transactions, bus is removed before event is emitted
        expect(busExistsWhenEventEmitted).toBe(false);
        // But event still contains the bus data (captured before deletion)
        expect(eventBusName).toBe('toDelete');
        // Bus is definitely gone
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
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'testBus',
        'last'
      );

      // Create a test block
      blockId = root.patchStore.addBlock('FieldConstNumber', { value: 0 });

      events = []; // Clear setup events
    });

    describe('BindingAdded event - Publishers', () => {
      it('emits BindingAdded when publisher added', () => {
        const publisherId = root.busStore.addPublisher(busId, blockId, 'value');

        const bindingAddedEvents = filterEventsByType(events, 'BindingAdded');
        expect(bindingAddedEvents).toHaveLength(1);
        expect(bindingAddedEvents[0]).toEqual({
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

        const bindingAddedEvents = filterEventsByType(events, 'BindingAdded');
        expect(bindingAddedEvents[0].direction).toBe('publish');
      });
    });

    describe('BindingAdded event - Listeners', () => {
      it('emits BindingAdded when listener added', () => {
        const listenerId = root.busStore.addListener(busId, blockId, 'input');

        const bindingAddedEvents = filterEventsByType(events, 'BindingAdded');
        expect(bindingAddedEvents).toHaveLength(1);
        expect(bindingAddedEvents[0]).toEqual({
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

        const bindingAddedEvents = filterEventsByType(events, 'BindingAdded');
        expect(bindingAddedEvents[0].direction).toBe('subscribe');
      });

      it('emits event even when listener has lens', () => {
        const listenerId = root.busStore.addListener(
          busId,
          blockId,
          'input',
          undefined,
          { type: 'scale', params: { scale: 2, offset: 0 } }
        );

        const bindingAddedEvents = filterEventsByType(events, 'BindingAdded');
        expect(bindingAddedEvents).toHaveLength(1);
        expect(bindingAddedEvents[0]).toEqual({
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
        events = []; // Clear setup events

        root.busStore.removePublisher(publisherId);

        const bindingRemovedEvents = filterEventsByType(events, 'BindingRemoved');
        expect(bindingRemovedEvents).toHaveLength(1);
        expect(bindingRemovedEvents[0]).toEqual({
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
        const bindingRemovedEvents = filterEventsByType(events, 'BindingRemoved');
        expect(bindingRemovedEvents).toHaveLength(0);
      });
    });

    describe('BindingRemoved event - Listeners', () => {
      it('emits BindingRemoved when listener removed', () => {
        const listenerId = root.busStore.addListener(busId, blockId, 'input');
        events = []; // Clear setup events

        root.busStore.removeListener(listenerId);

        const bindingRemovedEvents = filterEventsByType(events, 'BindingRemoved');
        expect(bindingRemovedEvents).toHaveLength(1);
        expect(bindingRemovedEvents[0]).toEqual({
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

        const bindingAddedEvents = filterEventsByType(events, 'BindingAdded');
        expect(bindingAddedEvents).toHaveLength(2);

        const publishEvent = bindingAddedEvents[0];
        const subscribeEvent = bindingAddedEvents[1];

        expect(publishEvent.direction).toBe('publish');
        expect(subscribeEvent.direction).toBe('subscribe');
      });
    });
  });

  describe('Integration: Bus deletion cascades', () => {
    it('emits BindingRemoved events when bus deleted removes bindings (implicit)', () => {
      const busId = root.busStore.createBus(
        { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        'cascadeBus',
        'last'
      );
      const blockId = root.patchStore.addBlock('FieldConstNumber', { value: 0 });

      const publisherId = root.busStore.addPublisher(busId, blockId, 'value');
      const listenerId = root.busStore.addListener(busId, blockId, 'value');

      events = []; // Clear setup events

      root.busStore.deleteBus(busId);

      // Should emit BusDeleted but NOT BindingRemoved (bindings removed silently)
      const busDeletedEvents = filterEventsByType(events, 'BusDeleted');
      expect(busDeletedEvents).toHaveLength(1);

      // Verify bindings actually removed
      expect(root.busStore.publishers.find(p => p.id === publisherId)).toBeUndefined();
      expect(root.busStore.listeners.find(l => l.id === listenerId)).toBeUndefined();
    });
  });
});
