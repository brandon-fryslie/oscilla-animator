/**
 * @file DiagnosticHub Tests
 * @description Test DiagnosticHub snapshot semantics and event handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticHub } from '../DiagnosticHub';
import { EventDispatcher } from '../../events/EventDispatcher';
import { createDiagnostic } from '../types';
import type { Diagnostic, DiagnosticCode } from '../types';
import type { PatchStore } from '../../stores/PatchStore';
import type { Block } from '../../types';

/**
 * Create a minimal mock PatchStore for testing.
 * By default includes a InfiniteTimeRoot to avoid "Missing TimeRoot" authoring diagnostic.
 * Pass empty array explicitly to test missing TimeRoot scenarios.
 */
function createMockPatchStore(
  blocks: Block[] = [{ id: 'time-root', type: 'InfiniteTimeRoot', label: 'TimeRoot', inputs: [], outputs: [], params: {}, category: 'Time' }]
): PatchStore {
  // Create a mock that provides the full root structure needed by storeToPatchDocument
  const mockRoot = {
    patchStore: {
      blocks,
      connections: [],
    },
    busStore: {
      buses: [],
      publishers: [],
      listeners: [],
    },
  };
  return {
    blocks,
    root: mockRoot,
  } as unknown as PatchStore;
}

/**
 * Create a sample compile diagnostic for testing.
 */
function createCompileDiagnostic(
  patchRevision: number,
  code: DiagnosticCode = 'E_TYPE_MISMATCH'
): Diagnostic {
  return createDiagnostic({
    code,
    severity: code.startsWith('W_') ? 'warn' : 'error',
    domain: 'compile',
    primaryTarget: { kind: 'block', blockId: 'block-1' },
    title: 'Type Mismatch',
    message: 'Expected Signal<float>, got Signal<string>',
    patchRevision,
  });
}

