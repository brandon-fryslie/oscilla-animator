/**
 * @file Bus Diagnostics Tests
 * @description Tests for bus-related warning diagnostics (P1.1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { createCompilerService } from '../integration';
import type { EditorEvent } from '../../events/types';
import type { Diagnostic } from '../../diagnostics/types';

describe('Bus Diagnostics', () => {
  let store: RootStore;
  let events: EditorEvent[];

  beforeEach(() => {
    store = new RootStore();
    events = [];

    store.events.on('CompileFinished', (event) => {
      events.push(event);
    });
  });

  describe('W_BUS_EMPTY', () => {
    // TODO: Bus diagnostic emission not yet implemented in compiler
    it.skip('should emit W_BUS_EMPTY for buses with publishers but no listeners', () => {
      const service = createCompilerService(store);

      // Add a complete, valid patch
      store.patchStore.addBlock('InfiniteTimeRoot');
      const domainBlock = store.patchStore.addBlock('GridDomain', { rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D', {});

      // Connect the blocks
      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');
      store.patchStore.connect(domainBlock, 'pos0', renderBlock, 'positions');

      // Create a custom bus with a publisher but no listeners
      store.busStore.buses.push({
        id: 'custom-bus',
        name: 'customBus',
        type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        combineMode: 'last',
        defaultValue: 0,
        sortKey: 0,
      });

      store.busStore.publishers.push({
        id: 'pub-1',
        busId: 'custom-bus',
        from: { blockId: domainBlock, slotId: 'domain', direction: 'output' },
        enabled: true,
        sortKey: 0,
      });

      service.compile();

      const finishedEvents = events.filter((e): e is Extract<EditorEvent, { type: 'CompileFinished' }> => e.type === 'CompileFinished');
      expect(finishedEvents).toHaveLength(1);

      const diagnostics = finishedEvents[0].diagnostics;
      const busEmptyWarnings = diagnostics.filter((d): d is Diagnostic => d.code === 'W_BUS_EMPTY');

      expect(busEmptyWarnings).toHaveLength(1);
      expect(busEmptyWarnings[0].severity).toBe('warn');
      expect(busEmptyWarnings[0].domain).toBe('compile');
      expect(busEmptyWarnings[0].primaryTarget).toEqual({ kind: 'bus', busId: 'custom-bus' });
    });

    it('should NOT emit W_BUS_EMPTY for buses with both publishers and listeners', () => {
      const service = createCompilerService(store);

      // Add a complete, valid patch
      store.patchStore.addBlock('InfiniteTimeRoot', { periodMs: 3000 });
      const domainBlock = store.patchStore.addBlock('GridDomain', { rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D', {});

      // Connect the blocks
      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');
      store.patchStore.connect(domainBlock, 'pos0', renderBlock, 'positions');

      // Create a custom bus with both publisher and listener
      store.busStore.buses.push({
        id: 'custom-bus',
        name: 'customBus',
        type: { world: 'signal', domain: 'float', category: 'core', busEligible: true },
        combineMode: 'last',
        defaultValue: 0,
        sortKey: 0,
      });

      store.busStore.publishers.push({
        id: 'pub-1',
        busId: 'custom-bus',
        from: { blockId: domainBlock, slotId: 'domain', direction: 'output' },
        enabled: true,
        sortKey: 0,
      });

      store.busStore.listeners.push({
        id: 'lis-1',
        busId: 'custom-bus',
        to: { blockId: renderBlock, slotId: 'radius', direction: 'input' },
        enabled: true,
      });

      service.compile();

      const finishedEvents = events.filter((e): e is Extract<EditorEvent, { type: 'CompileFinished' }> => e.type === 'CompileFinished');
      expect(finishedEvents).toHaveLength(1);

      const diagnostics = finishedEvents[0].diagnostics;
      const busEmptyWarnings = diagnostics.filter((d): d is Diagnostic => d.code === 'W_BUS_EMPTY');

      expect(busEmptyWarnings).toHaveLength(0);
    });
  });

  describe('W_GRAPH_UNUSED_OUTPUT', () => {
    // TODO: W_GRAPH_UNUSED_OUTPUT diagnostic emission not yet implemented in compiler
    it.skip('should emit W_GRAPH_UNUSED_OUTPUT for outputs not connected or published', () => {
      const service = createCompilerService(store);

      // Add a TimeRoot
      store.patchStore.addBlock('InfiniteTimeRoot',{ periodMs: 3000 });

      // Add two GridDomains, only connect one fully
      const domainBlock1 = store.patchStore.addBlock('GridDomain',{ rows: 5, cols: 5 });
      const domainBlock2 = store.patchStore.addBlock('GridDomain',{ rows: 3, cols: 3 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D',{});

      // Connect GridDomain1 fully to Render
      store.patchStore.connect(domainBlock1, 'domain', renderBlock, 'domain');
      store.patchStore.connect(domainBlock1, 'pos0', renderBlock, 'positions');

      // DON'T connect GridDomain2's outputs - they're unused!

      service.compile();

      const finishedEvents = events.filter((e): e is Extract<EditorEvent, { type: 'CompileFinished' }> => e.type === 'CompileFinished');
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      // Should succeed (complete patch)
      expect(event.status).toBe('ok');

      const diagnostics = event.diagnostics;
      const unusedOutputWarnings = diagnostics.filter((d) => d.code === 'W_GRAPH_UNUSED_OUTPUT');

      // Should have warnings for GridDomain2's unused outputs (domain, pos0)
      expect(unusedOutputWarnings.length).toBeGreaterThanOrEqual(1);
      expect(unusedOutputWarnings.some((w) =>
        w.primaryTarget.kind === 'port' && w.primaryTarget.portRef.blockId === domainBlock2
      )).toBe(true);
    });

    it('should NOT emit W_GRAPH_UNUSED_OUTPUT for TimeRoot outputs', () => {
      const service = createCompilerService(store);

      // Add just a InfiniteTimeRoot - its outputs (phase, wrap) are auto-published
      store.patchStore.addBlock('InfiniteTimeRoot',{ periodMs: 3000 });
      const domainBlock = store.patchStore.addBlock('GridDomain',{ rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D',{});

      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');
      store.patchStore.connect(domainBlock, 'pos0', renderBlock, 'positions');

      service.compile();

      const finishedEvents = events.filter((e): e is Extract<EditorEvent, { type: 'CompileFinished' }> => e.type === 'CompileFinished');
      expect(finishedEvents).toHaveLength(1);

      const diagnostics = finishedEvents[0].diagnostics;
      const unusedOutputWarnings = diagnostics.filter((d): d is Diagnostic => d.code === 'W_GRAPH_UNUSED_OUTPUT');

      // Should not have any warnings about TimeRoot outputs (phase, wrap)
      const timeRootWarnings = unusedOutputWarnings.filter(
        (w) => w.primaryTarget.kind === 'port' && w.primaryTarget.portRef?.slotId !== undefined && ['phase', 'wrap'].includes(w.primaryTarget.portRef.slotId)
      );
      expect(timeRootWarnings).toHaveLength(0);
    });

    it('should NOT emit W_GRAPH_UNUSED_OUTPUT for outputs that are published to buses', () => {
      const service = createCompilerService(store);

      // Add a complete patch
      store.patchStore.addBlock('InfiniteTimeRoot',{ periodMs: 3000 });
      const domainBlock = store.patchStore.addBlock('GridDomain',{ rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D',{});

      // Connect domain but publish pos0 to a bus instead of connecting
      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');

      // Publish pos0 to a bus
      store.busStore.publishers.push({
        id: 'pub-pos0',
        busId: 'phaseA', // Use existing bus
        from: { blockId: domainBlock, slotId: 'pos0', direction: 'output' },
        enabled: true,
        sortKey: 0,
      });

      service.compile();

      const finishedEvents = events.filter((e): e is Extract<EditorEvent, { type: 'CompileFinished' }> => e.type === 'CompileFinished');
      expect(finishedEvents).toHaveLength(1);

      const diagnostics = finishedEvents[0].diagnostics;
      const unusedOutputWarnings = diagnostics.filter((d): d is Diagnostic => d.code === 'W_GRAPH_UNUSED_OUTPUT');

      // Should not have warning for pos0 since it's published
      const pos0Warnings = unusedOutputWarnings.filter(
        (w) => w.primaryTarget.kind === 'port' && w.primaryTarget.portRef?.slotId === 'pos0'
      );
      expect(pos0Warnings).toHaveLength(0);
    });
  });
});
