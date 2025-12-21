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

/**
 * Create a minimal mock PatchStore for testing.
 */
function createMockPatchStore(blocks: any[] = []): PatchStore {
  return {
    blocks,
  } as PatchStore;
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
    message: 'Expected Signal<number>, got Signal<string>',
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
      // Create a patchStore with a CycleTimeRoot block
      patchStore = createMockPatchStore([
        { id: 'block-1', type: 'CycleTimeRoot' },
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

    it('should return diagnostics by revision', () => {
      const rev1 = hub.getByRevision(1);
      expect(rev1.length).toBe(1);
      expect(rev1[0].metadata.patchRevision).toBe(1);

      const rev2 = hub.getByRevision(2);
      expect(rev2.length).toBe(2);
      expect(rev2.every((d) => d.metadata.patchRevision === 2)).toBe(true);
    });

    it('should return diagnostics for active revision only', () => {
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
      expect(active.length).toBe(2);
      expect(active.every((d) => d.metadata.patchRevision === 2)).toBe(true);
    });

    it('should return empty array for non-existent revision', () => {
      const nonExistent = hub.getByRevision(999);
      expect(nonExistent).toEqual([]);
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
});
