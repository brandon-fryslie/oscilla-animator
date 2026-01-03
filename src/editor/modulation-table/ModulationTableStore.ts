/**
 * Modulation Table Store
 *
 * Derives table representation from PatchStore and BusStore.
 * The table is a projection - not a separate data store.
 *
 * Key constraints:
 * - At most one listener per input port (a row can only listen to one bus)
 * - Multiple publishers allowed per output port (can publish to multiple buses)
 */

import { makeObservable, observable, computed, action } from 'mobx';
import type { RootStore } from '../stores/RootStore';
import { SLOT_TYPE_TO_TYPE_DESC, isDirectlyCompatible } from '../types';
import type { TypeDesc, Slot, LensDefinition, AdapterStep, BusCombineMode } from '../types';
import { findAdapterPath } from '../adapters/autoAdapter';
import { getBlockDefinition } from '../blocks/registry';
import { convertBlockToBus } from '../bus-block/conversion';
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
  type RowDirection,
  createRowKey,
  createGroupKey,
  createPortRefKey,
  createDefaultViewState,
  parseRowKey,
  getColumnAbbreviation,
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
      deleteBlock: action,
      setFocusedBus: action,
      toggleGroupCollapse: action,
      toggleBusPin: action,
      toggleBusHide: action,
      togglePublishersSection: action,
      toggleListenersSection: action,
      toggleColumnExpanded: action,
      setTableSplitRatio: action,
      collapseAllGroups: action,
    });
  }

  // =============================================================================
  // Computed: Patch Index (for O(1) lookups)
  // =============================================================================

  /**
   * Build indexes for fast lookups.
   */
  get patchIndex(): PatchIndex {
    const listenersByInputPort = new Map<string, string>();
    const publishersByOutputPort = new Map<string, Map<string, string>>(); // portKey -> busId -> publisherId
    const publishersByBus = new Map<string, string[]>();
    const listenersByBus = new Map<string, string[]>();
    const portsByBlock = new Map<string, { inputs: string[]; outputs: string[] }>();



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
      publishersByOutputPort,
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
  // Computed: Rows (from blocks + ports)
  // =============================================================================

  /**
   * Derive rows from all blocks' ports.
   * - Output ports become publisher rows (can publish to buses)
   * - Input ports become listener rows (can listen to buses)
   */
  get rows(): readonly TableRow[] {
    const rows: TableRow[] = [];

    // Use userBlocks to exclude hidden blocks (like BusBlocks)
    for (const block of this.root.patchStore.userBlocks) {
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) continue;

      let hasBusEligiblePort = false;

      // Add output rows (publishers) for blocks with bus-eligible outputs
      for (const output of blockDef.outputs) {
        const typeDesc = this.slotToTypeDesc(output);
        if (!typeDesc) continue;

        // Only show bus-eligible outputs as rows
        if (!typeDesc.busEligible) continue;

        hasBusEligiblePort = true;
        const rowKey = createRowKey(block.id, output.id, 'output');
        const groupKey = createGroupKey('publishers', block.id);

        rows.push({
          key: rowKey,
          label: output.label,
          groupKey,
          blockId: block.id,
          portId: output.id,
          direction: 'output',
          type: typeDesc,
          semantics: typeDesc.semantics,
        });
      }

      // Add input rows (listeners) for blocks with bus-eligible inputs
      for (const input of blockDef.inputs) {
        const typeDesc = this.slotToTypeDesc(input);
        if (!typeDesc) continue;

        // Only show bus-eligible inputs as rows
        if (!typeDesc.busEligible) continue;

        hasBusEligiblePort = true;
        const rowKey = createRowKey(block.id, input.id, 'input');
        const groupKey = createGroupKey('listeners', block.id);

        rows.push({
          key: rowKey,
          label: input.label,
          groupKey,
          blockId: block.id,
          portId: input.id,
          direction: 'input',
          type: typeDesc,
          semantics: typeDesc.semantics,
          defaultValueSource: 'blockParam',
        });
      }

      // Log warning if block has no bus-eligible ports at all
      if (!hasBusEligiblePort) {
        console.warn(
          `[ModulationTable] Block "${block.label}" (${block.type}) has no bus-eligible ports. ` +
          `This is unexpected - all blocks in the patch should have at least one bus-eligible port.`
        );
      }
    }

    return rows;
  }

  /**
   * Get rows filtered by direction.
   */
  getRowsByDirection(direction: RowDirection): readonly TableRow[] {
    return this.rows.filter((r) => r.direction === direction);
  }

  /**
   * Group rows by block, separated by direction.
   * Publisher groups come first, then listener groups.
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
          label: block.label,
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

    // Sort groups: Publishers first (output), then Listeners (input), then by label
    return [...groupMap.values()].sort((a, b) => {
      // Check if group is publishers or listeners based on group key prefix
      const aIsPublisher = a.key.startsWith('publishers:') ? 0 : 1;
      const bIsPublisher = b.key.startsWith('publishers:') ? 0 : 1;
      if (aIsPublisher !== bIsPublisher) return aIsPublisher - bIsPublisher;
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Get row groups filtered by direction.
   */
  getRowGroupsByDirection(direction: RowDirection): readonly RowGroup[] {
    const prefix = direction === 'output' ? 'publishers:' : 'listeners:';
    return this.rowGroups.filter((g) => g.key.startsWith(prefix));
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
    if (rowFilter.text != null && rowFilter.text !== '') {
      const text = rowFilter.text.toLowerCase();
      rows = rows.filter((r) => r.label.toLowerCase().includes(text));
    }

    // Apply block type filter
    if (rowFilter.blockTypes != null && rowFilter.blockTypes.length > 0) {
      const types = new Set(rowFilter.blockTypes);
      rows = rows.filter((r) => {
        const block = this.root.patchStore.blocks.find((b) => b.id === r.blockId);
        return block != null && types.has(block.type);
      });
    }

    // Apply bound-only filter (checks both listeners and publishers)
    if (rowFilter.boundOnly === true) {
      const index = this.patchIndex;
      rows = rows.filter((r) => {
        const portKey = createPortRefKey(r.blockId, r.portId);
        if (r.direction === 'input') {
          return index.listenersByInputPort.has(portKey);
        } else {
          // For outputs, check if there are any publishers
          const portPublishers = index.publishersByOutputPort.get(portKey);
          return portPublishers != null && portPublishers.size > 0;
        }
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

    return this.root.patchStore.busBlocks.map(convertBlockToBus).map((bus) => {
      const publisherIds = index.publishersByBus.get(bus.id) ?? [];
      const listenerIds = index.listenersByBus.get(bus.id) ?? [];

      // Calculate activity based on listener count (normalized)
      const maxListeners = Math.max(1, ...this.root.patchStore.busBlocks.map(convertBlockToBus).map(
        (b) => (index.listenersByBus.get(b.id) ?? []).length
      ));
      const activity = listenerIds.length / maxListeners;

      return {
        busId: bus.id,
        name: bus.name,
        type: bus.type,
        combineMode: bus.combine.mode as BusCombineMode,
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
    if (colFilter.text != null && colFilter.text !== '') {
      const text = colFilter.text.toLowerCase();
      columns = columns.filter((c) => c.name.toLowerCase().includes(text));
    }

    // Apply domain filter
    if (colFilter.domains != null && colFilter.domains.length > 0) {
      const domains = new Set(colFilter.domains);
      columns = columns.filter((c) => domains.has(c.type.domain));
    }

    // Apply active-only filter
    if (colFilter.activeOnly === true) {
      columns = columns.filter((c) => c.listenerCount > 0);
    }

    // Apply compatibility filter for focused row
    // TODO: BROKEN - This feature incorrectly hides columns that ARE compatible,
    // and even hides columns with existing connections. The isTypeCompatible check
    // is too strict and doesn't account for adapters or existing bindings.
    // DO NOT enable until fixed.
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
  // Computed: Cells (from listeners and publishers)
  // =============================================================================

  /**
   * Derive cells from row-column intersections.
   * - For input rows: bound if there's a listener from that bus to that port
   * - For output rows: bound if there's a publisher from that port to that bus
   */
  get cells(): readonly TableCell[] {
    const cells: TableCell[] = [];
    const patchStore = this.root.patchStore;
    const busBlocks = patchStore.busBlocks;
    const edges = patchStore.edges;

    // Build a map of bus ID -> BusBlock ID for quick lookup
    const busIdToBlockId = new Map<string, string>();
    for (const b of busBlocks) {
      const busId = (b.params.busId as string) || b.id;
      busIdToBlockId.set(busId, b.id);
    }

    for (const row of this.rows) {
      const parsed = parseRowKey(row.key);
      if (!parsed) continue;
      const { blockId, portId, direction } = parsed;

      for (const column of this.columns) {
        const busBlockId = busIdToBlockId.get(column.busId);
        if (!busBlockId) {
          cells.push({
            rowKey: row.key,
            busId: column.busId,
            direction: row.direction,
            status: 'available' as CellStatus,
          });
          continue;
        }

        // Check for edge connecting this port to/from this BusBlock
        let isBound = false;
        if (direction === 'input') {
          // Listener: edge FROM BusBlock TO this port
          isBound = edges.some(e =>
            e.from.blockId === busBlockId &&
            e.to.blockId === blockId &&
            e.to.slotId === portId
          );
        } else {
          // Publisher: edge FROM this port TO BusBlock
          isBound = edges.some(e =>
            e.from.blockId === blockId &&
            e.from.slotId === portId &&
            e.to.blockId === busBlockId
          );
        }

        cells.push({
          rowKey: row.key,
          busId: column.busId,
          direction: row.direction,
          status: isBound ? 'bound' as CellStatus : 'available' as CellStatus,
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
    if (rowKey != null && busId != null) {
      this.viewState.focusedCell = { rowKey, busId };

      // Also focus the block
      const parsed = parseRowKey(rowKey);
      if (parsed != null) {
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
    if (blockId != null) {
      this.root.uiStore.selectBlock(blockId);
    }
  }

  /**
   * Delete a block by ID.
   */
  deleteBlock(blockId: string): void {
    this.root.patchStore.removeBlock(blockId);
  }

  /**
   * Set focused bus and open the Bus Inspector.
   */
  setFocusedBus(busId: string | undefined): void {
    this.viewState.focusedBusId = busId;
    if (busId != null) {
      this.root.uiStore.selectBus(busId);
    }
  }

  /**
   * Select a connection and open the Connection Inspector.
   */
  selectConnection(type: 'publisher' | 'listener', connectionId: string): void {
    this.root.uiStore.selectConnection(type, connectionId);
  }

  /**
   * Select a modulation table cell and open the Connection Inspector.
   * Works for any cell - bound, unbound, or incompatible.
   */
  selectCell(rowKey: string, busId: string): void {
    const row = this.visibleRows.find(r => r.key === rowKey);
    if (!row) return;
    this.root.uiStore.selectCell(rowKey, busId, row.direction);
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

  /**
   * Toggle publishers section collapsed state.
   */
  togglePublishersSection(): void {
    this.viewState.publishersSectionCollapsed = !this.viewState.publishersSectionCollapsed;
  }

  /**
   * Toggle listeners section collapsed state.
   */
  toggleListenersSection(): void {
    this.viewState.listenersSectionCollapsed = !this.viewState.listenersSectionCollapsed;
  }

  /**
   * Toggle column expanded state (full width vs abbreviated).
   */
  toggleColumnExpanded(busId: string): void {
    const idx = this.viewState.expandedColumnIds.indexOf(busId);
    if (idx >= 0) {
      this.viewState.expandedColumnIds.splice(idx, 1);
    } else {
      this.viewState.expandedColumnIds.push(busId);
    }
  }

  /**
   * Check if a column is expanded.
   */
  isColumnExpanded(busId: string): boolean {
    return this.viewState.expandedColumnIds.includes(busId);
  }

  /**
   * Get column display name (abbreviated or full based on expanded state).
   */
  getColumnDisplayName(column: TableColumn): string {
    if (this.viewState.expandedColumnIds.includes(column.busId)) {
      return column.name;
    }
    return getColumnAbbreviation(column.name);
  }

  /**
   * Set table split ratio (0-1, where 0.5 = equal).
   */
  setTableSplitRatio(ratio: number): void {
    this.viewState.tableSplitRatio = Math.max(0.1, Math.min(0.9, ratio));
  }

  /**
   * Collapse all groups (for initial state).
   */
  collapseAllGroups(): void {
    for (const group of this.rowGroups) {
      this.viewState.collapsedGroups[group.key] = true;
    }
  }

  // =============================================================================
  // Actions: Cell Binding
  // =============================================================================

  /**
   * Bind a cell (create listener or publisher depending on row direction).
   * - For input rows: creates a listener (bus → port)
   * - For output rows: creates a publisher (port → bus)
   */
  bindCell(rowKey: RowKey, busId: string, lensChain?: LensDefinition[]): void {
    const parsed = parseRowKey(rowKey);
    if (!parsed) {
      throw new Error(`Invalid row key: ${rowKey}`);
    }

    const { direction, blockId, portId } = parsed;
    const row = this.rows.find((candidate) => candidate.key === rowKey);
    const column = this.columns.find((candidate) => candidate.busId === busId);
    let adapterChain: AdapterStep[] | undefined;

    if (row && column && !isDirectlyCompatible(column.type, row.type)) {
      const result = findAdapterPath(column.type, row.type, 'listener');
      if (!result.ok) {
        console.warn(`Cannot bind ${rowKey} to ${busId}: ${result.reason ?? 'no adapter path'}`);
        return;
      }
      adapterChain = result.chain;
    }
    // Edge-based binding:
    // - For inputs: add an edge from BusBlock:out → input port
    // - For outputs: add an edge from output port → BusBlock:in
    const patchStore = this.root.patchStore;

    // Find the BusBlock for this busId
    const busBlock = patchStore.busBlocks.find(b => b.params.busId === busId || b.id === busId);
    if (!busBlock) {
      console.warn(`[ModulationTableStore] BusBlock not found for busId: ${busId}`);
      return;
    }

    // Build transforms from adapter chain and lens chain
    const transforms: import('../types').TransformStep[] = [];
    if (adapterChain) {
      for (const adapter of adapterChain) {
        transforms.push(adapter);
      }
    }
    if (lensChain) {
      for (const lens of lensChain) {
        // Convert LensDefinition to LensInstance format
        transforms.push({
          kind: 'lens',
          lens: {
            lensId: lens.type,
            enabled: true,
            params: {},  // LensParamBinding needs proper initialization
          },
        });
      }
    }

    // Generate unique edge ID
    const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    if (direction === 'input') {
      // Listening: BusBlock output → block input
      patchStore.addEdge({
        id: edgeId,
        from: { kind: 'port', blockId: busBlock.id, slotId: 'out' },
        to: { kind: 'port', blockId, slotId: portId },
        transforms: transforms.length > 0 ? transforms : undefined,
        enabled: true,
      });
    } else {
      // Publishing: block output → BusBlock input
      patchStore.addEdge({
        id: edgeId,
        from: { kind: 'port', blockId, slotId: portId },
        to: { kind: 'port', blockId: busBlock.id, slotId: 'in' },
        transforms: transforms.length > 0 ? transforms : undefined,
        enabled: true,
      });
    }
  }

  /**
   * Unbind a cell (remove listener or publisher).
   * For input rows, removes the listener from that port.
   * For output rows, removes the publisher to the specified bus.
   */
  unbindCell(rowKey: RowKey, busId?: string): void {
    const parsed = parseRowKey(rowKey);
    if (!parsed) {
      throw new Error(`Invalid row key: ${rowKey}`);
    }

    const { direction, blockId, portId } = parsed;
    const patchStore = this.root.patchStore;

    // Find the edge(s) connecting this port to/from a BusBlock
    const busBlockIds = new Set(patchStore.busBlocks.map(b => b.id));
    const edges = patchStore.edges;

    let edgesToRemove: string[] = [];

    if (direction === 'input') {
      // Find edges FROM any BusBlock TO this port
      edgesToRemove = edges
        .filter(e =>
          e.to.blockId === blockId &&
          e.to.slotId === portId &&
          busBlockIds.has(e.from.blockId) &&
          (!busId || patchStore.busBlocks.find(b => b.id === e.from.blockId)?.params.busId === busId || e.from.blockId === busId)
        )
        .map(e => e.id);
    } else {
      // Find edges FROM this port TO any BusBlock
      edgesToRemove = edges
        .filter(e =>
          e.from.blockId === blockId &&
          e.from.slotId === portId &&
          busBlockIds.has(e.to.blockId) &&
          (!busId || patchStore.busBlocks.find(b => b.id === e.to.blockId)?.params.busId === busId || e.to.blockId === busId)
        )
        .map(e => e.id);
    }

    if (edgesToRemove.length === 0) {
      return; // Nothing to unbind
    }

    for (const edgeId of edgesToRemove) {
      patchStore.removeEdge(edgeId);
    }
  }

  /**
   * Update cell lens chain (only for input/listener cells).
   */
  updateCellLenses(rowKey: RowKey, lensChain: LensDefinition[] | undefined): void {
    const parsed = parseRowKey(rowKey);
    if (!parsed) {
      throw new Error(`Invalid row key: ${rowKey}`);
    }

    const { direction, blockId, portId } = parsed;
    const patchStore = this.root.patchStore;

    // Only input/listener cells can have lenses
    if (direction !== 'input') {
      console.warn('[ModulationTableStore] updateCellLenses only supported for input rows');
      return;
    }

    // Find the BusBlock edge for this input port
    const busBlockIds = new Set(patchStore.busBlocks.map(b => b.id));
    const edge = patchStore.edges.find(e =>
      e.to.blockId === blockId &&
      e.to.slotId === portId &&
      busBlockIds.has(e.from.blockId)
    );

    if (!edge) {
      console.warn('[ModulationTableStore] No bus connection found for row:', rowKey);
      return;
    }

    // Build new transforms array - preserve adapters, update lenses
    const existingTransforms = edge.transforms ?? [];
    const adapters = existingTransforms.filter(t => !('kind' in t) || t.kind !== 'lens');
    const newLenses: import('../types').TransformStep[] = lensChain?.map(lens => ({
      kind: 'lens' as const,
      lens: {
        lensId: lens.type,
        enabled: true,
        params: {},  // LensParamBinding needs proper initialization
      },
    })) ?? [];

    const newTransforms = [...adapters, ...newLenses];

    // Update the edge - remove and re-add since we don't have WireUpdate
    // Note: We could use patchStore.updateEdge if available
    patchStore.removeEdge(edge.id);
    patchStore.addEdge({
      id: edge.id, // Preserve edge ID
      from: edge.from,
      to: edge.to,
      transforms: newTransforms.length > 0 ? newTransforms : undefined,
      enabled: edge.enabled,
    });
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Convert a Slot to TypeDesc.
   */
  private slotToTypeDesc(slot: Slot): TypeDesc | undefined {
    return SLOT_TYPE_TO_TYPE_DESC[slot.type];
  }

  /**
   * Get cell status for a listener (input) row.
   */
//   private getCellStatusForListener(row: TableRow, column: TableColumn, listener?: Listener): CellStatus {
//     if (listener) {
//       return 'bound';
//     }
// 
//     // For listeners, bus type is source, row type is target
//     if (this.isTypeCompatible(column.type, row.type)) {
//       return 'empty';
//     }
// 
//     if (this.isTypeConvertible(column.type, row.type)) {
//       return 'convertible';
//     }
// 
//     return 'incompatible';
//   }

  /**
   * Get cell status for a publisher (output) row.
   */
//   private getCellStatusForPublisher(row: TableRow, column: TableColumn, publisher?: Publisher): CellStatus {
//     if (publisher) {
//       return 'bound';
//     }
// 
//     // For publishers, row type is source, bus type is target
//     if (this.isTypeCompatible(row.type, column.type)) {
//       return 'empty';
//     }
// 
//     if (this.isTypeConvertible(row.type, column.type)) {
//       return 'convertible';
//     }
// 
//     return 'incompatible';
//   }

  /**
   * Check if source type is directly compatible with target type.
   */
  private isTypeCompatible(source: TypeDesc, target: TypeDesc): boolean {
    return isDirectlyCompatible(source, target);
  }

  /**
   * Check if source type can be converted to target type.
   */
//   private isTypeConvertible(source: TypeDesc, target: TypeDesc): boolean {
//     const result = findAdapterPath(source, target, 'listener');
//     return !!result.ok || !!(result.suggestions && result.suggestions.length > 0);
//   }
// 
  /**
   * Get suggested lens chain for type conversion.
   */
//   private getSuggestedChain(_row: TableRow, _column: TableColumn): LensDefinition[] | undefined {
//     // Type conversions should be represented via adapters, not lenses.
//     return undefined;
//   }

  /**
   * Get cost class for type conversion.
   */
//   private getCostClass(row: TableRow, column: TableColumn): 'cheap' | 'moderate' | 'heavy' {
//     // Signal to field: cheap (broadcast)
//     if (column.type.world === 'signal' && row.type.world === 'field') {
//       return 'cheap';
//     }
// 
//     // Same world conversions are cheap
//     if (column.type.world === row.type.world) {
//       return 'cheap';
//     }
// 
//     return 'moderate';
//   }
}
