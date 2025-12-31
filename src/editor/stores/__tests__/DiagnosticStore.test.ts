/**
 * @file DiagnosticStore Tests
 * @description Tests for DiagnosticStore MobX wrapper (P0.7)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import type { CompileFinishedEvent } from '../../events/types';

describe('DiagnosticStore', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();

    // Remove the palette bus (color domain) to avoid P1 validation errors
    // P1 correctly validates that non-numeric buses are not yet supported in IR mode
    // These tests are about DiagnosticStore behavior, not bus validation
    const paletteBus = rootStore.busStore.buses.find(b => b.name === 'palette');
    if (paletteBus !== undefined && paletteBus !== null) {
      rootStore.busStore.deleteBus(paletteBus.id);
    }

    // Add a TimeRoot block so authoring validators pass
    // (otherwise we get a "Missing TimeRoot" diagnostic)
    rootStore.patchStore.addBlock('InfiniteTimeRoot');
  });

  describe('Initialization', () => {
    it('should be accessible from RootStore', () => {
      expect(rootStore.diagnosticStore).toBeDefined();
      expect(rootStore.diagnosticHub).toBeDefined();
    });

    it('should have zero counts after adding TimeRoot', () => {
      // With a TimeRoot block added in beforeEach, there should be no authoring diagnostics
      expect(rootStore.diagnosticStore.errorCount).toBe(0);
      expect(rootStore.diagnosticStore.warningCount).toBe(0);
      expect(rootStore.diagnosticStore.totalCount).toBe(0);
    });

    it('should have empty activeDiagnostics after adding TimeRoot', () => {
      expect(rootStore.diagnosticStore.activeDiagnostics).toEqual([]);
    });

    it('should have Missing TimeRoot diagnostic without TimeRoot', () => {
      // Create a fresh RootStore WITHOUT adding TimeRoot
      const freshStore = new RootStore();

      // Remove palette bus to avoid P1 validation errors
      const paletteBus = freshStore.busStore.buses.find(b => b.name === 'palette');
      if (paletteBus !== undefined && paletteBus !== null) {
        freshStore.busStore.deleteBus(paletteBus.id);
      }

      // Initial authoring validation should find missing TimeRoot
      expect(freshStore.diagnosticStore.activeDiagnostics).toHaveLength(1);
      expect(freshStore.diagnosticStore.activeDiagnostics[0].code).toBe('E_TIME_ROOT_MISSING');
      expect(freshStore.diagnosticStore.errorCount).toBe(1);
    });
  });

  describe('Computed Properties', () => {
    it('should react to CompileFinished events with diagnostics', () => {
      // Emit a CompileFinished event with diagnostics
      const event: CompileFinishedEvent = {
        type: 'CompileFinished',
        compileId: 'test-compile-1',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        status: 'failed',
        durationMs: 10,
        diagnostics: [
          {
            id: 'diag-1',
            code: 'E_TIME_ROOT_MISSING',
            severity: 'error',
            domain: 'compile',
            primaryTarget: { kind: 'graphSpan', blockIds: [] },
            title: 'Missing TimeRoot',
            message: 'No TimeRoot block found in patch',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 1,
            },
          },
          {
            id: 'diag-2',
            code: 'W_BUS_EMPTY',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: { kind: 'bus', busId: 'bus-1' },
            title: 'Empty Bus',
            message: 'Bus has no listeners',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 1,
            },
          },
        ],
      };

      rootStore.events.emit(event);

      // Also emit ProgramSwapped to set active revision
      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        compileId: 'test-compile-1',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });

      // Check that counts are updated
      expect(rootStore.diagnosticStore.activeDiagnostics).toHaveLength(2);
      expect(rootStore.diagnosticStore.errorCount).toBe(1);
      expect(rootStore.diagnosticStore.warningCount).toBe(1);
      expect(rootStore.diagnosticStore.totalCount).toBe(2);
    });

    it('should return correct hasErrors status', () => {
      // Initially no errors
      expect(rootStore.diagnosticStore.hasErrors).toBe(false);

      // Emit CompileFinished with error
      rootStore.events.emit({
        type: 'CompileFinished',
        compileId: 'test-compile-1',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        status: 'failed',
        durationMs: 10,
        diagnostics: [
          {
            id: 'diag-1',
            code: 'E_TYPE_MISMATCH',
            severity: 'error',
            domain: 'compile',
            primaryTarget: { kind: 'block', blockId: 'block-1' },
            title: 'Type Mismatch',
            message: 'Type mismatch error',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 1,
            },
          },
        ],
      });

      // Set active revision
      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        compileId: 'test-compile-1',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });

      expect(rootStore.diagnosticStore.hasErrors).toBe(true);
    });

    it('should return correct hasWarnings status', () => {
      expect(rootStore.diagnosticStore.hasWarnings).toBe(false);

      rootStore.events.emit({
        type: 'CompileFinished',
        compileId: 'test-compile-1',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        status: 'ok',
        durationMs: 10,
        diagnostics: [
          {
            id: 'diag-1',
            code: 'W_BUS_EMPTY',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: { kind: 'bus', busId: 'bus-1' },
            title: 'Empty Bus',
            message: 'Bus has no listeners',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 1,
            },
          },
        ],
      });

      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        compileId: 'test-compile-1',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });

      expect(rootStore.diagnosticStore.hasWarnings).toBe(true);
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      // Set up diagnostics with different severities
      rootStore.events.emit({
        type: 'CompileFinished',
        compileId: 'test-compile-1',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        status: 'failed',
        durationMs: 10,
        diagnostics: [
          {
            id: 'error-1',
            code: 'E_TYPE_MISMATCH',
            severity: 'error',
            domain: 'compile',
            primaryTarget: { kind: 'block', blockId: 'block-1' },
            title: 'Error 1',
            message: 'Error 1',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 1,
            },
          },
          {
            id: 'warn-1',
            code: 'W_BUS_EMPTY',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: { kind: 'block', blockId: 'block-2' },
            title: 'Warning 1',
            message: 'Warning 1',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 1,
            },
          },
        ],
      });

      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        compileId: 'test-compile-1',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });
    });

    it('should filter diagnostics by severity', () => {
      const errors = rootStore.diagnosticStore.getDiagnosticsBySeverity('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].id).toBe('error-1');

      const warnings = rootStore.diagnosticStore.getDiagnosticsBySeverity('warn');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].id).toBe('warn-1');
    });

    it('should get diagnostics for a specific block', () => {
      const block1Diags = rootStore.diagnosticStore.getDiagnosticsForBlock('block-1');
      expect(block1Diags).toHaveLength(1);
      expect(block1Diags[0].id).toBe('error-1');

      const block2Diags = rootStore.diagnosticStore.getDiagnosticsForBlock('block-2');
      expect(block2Diags).toHaveLength(1);
      expect(block2Diags[0].id).toBe('warn-1');
    });

    it('should get diagnostics for a specific bus', () => {
      // Add a bus diagnostic
      rootStore.events.emit({
        type: 'CompileFinished',
        compileId: 'test-compile-2',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 2,
        status: 'ok',
        durationMs: 10,
        diagnostics: [
          {
            id: 'bus-diag-1',
            code: 'W_BUS_EMPTY',
            severity: 'warn',
            domain: 'compile',
            primaryTarget: { kind: 'bus', busId: 'test-bus' },
            title: 'Bus Warning',
            message: 'Bus warning',
            metadata: {
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              occurrenceCount: 1,
              patchRevision: 2,
            },
          },
        ],
      });

      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 2,
        compileId: 'test-compile-2',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });

      const busDiags = rootStore.diagnosticStore.getDiagnosticsForBus('test-bus');
      expect(busDiags).toHaveLength(1);
      expect(busDiags[0].id).toBe('bus-diag-1');
    });
  });

  describe('Active Revision', () => {
    it('should return active revision from hub', () => {
      expect(rootStore.diagnosticStore.activeRevision).toBe(0);

      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 5,
        compileId: 'test-compile-1',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });

      expect(rootStore.diagnosticStore.activeRevision).toBe(5);
    });
  });

  describe('Invalidation', () => {
    it('should invalidate on CompileFinished events', () => {
      const initialRevision = rootStore.diagnosticStore._revisionCounter;

      rootStore.events.emit({
        type: 'CompileFinished',
        compileId: 'test-compile-1',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        status: 'ok',
        durationMs: 10,
        diagnostics: [],
      });

      expect(rootStore.diagnosticStore._revisionCounter).toBe(initialRevision + 1);
    });

    it('should invalidate on ProgramSwapped events', () => {
      const initialRevision = rootStore.diagnosticStore._revisionCounter;

      rootStore.events.emit({
        type: 'ProgramSwapped',
        patchId: rootStore.patchStore.patchId,
        patchRevision: 1,
        compileId: 'test-compile-1',
        swapMode: 'hard',
        swapLatencyMs: 5,
      });

      expect(rootStore.diagnosticStore._revisionCounter).toBe(initialRevision + 1);
    });

    it('should invalidate on GraphCommitted events', () => {
      const initialRevision = rootStore.diagnosticStore._revisionCounter;

      rootStore.events.emit({
        type: 'GraphCommitted',
        patchId: rootStore.patchStore.patchId,
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

      expect(rootStore.diagnosticStore._revisionCounter).toBe(initialRevision + 1);
    });
  });
});
