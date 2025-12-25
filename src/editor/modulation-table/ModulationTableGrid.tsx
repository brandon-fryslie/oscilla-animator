/**
 * ModulationTableGrid Component
 *
 * Renders multiple MUI DataGrid tables, one per block.
 * Each block has a collapsible header - click to expand/collapse.
 * Groups are collapsed by default.
 */

import { observer } from 'mobx-react-lite';
import { useMemo, useCallback } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridColumnHeaderParams } from '@mui/x-data-grid';
import { ThemeProvider } from '@mui/material/styles';
import { Tooltip } from './Tooltip';
import { modulationTableTheme } from './muiTheme';
import type { ModulationTableStore } from './ModulationTableStore';
import type { TableRow, TableColumn, TableCell, RowKey, RowGroup } from './types';

interface ModulationTableGridProps {
  store: ModulationTableStore;
  rows: readonly TableRow[];
  columns: readonly TableColumn[];
  cells: readonly TableCell[];
  onCellClick: (rowKey: RowKey, busId: string, e?: React.MouseEvent) => void;
  onCellDoubleClick: (rowKey: RowKey, busId: string) => void;
  onCellRightClick: (e: React.MouseEvent, rowKey: RowKey, busId: string) => void;
  onRowClick: (rowKey: RowKey) => void;
  onColumnClick: (busId: string) => void;
  onColumnRightClick: (e: React.MouseEvent, busId: string) => void;
}

/**
 * Render a cell's binding indicator.
 */
function renderCellContent(cell: TableCell): React.ReactElement {
  if (cell.status === 'bound') {
    if (cell.lensChain && cell.lensChain.length > 0) {
      const lensText = cell.lensChain.map(l => l.type).join(' → ');
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 4px',
            background: 'rgba(74, 158, 255, 0.2)',
            borderRadius: '3px',
            fontSize: '9px',
            color: '#4a9eff',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lensText}
        </span>
      );
    }
    return (
      <span style={{ fontSize: '16px', color: '#22c55e', lineHeight: 1 }}>•</span>
    );
  }

  if (cell.status === 'convertible') {
    const costClass = cell.costClass ?? 'cheap';
    const symbol = costClass === 'heavy' ? '⚡' : costClass === 'moderate' ? '⚠' : '~';
    const color = costClass === 'heavy' ? '#ef4444' : costClass === 'moderate' ? '#eab308' : '#22c55e';
    return (
      <span style={{ fontSize: '12px', fontWeight: 500, color }}>{symbol}</span>
    );
  }

  if (cell.status === 'incompatible') {
    return (
      <span style={{ fontSize: '11px', color: '#ef4444', opacity: 0.5 }}>×</span>
    );
  }

  return <></>;
}

/**
 * Get cell background color based on status.
 */
function getCellBackgroundColor(cell: TableCell): string {
  if (cell.status === 'bound') {
    return 'rgba(34, 197, 94, 0.15)';
  }
  if (cell.status === 'convertible') {
    return 'rgba(249, 115, 22, 0.1)';
  }
  if (cell.status === 'incompatible') {
    return 'rgba(239, 68, 68, 0.05)';
  }
  return 'transparent';
}

/**
 * Single block table - renders a DataGrid for one block's ports.
 */
