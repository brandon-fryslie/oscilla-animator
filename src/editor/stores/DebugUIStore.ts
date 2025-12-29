/**
 * Debug UI Store
 *
 * Manages state for the debug UI system:
 * - Debug Drawer (open/closed, active tab)
 * - Probe Mode (active, target, cursor position)
 * - Health snapshot caching for UI
 *
 * This store is the single source of truth for all debug UI state.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { RootStore } from './RootStore';
import type { RuntimeHealthSnapshotEvent } from '../events/types';

/**
 * Probe target types
 */
export type ProbeTarget =
  | { type: 'bus'; busId: string }
  | { type: 'block'; blockId: string }
  | null;

/**
 * Debug drawer tab IDs
 */
export type DebugDrawerTab = 'overview' | 'buses' | 'ir' | 'schedule';

/**
 * Cursor position for probe card
 */
export interface CursorPosition {
  x: number;
  y: number;
}

/**
 * DebugUIStore - State management for debug UI
 *
 * Responsibilities:
 * - Drawer open/closed state and active tab
 * - Probe mode activation and target tracking
 * - Latest health snapshot caching
 * - Cursor position tracking for probe card
 */
export class DebugUIStore {
  /** Drawer open/closed state */
  isDrawerOpen = false;

  /** Active tab in the drawer */
  activeTab: DebugDrawerTab = 'overview';

  /** Probe mode active/inactive */
  probeMode = false;

  /** Current probe target (bus or block being hovered) */
  probeTarget: ProbeTarget = null;

  /** Cursor position for probe card positioning */
  cursorPosition: CursorPosition = { x: 0, y: 0 };

  /** Latest health snapshot from runtime */
  latestHealthSnapshot: RuntimeHealthSnapshotEvent | null = null;

  /** Time model kind from compiled IR program */
  timeModelKind: 'finite' | 'cyclic' | 'infinite' = 'infinite';

  /** Reference to root store */
  private readonly root: RootStore;

  /** Probe card dismiss timer */
  private probeCardDismissTimer: number | null = null;

  /** Mousemove throttle timer */
  private mouseMoveThrottleTimer: number | null = null;

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      isDrawerOpen: observable,
      activeTab: observable,
      probeMode: observable,
      probeTarget: observable,
      cursorPosition: observable,
      latestHealthSnapshot: observable,
      timeModelKind: observable,

      // Actions
      openDrawer: action,
      closeDrawer: action,
      setActiveTab: action,
      toggleProbeMode: action,
      setProbeTarget: action,
      updateCursorPosition: action,
      updateHealthSnapshot: action,

      // Computed
      healthStatus: computed,
      stabilityStatus: computed,
    });

    // Subscribe to RuntimeHealthSnapshot events
    this.setupEventListeners();
  }

  // =============================================================================
  // Drawer Actions
  // =============================================================================

  /**
   * Open the debug drawer with optional tab selection.
   */
  openDrawer(tab?: DebugDrawerTab): void {
    this.isDrawerOpen = true;
    if (tab !== undefined) {
      this.activeTab = tab;
    }
  }

  /**
   * Close the debug drawer.
   */
  closeDrawer(): void {
    this.isDrawerOpen = false;
  }

  /**
   * Set the active tab.
   */
  setActiveTab(tab: DebugDrawerTab): void {
    this.activeTab = tab;
  }

  // =============================================================================
  // Probe Mode Actions
  // =============================================================================

  /**
   * Toggle probe mode on/off.
   */
  toggleProbeMode(): void {
    this.probeMode = !this.probeMode;
    if (!this.probeMode) {
      // Clear probe target when disabling probe mode
      this.probeTarget = null;
      this.clearProbeCardDismissTimer();
    }
  }

  /**
   * Set the current probe target (with optional delay for dismiss).
   */
  setProbeTarget(target: ProbeTarget, delay = 0): void {
    // Clear any existing dismiss timer
    this.clearProbeCardDismissTimer();

    if (delay > 0 && target === null) {
      // Delay clearing the target (allows cursor to move to probe card)
      this.probeCardDismissTimer = window.setTimeout(() => {
        this.probeTarget = null;
      }, delay);
    } else {
      this.probeTarget = target;
    }
  }

  /**
   * Update cursor position (throttled to 60Hz).
   */
  updateCursorPosition(x: number, y: number): void {
    // Throttle to ~60Hz (16ms)
    if (this.mouseMoveThrottleTimer !== null) {
      return;
    }

    this.cursorPosition = { x, y };

    this.mouseMoveThrottleTimer = window.setTimeout(() => {
      this.mouseMoveThrottleTimer = null;
    }, 16);
  }

  // =============================================================================
  // Health Snapshot
  // =============================================================================

  /**
   * Update the latest health snapshot (called by event listener).
   */
  updateHealthSnapshot(snapshot: RuntimeHealthSnapshotEvent): void {
    this.latestHealthSnapshot = snapshot;
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  /**
   * Health status based on NaN/Inf counts.
   * - green (ok): 0 NaN/Inf
   * - yellow (warning): 1-10 NaN/Inf
   * - red (error): >10 NaN/Inf
   */
  get healthStatus(): 'ok' | 'warning' | 'error' {
    if (this.latestHealthSnapshot === null) return 'ok';

    const { nanCount, infCount } = this.latestHealthSnapshot.evalStats;
    const totalBadValues = nanCount + infCount;

    if (totalBadValues === 0) return 'ok';
    if (totalBadValues <= 10) return 'warning';
    return 'error';
  }

  /**
   * Stability status based on FPS variance.
   * - stable (green): FPS variance <10fps
   * - unstable (yellow): FPS variance >=10fps
   */
  get stabilityStatus(): 'stable' | 'unstable' {
    // For now, return stable - full implementation requires tracking FPS history
    // TODO: Implement FPS variance tracking
    return 'stable';
  }

  // =============================================================================
  // Event Listeners
  // =============================================================================

  /**
   * Subscribe to RuntimeHealthSnapshot events from EventDispatcher.
   */
  private setupEventListeners(): void {
    this.root.events.on('RuntimeHealthSnapshot', (event) => {
      this.updateHealthSnapshot(event);
    });
  }

  /**
   * Clear probe card dismiss timer.
   */
  private clearProbeCardDismissTimer(): void {
    if (this.probeCardDismissTimer !== null) {
      clearTimeout(this.probeCardDismissTimer);
      this.probeCardDismissTimer = null;
    }
  }

  /**
   * Cleanup timers on destroy.
   */
  destroy(): void {
    this.clearProbeCardDismissTimer();
    if (this.mouseMoveThrottleTimer !== null) {
      clearTimeout(this.mouseMoveThrottleTimer);
      this.mouseMoveThrottleTimer = null;
    }
  }
}
