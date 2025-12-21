/**
 * @file DiagnosticHub
 * @description Central hub for managing diagnostic state with snapshot semantics.
 *
 * Design principles:
 * - Diagnostics are keyed by patchRevision (snapshot semantics)
 * - Event-driven updates (subscribes to EventDispatcher)
 * - Separation of concerns: authoring vs compile vs runtime diagnostics
 * - Single source of truth for diagnostic state
 *
 * Reference: design-docs/4-Event-System/3.5-Events-and-Payloads-Schema.md
 */

import type { EventDispatcher } from '../events/EventDispatcher';
import type { Diagnostic, Domain, Severity } from './types';
import { createDiagnostic } from './types';
import type { PatchStore } from '../stores/PatchStore';

/**
 * Filter options for querying diagnostics.
 */
export interface DiagnosticFilter {
  /** Filter by diagnostic domain */
  domain?: Domain;
  /** Filter by severity level */
  severity?: Severity;
  /** Filter by patch revision */
  patchRevision?: number;
}

/**
 * DiagnosticHub manages all diagnostic state with snapshot semantics.
 *
 * State organization:
 * - compileSnapshots: Map<patchRevision, Diagnostic[]> - compile diagnostics per revision
 * - authoringSnapshot: Diagnostic[] - current authoring diagnostics (fast validation)
 * - activeRevision: number - which revision is currently running in the player
 * - pendingCompileRevision: number | null - which revision is currently being compiled
 *
 * Event subscriptions:
 * - GraphCommitted: Run authoring validators, update authoring snapshot
 * - CompileStarted: Mark compile diagnostics "pending" for that revision
 * - CompileFinished: Replace compile snapshot with event payload diagnostics
 * - ProgramSwapped: Set active revision pointer
 */
export class DiagnosticHub {
  /** Compile diagnostics snapshots, keyed by patchRevision */
  private compileSnapshots = new Map<number, Diagnostic[]>();

  /** Current authoring diagnostics (fast graph validation) */
  private authoringSnapshot: Diagnostic[] = [];

  /** Which patchRevision is currently active in the runtime */
  private activeRevision: number = 0;

  /** Which patchRevision is currently being compiled (null if none) */
  private pendingCompileRevision: number | null = null;

  /** Unsubscribe functions for event listeners */
  private unsubscribers: (() => void)[] = [];

  /** Reference to PatchStore for authoring validation */
  private patchStore: PatchStore;

  constructor(events: EventDispatcher, patchStore: PatchStore) {
    this.patchStore = patchStore;

    // Subscribe to lifecycle events
    this.unsubscribers.push(
      events.on('GraphCommitted', (event) => this.handleGraphCommitted(event)),
      events.on('CompileStarted', (event) => this.handleCompileStarted(event)),
      events.on('CompileFinished', (event) => this.handleCompileFinished(event)),
      events.on('ProgramSwapped', (event) => this.handleProgramSwapped(event))
    );
  }

  /**
   * Clean up event subscriptions.
   */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private handleGraphCommitted(event: { patchRevision: number }): void {
    // Run authoring validators on the current graph state
    this.authoringSnapshot = this.runAuthoringValidators(event.patchRevision);
  }

  private handleCompileStarted(event: { patchRevision: number }): void {
    // Mark this revision as pending compilation
    this.pendingCompileRevision = event.patchRevision;
  }

  private handleCompileFinished(event: {
    patchRevision: number;
    diagnostics: Diagnostic[];
  }): void {
    // Replace compile snapshot for this revision completely
    this.compileSnapshots.set(event.patchRevision, event.diagnostics);

    // Clear pending state if this was the pending revision
    if (this.pendingCompileRevision === event.patchRevision) {
      this.pendingCompileRevision = null;
    }
  }

  private handleProgramSwapped(event: { patchRevision: number }): void {
    // Update active revision pointer
    this.activeRevision = event.patchRevision;
  }

  // ===========================================================================
  // Authoring Validators
  // ===========================================================================

  /**
   * Run fast authoring validators against the current graph state.
   * These are cheap, synchronous checks that provide immediate feedback.
   *
   * Current validators:
   * - Check for missing TimeRoot
   *
   * @param patchRevision - The revision to attach to diagnostics
   * @returns Array of authoring diagnostics
   */
  private runAuthoringValidators(patchRevision: number): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Validator: Check for missing TimeRoot
    const timeRootBlocks = this.patchStore.blocks.filter(
      (block) =>
        block.type === 'FiniteTimeRoot' ||
        block.type === 'CycleTimeRoot' ||
        block.type === 'InfiniteTimeRoot'
    );

