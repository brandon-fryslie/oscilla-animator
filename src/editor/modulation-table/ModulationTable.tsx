/**
 * Modulation Table Component
 *
 * Side-by-side layout:
 * - Left: Listeners (bus → input ports)
 * - Right: Publishers (output ports → bus)
 *
 * Features:
 * - Collapsible sections with rotated title bars
 * - Draggable resizer between sections
 * - Minimal-width columns that expand on click
 * - Block groups collapsed by default
 */

import { observer } from 'mobx-react-lite';
import { useRef, useCallback, useState, useEffect } from 'react';
import type { ModulationTableStore } from './ModulationTableStore';
import type { TableRow, TableColumn, TableCell, RowGroup, RowKey } from './types';
import type { LensDefinition } from '../types';
import { LensChainEditorPopover } from './LensChainEditor';
import { Tooltip } from './Tooltip';
import './ModulationTable.css';

interface ModulationTableProps {
  store: ModulationTableStore;
}

/**
 * Format a lens chain for display.
 */
function formatLensChain(lensChain: readonly LensDefinition[] | undefined): string {
  if (lensChain == null || lensChain.length === 0) {
    return '';
  }

  return lensChain
    .map((lens) => {
      const params = Object.entries(lens.params)
        .map(([k, v]) => `${k}:${String(v)}`)
        .join(', ');
      return params ? `${lens.type}(${params})` : lens.type;
    })
    .join(' → ');
}

/**
 * Cell component for a single table cell.
 */
