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
import type { RuntimeHealthSnapshotEvent } from '../events/types';
import type { Diagnostic, Domain, Severity } from './types';
import { createDiagnostic } from './types';
import type { PatchStore } from '../stores/PatchStore';
import { Validator } from '../semantic';
import { storeToPatchDocument } from '../semantic/patchAdapter';

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
  /** Include muted diagnostics (default: false) */
  includeMuted?: boolean;
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

  /** Runtime diagnostics with expiry timestamps */
  private runtimeDiagnostics = new Map<string, { diagnostic: Diagnostic; lastSeenAt: number }>();

  /** Set of muted diagnostic IDs */
  private mutedIds = new Set<string>();

  /** Which patchRevision is currently active in the runtime */
  private activeRevision: number = 0;

  /** Which patchRevision is currently being compiled (null if none) */
  private pendingCompileRevision: number | null = null;

  /** Unsubscribe functions for event listeners */
  private unsubscribers: (() => void)[] = [];

  /** Reference to PatchStore for authoring validation */
  private readonly patchStore: PatchStore;

  /** Runtime diagnostics expiry time in milliseconds (5 seconds) */
  private static readonly RUNTIME_EXPIRY_MS = 5000;

  constructor(events: EventDispatcher, patchStore: PatchStore) {
    this.patchStore = patchStore;

    // Subscribe to lifecycle events
    this.unsubscribers.push(
      events.on('GraphCommitted', (event) => this.handleGraphCommitted(event)),
      events.on('CompileStarted', (event) => this.handleCompileStarted(event)),
      events.on('CompileFinished', (event) => this.handleCompileFinished(event)),
      events.on('ProgramSwapped', (event) => this.handleProgramSwapped(event)),
      events.on('RuntimeHealthSnapshot', (event) => this.handleRuntimeHealthSnapshot(event))
    );

    // Run initial authoring validation immediately
    // This ensures diagnostics are available even before any events are emitted
    this.authoringSnapshot = this.runAuthoringValidators(0);
  }

  /**
   * Clean up event subscriptions and clear all diagnostic state.
   */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.authoringSnapshot = [];
    this.compileSnapshots.clear();
    this.runtimeDiagnostics.clear();
    this.mutedIds.clear();
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private handleGraphCommitted(event: { readonly patchRevision: number }): void {
    // Run authoring validators on the current graph state
    this.authoringSnapshot = this.runAuthoringValidators(event.patchRevision);
  }

  private handleCompileStarted(event: { readonly patchRevision: number }): void {
    // Mark this revision as pending compilation
    this.pendingCompileRevision = event.patchRevision;
  }

  private handleCompileFinished(event: {
    readonly patchRevision: number;
    readonly diagnostics: Diagnostic[];
  }): void {
    // Replace compile snapshot for this revision completely
    this.compileSnapshots.set(event.patchRevision, event.diagnostics);

    // Clear pending state if this was the pending revision
    if (this.pendingCompileRevision === event.patchRevision) {
      this.pendingCompileRevision = null;
    }
  }

  private handleProgramSwapped(event: { readonly patchRevision: number }): void {
    // Update active revision pointer
    this.activeRevision = event.patchRevision;
  }

  private handleRuntimeHealthSnapshot(event: RuntimeHealthSnapshotEvent): void {
    const now = Date.now();
    const patchRevision = event.activePatchRevision;

    // Expire old runtime diagnostics (not seen for RUNTIME_EXPIRY_MS)
    for (const [id, entry] of this.runtimeDiagnostics) {
      if (now - entry.lastSeenAt > DiagnosticHub.RUNTIME_EXPIRY_MS) {
        this.runtimeDiagnostics.delete(id);
      }
    }

    // Create diagnostics from runtime health data
    const { evalStats, frameBudget } = event;

    // P_NAN_DETECTED: NaN values detected in evaluation
    if (evalStats.nanCount > 0) {
      const diagId = `P_NAN_DETECTED:runtime:${patchRevision}`;
      const existing = this.runtimeDiagnostics.get(diagId);
      if (existing !== undefined) {
        existing.lastSeenAt = now;
        existing.diagnostic.metadata.lastSeenAt = now;
        existing.diagnostic.metadata.occurrenceCount++;
      } else {
        this.runtimeDiagnostics.set(diagId, {
          lastSeenAt: now,
          diagnostic: createDiagnostic({
            code: 'P_NAN_DETECTED',
            severity: 'warn',
            domain: 'runtime',
            primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
            title: 'NaN values detected',
            message: `${evalStats.nanCount} NaN value(s) detected during evaluation. This may cause rendering issues.`,
            patchRevision,
            signature: diagId,
          }),
        });
      }
    }

    // P_INFINITY_DETECTED: Infinity values detected
    if (evalStats.infCount > 0) {
      const diagId = `P_INFINITY_DETECTED:runtime:${patchRevision}`;
      const existing = this.runtimeDiagnostics.get(diagId);
      if (existing !== undefined) {
        existing.lastSeenAt = now;
        existing.diagnostic.metadata.lastSeenAt = now;
        existing.diagnostic.metadata.occurrenceCount++;
      } else {
        this.runtimeDiagnostics.set(diagId, {
          lastSeenAt: now,
          diagnostic: createDiagnostic({
            code: 'P_INFINITY_DETECTED',
            severity: 'warn',
            domain: 'runtime',
            primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
            title: 'Infinity values detected',
            message: `${evalStats.infCount} Infinity value(s) detected during evaluation. This may cause rendering issues.`,
            patchRevision,
            signature: diagId,
          }),
        });
      }
    }

    // P_FRAME_BUDGET_EXCEEDED: Frame time exceeds 60fps budget (16.67ms)
    if (frameBudget.avgFrameMs > 16.67) {
      const diagId = `P_FRAME_BUDGET_EXCEEDED:runtime:${patchRevision}`;
      const existing = this.runtimeDiagnostics.get(diagId);
      if (existing !== undefined) {
        existing.lastSeenAt = now;
        existing.diagnostic.metadata.lastSeenAt = now;
        existing.diagnostic.metadata.occurrenceCount++;
        // Update message with latest stats
        existing.diagnostic.message = `Average frame time ${frameBudget.avgFrameMs.toFixed(1)}ms exceeds 60fps budget (16.67ms). FPS: ~${frameBudget.fpsEstimate.toFixed(0)}`;
      } else {
        this.runtimeDiagnostics.set(diagId, {
          lastSeenAt: now,
          diagnostic: createDiagnostic({
            code: 'P_FRAME_BUDGET_EXCEEDED',
            severity: 'warn',
            domain: 'perf',
            primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
            title: 'Frame budget exceeded',
            message: `Average frame time ${frameBudget.avgFrameMs.toFixed(1)}ms exceeds 60fps budget (16.67ms). FPS: ~${frameBudget.fpsEstimate.toFixed(0)}`,
            patchRevision,
            payload: {
              kind: 'perf',
              metric: 'avgFrameMs',
              value: frameBudget.avgFrameMs,
              threshold: 16.67,
            },
            signature: diagId,
          }),
        });
      }
    }
  }

  // ===========================================================================
  // Mute/Unmute Methods
  // ===========================================================================

  /**
   * Mute a diagnostic by ID. Muted diagnostics are excluded from query results
   * unless explicitly requested with includeMuted filter.
   *
   * @param diagnosticId - The ID of the diagnostic to mute
   */
  muteDiagnostic(diagnosticId: string): void {
    this.mutedIds.add(diagnosticId);
  }

  /**
   * Unmute a previously muted diagnostic.
   *
   * @param diagnosticId - The ID of the diagnostic to unmute
   */
  unmuteDiagnostic(diagnosticId: string): void {
    this.mutedIds.delete(diagnosticId);
  }

  /**
   * Check if a diagnostic is muted.
   *
   * @param diagnosticId - The ID of the diagnostic to check
   * @returns True if the diagnostic is muted
   */
  isMuted(diagnosticId: string): boolean {
    return this.mutedIds.has(diagnosticId);
  }

  /**
   * Get the count of muted diagnostics.
   *
   * @returns Number of muted diagnostic IDs
   */
  getMutedCount(): number {
    return this.mutedIds.size;
  }

  /**
   * Clear all muted diagnostics.
   */
  clearMuted(): void {
    this.mutedIds.clear();
  }

  // ===========================================================================
  // Authoring Validators
  // ===========================================================================

  /**
   * Run authoring validators against the current graph state.
   *
   * Uses the Semantic Validator as the single source of truth for all validation rules.
   * This ensures UI authoring feedback matches compiler validation exactly.
   *
   * Validators include:
   * - TimeRoot constraints (exactly one required)
   * - Unique writers (no multiple connections to same input)
   * - Type compatibility on all connections
   * - No cycles in the graph
   * - All connection endpoints exist
   * - Empty bus warnings
   *
   * @param patchRevision - The revision to attach to diagnostics
   * @returns Array of authoring diagnostics (errors and warnings)
   */
  private runAuthoringValidators(patchRevision: number): Diagnostic[] {
    // Check if root is available (may not be in tests with minimal mocks)
    if (this.patchStore.root === undefined || this.patchStore.root === null) {
      return [
        createDiagnostic({
          code: 'E_VALIDATION_FAILED',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
          title: 'Validation Error',
          message: 'Patch root is unavailable for validation.',
          patchRevision,
        }),
      ];
    }

    try {
      const patchDoc = storeToPatchDocument(this.patchStore.root);
      const validator = new Validator(patchDoc, patchRevision);
      const result = validator.validateAll(patchDoc);

      // Return only errors for authoring diagnostics (fast feedback for blocking issues)
      // Warnings like empty buses are better suited for compile diagnostics
      // Transform domain to 'authoring' since Validator produces 'compile' by default
      return result.errors.map((diag) => ({
        ...diag,
        domain: 'authoring' as const,
      }));
    } catch (error) {
      // If validation fails catastrophically, return a single error diagnostic
      console.error('[DiagnosticHub] Validation failed catastrophically:', error);
      return [
        createDiagnostic({
          code: 'E_VALIDATION_FAILED',
          severity: 'error',
          domain: 'authoring',
          primaryTarget: { kind: 'graphSpan', blockIds: [], spanKind: 'subgraph' },
          title: 'Validation Error',
          message: `Failed to validate patch: ${error instanceof Error ? error.message : String(error)}`,
          patchRevision,
        }),
      ];
    }
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Get all diagnostics, optionally filtered.
   *
   * @param filters - Optional filters (domain, severity, patchRevision, includeMuted)
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
      if (compileDiags !== undefined) {
        allDiagnostics.push(...compileDiags);
      }
    } else {
      // Get diagnostics from all revisions
      for (const diagnostics of this.compileSnapshots.values()) {
        allDiagnostics.push(...diagnostics);
      }
    }

    // Collect runtime diagnostics
    for (const entry of this.runtimeDiagnostics.values()) {
      allDiagnostics.push(entry.diagnostic);
    }

    // Apply filters (including muted filtering)
    return this.applyFilters(allDiagnostics, filters);
  }

  /**
   * Get diagnostics for a specific patch revision.
   * Excludes muted diagnostics by default.
   *
   * Note: Authoring diagnostics are ALWAYS included regardless of revision,
   * because they represent the current graph state, not a historical snapshot.
   *
   * @param patchRevision - The revision to query
   * @param includeMuted - Whether to include muted diagnostics (default: false)
   * @returns Array of diagnostics for that revision
   */
  getByRevision(patchRevision: number, includeMuted = false): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Authoring diagnostics are always current - include all regardless of revision
    diagnostics.push(...this.authoringSnapshot);

    // Add compile diagnostics for this revision
    const compileDiags = this.compileSnapshots.get(patchRevision);
    if (compileDiags !== undefined) {
      diagnostics.push(...compileDiags);
    }

    // Add runtime diagnostics for this revision
    for (const entry of this.runtimeDiagnostics.values()) {
      if (entry.diagnostic.metadata.patchRevision === patchRevision) {
        diagnostics.push(entry.diagnostic);
      }
    }

    // Filter out muted diagnostics unless includeMuted is true
    if (includeMuted !== true) {
      return diagnostics.filter((d) => !this.mutedIds.has(d.id));
    }

    return diagnostics;
  }

  /**
   * Get diagnostics for the currently active revision (running in player).
   * Excludes muted diagnostics by default.
   *
   * @param includeMuted - Whether to include muted diagnostics (default: false)
   * @returns Array of diagnostics for the active revision
   */
  getActive(includeMuted = false): Diagnostic[] {
    return this.getByRevision(this.activeRevision, includeMuted);
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
    return snapshot !== undefined ? [...snapshot] : undefined;
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
    diagnostics: readonly Diagnostic[],
    filters?: DiagnosticFilter
  ): Diagnostic[] {
    if (filters === undefined) {
      // Default: exclude muted diagnostics
      return diagnostics.filter((diag) => !this.mutedIds.has(diag.id));
    }

    return diagnostics.filter((diag) => {
      // Filter muted unless includeMuted is true
      if (filters.includeMuted !== true && this.mutedIds.has(diag.id)) {
        return false;
      }
      if (filters.domain !== undefined && diag.domain !== filters.domain) {
        return false;
      }
      if (filters.severity !== undefined && diag.severity !== filters.severity) {
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

  /**
   * Get runtime diagnostics (for testing/debugging).
   *
   * @returns Array of current runtime diagnostics
   */
  getRuntimeDiagnostics(): Diagnostic[] {
    return Array.from(this.runtimeDiagnostics.values()).map((e) => e.diagnostic);
  }

  /**
   * Expire runtime diagnostics that haven't been seen recently.
   * This is called automatically during RuntimeHealthSnapshot handling,
   * but can also be called manually for testing.
   *
   * @param now - Current timestamp (default: Date.now())
   */
  expireRuntimeDiagnostics(now: number = Date.now()): void {
    for (const [id, entry] of this.runtimeDiagnostics) {
      if (now - entry.lastSeenAt > DiagnosticHub.RUNTIME_EXPIRY_MS) {
        this.runtimeDiagnostics.delete(id);
      }
    }
  }
}
