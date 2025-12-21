/**
 * Modulation Table Component
 *
 * The primary UI for modulation routing.
 * Columns = Buses (signal sources)
 * Rows = Ports (addressable targets)
 * Cells = Bindings with lens chains
 */

import { observer } from 'mobx-react-lite';
import { useRef, useCallback, useState } from 'react';
import type { ModulationTableStore } from './ModulationTableStore';
import type { TableRow, TableColumn, TableCell, RowGroup, RowKey } from './types';
import './ModulationTable.css';

interface ModulationTableProps {
  store: ModulationTableStore;
}

/**
 * Format a lens chain for display.
 */
function formatLensChain(lensChain: readonly { type: string; params: Record<string, unknown> }[] | undefined): string {
  if (!lensChain || lensChain.length === 0) {
    return '';
  }

  return lensChain
    .map((lens) => {
      const params = Object.entries(lens.params)
        .map(([k, v]) => `${k}:${v}`)
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
    onCellClick: (rowKey: RowKey, busId: string) => void;
    onCellDoubleClick: (rowKey: RowKey, busId: string) => void;
    onCellRightClick: (e: React.MouseEvent, rowKey: RowKey, busId: string) => void;
  }) => {
    const statusClass = cell.status;
    const focusedClass = isFocused ? 'focused' : '';
    const enabledClass = cell.enabled === false ? 'disabled' : '';

    const handleClick = useCallback(() => {
      onCellClick(row.key, column.busId);
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
        title={cell.status === 'bound' ? formatLensChain(cell.lensChain) : cell.status}
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
        {cell.status === 'convertible' && <span className="convertible-hint">~</span>}
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
        <th
          className="mod-table-row-header"
          onClick={() => onRowClick(row.key)}
          title={`${row.blockId}:${row.portId} (${row.type.world}:${row.type.domain})`}
        >
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
const GroupHeaderRow = observer(
  ({
    group,
    columns,
    onToggleCollapse,
    onGroupClick,
  }: {
    group: RowGroup;
    columns: readonly TableColumn[];
    onToggleCollapse: (groupKey: string) => void;
    onGroupClick: (blockId: string) => void;
  }) => {
    return (
      <tr className={`mod-table-group-header ${group.collapsed ? 'collapsed' : ''}`}>
        <th
          className="group-header-cell"
          onClick={() => onToggleCollapse(group.key)}
          colSpan={columns.length + 1}
        >
          <span className="collapse-icon">{group.collapsed ? '▸' : '▾'}</span>
          <span className="group-label" onClick={(e) => { e.stopPropagation(); onGroupClick(group.blockId); }}>
            {group.label}
          </span>
          <span className="group-count">({group.rowKeys.length} ports)</span>
        </th>
      </tr>
    );
  }
);

/**
 * Column header cell.
 */
const ColumnHeader = observer(
  ({
    column,
    isFocused,
    isPinned,
    onColumnClick,
    onColumnRightClick,
  }: {
    column: TableColumn;
    isFocused: boolean;
    isPinned: boolean;
    onColumnClick: (busId: string) => void;
    onColumnRightClick: (e: React.MouseEvent, busId: string) => void;
  }) => {
    return (
      <th
        className={`mod-table-col-header ${isFocused ? 'focused' : ''} ${isPinned ? 'pinned' : ''}`}
        onClick={() => onColumnClick(column.busId)}
        onContextMenu={(e) => {
          e.preventDefault();
          onColumnRightClick(e, column.busId);
        }}
        title={`${column.name} (${column.type.world}:${column.type.domain}, ${column.combineMode})`}
      >
        <div className="col-header-content">
          <span className="col-name">{column.name}</span>
          <span className="col-type">{column.type.domain}</span>
          {column.publisherCount > 0 && (
            <span className="col-publishers">{column.publisherCount} pub</span>
          )}
          <div
            className="col-activity"
            style={{ '--activity': column.activity } as React.CSSProperties}
          />
        </div>
      </th>
    );
  }
);

/**
 * Main modulation table component.
 */
export const ModulationTable = observer(({ store }: ModulationTableProps) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'cell' | 'column' | 'row';
    rowKey?: RowKey;
    busId?: string;
  } | null>(null);

  const rows = store.visibleRows;
  const columns = store.visibleColumns;
  const cells = store.cells;
  const groups = store.rowGroups;
  const focusedCell = store.viewState.focusedCell;
  const focusedBusId = store.viewState.focusedBusId;
  const pinnedBusIds = new Set(store.viewState.pinnedBusIds);

  // Handlers
  const handleCellClick = useCallback(
    (rowKey: RowKey, busId: string) => {
      store.setFocusedCell(rowKey, busId);
    },
    [store]
  );

  const handleCellDoubleClick = useCallback(
    (rowKey: RowKey, busId: string) => {
      const cell = store.getCell(rowKey, busId);
      if (!cell) return;

      if (cell.status === 'bound') {
        // Unbind the cell
        store.unbindCell(rowKey);
      } else if (cell.status === 'empty' || cell.status === 'convertible') {
        // Bind the cell
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
      store.setFocusedBus(busId);
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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Build rows grouped by block
  const renderedRows: React.ReactNode[] = [];
  for (const group of groups) {
    // Add group header
    renderedRows.push(
      <GroupHeaderRow
        key={`group-${group.key}`}
        group={group}
        columns={columns}
        onToggleCollapse={handleGroupToggle}
        onGroupClick={handleGroupClick}
      />
    );

    // Add rows if not collapsed
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
              onCellClick={handleCellClick}
              onCellDoubleClick={handleCellDoubleClick}
              onCellRightClick={handleCellRightClick}
              onRowClick={handleRowClick}
            />
          );
        }
      }
    }
  }

  return (
    <div className="modulation-table-container">
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
        <label className="mod-table-filter">
          <input
            type="checkbox"
            checked={store.viewState.showOnlyCompatibleColumnsForFocusedRow}
            onChange={(e) => {
              store.viewState.showOnlyCompatibleColumnsForFocusedRow = e.target.checked;
            }}
          />
          Compatible only
        </label>
      </div>

      {/* Table */}
      <div className="mod-table-scroll">
        <table ref={tableRef} className="modulation-table">
          <thead>
            <tr>
              <th className="mod-table-corner" />
              {columns.map((column) => (
                <ColumnHeader
                  key={column.busId}
                  column={column}
                  isFocused={column.busId === focusedBusId}
                  isPinned={pinnedBusIds.has(column.busId)}
                  onColumnClick={handleColumnClick}
                  onColumnRightClick={handleColumnRightClick}
                />
              ))}
            </tr>
          </thead>
          <tbody>{renderedRows}</tbody>
        </table>
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="mod-table-empty">
          <p>No modulation targets available.</p>
          <p>Add blocks with input ports to see them here.</p>
        </div>
      )}

      {columns.length === 0 && rows.length > 0 && (
        <div className="mod-table-empty">
          <p>No signal buses available.</p>
          <p>Create buses to route signals to parameters.</p>
        </div>
      )}

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
                    if (contextMenu.rowKey && contextMenu.busId) {
                      const cell = store.getCell(contextMenu.rowKey, contextMenu.busId);
                      if (cell?.status === 'bound') {
                        store.unbindCell(contextMenu.rowKey);
                      } else {
                        store.bindCell(
                          contextMenu.rowKey,
                          contextMenu.busId,
                          cell?.suggestedChain ? [...cell.suggestedChain] : undefined
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
                <button onClick={closeContextMenu}>Edit Lenses...</button>
              </>
            )}
            {contextMenu.type === 'column' && (
              <>
                <button
                  onClick={() => {
                    if (contextMenu.busId) {
                      store.toggleBusPin(contextMenu.busId);
                    }
                    closeContextMenu();
                  }}
                >
                  {pinnedBusIds.has(contextMenu.busId!) ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.busId) {
                      store.toggleBusHide(contextMenu.busId);
                    }
                    closeContextMenu();
                  }}
                >
                  Hide
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
});
