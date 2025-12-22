/**
 * Modulation Table Store
 *
 * Derives table representation from PatchStore and BusStore.
 * The table is a projection - not a separate data store.
 *
 * Key constraint: At most one listener per input port.
 * This keeps the grid usable (a row can only be bound to one bus).
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { RootStore } from '../stores/RootStore';
import { SLOT_TYPE_TO_TYPE_DESC, portRefToKey } from '../types';
import type { TypeDesc, Slot, Listener, LensDefinition, PortKey } from '../types';
import { getBlockDefinition } from '../blocks/registry';
import type { BlockDefinition } from '../blocks/types';
import {
  type TableRow,
  type TableColumn,
  type TableCell,
  type RowGroup,
  type TableViewState,
  type PatchIndex,
  type RowKey,
  type GroupKey,
  type CellStatus,
  createRowKey,
  createGroupKey,
  createDefaultViewState,
  parseRowKey,
} from './types';

/**
 * Store for modulation table state.
 * Manages view state and derives table structure from patch.
 */
export class ModulationTableStore {
  /** Root store reference */
  private readonly root: RootStore;

  /** Current view state */
  viewState: TableViewState;

  constructor(root: RootStore) {
    this.root = root;
    this.viewState = createDefaultViewState('default');

    makeObservable(this, {
      viewState: observable,
      rows: computed,
      rowGroups: computed,
      columns: computed,
      cells: computed,
      patchIndex: computed,
      visibleRows: computed,
      visibleColumns: computed,
      setFocusedCell: action,
      setFocusedBlock: action,
      setFocusedBus: action,
      toggleGroupCollapse: action,
      toggleBusPin: action,
      toggleBusHide: action,
    });
  }

  // =============================================================================
  // Computed: Patch Index (for O(1) lookups)
  // =============================================================================

  /**
   * Build indexes for fast lookups.
   */
  get patchIndex(): PatchIndex {
    const listenersByInputPort = new Map<PortKey, string>();
    const publishersByBus = new Map<string, string[]>();
    const listenersByBus = new Map<string, string[]>();
    const portsByBlock = new Map<string, { inputs: string[]; outputs: string[] }>();

    // Index listeners by input port
    for (const listener of this.root.busStore.listeners) {
      const key = portRefToKey({ ...listener.to, direction: 'input' });
      listenersByInputPort.set(key, listener.id);

      // Also index by bus
      const busListeners = listenersByBus.get(listener.busId) ?? [];
      busListeners.push(listener.id);
      listenersByBus.set(listener.busId, busListeners);
    }

    // Index publishers by bus
    for (const publisher of this.root.busStore.publishers) {
      const busPublishers = publishersByBus.get(publisher.busId) ?? [];
      busPublishers.push(publisher.id);
      publishersByBus.set(publisher.busId, busPublishers);
    }

    // Index ports by block
    for (const block of this.root.patchStore.blocks) {
      const blockDef = getBlockDefinition(block.type);
      if (blockDef) {
        portsByBlock.set(block.id, {
          inputs: blockDef.inputs.map((s) => s.id),
          outputs: blockDef.outputs.map((s) => s.id),
        });
      }
    }

    return {
      listenersByInputPort,
      publishersByBus: new Map([...publishersByBus].map(([k, v]) => [k, v as readonly string[]])),
      listenersByBus: new Map([...listenersByBus].map(([k, v]) => [k, v as readonly string[]])),
      portsByBlock: new Map(
        [...portsByBlock].map(([k, v]) => [
          k,
          { inputs: v.inputs as readonly string[], outputs: v.outputs as readonly string[] },
        ])
      ),
    };
  }

  // =============================================================================
  // Computed: Rows (from blocks + input ports)
  // =============================================================================

  /**
   * Derive rows from all blocks' input ports.
   * Each input port becomes a row.
   */
  get rows(): readonly TableRow[] {
    const rows: TableRow[] = [];

    for (const block of this.root.patchStore.blocks) {
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) continue;

      // Determine which inputs should become rows
      // For now: all inputs from renderer/domain blocks
      // TODO: Use BlockUiContract.tableRows when available
      const shouldShowRows = this.shouldBlockShowRows(blockDef);
      if (!shouldShowRows) continue;

      for (const input of blockDef.inputs) {
        const typeDesc = this.slotToTypeDesc(input);
        if (!typeDesc) continue;

        // Only show bus-eligible inputs as rows
        if (!typeDesc.busEligible) continue;

        const rowKey = createRowKey(block.id, input.id);
        const groupKey = createGroupKey(blockDef.subcategory, block.id);

        rows.push({
          key: rowKey,
          label: input.label,
          groupKey,
          blockId: block.id,
          portId: input.id,
          type: typeDesc,
          semantics: typeDesc.semantics,
          defaultValueSource: 'blockParam',
        });
      }
    }