    if (timeRootBlocks.length === 0) {
      diagnostics.push(
        createDiagnostic({
          code: 'E_TIME_ROOT_MISSING',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
          title: 'Missing TimeRoot',
          message: 'The patch requires exactly one TimeRoot block (Finite, Cycle, or Infinite).',
          patchRevision,
          actions: [
            {
              kind: 'createTimeRoot',
              timeRootKind: 'Cycle',
            },
          ],
        })
      );
    }

    return diagnostics;
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get all diagnostics, optionally filtered.
   *
   * @param filters - Optional filters (domain, severity, patchRevision)
   * @returns Array of diagnostics matching the filters
   */
  getAll(filters?: DiagnosticFilter): Diagnostic[] {
    const allDiagnostics: Diagnostic[] = [];

    // Collect authoring diagnostics
    allDiagnostics.push(...this.authoringSnapshot);

    // Collect compile diagnostics
    if (filters?.patchRevision !== undefined) {
      // Only get diagnostics for the specified revision
      const compileDiags = this.compileSnapshots.get(filters.patchRevision);
      if (compileDiags) {
        allDiagnostics.push(...compileDiags);
      }
    } else {
      // Get diagnostics from all revisions
      for (const diagnostics of this.compileSnapshots.values()) {
        allDiagnostics.push(...diagnostics);
      }
    }

    // Apply filters
    return this.applyFilters(allDiagnostics, filters);
  }

  /**
   * Get diagnostics for a specific patch revision.
   *
   * @param patchRevision - The revision to query
   * @returns Array of diagnostics for that revision
   */
  getByRevision(patchRevision: number): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Add authoring diagnostics if they match the revision
    const authoringDiags = this.authoringSnapshot.filter(
      (d) => d.metadata.patchRevision === patchRevision
    );
    diagnostics.push(...authoringDiags);

    // Add compile diagnostics for this revision
    const compileDiags = this.compileSnapshots.get(patchRevision);
    if (compileDiags) {
      diagnostics.push(...compileDiags);
    }

    return diagnostics;
  }

  /**
   * Get diagnostics for the currently active revision (running in player).
   *
   * @returns Array of diagnostics for the active revision
   */
  getActive(): Diagnostic[] {
    return this.getByRevision(this.activeRevision);
  }

  /**
   * Get the current authoring diagnostics snapshot.
   *
   * @returns Array of current authoring diagnostics
   */
  getAuthoringSnapshot(): Diagnostic[] {
    return [...this.authoringSnapshot];
  }

  /**
   * Get the compile diagnostics snapshot for a specific revision.
   *
   * @param patchRevision - The revision to query
   * @returns Array of compile diagnostics, or undefined if not compiled yet
   */
  getCompileSnapshot(patchRevision: number): Diagnostic[] | undefined {
    const snapshot = this.compileSnapshots.get(patchRevision);
    return snapshot ? [...snapshot] : undefined;
  }

  /**
   * Check if a compilation is currently pending.
   *
   * @returns True if a compilation is in progress
   */
  isCompilePending(): boolean {
    return this.pendingCompileRevision !== null;
  }

  /**
   * Get the revision that is currently being compiled.
   *
   * @returns The pending revision, or null if no compilation is in progress
   */
  getPendingRevision(): number | null {
    return this.pendingCompileRevision;
  }

  /**
   * Get the currently active revision number.
   *
   * @returns The active revision
   */
  getActiveRevision(): number {
    return this.activeRevision;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Apply filters to a diagnostic array.
   */
  private applyFilters(
    diagnostics: Diagnostic[],
    filters?: DiagnosticFilter
  ): Diagnostic[] {
    if (!filters) {
      return diagnostics;
    }

    return diagnostics.filter((diag) => {
      if (filters.domain && diag.domain !== filters.domain) {
        return false;
      }
      if (filters.severity && diag.severity !== filters.severity) {
        return false;
      }
      if (
        filters.patchRevision !== undefined &&
        diag.metadata.patchRevision !== filters.patchRevision
      ) {
        return false;
      }
      return true;
    });
  }
}