describe('DiagnosticHub', () => {
  let events: EventDispatcher;
  let patchStore: PatchStore;
  let hub: DiagnosticHub;

  beforeEach(() => {
    events = new EventDispatcher();
    patchStore = createMockPatchStore();
    hub = new DiagnosticHub(events, patchStore);
  });

  describe('Event Handling', () => {
    it('should handle GraphCommitted events and run authoring validators', () => {
      // Create hub with no TimeRoot to test missing TimeRoot detection
      patchStore = createMockPatchStore([]);
      hub = new DiagnosticHub(events, patchStore);

      // Emit GraphCommitted with a patch that has no TimeRoot
      events.emit({
        type: 'GraphCommitted',
        patchId: 'test-patch',
        patchRevision: 1,
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 1,
          blocksRemoved: 0,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: 0,
          timeRootChanged: false,
        },
      });

      // Should have created an authoring diagnostic for missing TimeRoot
      const authoring = hub.getAuthoringSnapshot();
      expect(authoring).toHaveLength(1);
      expect(authoring[0].code).toBe('E_TIME_ROOT_MISSING');
      expect(authoring[0].domain).toBe('authoring');
    });

    it('should not create missing TimeRoot diagnostic when TimeRoot exists', () => {
      // Create a patchStore with a InfiniteTimeRoot block
      patchStore = createMockPatchStore([
        { id: 'block-1', type: 'InfiniteTimeRoot', label: 'TimeRoot', inputs: [], outputs: [], params: {}, category: 'Time' },
      ]);
      hub = new DiagnosticHub(events, patchStore);

      events.emit({
        type: 'GraphCommitted',
        patchId: 'test-patch',
        patchRevision: 1,
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 1,
          blocksRemoved: 0,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: 0,
          timeRootChanged: true,
        },
      });

      // Should not have any authoring diagnostics
      const authoring = hub.getAuthoringSnapshot();
      expect(authoring).toHaveLength(0);
    });

    it('should handle CompileStarted events and mark pending state', () => {
      events.emit({
        type: 'CompileStarted',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        trigger: 'graphCommitted',
      });

      expect(hub.isCompilePending()).toBe(true);
      expect(hub.getPendingRevision()).toBe(1);
    });

    it('should handle CompileFinished events and replace compile snapshot', () => {
      const diagnostic1 = createCompileDiagnostic(1, 'E_TYPE_MISMATCH');
      const diagnostic2 = createCompileDiagnostic(1, 'W_BUS_EMPTY');

      // First compilation
      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'failed',
        durationMs: 42,
        diagnostics: [diagnostic1, diagnostic2],
      });

      // Should have both diagnostics
      const snapshot1 = hub.getCompileSnapshot(1);
      expect(snapshot1).toHaveLength(2);
      expect(snapshot1?.[0].code).toBe('E_TYPE_MISMATCH');
      expect(snapshot1?.[1].code).toBe('W_BUS_EMPTY');

      // Second compilation (replaces the first completely)
      const diagnostic3 = createCompileDiagnostic(1, 'E_CYCLE_DETECTED');

      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-2',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'failed',
        durationMs: 35,
        diagnostics: [diagnostic3],
      });

      // Should have ONLY the new diagnostic (complete replacement)
      const snapshot2 = hub.getCompileSnapshot(1);
      expect(snapshot2).toHaveLength(1);
      expect(snapshot2?.[0].code).toBe('E_CYCLE_DETECTED');
    });

    it('should clear pending state after CompileFinished', () => {
      events.emit({
        type: 'CompileStarted',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        trigger: 'graphCommitted',
      });

      expect(hub.isCompilePending()).toBe(true);

      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'ok',
        durationMs: 42,
        diagnostics: [],
      });

      expect(hub.isCompilePending()).toBe(false);
      expect(hub.getPendingRevision()).toBe(null);
    });

    it('should handle ProgramSwapped events and update activeRevision', () => {
      events.emit({
        type: 'ProgramSwapped',
        patchId: 'test-patch',
        patchRevision: 5,
        compileId: 'compile-1',
        swapMode: 'hard',
        swapLatencyMs: 10,
      });

      expect(hub.getActiveRevision()).toBe(5);
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      // Use empty blocks to generate Missing TimeRoot authoring diagnostic
      patchStore = createMockPatchStore([]);
      hub = new DiagnosticHub(events, patchStore);

      // Set up some test data
      const diag1 = createCompileDiagnostic(1, 'E_TYPE_MISMATCH');
      const diag2 = createCompileDiagnostic(2, 'E_CYCLE_DETECTED');
      const diag3 = createCompileDiagnostic(2, 'W_BUS_EMPTY');

      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'failed',
        durationMs: 42,
        diagnostics: [diag1],
      });

      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-2',
        patchId: 'test-patch',
        patchRevision: 2,
        status: 'failed',
        durationMs: 35,
        diagnostics: [diag2, diag3],
      });

      // Trigger authoring validation
      events.emit({
        type: 'GraphCommitted',
        patchId: 'test-patch',
        patchRevision: 3,
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 0,
          blocksRemoved: 0,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: 0,
          timeRootChanged: false,
        },
      });
    });

    it('should return all diagnostics from all revisions', () => {
      const all = hub.getAll();
      // 1 from rev1, 2 from rev2, 1 authoring from rev3
      expect(all.length).toBe(4);
    });

    it('should filter diagnostics by domain', () => {
      const compileDiags = hub.getAll({ domain: 'compile' });
      expect(compileDiags.length).toBe(3);
      expect(compileDiags.every((d) => d.domain === 'compile')).toBe(true);

      const authoringDiags = hub.getAll({ domain: 'authoring' });
      expect(authoringDiags.length).toBe(1);
      expect(authoringDiags[0].domain).toBe('authoring');
    });

    it('should filter diagnostics by severity', () => {
      const errors = hub.getAll({ severity: 'error' });
      // All our test diagnostics are errors except one warning
      expect(errors.length).toBe(3);
      expect(errors.every((d) => d.severity === 'error')).toBe(true);

      const warnings = hub.getAll({ severity: 'warn' });
      expect(warnings.length).toBe(1);
      expect(warnings[0].code).toBe('W_BUS_EMPTY');
    });

    it('should filter diagnostics by patchRevision', () => {
      const rev1Diags = hub.getAll({ patchRevision: 1 });
      expect(rev1Diags.length).toBe(1);
      expect(rev1Diags[0].code).toBe('E_TYPE_MISMATCH');

      const rev2Diags = hub.getAll({ patchRevision: 2 });
      expect(rev2Diags.length).toBe(2);
    });

    it('should return diagnostics by revision (includes authoring)', () => {
      // getByRevision now always includes authoring diagnostics (revision-agnostic)
      const rev1 = hub.getByRevision(1);
      // 1 compile diagnostic + 1 authoring diagnostic
      expect(rev1.length).toBe(2);
      expect(rev1.filter((d) => d.domain === 'compile')).toHaveLength(1);
      expect(rev1.filter((d) => d.domain === 'authoring')).toHaveLength(1);

      const rev2 = hub.getByRevision(2);
      // 2 compile diagnostics + 1 authoring diagnostic
      expect(rev2.length).toBe(3);
      expect(rev2.filter((d) => d.domain === 'compile')).toHaveLength(2);
      expect(rev2.filter((d) => d.domain === 'authoring')).toHaveLength(1);
    });

    it('should return diagnostics for active revision (includes authoring)', () => {
      // Set active revision to 2
      events.emit({
        type: 'ProgramSwapped',
        patchId: 'test-patch',
        patchRevision: 2,
        compileId: 'compile-2',
        swapMode: 'hard',
        swapLatencyMs: 10,
      });

      const active = hub.getActive();
      // 2 compile diagnostics + 1 authoring diagnostic
      expect(active.length).toBe(3);
      // Compile diagnostics have patchRevision 2
      expect(active.filter((d) => d.domain === 'compile')).toHaveLength(2);
      expect(active.filter((d) => d.domain === 'compile').every((d) => d.metadata.patchRevision === 2)).toBe(true);
      // Authoring diagnostics are always included regardless of revision
      expect(active.filter((d) => d.domain === 'authoring')).toHaveLength(1);
    });

    it('should return only authoring diagnostics for non-existent compile revision', () => {
      // No compile diagnostics exist for revision 999, but authoring diagnostics are always included
      const nonExistent = hub.getByRevision(999);
      expect(nonExistent).toHaveLength(1);
      expect(nonExistent[0].domain).toBe('authoring');
    });

    it('should return undefined for compile snapshot of non-compiled revision', () => {
      const snapshot = hub.getCompileSnapshot(999);
      expect(snapshot).toBeUndefined();
    });
  });

  describe('Snapshot Semantics', () => {
    it('should maintain separate snapshots per revision', () => {
      const diag1 = createCompileDiagnostic(1, 'E_TYPE_MISMATCH');
      const diag2 = createCompileDiagnostic(2, 'E_CYCLE_DETECTED');

      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'failed',
        durationMs: 42,
        diagnostics: [diag1],
      });

      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-2',
        patchId: 'test-patch',
        patchRevision: 2,
        status: 'failed',
        durationMs: 35,
        diagnostics: [diag2],
      });

      // Both snapshots should exist independently
      const snapshot1 = hub.getCompileSnapshot(1);
      const snapshot2 = hub.getCompileSnapshot(2);

      expect(snapshot1).toHaveLength(1);
      expect(snapshot1?.[0].code).toBe('E_TYPE_MISMATCH');

      expect(snapshot2).toHaveLength(1);
      expect(snapshot2?.[0].code).toBe('E_CYCLE_DETECTED');
    });

    it('should completely replace snapshot on subsequent CompileFinished for same revision', () => {
      const diag1 = createCompileDiagnostic(1, 'E_TYPE_MISMATCH');
      const diag2 = createCompileDiagnostic(1, 'W_BUS_EMPTY');

      // First compilation
      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'failed',
        durationMs: 42,
        diagnostics: [diag1, diag2],
      });

      expect(hub.getCompileSnapshot(1)).toHaveLength(2);

      // Second compilation - empty diagnostics (success case)
      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-2',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'ok',
        durationMs: 30,
        diagnostics: [],
      });

      // Should be completely replaced with empty array
      const snapshot = hub.getCompileSnapshot(1);
      expect(snapshot).toEqual([]);
    });
  });

  describe('Lifecycle', () => {
    it('should unsubscribe from events on dispose', () => {
      const hub2 = new DiagnosticHub(events, patchStore);

      // Dispose the hub
      hub2.dispose();

      // Emit an event (should not affect the disposed hub)
      events.emit({
        type: 'GraphCommitted',
        patchId: 'test-patch',
        patchRevision: 1,
        reason: 'userEdit',
        diffSummary: {
          blocksAdded: 1,
          blocksRemoved: 0,
          busesAdded: 0,
          busesRemoved: 0,
          bindingsChanged: 0,
          timeRootChanged: false,
        },
      });

      // Hub should not have any diagnostics (it's been disposed)
      const authoring = hub2.getAuthoringSnapshot();
      expect(authoring).toEqual([]);
    });
  });

  describe('Mute/Unmute', () => {
    beforeEach(() => {
      // Set up test data with a diagnostic
      const diag = createCompileDiagnostic(1, 'E_TYPE_MISMATCH');
      events.emit({
        type: 'CompileFinished',
        compileId: 'compile-1',
        patchId: 'test-patch',
        patchRevision: 1,
        status: 'failed',
        durationMs: 42,
        diagnostics: [diag],
      });
      // Set active revision to 1
      events.emit({
        type: 'ProgramSwapped',
        patchId: 'test-patch',
        patchRevision: 1,
        compileId: 'compile-1',
        swapMode: 'hard',
        swapLatencyMs: 10,
      });
    });

    it('should exclude muted diagnostics from getActive() by default', () => {
      const diags = hub.getActive();
      expect(diags).toHaveLength(1);

      const diagId = diags[0].id;
      hub.muteDiagnostic(diagId);

      // After muting, should be excluded
      const afterMute = hub.getActive();
      expect(afterMute).toHaveLength(0);
    });

    it('should include muted diagnostics with includeMuted parameter', () => {
      const diags = hub.getActive();
      const diagId = diags[0].id;
      hub.muteDiagnostic(diagId);

      // With includeMuted = true
      const withMuted = hub.getActive(true);
      expect(withMuted).toHaveLength(1);
    });

    it('should restore diagnostic when unmuted', () => {
      const diags = hub.getActive();
      const diagId = diags[0].id;

      hub.muteDiagnostic(diagId);
      expect(hub.getActive()).toHaveLength(0);

      hub.unmuteDiagnostic(diagId);
      expect(hub.getActive()).toHaveLength(1);
    });

    it('should report correct muted count', () => {
      expect(hub.getMutedCount()).toBe(0);

      const diags = hub.getActive();
      hub.muteDiagnostic(diags[0].id);
      expect(hub.getMutedCount()).toBe(1);

      hub.clearMuted();
      expect(hub.getMutedCount()).toBe(0);
    });

    it('should correctly report isMuted status', () => {
      const diags = hub.getActive();
      const diagId = diags[0].id;

      expect(hub.isMuted(diagId)).toBe(false);
      hub.muteDiagnostic(diagId);
      expect(hub.isMuted(diagId)).toBe(true);
    });

    it('should exclude muted diagnostics from getAll() by default', () => {
      const diags = hub.getActive();
      hub.muteDiagnostic(diags[0].id);

      const all = hub.getAll();
      expect(all).toHaveLength(0);
    });

    it('should include muted diagnostics in getAll() with filter', () => {
      const diags = hub.getActive();
      hub.muteDiagnostic(diags[0].id);

      const all = hub.getAll({ includeMuted: true });
      expect(all).toHaveLength(1);
    });
  });

  describe('RuntimeHealthSnapshot Handling', () => {
    beforeEach(() => {
      // Set active revision
      events.emit({
        type: 'ProgramSwapped',
        patchId: 'test-patch',
        patchRevision: 1,
        compileId: 'compile-1',
        swapMode: 'hard',
        swapLatencyMs: 10,
      });
    });

    it('should create P_NAN_DETECTED diagnostic when nanCount > 0', () => {
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 5, infCount: 0, fieldMaterializations: 0 },
      });

      const runtime = hub.getRuntimeDiagnostics();
      expect(runtime).toHaveLength(1);
      expect(runtime[0].code).toBe('P_NAN_DETECTED');
      expect(runtime[0].domain).toBe('runtime');
      expect(runtime[0].message).toContain('5 NaN');
    });

    it('should create P_INFINITY_DETECTED diagnostic when infCount > 0', () => {
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 0, infCount: 3, fieldMaterializations: 0 },
      });

      const runtime = hub.getRuntimeDiagnostics();
      expect(runtime).toHaveLength(1);
      expect(runtime[0].code).toBe('P_INFINITY_DETECTED');
    });

    it('should create P_FRAME_BUDGET_EXCEEDED when avgFrameMs > 16.67', () => {
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 30, avgFrameMs: 33.3 },
        evalStats: { nanCount: 0, infCount: 0, fieldMaterializations: 0 },
      });

      const runtime = hub.getRuntimeDiagnostics();
      expect(runtime).toHaveLength(1);
      expect(runtime[0].code).toBe('P_FRAME_BUDGET_EXCEEDED');
      expect(runtime[0].domain).toBe('perf');
    });

    it('should update occurrence count for repeated diagnostics', () => {
      // First snapshot
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 1, infCount: 0, fieldMaterializations: 0 },
      });

      let runtime = hub.getRuntimeDiagnostics();
      expect(runtime[0].metadata.occurrenceCount).toBe(1);

      // Second snapshot with same issue
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 2000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 2, infCount: 0, fieldMaterializations: 0 },
      });

      runtime = hub.getRuntimeDiagnostics();
      expect(runtime).toHaveLength(1);
      expect(runtime[0].metadata.occurrenceCount).toBe(2);
    });

    it('should expire runtime diagnostics after timeout', () => {
      // Create a runtime diagnostic
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 1, infCount: 0, fieldMaterializations: 0 },
      });

      expect(hub.getRuntimeDiagnostics()).toHaveLength(1);

      // Simulate time passing (> 5 seconds)
      const futureTime = Date.now() + 6000;
      hub.expireRuntimeDiagnostics(futureTime);

      expect(hub.getRuntimeDiagnostics()).toHaveLength(0);
    });

    it('should include runtime diagnostics in getActive()', () => {
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 1, infCount: 0, fieldMaterializations: 0 },
      });

      const active = hub.getActive();
      expect(active.some((d) => d.code === 'P_NAN_DETECTED')).toBe(true);
    });

    it('should not create diagnostics when values are healthy', () => {
      events.emit({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test-patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 10 },
        evalStats: { nanCount: 0, infCount: 0, fieldMaterializations: 0 },
      });

      const runtime = hub.getRuntimeDiagnostics();
      expect(runtime).toHaveLength(0);
    });
  });
});