    return rows;
  }

  /**
   * Group rows by block.
   */
  get rowGroups(): readonly RowGroup[] {
    const groupMap = new Map<GroupKey, RowGroup>();

    for (const row of this.rows) {
      let group = groupMap.get(row.groupKey);

      if (!group) {
        const block = this.root.patchStore.blocks.find((b) => b.id === row.blockId);
        const blockDef = block ? getBlockDefinition(block.type) : undefined;

        if (!block || !blockDef) continue;

        group = {
          key: row.groupKey,
          label: `${blockDef.subcategory}: ${block.label}`,
          blockId: row.blockId,
          blockDef,
          rowKeys: [],
          collapsed: this.viewState.collapsedGroups[row.groupKey] ?? false,
        };
        groupMap.set(row.groupKey, group);
      }

      // Add row key to group (need to mutate since we're building)
      (group.rowKeys as string[]).push(row.key);
    }

    // Sort groups: Render first, then others
    return [...groupMap.values()].sort((a, b) => {
      const aRender = a.blockDef.subcategory === 'Render' ? 0 : 1;
      const bRender = b.blockDef.subcategory === 'Render' ? 0 : 1;
      if (aRender !== bRender) return aRender - bRender;
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Visible rows after filtering.
   */
  get visibleRows(): readonly TableRow[] {
    const { rowFilter, collapsedGroups, hiddenRowKeys } = this.viewState;
    let rows = this.rows;

    // Filter out hidden rows
    rows = rows.filter((r) => !hiddenRowKeys[r.key]);

    // Filter out collapsed groups
    rows = rows.filter((r) => !collapsedGroups[r.groupKey]);

    // Apply text filter
    if (rowFilter.text) {
      const text = rowFilter.text.toLowerCase();
      rows = rows.filter((r) => r.label.toLowerCase().includes(text));
    }

    // Apply block type filter
    if (rowFilter.blockTypes && rowFilter.blockTypes.length > 0) {
      const types = new Set(rowFilter.blockTypes);
      rows = rows.filter((r) => {
        const block = this.root.patchStore.blocks.find((b) => b.id === r.blockId);
        return block && types.has(block.type);
      });
    }

    // Apply bound-only filter
    if (rowFilter.boundOnly) {
      const index = this.patchIndex;
      rows = rows.filter((r) => {
        const portKey = portRefToKey({ blockId: r.blockId, slotId: r.portId, direction: 'input' });
        return index.listenersByInputPort.has(portKey);
      });
    }

    return rows;
  }

  // =============================================================================
  // Computed: Columns (from buses)
  // =============================================================================

  /**
   * Derive columns from all buses.
   */
  get columns(): readonly TableColumn[] {
    const index = this.patchIndex;

    return this.root.busStore.buses.map((bus) => {
      const publisherIds = index.publishersByBus.get(bus.id) ?? [];
      const listenerIds = index.listenersByBus.get(bus.id) ?? [];

      // Calculate activity based on listener count (normalized)
      const maxListeners = Math.max(1, ...this.root.busStore.buses.map(
        (b) => (index.listenersByBus.get(b.id) ?? []).length
      ));
      const activity = listenerIds.length / maxListeners;

      return {
        busId: bus.id,
        name: bus.name,
        type: bus.type,
        combineMode: bus.combineMode,
        enabled: true, // TODO: Add bus enabled state
        publisherCount: publisherIds.length,
        listenerCount: listenerIds.length,
        activity,
      };
    });
  }

  /**
   * Visible columns after filtering.
   */
  get visibleColumns(): readonly TableColumn[] {
    const { colFilter, pinnedBusIds, hiddenBusIds, showOnlyCompatibleColumnsForFocusedRow } = this.viewState;
    let columns = this.columns;

    // Filter out hidden columns
    columns = columns.filter((c) => !hiddenBusIds.includes(c.busId));

    // Apply text filter
    if (colFilter.text) {
      const text = colFilter.text.toLowerCase();
      columns = columns.filter((c) => c.name.toLowerCase().includes(text));
    }

    // Apply domain filter
    if (colFilter.domains && colFilter.domains.length > 0) {
      const domains = new Set(colFilter.domains);
      columns = columns.filter((c) => domains.has(c.type.domain));
    }

    // Apply active-only filter
    if (colFilter.activeOnly) {
      columns = columns.filter((c) => c.listenerCount > 0);
    }

    // Apply compatibility filter for focused row
    if (showOnlyCompatibleColumnsForFocusedRow && this.viewState.focusedCell) {
      const row = this.rows.find((r) => r.key === this.viewState.focusedCell?.rowKey);
      if (row) {
        columns = columns.filter((c) => this.isTypeCompatible(c.type, row.type));
      }
    }

    // Sort: pinned first, then by sort mode
    const pinned = new Set(pinnedBusIds);
    columns = [...columns].sort((a, b) => {
      const aPinned = pinned.has(a.busId) ? 0 : 1;
      const bPinned = pinned.has(b.busId) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;

      switch (this.viewState.busSort) {
        case 'alpha':
          return a.name.localeCompare(b.name);
        case 'activity':
          return b.activity - a.activity;
        case 'type':
          return `${a.type.world}:${a.type.domain}`.localeCompare(`${b.type.world}:${b.type.domain}`);
        default:
          return 0;
      }
    });

    return columns;
  }

  // =============================================================================
  // Computed: Cells (from listeners)
  // =============================================================================

  /**
   * Derive cells from row-column intersections.
   * A cell is bound if there's a listener from that port to that bus.
   */
  get cells(): readonly TableCell[] {
    const cells: TableCell[] = [];
    const index = this.patchIndex;

    for (const row of this.rows) {
      const portKey = portRefToKey({ blockId: row.blockId, slotId: row.portId, direction: 'input' });
      const listenerId = index.listenersByInputPort.get(portKey);

      for (const column of this.columns) {
        const listener = listenerId
          ? this.root.busStore.listeners.find((l) => l.id === listenerId && l.busId === column.busId)
          : undefined;

        const status = this.getCellStatus(row, column, listener);

        cells.push({
          rowKey: row.key,
          busId: column.busId,
          listenerId: listener?.id,
          enabled: listener?.enabled,
          lensChain: listener?.lensStack ?? (listener?.lens ? [listener.lens] : undefined),
          status,
          suggestedChain: status === 'convertible' ? this.getSuggestedChain(row, column) : undefined,
          costClass: status === 'convertible' ? this.getCostClass(row, column) : undefined,
        });
      }
    }

    return cells;
  }

  /**
   * Get cell for a specific row-column intersection.
   */
  getCell(rowKey: RowKey, busId: string): TableCell | undefined {
    return this.cells.find((c) => c.rowKey === rowKey && c.busId === busId);
  }

  // =============================================================================
  // Actions: View State
  // =============================================================================

  /**
   * Set focused cell.
   */
  setFocusedCell(rowKey: RowKey | undefined, busId: string | undefined): void {
    if (rowKey && busId) {
      this.viewState.focusedCell = { rowKey, busId };

      // Also focus the block
      const parsed = parseRowKey(rowKey);
      if (parsed) {
        this.viewState.focusedBlockId = parsed.blockId;
      }
      this.viewState.focusedBusId = busId;
    } else {
      this.viewState.focusedCell = undefined;
    }
  }

  /**
   * Set focused block.
   */
  setFocusedBlock(blockId: string | undefined): void {
    this.viewState.focusedBlockId = blockId;
    if (blockId) {
      this.root.uiStore.selectBlock(blockId);
    }
  }

  /**
   * Set focused bus.
   */
  setFocusedBus(busId: string | undefined): void {
    this.viewState.focusedBusId = busId;
  }

  /**
   * Toggle group collapse state.
   */
  toggleGroupCollapse(groupKey: GroupKey): void {
    this.viewState.collapsedGroups[groupKey] = !this.viewState.collapsedGroups[groupKey];
  }

  /**
   * Toggle bus pinned state.
   */
  toggleBusPin(busId: string): void {
    const idx = this.viewState.pinnedBusIds.indexOf(busId);
    if (idx >= 0) {
      this.viewState.pinnedBusIds.splice(idx, 1);
    } else {
      this.viewState.pinnedBusIds.push(busId);
    }
  }

  /**
   * Toggle bus hidden state.
   */
  toggleBusHide(busId: string): void {
    const idx = this.viewState.hiddenBusIds.indexOf(busId);
    if (idx >= 0) {
      this.viewState.hiddenBusIds.splice(idx, 1);
    } else {
      this.viewState.hiddenBusIds.push(busId);
    }
  }

  // =============================================================================
  // Actions: Cell Binding
  // =============================================================================

  /**
   * Bind a cell (create listener from port to bus).
   */
  bindCell(rowKey: RowKey, busId: string, lensChain?: LensDefinition[]): void {
    const parsed = parseRowKey(rowKey);
    if (!parsed) {
      throw new Error(`Invalid row key: ${rowKey}`);
    }

    const { blockId, portId } = parsed;

    // Check if there's already a listener for this port
    const portKey = portRefToKey({ blockId, slotId: portId, direction: 'input' });
    const existingListenerId = this.patchIndex.listenersByInputPort.get(portKey);

    // If exists, remove it first (one listener per port constraint)
    if (existingListenerId) {
      this.root.busStore.removeListener(existingListenerId);
    }

    // Create new listener
    this.root.busStore.addListener(busId, blockId, portId, undefined, lensChain);
  }

  /**
   * Unbind a cell (remove listener).
   */
  unbindCell(rowKey: RowKey): void {
    const parsed = parseRowKey(rowKey);
    if (!parsed) return;

    const portKey = portRefToKey({ blockId: parsed.blockId, slotId: parsed.portId, direction: 'input' });
    const listenerId = this.patchIndex.listenersByInputPort.get(portKey);

    if (listenerId) {
      this.root.busStore.removeListener(listenerId);
    }
  }

  /**
   * Update cell lens chain.
   */
  updateCellLenses(rowKey: RowKey, lensChain: LensDefinition[] | undefined): void {
    const parsed = parseRowKey(rowKey);
    if (!parsed) return;

    const portKey = portRefToKey({ blockId: parsed.blockId, slotId: parsed.portId, direction: 'input' });
    const listenerId = this.patchIndex.listenersByInputPort.get(portKey);

    if (listenerId) {
      this.root.busStore.updateListener(listenerId, { lensStack: lensChain });
    }
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Determine if a block should show rows in the table.
   * Per spec: renderers, domains, cameras show rows; sources, operators don't.
   */
  private shouldBlockShowRows(blockDef: BlockDefinition): boolean {
    // Show rows for render/domain/camera blocks
    const showCategories = ['Render', 'Scene', 'Derivers'];
    if (showCategories.includes(blockDef.subcategory)) {
      return true;
    }

    // Also show for domain blocks
    if (blockDef.subcategory === 'Spatial' || blockDef.laneKind === 'Scene') {
      return true;
    }

    return false;
  }

  /**
   * Convert a Slot to TypeDesc.
   */
  private slotToTypeDesc(slot: Slot): TypeDesc | undefined {
    return SLOT_TYPE_TO_TYPE_DESC[slot.type];
  }

  /**
   * Get cell status based on types and existing binding.
   */
  private getCellStatus(row: TableRow, column: TableColumn, listener?: Listener): CellStatus {
    if (listener) {
      return 'bound';
    }

    if (this.isTypeCompatible(column.type, row.type)) {
      return 'empty';
    }

    if (this.isTypeConvertible(column.type, row.type)) {
      return 'convertible';
    }

    return 'incompatible';
  }

  /**
   * Check if source type is directly compatible with target type.
   */
  private isTypeCompatible(source: TypeDesc, target: TypeDesc): boolean {
    // Direct match
    if (source.world === target.world && source.domain === target.domain) {
      return true;
    }

    // Signal can feed field (broadcast)
    if (source.world === 'signal' && target.world === 'field' && source.domain === target.domain) {
      return true;
    }

    return false;
  }

  /**
   * Check if source type can be converted to target type.
   */
  private isTypeConvertible(source: TypeDesc, target: TypeDesc): boolean {
    // Number-to-number conversions across worlds
    if (source.domain === 'number' && target.domain === 'number') {
      return true;
    }

    // Phase to number
    if (source.domain === 'phase' && target.domain === 'number') {
      return true;
    }

    // Number to phase (with clamping)
    if (source.domain === 'number' && target.domain === 'phase') {
      return true;
    }

    return false;
  }

  /**
   * Get suggested lens chain for type conversion.
   */
  private getSuggestedChain(row: TableRow, column: TableColumn): LensDefinition[] | undefined {
    // Signal to field: broadcast lens
    if (column.type.world === 'signal' && row.type.world === 'field') {
      return [{ type: 'broadcast', params: {} }];
    }

    // Phase to number: scale lens
    if (column.type.domain === 'phase' && row.type.domain === 'number') {
      return [{ type: 'scale', params: { scale: 1, offset: 0 } }];
    }

    return undefined;
  }

  /**
   * Get cost class for type conversion.
   */
  private getCostClass(row: TableRow, column: TableColumn): 'cheap' | 'moderate' | 'heavy' {
    // Signal to field: cheap (broadcast)
    if (column.type.world === 'signal' && row.type.world === 'field') {
      return 'cheap';
    }

    // Same world conversions are cheap
    if (column.type.world === row.type.world) {
      return 'cheap';
    }

    return 'moderate';
  }
}
