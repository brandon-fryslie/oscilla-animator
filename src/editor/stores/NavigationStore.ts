/**
 * @file Navigation Store
 * @description Manages navigation between Root View and Graph View.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md
 *
 * Navigation is explicit and does not derive from selection state.
 * Two levels only: Root View (graph cards) and Graph View (editing surface).
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { RootStore } from './RootStore';

/**
 * Navigation state discriminated union.
 * Exactly two levels: root (graph overview) or graph (editing).
 */
export type NavState =
  | { level: 'root' }
  | { level: 'graph'; graphId: string; breadcrumb: string[] };

export class NavigationStore {
  root: RootStore;

  /**
   * Current navigation state.
   * Starts at root level.
   */
  navState: NavState = { level: 'root' };

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      navState: observable,
      currentLevel: computed,
      currentGraphId: computed,
      breadcrumb: computed,
      enterGraph: action,
      exitToRoot: action,
      renameGraph: action,
    });
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  /** Current navigation level */
  get currentLevel(): 'root' | 'graph' {
    return this.navState.level;
  }

  /** Current graph ID (null when at root) */
  get currentGraphId(): string | null {
    return this.navState.level === 'graph' ? this.navState.graphId : null;
  }

  /** Current breadcrumb path (empty at root) */
  get breadcrumb(): string[] {
    return this.navState.level === 'graph' ? this.navState.breadcrumb : [];
  }

  // =============================================================================
  // Actions
  // =============================================================================

  /**
   * Navigate into a graph for editing.
   * Sets breadcrumb to ["Patch", graphName].
   */
  enterGraph(graphId: string, graphName: string = 'Graph'): void {
    this.navState = {
      level: 'graph',
      graphId,
      breadcrumb: ['Patch', graphName],
    };
  }

  /**
   * Navigate back to root view (graph overview).
   */
  exitToRoot(): void {
    this.navState = { level: 'root' };
  }

  /**
   * Rename the current graph in the breadcrumb.
   * Only valid when at graph level.
   */
  renameGraph(newName: string): void {
    if (this.navState.level === 'graph') {
      this.navState = {
        ...this.navState,
        breadcrumb: ['Patch', newName],
      };
    }
  }
}