const BlockTable = observer(({
  group,
  rows,
  columns,
  cells,
  store,
  onCellClick,
  onCellDoubleClick,
  onCellRightClick,
  onRowClick,
  onColumnClick,
  onColumnRightClick,
}: {
  group: RowGroup;
  rows: readonly TableRow[];
  columns: readonly TableColumn[];
  cells: readonly TableCell[];
  store: ModulationTableStore;
  onCellClick: (rowKey: RowKey, busId: string, e?: React.MouseEvent) => void;
  onCellDoubleClick: (rowKey: RowKey, busId: string) => void;
  onCellRightClick: (e: React.MouseEvent, rowKey: RowKey, busId: string) => void;
  onRowClick: (rowKey: RowKey) => void;
  onColumnClick: (busId: string) => void;
  onColumnRightClick: (e: React.MouseEvent, busId: string) => void;
}) => {
  const focusedCell = store.viewState.focusedCell;
  const focusedBusId = store.viewState.focusedBusId;
  // Read collapse state directly from store for reactivity
  const isCollapsed = store.viewState.collapsedGroups[group.key] ?? true;

  // Filter rows for this block
  const blockRows = useMemo(() => {
    return rows.filter(r => group.rowKeys.includes(r.key));
  }, [rows, group.rowKeys]);

  // Build grid rows
  const gridRows = useMemo(() => {
    return blockRows.map(row => {
      const rowData: Record<string, unknown> = {
        id: row.key,
        rowLabel: row.label,
        portType: row.type.domain,
      };

      // Add cell data for each column
      for (const column of columns) {
        const cell = cells.find(c => c.rowKey === row.key && c.busId === column.busId);
        rowData[column.busId] = cell;
      }

      return rowData;
    });
  }, [blockRows, columns, cells]);

  // Build grid columns
  const gridColumns = useMemo(() => {
    const cols: GridColDef[] = [];

    // Row label column - compact
    cols.push({
      field: 'rowLabel',
      headerName: '',
      width: 90,
      minWidth: 60,
      maxWidth: 120,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams) => {
        const rowKey = params.row.id as RowKey;
        const isFocused = focusedCell?.rowKey === rowKey;

        return (
          <div
            onClick={() => onRowClick(rowKey)}
            title={`${params.value} (${params.row.portType})`}
            style={{
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              padding: '2px 4px',
              background: isFocused ? 'rgba(74, 158, 255, 0.15)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                color: '#e5e5e5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {params.value as string}
            </span>
          </div>
        );
      },
    });

    // Bus columns - compact
    for (const column of columns) {
      // Columns are always in compact mode (no expansion state)
      const isExpanded = false;
      const displayName = column.name;
      const isFocused = column.busId === focusedBusId;

      cols.push({
        field: column.busId,
        headerName: displayName,
        width: isExpanded ? 80 : 36,
        minWidth: 28,
        sortable: false,
        disableColumnMenu: true,
        headerClassName: isFocused ? 'focused-column' : undefined,
        renderHeader: (params: GridColumnHeaderParams) => {
          const tooltipContent = (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '11px', color: '#e5e5e5' }}>
                {column.name}
              </div>
              <div style={{ fontSize: '9px', color: '#4a9eff', fontFamily: 'monospace' }}>
                {column.type.domain}
              </div>
            </div>
          );

          return (
            <Tooltip content={tooltipContent} placement="top">
              <div
                onClick={() => onColumnClick(column.busId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onColumnRightClick(e, column.busId);
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#e5e5e5',
                }}
              >
                {params.colDef.headerName}
              </div>
            </Tooltip>
          );
        },
        renderCell: (params: GridRenderCellParams) => {
          const cell = params.value as TableCell | undefined;
          if (!cell) return null;

          const rowKey = params.row.id as RowKey;
          const isFocused = focusedCell?.rowKey === rowKey && focusedCell?.busId === column.busId;
          const bgColor = getCellBackgroundColor(cell);

          return (
            <div
              onClick={(e) => onCellClick(rowKey, column.busId, e)}
              onDoubleClick={() => onCellDoubleClick(rowKey, column.busId)}
              onContextMenu={(e) => {
                e.preventDefault();
                onCellRightClick(e, rowKey, column.busId);
              }}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: cell.status === 'incompatible' ? 'not-allowed' : 'pointer',
                backgroundColor: isFocused ? 'rgba(74, 158, 255, 0.2)' : bgColor,
                opacity: cell.enabled === false ? 0.5 : 1,
              }}
            >
              {renderCellContent(cell)}
            </div>
          );
        },
      });
    }

    return cols;
  }, [columns, store, focusedCell, focusedBusId, onRowClick, onColumnClick, onColumnRightClick, onCellClick, onCellDoubleClick, onCellRightClick]);

  const handleHeaderClick = useCallback(() => {
    store.toggleGroupCollapse(group.key);
  }, [store, group.key]);

  const chevron = isCollapsed ? '▸' : '▾';
  const tableHeight = isCollapsed ? 0 : Math.min(blockRows.length * 24 + 32, 200);

  return (
    <div style={{ marginBottom: '2px' }}>
      {/* Block header - clickable to collapse/expand */}
      <div
        onClick={handleHeaderClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: '#2a2a2a',
          borderBottom: '1px solid #3a3a3a',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '10px', color: '#888' }}>{chevron}</span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#e5e5e5' }}>
          {group.label}
        </span>
        <span style={{ fontSize: '9px', color: '#666', marginLeft: 'auto' }}>
          {group.rowKeys.length}
        </span>
      </div>

      {/* Block table - only shown when expanded */}
      {!isCollapsed && blockRows.length > 0 && (
        <div style={{ height: tableHeight }}>
          <DataGrid
            rows={gridRows}
            columns={gridColumns}
            rowHeight={24}
            columnHeaderHeight={24}
            disableRowSelectionOnClick
            disableColumnSelector
            disableColumnFilter
            disableColumnMenu
            hideFooter
            sx={{
              border: 'none',
              '& .MuiDataGrid-cell': {
                padding: 0,
                borderBottom: '1px solid #333',
              },
              '& .MuiDataGrid-columnHeader': {
                padding: 0,
              },
              '& .MuiDataGrid-columnHeaders': {
                borderBottom: '1px solid #444',
                minHeight: '24px !important',
                maxHeight: '24px !important',
              },
              '& .MuiDataGrid-virtualScroller': {
                backgroundColor: '#1e1e1e',
              },
            }}
          />
        </div>
      )}
    </div>
  );
});

/**
 * ModulationTableGrid - renders multiple tables, one per block.
 */
export const ModulationTableGrid = observer(({
  store,
  rows,
  columns,
  cells,
  onCellClick,
  onCellDoubleClick,
  onCellRightClick,
  onRowClick,
  onColumnClick,
  onColumnRightClick,
}: ModulationTableGridProps) => {
  // Get row groups from the store's computed property
  const rowGroups = store.rowGroups;

  if (rowGroups.length === 0) {
    return <div style={{ padding: '8px', color: '#666', fontSize: '11px' }}>No ports</div>;
  }

  return (
    <ThemeProvider theme={modulationTableTheme}>
      <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
        {rowGroups.map((group: RowGroup) => (
          <BlockTable
            key={group.key}
            group={group}
            rows={rows}
            columns={columns}
            cells={cells}
            store={store}
            onCellClick={onCellClick}
            onCellDoubleClick={onCellDoubleClick}
            onCellRightClick={onCellRightClick}
            onRowClick={onRowClick}
            onColumnClick={onColumnClick}
            onColumnRightClick={onColumnRightClick}
          />
        ))}
      </div>
    </ThemeProvider>
  );
});
