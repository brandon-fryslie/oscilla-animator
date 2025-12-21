/**
 * @file DiagnosticStore
 * @description MobX wrapper around DiagnosticHub for reactive UI updates.
 *
 * This store provides computed properties that react to diagnostic state changes,
 * making it easy for React components to render diagnostic information.
 *
 * Reference: DOD-2025-12-20-174727.md §P0.7
 */

import { makeObservable, computed, observable, action } from 'mobx';
import type { DiagnosticHub } from '../diagnostics/DiagnosticHub';
import type { Diagnostic, Severity } from '../diagnostics/types';

/**
 * DiagnosticStore provides reactive access to diagnostic state.
 *
 * Usage:
 * ```typescript
 * const hub = new DiagnosticHub(events, patchStore);
 * const store = new DiagnosticStore(hub);
 *
 * // In React component:
 * const { activeDiagnostics, errorCount, warningCount } = store;
 * ```
 */
export class DiagnosticStore {
  /** Reference to the underlying DiagnosticHub */
  private readonly hub: DiagnosticHub;

  /**
   * Observable revision counter that gets incremented when diagnostics change.
   * This triggers MobX to recompute derived values.
   */
  private revisionCounter = 0;

  constructor(hub: DiagnosticHub) {
    this.hub = hub;

    makeObservable<DiagnosticStore, 'revisionCounter'>(this, {
      revisionCounter: observable,
      activeDiagnostics: computed,
      errorCount: computed,
      warningCount: computed,
      hintCount: computed,
      infoCount: computed,
      fatalCount: computed,
      totalCount: computed,
      mutedCount: computed,
      invalidate: action,
      muteDiagnostic: action,
      unmuteDiagnostic: action,
    });
  }

  /**
   * Call this method when diagnostic state changes to trigger recomputation.
   * This should be called from event handlers or after DiagnosticHub updates.
   */
  invalidate(): void {
    this.revisionCounter++;
  }

  /**
   * Get diagnostics for the currently active revision.
   * This is the primary query for UI components.
   */
  get activeDiagnostics(): Diagnostic[] {
    // Touch revisionCounter to establish dependency
    void this.revisionCounter;
    return this.hub.getActive();
  }

  /**
   * Count of diagnostics with severity 'error'.
   */
  get errorCount(): number {
    return this.countBySeverity('error');
  }

  /**
   * Count of diagnostics with severity 'warn'.
   */
  get warningCount(): number {
    return this.countBySeverity('warn');
  }

  /**
   * Count of diagnostics with severity 'hint'.
   */
  get hintCount(): number {
    return this.countBySeverity('hint');
  }

  /**
   * Count of diagnostics with severity 'info'.
   */
  get infoCount(): number {
    return this.countBySeverity('info');
  }

  /**
   * Count of diagnostics with severity 'fatal'.
   */
  get fatalCount(): number {
    return this.countBySeverity('fatal');
  }

  /**
   * Total count of all active diagnostics.
   */
  get totalCount(): number {
    return this.activeDiagnostics.length;
  }

  /**
   * Count of muted diagnostics.
   */
  get mutedCount(): number {
    void this.revisionCounter;
    return this.hub.getMutedCount();
  }

  /**
   * Get the currently active revision number.
   */
  get activeRevision(): number {
    void this.revisionCounter;
    return this.hub.getActiveRevision();
  }

  /**
   * Check if there are any errors (severity = 'error' or 'fatal').
   */
  get hasErrors(): boolean {
    return this.errorCount > 0 || this.fatalCount > 0;
  }

  /**
   * Check if there are any warnings.
   */
  get hasWarnings(): boolean {
    return this.warningCount > 0;
  }

  /**
   * Get diagnostics filtered by severity.
   */
  getDiagnosticsBySeverity(severity: Severity): Diagnostic[] {
    void this.revisionCounter;
    return this.activeDiagnostics.filter(d => d.severity === severity);
  }

  /**
   * Get diagnostics for a specific block.
   */
  getDiagnosticsForBlock(blockId: string): Diagnostic[] {
    void this.revisionCounter;
    return this.activeDiagnostics.filter(d => {
      const target = d.primaryTarget;
      if (target.kind === 'block') return target.blockId === blockId;
      if (target.kind === 'port') return target.blockId === blockId;
      if (target.kind === 'timeRoot') return target.blockId === blockId;
      if (target.kind === 'graphSpan') return target.blockIds.includes(blockId);
      return false;
    });
  }

  /**
   * Get diagnostics for a specific bus.
   */
  getDiagnosticsForBus(busId: string): Diagnostic[] {
    void this.revisionCounter;
    return this.activeDiagnostics.filter(d => {
      const target = d.primaryTarget;
      if (target.kind === 'bus') return target.busId === busId;
      if (target.kind === 'binding') return target.busId === busId;
      return false;
    });
  }

  /**
   * Mute a diagnostic by ID.
   */
  muteDiagnostic(diagnosticId: string): void {
    this.hub.muteDiagnostic(diagnosticId);
    this.invalidate();
  }

  /**
   * Unmute a diagnostic by ID.
   */
  unmuteDiagnostic(diagnosticId: string): void {
    this.hub.unmuteDiagnostic(diagnosticId);
    this.invalidate();
  }

  /**
   * Check if a diagnostic is muted.
   */
  isMuted(diagnosticId: string): boolean {
    void this.revisionCounter;
    return this.hub.isMuted(diagnosticId);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private countBySeverity(severity: Severity): number {
    void this.revisionCounter;
    return this.activeDiagnostics.filter(d => d.severity === severity).length;
  }
}