const TableCellComponent = observer(
  ({
    cell,
    row,
    column,
    isFocused,
    onCellClick,
    onCellDoubleClick,
    onCellRightClick,
  }: {
    cell: TableCell;
    row: TableRow;
    column: TableColumn;
    isFocused: boolean;
    onCellClick: (rowKey: RowKey, busId: string, e?: React.MouseEvent) => void;
    onCellDoubleClick: (rowKey: RowKey, busId: string) => void;
    onCellRightClick: (e: React.MouseEvent, rowKey: RowKey, busId: string) => void;
  }) => {
    const statusClass = cell.status;
    const focusedClass = isFocused ? 'focused' : '';
    const enabledClass = cell.enabled === false ? 'disabled' : '';

    const handleClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      onCellClick(row.key, column.busId, e);
    }, [row.key, column.busId, onCellClick]);

    const handleDoubleClick = useCallback(() => {
      onCellDoubleClick(row.key, column.busId);
    }, [row.key, column.busId, onCellDoubleClick]);

    const handleRightClick = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        onCellRightClick(e, row.key, column.busId);
      },
      [row.key, column.busId, onCellRightClick]
    );

    return (
      <td
        className={`mod-table-cell ${statusClass} ${focusedClass} ${enabledClass}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
      >
        {cell.status === 'bound' && (
          <div className="cell-binding">
            {cell.lensChain && cell.lensChain.length > 0 ? (
              <span className="lens-chip">{formatLensChain(cell.lensChain)}</span>
            ) : (
              <span className="direct-binding">•</span>
            )}
          </div>
        )}
        {cell.status === 'convertible' && (
          <span className={`convertible-hint cost-${cell.costClass ?? 'cheap'}`}>
            {cell.costClass === 'heavy' ? '⚡' : cell.costClass === 'moderate' ? '⚠' : '~'}
          </span>
        )}
        {cell.status === 'incompatible' && <span className="incompatible-hint">×</span>}
      </td>
    );
  }
);

/**
 * Row component for a single table row.
 */
const TableRowComponent = observer(
  ({
    row,
    columns,
    cells,
    focusedCell,
    onCellClick,
    onCellDoubleClick,
    onCellRightClick,
    onRowClick,
  }: {
    row: TableRow;
    columns: readonly TableColumn[];
    cells: readonly TableCell[];
    focusedCell: { rowKey: RowKey; busId: string } | undefined;
    onCellClick: (rowKey: RowKey, busId: string) => void;
    onCellDoubleClick: (rowKey: RowKey, busId: string) => void;
    onCellRightClick: (e: React.MouseEvent, rowKey: RowKey, busId: string) => void;
    onRowClick: (rowKey: RowKey) => void;
  }) => {
    const rowCells = cells.filter((c) => c.rowKey === row.key);
    const isFocusedRow = focusedCell?.rowKey === row.key;

    return (
      <tr className={`mod-table-row ${isFocusedRow ? 'focused-row' : ''}`}>
        <th className="mod-table-row-header" onClick={() => onRowClick(row.key)}>
          <span className="row-label">{row.label}</span>
          <span className="row-type">{row.type.domain}</span>
        </th>
        {columns.map((column) => {
          const cell = rowCells.find((c) => c.busId === column.busId);
          if (!cell) return <td key={column.busId} className="mod-table-cell empty" />;

          const isFocused = focusedCell?.rowKey === row.key && focusedCell?.busId === column.busId;

          return (
            <TableCellComponent
              key={column.busId}
              cell={cell}
              row={row}
              column={column}
              isFocused={isFocused}
              onCellClick={onCellClick}
              onCellDoubleClick={onCellDoubleClick}
              onCellRightClick={onCellRightClick}
            />
          );
        })}
      </tr>
    );
  }
);

/**
 * Group header row.
 */
/**
 * Compute per-column bound/available counts for a group.
 */
function computeColumnCounts(
  group: RowGroup,
  columns: readonly TableColumn[],
  cells: readonly TableCell[]
): Map<string, { bound: number; available: number }> {
  const counts = new Map<string, { bound: number; available: number }>();

  for (const col of columns) {
    counts.set(col.busId, { bound: 0, available: 0 });
  }

  for (const rowKey of group.rowKeys) {
    for (const col of columns) {
      const cell = cells.find((c) => c.rowKey === rowKey && c.busId === col.busId);
      if (!cell) continue;

      const colCount = counts.get(col.busId)!;
      if (cell.status === 'bound') {
        colCount.bound++;
      } else if (cell.status === 'convertible' || cell.status === 'empty') {
        // empty cells that are compatible count as available
        colCount.available++;
      }
    }
  }

  return counts;
}

const GroupHeaderRow = observer(
  ({
    group,
    columns,
    cells,
    onToggleCollapse,
    onGroupClick,
    onGroupRightClick,
  }: {
    group: RowGroup;
    columns: readonly TableColumn[];
    cells: readonly TableCell[];
    onToggleCollapse: (groupKey: string) => void;
    onGroupClick: (blockId: string) => void;
    onGroupRightClick: (e: React.MouseEvent, blockId: string) => void;
  }) => {
    const isCollapsed = group.collapsed;
    const columnCounts = isCollapsed ? computeColumnCounts(group, columns, cells) : null;

    return (
      <tr className={`mod-table-group-header ${isCollapsed ? 'collapsed' : ''}`}>
        <th
          className="group-header-cell"
          onClick={() => onToggleCollapse(group.key)}
          onContextMenu={(e) => {
            e.preventDefault();
            onGroupRightClick(e, group.blockId);
          }}
          colSpan={isCollapsed ? 1 : columns.length + 1}
        >
          <span className="collapse-icon">{isCollapsed ? '▸' : '▾'}</span>
          <span
            className="group-label"
            onClick={(e) => {
              e.stopPropagation();
              onGroupClick(group.blockId);
            }}
          >
            {group.label}
          </span>
        </th>
        {isCollapsed &&
          columns.map((col) => {
            const counts = columnCounts?.get(col.busId);
            const bound = counts?.bound ?? 0;
            const available = counts?.available ?? 0;

            // Show nothing if both are 0
            if (bound === 0 && available === 0) {
              return <th key={col.busId} className="group-header-count-cell" onClick={() => onToggleCollapse(group.key)} />;
            }

            return (
              <th key={col.busId} className="group-header-count-cell" onClick={() => onToggleCollapse(group.key)}>
                <span className="group-count-pair">
                  <span className="count-paren">(</span>
                  {bound > 0 && <span className="count-bound">{bound}</span>}
                  {bound > 0 && available > 0 && <span className="count-comma">,</span>}
                  {available > 0 && <span className="count-available">{available}</span>}
                  <span className="count-paren">)</span>
                </span>
              </th>
            );
          })}
      </tr>
    );
  }
);

/**
 * Column header cell with expandable width.
 */
const ColumnHeader = observer(
  ({
    column,
    store,
    isFocused,
    isPinned,
    onColumnClick,
    onColumnRightClick,
  }: {
    column: TableColumn;
    store: ModulationTableStore;
    isFocused: boolean;
    isPinned: boolean;
    onColumnClick: (busId: string) => void;
    onColumnRightClick: (e: React.MouseEvent, busId: string) => void;
  }) => {
    const isExpanded = store.isColumnExpanded(column.busId);
    const displayName = store.getColumnDisplayName(column);

    // Tooltip shows the expanded column info
    const tooltipContent = (
      <div className="col-tooltip">
        <div className="col-tooltip-name">{column.name}</div>
        <div className="col-tooltip-type">{column.type.domain}</div>
        {column.publisherCount > 0 && (
          <div className="col-tooltip-publishers">{column.publisherCount} publisher{column.publisherCount !== 1 ? 's' : ''}</div>
        )}
      </div>
    );

    return (
      <Tooltip content={tooltipContent} placement="top">
        <th
          className={`mod-table-col-header ${isFocused ? 'focused' : ''} ${isPinned ? 'pinned' : ''} ${isExpanded ? 'expanded' : 'compact'}`}
          onClick={() => onColumnClick(column.busId)}
          onContextMenu={(e) => {
            e.preventDefault();
            onColumnRightClick(e, column.busId);
          }}
        >
          <div className="col-header-content">
            <span className="col-name">{displayName}</span>
            {isExpanded && (
              <>
                <span className="col-type">{column.type.domain}</span>
                {column.publisherCount > 0 && (
                  <span className="col-publishers">{column.publisherCount} pub</span>
                )}
              </>
            )}
          </div>
        </th>
      </Tooltip>
    );
  }
);

/**
 * Section table for either Publishers or Listeners.
 */
const SectionTable = observer(
  ({
    title,
    direction,
    groups,
    rows,
    columns,
    cells,
    focusedCell,
    focusedBusId,
    pinnedBusIds,
    store,
    onCellClick,
    onCellDoubleClick,
    onCellRightClick,
    onRowClick,
    onColumnClick,
    onColumnRightClick,
    onGroupToggle,
    onGroupClick,
    onGroupRightClick,
    onSectionCollapse,
  }: {
    title: string;
    direction: 'input' | 'output';
    groups: readonly RowGroup[];
    rows: readonly TableRow[];
    columns: readonly TableColumn[];
    cells: readonly TableCell[];
    focusedCell: { rowKey: RowKey; busId: string } | undefined;
    focusedBusId: string | undefined;
    pinnedBusIds: Set<string>;
    store: ModulationTableStore;
    onCellClick: (rowKey: RowKey, busId: string) => void;
    onCellDoubleClick: (rowKey: RowKey, busId: string) => void;
    onCellRightClick: (e: React.MouseEvent, rowKey: RowKey, busId: string) => void;
    onRowClick: (rowKey: RowKey) => void;
    onColumnClick: (busId: string) => void;
    onColumnRightClick: (e: React.MouseEvent, busId: string) => void;
    onGroupToggle: (groupKey: string) => void;
    onGroupClick: (blockId: string) => void;
    onGroupRightClick: (e: React.MouseEvent, blockId: string) => void;
    onSectionCollapse?: () => void;
  }) => {
    const tableRef = useRef<HTMLTableElement>(null);

    // Build table rows
    const renderedRows: React.ReactNode[] = [];

    for (const group of groups) {
      renderedRows.push(
        <GroupHeaderRow
          key={`group-${group.key}`}
          group={group}
          columns={columns}
          cells={cells}
          onToggleCollapse={onGroupToggle}
          onGroupClick={onGroupClick}
          onGroupRightClick={onGroupRightClick}
        />
      );

      if (!group.collapsed) {
        for (const rowKey of group.rowKeys) {
          const row = rows.find((r) => r.key === rowKey);
          if (row) {
            renderedRows.push(
              <TableRowComponent
                key={rowKey}
                row={row}
                columns={columns}
                cells={cells}
                focusedCell={focusedCell}
                onCellClick={onCellClick}
                onCellDoubleClick={onCellDoubleClick}
                onCellRightClick={onCellRightClick}
                onRowClick={onRowClick}
              />
            );
          }
        }
      }
    }

    const icon = direction === 'output' ? '↑' : '↓';
    const hint = direction === 'output' ? 'output → bus' : 'bus → input';

    return (
      <div className="section-table-container">
        <div
          className={`section-table-header ${onSectionCollapse ? 'clickable' : ''}`}
          onClick={onSectionCollapse}
          role={onSectionCollapse ? 'button' : undefined}
          tabIndex={onSectionCollapse ? 0 : undefined}
          onKeyDown={
            onSectionCollapse
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSectionCollapse();
                  }
                }
              : undefined
          }
        >
          <span className="section-icon">{icon}</span>
          <span className="section-label">{title}</span>
          <span className="section-hint">{hint}</span>
        </div>
        <div className="section-table-scroll">
          <table ref={tableRef} className="modulation-table">
            <thead>
              <tr>
                <th className="mod-table-corner" />
                {columns.map((column) => (
                  <ColumnHeader
                    key={column.busId}
                    column={column}
                    store={store}
                    isFocused={column.busId === focusedBusId}
                    isPinned={pinnedBusIds.has(column.busId)}
                    onColumnClick={onColumnClick}
                    onColumnRightClick={onColumnRightClick}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {renderedRows.length > 0 ? (
                renderedRows
              ) : (
                <tr>
                  <td colSpan={columns.length + 1} className="section-empty">
                    No {direction === 'output' ? 'publisher' : 'listener'} ports
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

/**
 * Collapsed section bar with rotated text.
 */
const CollapsedSectionBar = ({
  title,
  direction,
  onClick,
}: {
  title: string;
  direction: 'input' | 'output';
  onClick: () => void;
}) => {
  const icon = direction === 'output' ? '↑' : '↓';

  return (
    <div
      className={`collapsed-section-bar ${direction}`}
      onClick={onClick}
      title={`Click to expand ${title}`}
    >
      <span className="collapsed-section-text">
        {icon} {title}
      </span>
    </div>
  );
};

/**
 * Main modulation table component with side-by-side layout.
 */
export const ModulationTable = observer(({ store }: ModulationTableProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'cell' | 'column' | 'row' | 'block';
    rowKey?: RowKey;
    busId?: string;
    blockId?: string;
  } | null>(null);

  // Lens editor state
  const [lensEditor, setLensEditor] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    rowKey: RowKey;
    busId: string;
  } | null>(null);

  const rows = store.visibleRows;
  const columns = store.visibleColumns;
  const cells = store.cells;
  const focusedCell = store.viewState.focusedCell;
  const focusedBusId = store.viewState.focusedBusId;
  const pinnedBusIds = new Set(store.viewState.pinnedBusIds);

  // Separate groups by direction
  const publisherGroups = store.getRowGroupsByDirection('output');
  const listenerGroups = store.getRowGroupsByDirection('input');
  const publisherRows = store.getRowsByDirection('output');
  const listenerRows = store.getRowsByDirection('input');

  // Section collapse states
  const publishersCollapsed = store.viewState.publishersSectionCollapsed;
  const listenersCollapsed = store.viewState.listenersSectionCollapsed;
  const splitRatio = store.viewState.tableSplitRatio;

  // Collapse all groups on mount if they haven't been initialized
  useEffect(() => {
    // Only run once when the component mounts
    const groups = store.rowGroups;
    const hasAnyCollapseState = Object.keys(store.viewState.collapsedGroups).length > 0;
    if (groups.length > 0 && !hasAnyCollapseState) {
      store.collapseAllGroups();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const handleCellClick = useCallback(
    (rowKey: RowKey, busId: string, _e?: React.MouseEvent) => {
      store.setFocusedCell(rowKey, busId);
      // Always open ConnectionInspector for ANY cell (bound, unbound, or incompatible)
      store.selectCell(rowKey, busId);
    },
    [store]
  );

  const handleCellDoubleClick = useCallback(
    (rowKey: RowKey, busId: string) => {
      const cell = store.getCell(rowKey, busId);
      if (!cell) return;

      if (cell.status === 'bound') {
        store.unbindCell(rowKey, busId);
      } else if (cell.status === 'empty' || cell.status === 'convertible') {
        store.bindCell(rowKey, busId, cell.suggestedChain ? [...cell.suggestedChain] : undefined);
      }
    },
    [store]
  );

  const handleCellRightClick = useCallback(
    (e: React.MouseEvent, rowKey: RowKey, busId: string) => {
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'cell', rowKey, busId });
    },
    []
  );

  const handleRowClick = useCallback(
    (rowKey: RowKey) => {
      const row = rows.find((r) => r.key === rowKey);
      if (row) {
        store.setFocusedBlock(row.blockId);
      }
    },
    [store, rows]
  );

  const handleColumnClick = useCallback(
    (busId: string) => {
      store.toggleColumnExpanded(busId);
    },
    [store]
  );

  const handleColumnRightClick = useCallback(
    (e: React.MouseEvent, busId: string) => {
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'column', busId });
    },
    []
  );

  const handleGroupToggle = useCallback(
    (groupKey: string) => {
      store.toggleGroupCollapse(groupKey);
    },
    [store]
  );

  const handleGroupClick = useCallback(
    (blockId: string) => {
      store.setFocusedBlock(blockId);
    },
    [store]
  );

  const handleGroupRightClick = useCallback(
    (e: React.MouseEvent, blockId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, type: 'block', blockId });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Open lens editor for a cell
  const openLensEditor = useCallback(
    (rowKey: RowKey, busId: string, position: { x: number; y: number }) => {
      setLensEditor({
        isOpen: true,
        position,
        rowKey,
        busId,
      });
      closeContextMenu();
    },
    [closeContextMenu]
  );

  // Close lens editor
  const closeLensEditor = useCallback(() => {
    setLensEditor(null);
  }, []);

  // Handle lens chain update
  const handleLensChainChange = useCallback(
    (lensChain: LensDefinition[]) => {
      if (!lensEditor) return;
      store.updateCellLenses(lensEditor.rowKey, lensChain.length > 0 ? lensChain : undefined);
    },
    [store, lensEditor]
  );

  // Drag handling for resizer
  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      store.setTableSplitRatio(ratio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, store]);

  // Calculate flex values for sections
  const listenersWidth = listenersCollapsed ? 'auto' : `${splitRatio * 100}%`;
  const publishersWidth = publishersCollapsed ? 'auto' : `${(1 - splitRatio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={`modulation-table-container side-by-side ${isDragging ? 'dragging' : ''}`}
    >
      {/* Toolbar */}
      <div className="mod-table-toolbar">
        <input
          type="text"
          className="mod-table-search"
          placeholder="Search rows..."
          value={store.viewState.rowFilter.text ?? ''}
          onChange={(e) => {
            store.viewState.rowFilter.text = e.target.value || undefined;
          }}
        />
        <label className="mod-table-filter">
          <input
            type="checkbox"
            checked={store.viewState.rowFilter.boundOnly ?? false}
            onChange={(e) => {
              store.viewState.rowFilter.boundOnly = e.target.checked;
            }}
          />
          Bound only
        </label>
        {/* TODO: Hidden - showOnlyCompatibleColumnsForFocusedRow feature is broken.
            See ModulationTableStore.ts for details.
            UI element removed to avoid type errors. */}
      </div>

      {/* Side-by-side sections */}
      <div className="mod-table-sections">
        {/* Listeners Section (Left) */}
        {listenersCollapsed ? (
          <CollapsedSectionBar
            title="Listeners"
            direction="input"
            onClick={() => store.toggleListenersSection()}
          />
        ) : (
          <div className="mod-table-section listeners-section" style={{ width: listenersWidth }}>
            <SectionTable
              title="Listeners"
              direction="input"
              groups={listenerGroups}
              rows={listenerRows}
              columns={columns}
              cells={cells}
              focusedCell={focusedCell}
              focusedBusId={focusedBusId}
              pinnedBusIds={pinnedBusIds}
              store={store}
              onCellClick={handleCellClick}
              onCellDoubleClick={handleCellDoubleClick}
              onCellRightClick={handleCellRightClick}
              onRowClick={handleRowClick}
              onColumnClick={handleColumnClick}
              onColumnRightClick={handleColumnRightClick}
              onGroupToggle={handleGroupToggle}
              onGroupClick={handleGroupClick}
              onGroupRightClick={handleGroupRightClick}
              onSectionCollapse={() => store.toggleListenersSection()}
            />
          </div>
        )}

        {/* Resizer (only when both sections are visible) */}
        {!listenersCollapsed && !publishersCollapsed && (
          <div
            className="mod-table-resizer"
            onMouseDown={handleResizerMouseDown}
            title="Drag to resize"
          />
        )}

        {/* Publishers Section (Right) */}
        {publishersCollapsed ? (
          <CollapsedSectionBar
            title="Publishers"
            direction="output"
            onClick={() => store.togglePublishersSection()}
          />
        ) : (
          <div className="mod-table-section publishers-section" style={{ width: publishersWidth }}>
            <SectionTable
              title="Publishers"
              direction="output"
              groups={publisherGroups}
              rows={publisherRows}
              columns={columns}
              cells={cells}
              focusedCell={focusedCell}
              focusedBusId={focusedBusId}
              pinnedBusIds={pinnedBusIds}
              store={store}
              onCellClick={handleCellClick}
              onCellDoubleClick={handleCellDoubleClick}
              onCellRightClick={handleCellRightClick}
              onRowClick={handleRowClick}
              onColumnClick={handleColumnClick}
              onColumnRightClick={handleColumnRightClick}
              onGroupToggle={handleGroupToggle}
              onGroupClick={handleGroupClick}
              onGroupRightClick={handleGroupRightClick}
              onSectionCollapse={() => store.togglePublishersSection()}
            />
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="mod-table-overlay" onClick={closeContextMenu} />
          <div
            className="mod-table-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'cell' && (
              <>
                <button
                  onClick={() => {
                    if (contextMenu.rowKey != null && contextMenu.busId != null) {
                      const cell = store.getCell(contextMenu.rowKey, contextMenu.busId);
                      if (cell?.status === 'bound') {
                        store.unbindCell(contextMenu.rowKey, contextMenu.busId);
                      } else {
                        store.bindCell(
                          contextMenu.rowKey,
                          contextMenu.busId,
                          cell?.suggestedChain != null ? [...cell.suggestedChain] : undefined
                        );
                      }
                    }
                    closeContextMenu();
                  }}
                >
                  {store.getCell(contextMenu.rowKey!, contextMenu.busId!)?.status === 'bound'
                    ? 'Unbind'
                    : 'Bind'}
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.rowKey != null && contextMenu.busId != null) {
                      // If not bound, bind first then open editor
                      const cell = store.getCell(contextMenu.rowKey, contextMenu.busId);
                      if (cell?.status !== 'bound') {
                        store.bindCell(
                          contextMenu.rowKey,
                          contextMenu.busId,
                          cell?.suggestedChain != null ? [...cell.suggestedChain] : undefined
                        );
                      }
                      openLensEditor(contextMenu.rowKey, contextMenu.busId, {
                        x: contextMenu.x,
                        y: contextMenu.y,
                      });
                    }
                  }}
                >
                  Edit Lenses...
                </button>
              </>
            )}
            {contextMenu.type === 'column' && (
              <>
                <button
                  onClick={() => {
                    if (contextMenu.busId != null) {
                      store.setFocusedBus(contextMenu.busId);
                    }
                    closeContextMenu();
                  }}
                >
                  Inspect Bus
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.busId != null) {
                      store.toggleBusPin(contextMenu.busId);
                    }
                    closeContextMenu();
                  }}
                >
                  {pinnedBusIds.has(contextMenu.busId!) ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.busId != null) {
                      store.toggleBusHide(contextMenu.busId);
                    }
                    closeContextMenu();
                  }}
                >
                  Hide
                </button>
              </>
            )}
            {contextMenu.type === 'block' && contextMenu.blockId && (
              <>
                <button
                  onClick={() => {
                    store.setFocusedBlock(contextMenu.blockId!);
                    closeContextMenu();
                  }}
                >
                  Inspect Block
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    store.deleteBlock(contextMenu.blockId!);
                    closeContextMenu();
                  }}
                >
                  Delete Block
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Lens chain editor popover */}
      {lensEditor && (
        <LensChainEditorPopover
          isOpen={lensEditor.isOpen}
          position={lensEditor.position}
          lensChain={
            store.getCell(lensEditor.rowKey, lensEditor.busId)?.lensChain ?? []
          }
          onChange={handleLensChainChange}
          sourceType={columns.find((c) => c.busId === lensEditor.busId)?.type}
          targetType={rows.find((r) => r.key === lensEditor.rowKey)?.type}
          onClose={closeLensEditor}
        />
      )}
    </div>
  );
});
