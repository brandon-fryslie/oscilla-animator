/**
 * @file Selection Store
 * @description Manages selection state for blocks, buses, and ports.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md
 *
 * Supports multi-selection for blocks. Selection is used for deletion,
 * duplication, and bulk operations.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type { RootStore } from './RootStore';

/**
 * Port reference.
 */
export interface PortRef {
  blockId: string;
  portId: string;
}

/**
 * Selection discriminated union.
 * Note: 'bus' selection is removed - select BusBlocks as regular blocks instead.
 */
export type Selection =
  | { kind: 'none' }
  | { kind: 'block'; ids: string[] }
  | { kind: 'port'; ref: PortRef };

export class SelectionStore {
  root: RootStore;

  /**
   * Current selection state.
   */
  selection: Selection = { kind: 'none' };

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      selection: observable,
      kind: computed,
      selectedBlockIds: computed,
      selectedBusId: computed,
      selectedPortRef: computed,
      selectBlock: action,
      selectBlocks: action,
      toggleBlockSelection: action,
      selectBus: action,
      selectPort: action,
      clearSelection: action,
      isBlockSelected: action,
    });
  }

  // =============================================================================
  // Computed Values
  // =============================================================================

  get kind(): 'none' | 'block' | 'port' {
    return this.selection.kind;
  }

  get selectedBlockIds(): string[] {
    return this.selection.kind === 'block' ? this.selection.ids : [];
  }

  /**
   * Get the selected bus ID (if a BusBlock is selected).
   * Block ID = Bus ID in the unified architecture.
   */
  get selectedBusId(): string | null {
    // BusBlock selection - single block only (block ID = bus ID)
    if (this.selection.kind === 'block' && this.selection.ids.length === 1) {
      const blockId = this.selection.ids[0];
      const block = this.root.patchStore.blocks.find(b => b.id === blockId);
      if (block?.type === 'BusBlock') {
        return block.id; // Block ID is the bus ID
      }
    }

    return null;
  }

  get selectedPortRef(): PortRef | null {
    return this.selection.kind === 'port' ? this.selection.ref : null;
  }

  // =============================================================================
  // Actions - Selection
  // =============================================================================

  /**
   * Select a single block.
   * @param id - Block ID to select
   * @param additive - If true, add to existing selection (multi-select)
   */
  selectBlock(id: string, additive: boolean = false): void {
    if (additive && this.selection.kind === 'block') {
      // Add to existing selection
      const ids = this.selection.ids.includes(id)
        ? this.selection.ids
        : [...this.selection.ids, id];
      this.selection = { kind: 'block', ids };
    } else {
      // Replace selection
      this.selection = { kind: 'block', ids: [id] };
    }
  }

  /**
   * Select multiple blocks.
   * @param ids - Block IDs to select
   */
  selectBlocks(ids: string[]): void {
    if (ids.length === 0) {
      this.clearSelection();
    } else {
      this.selection = { kind: 'block', ids: [...ids] };
    }
  }

  /**
   * Toggle a block's selection state (for shift+click multi-select).
   * @param id - Block ID to toggle
   */
  toggleBlockSelection(id: string): void {
    if (this.selection.kind === 'block') {
      if (this.selection.ids.includes(id)) {
        // Remove from selection
        const ids = this.selection.ids.filter(bid => bid !== id);
        if (ids.length === 0) {
          this.clearSelection();
        } else {
          this.selection = { kind: 'block', ids };
        }
      } else {
        // Add to selection
        this.selection = { kind: 'block', ids: [...this.selection.ids, id] };
      }
    } else {
      // Start new selection
      this.selection = { kind: 'block', ids: [id] };
    }
  }

  /**
   * Select a bus (selects its BusBlock).
   * @param id - Bus ID to select (block ID = bus ID)
   */
  selectBus(id: string): void {
    // In the unified architecture, selecting a bus means selecting its BusBlock
    this.selection = { kind: 'block', ids: [id] };
  }

  /**
   * Select a port.
   * @param ref - Port reference to select
   */
  selectPort(ref: PortRef): void {
    this.selection = { kind: 'port', ref };
  }

  /**
   * Clear selection.
   */
  clearSelection(): void {
    this.selection = { kind: 'none' };
  }

  /**
   * Check if a block is selected.
   * @param id - Block ID to check
   */
  isBlockSelected(id: string): boolean {
    return this.selection.kind === 'block' && this.selection.ids.includes(id);
  }
}
