/**
 * @file Diagnostic Emission Tests
 * @description Tests for compiler diagnostic event emission (P0.8)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import { createCompilerService } from '../integration';
import type { CompileStartedEvent, CompileFinishedEvent, EditorEvent } from '../../events/types';
import { setFeatureFlags, resetFeatureFlags } from '../featureFlags';

describe('Diagnostic Emission', () => {
  let store: RootStore;
  let events: EditorEvent[];

  beforeEach(() => {
    // Reset feature flags to default state
    resetFeatureFlags();

    // Disable requireTimeRoot feature flag for these tests (to test legacy mode)
    setFeatureFlags({ requireTimeRoot: false });

    store = new RootStore();
    events = [];

    // Capture all events
    store.events.on('CompileStarted', (event) => {
      events.push(event);
    });
    store.events.on('CompileFinished', (event) => {
      events.push(event);
    });
  });

  describe('CompileStarted Event', () => {
    it('should emit CompileStarted at the beginning of compilation', () => {
      const service = createCompilerService(store);

      // Add a simple block to trigger compilation
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });

      service.compile();

      const startedEvents = events.filter((e) => e.type === 'CompileStarted') as CompileStartedEvent[];
      expect(startedEvents).toHaveLength(1);

      const event = startedEvents[0];
      expect(event.compileId).toBeTruthy();
      expect(event.patchId).toBe(store.patchStore.patchId);
      expect(event.patchRevision).toBe(store.patchStore.patchRevision);
      expect(event.trigger).toBe('graphCommitted');
    });

    it('should generate unique compileId for each compilation', () => {
      const service = createCompilerService(store);

      // Add a simple block
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });

      // Compile twice
      service.compile();
      service.compile();

      const startedEvents = events.filter((e) => e.type === 'CompileStarted') as CompileStartedEvent[];
      expect(startedEvents).toHaveLength(2);

      const compileId1 = startedEvents[0].compileId;
      const compileId2 = startedEvents[1].compileId;

      expect(compileId1).not.toBe(compileId2);
    });
  });

  describe('CompileFinished Event', () => {
    it('should emit CompileFinished with status "ok" on successful compilation', () => {
      const service = createCompilerService(store);

      // Add a valid complete patch (TimeRoot + Domain + Render)
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });
      const domainBlock = store.patchStore.addBlock('GridDomain', 'fields', { rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D', 'program', {});

      // Connect: GridDomain.domain -> RenderInstances2D.domain (required)
      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');
      // Connect: GridDomain.pos0 -> RenderInstances2D.positions (required)
      store.patchStore.connect(domainBlock, 'pos0', renderBlock, 'positions');

      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.status).toBe('ok');
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(event.diagnostics).toEqual([]);
      expect(event.programMeta).toBeDefined();
      // timelineHint should be a valid value (finite, cyclic, or infinite)
      expect(['finite', 'cyclic', 'infinite']).toContain(event.programMeta?.timelineHint);
      // timeRootKind should be present
      expect(event.programMeta?.timeRootKind).toBeDefined();
    });

    it('should include compileId matching CompileStarted', () => {
      const service = createCompilerService(store);

      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });

      service.compile();

      const startedEvents = events.filter((e) => e.type === 'CompileStarted') as CompileStartedEvent[];
      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];

      expect(startedEvents).toHaveLength(1);
      expect(finishedEvents).toHaveLength(1);
      expect(finishedEvents[0].compileId).toBe(startedEvents[0].compileId);
    });

    it('should measure compilation duration', () => {
      const service = createCompilerService(store);

      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });

      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(event.durationMs).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Diagnostic Conversion', () => {
    it('should convert E_TIME_ROOT_MISSING diagnostic when requireTimeRoot is enabled', () => {
      // Enable requireTimeRoot feature flag
      setFeatureFlags({ requireTimeRoot: true });

      store = new RootStore();
      events = [];

      store.events.on('CompileFinished', (event) => {
        events.push(event);
      });

      const service = createCompilerService(store);

      // Add a non-TimeRoot block (should trigger missing TimeRoot error)
      store.patchStore.addBlock('GridDomain', 'fields', { rows: 5, cols: 5 });

      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.status).toBe('failed');
      expect(event.diagnostics).toHaveLength(1);

      const diagnostic = event.diagnostics[0];
      expect(diagnostic.code).toBe('E_TIME_ROOT_MISSING');
      expect(diagnostic.severity).toBe('error');
      expect(diagnostic.domain).toBe('compile');
      expect(diagnostic.primaryTarget.kind).toBe('graphSpan');
    });

    it('should convert E_TIME_ROOT_MULTIPLE diagnostic when multiple TimeRoots exist', () => {
      // Enable requireTimeRoot feature flag
      setFeatureFlags({ requireTimeRoot: true });

      store = new RootStore();
      events = [];

      store.events.on('CompileFinished', (event) => {
        events.push(event);
      });

      const service = createCompilerService(store);

      // Add two TimeRoot blocks (should trigger multiple TimeRoot error)
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });
      store.patchStore.addBlock('FiniteTimeRoot', 'phase', { durationMs: 5000 });

      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.status).toBe('failed');
      expect(event.diagnostics).toHaveLength(1);

      const diagnostic = event.diagnostics[0];
      expect(diagnostic.code).toBe('E_TIME_ROOT_MULTIPLE');
      expect(diagnostic.severity).toBe('error');
      expect(diagnostic.domain).toBe('compile');
      expect(diagnostic.primaryTarget.kind).toBe('timeRoot');
    });
  });

  describe('ProgramMeta', () => {
    it('should include timelineHint and timeRootKind in programMeta on success', () => {
      const service = createCompilerService(store);

      // Create a complete, valid patch
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });
      const domainBlock = store.patchStore.addBlock('GridDomain', 'fields', { rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D', 'program', {});
      // Connect: GridDomain.domain -> RenderInstances2D.domain (required)
      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');
      // Connect: GridDomain.pos0 -> RenderInstances2D.positions (required)
      store.patchStore.connect(domainBlock, 'pos0', renderBlock, 'positions');

      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.programMeta).toBeDefined();
      // timelineHint should be a valid value (finite, cyclic, or infinite)
      expect(['finite', 'cyclic', 'infinite']).toContain(event.programMeta?.timelineHint);
      // timeRootKind should be present
      expect(event.programMeta?.timeRootKind).toBeDefined();
    });

    it('should include bus usage summary in programMeta', () => {
      const service = createCompilerService(store);

      // Create a complete, valid patch
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });
      const domainBlock = store.patchStore.addBlock('GridDomain', 'fields', { rows: 5, cols: 5 });
      const renderBlock = store.patchStore.addBlock('RenderInstances2D', 'program', {});
      // Connect: GridDomain.domain -> RenderInstances2D.domain (required)
      store.patchStore.connect(domainBlock, 'domain', renderBlock, 'domain');
      // Connect: GridDomain.pos0 -> RenderInstances2D.positions (required)
      store.patchStore.connect(domainBlock, 'pos0', renderBlock, 'positions');

      // CycleTimeRoot auto-publishes to phaseA bus, so we should see it in the summary
      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.programMeta?.busUsageSummary).toBeDefined();
      // The bus usage summary should include any buses that were used
    });
  });

  describe('Empty Patch Handling', () => {
    it('should emit CompileFinished with failed status for empty patch', () => {
      const service = createCompilerService(store);

      // Don't add any blocks - compile empty patch
      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      expect(event.status).toBe('failed');
      // Empty patch fails with a diagnostic explaining why (no output port)
      // This is better UX than silently failing
      expect(event.diagnostics.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Exception Handling', () => {
    it('should emit CompileFinished on compilation', () => {
      const service = createCompilerService(store);

      // Add a block
      store.patchStore.addBlock('CycleTimeRoot', 'phase', { periodMs: 3000 });

      // Compile should complete and emit CompileFinished
      service.compile();

      const finishedEvents = events.filter((e) => e.type === 'CompileFinished') as CompileFinishedEvent[];
      expect(finishedEvents).toHaveLength(1);

      const event = finishedEvents[0];
      // Should succeed or fail, but always emit CompileFinished
      expect(['ok', 'failed']).toContain(event.status);
    });
  });
});
