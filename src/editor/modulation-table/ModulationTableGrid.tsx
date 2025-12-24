/**
 * ModulationTableGrid Component
 *
 * MUI DataGrid-based replacement for the HTML table.
 * Fixes column width stability issues.
 */

import { observer } from 'mobx-react-lite';
import { useMemo, useCallback } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams, GridColumnHeaderParams } from '@mui/x-data-grid';
import { ThemeProvider } from '@mui/material/styles';
import { Tooltip } from './Tooltip';
import { modulationTableTheme } from './muiTheme';
import type { ModulationTableStore } from './ModulationTableStore';
import type { TableRow, TableColumn, TableCell, RowKey } from './types';

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
            padding: '2px 6px',
            background: 'rgba(74, 158, 255, 0.2)',
            borderRadius: '3px',
            fontSize: '10px',
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
      <span style={{ fontSize: '20px', color: '#22c55e', lineHeight: 1 }}>•</span>
    );
  }

  if (cell.status === 'convertible') {
    const costClass = cell.costClass ?? 'cheap';
    const symbol = costClass === 'heavy' ? '⚡' : costClass === 'moderate' ? '⚠' : '~';
    const color = costClass === 'heavy' ? '#ef4444' : costClass === 'moderate' ? '#eab308' : '#22c55e';
    return (
      <span style={{ fontSize: '14px', fontWeight: 500, color }}>{symbol}</span>
    );
  }

  if (cell.status === 'incompatible') {
    return (
      <span style={{ fontSize: '12px', color: '#ef4444', opacity: 0.5 }}>×</span>
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
 * ModulationTableGrid using MUI DataGrid.
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
  const focusedCell = store.viewState.focusedCell;
  const focusedBusId = store.viewState.focusedBusId;

  // Build DataGrid rows
  const gridRows = useMemo(() => {
    return rows.map(row => {
      const rowData: Record<string, unknown> = {
        id: row.key,
        rowLabel: row.label,
        rowType: row.type.domain,
        blockId: row.blockId,
      };

      // Add cell data for each column
      for (const column of columns) {
        const cell = cells.find(c => c.rowKey === row.key && c.busId === column.busId);
        rowData[column.busId] = cell;
      }

      return rowData;
    });
  }, [rows, columns, cells]);

  // Build DataGrid columns
  const gridColumns = useMemo(() => {
    const cols: GridColDef[] = [];

    // First column: Row header (pinned)
    cols.push({
      field: 'rowLabel',
      headerName: '',
      width: 150,
      minWidth: 80,
      flex: 0.2,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams) => {
        const rowKey = params.row.id as RowKey;
        const isFocused = focusedCell?.rowKey === rowKey;

        return (
          <div
            onClick={() => onRowClick(rowKey)}
            style={{
              width: '100%',
              cursor: 'pointer',
              padding: '4px 6px',
              background: isFocused ? 'rgba(74, 158, 255, 0.15)' : '#242424',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontWeight: 500,
                fontSize: '11px',
                color: '#e5e5e5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {params.value as string}
            </div>
            <div
              style={{
                fontSize: '9px',
                color: '#888',
                textTransform: 'lowercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {params.row.rowType as string}
            </div>
          </div>
        );
      },
    });

    // Bus columns
    for (const column of columns) {
      const isExpanded = store.isColumnExpanded(column.busId);
      const displayName = store.getColumnDisplayName(column);
      const isFocused = column.busId === focusedBusId;

      cols.push({
        field: column.busId,
        headerName: displayName,
        width: isExpanded ? 100 : undefined,
        minWidth: 32,
        flex: isExpanded ? 0 : 1,
        sortable: false,
        disableColumnMenu: true,
        headerClassName: isFocused ? 'focused-column' : undefined,
        renderHeader: (params: GridColumnHeaderParams) => {
          const tooltipContent = (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '12px', color: '#e5e5e5', marginBottom: '2px' }}>
                {column.name}
              </div>
              <div style={{ fontSize: '10px', color: '#4a9eff', fontFamily: 'monospace', textTransform: 'lowercase' }}>
                {column.type.domain}
              </div>
              {column.publisherCount > 0 && (
                <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
                  {column.publisherCount} publisher{column.publisherCount !== 1 ? 's' : ''}
                </div>
              )}
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
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  cursor: 'pointer',
                  padding: isExpanded ? '8px 6px' : '6px 2px',
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: '#e5e5e5',
                    fontSize: isExpanded ? '12px' : '14px',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {params.colDef.headerName}
                </span>
                {isExpanded && (
                  <>
                    <span style={{ fontSize: '10px', color: '#888', textTransform: 'lowercase' }}>
                      {column.type.domain}
                    </span>
                    {column.publisherCount > 0 && (
                      <span style={{ fontSize: '9px', color: '#666' }}>
                        {column.publisherCount} pub
                      </span>
                    )}
                  </>
                )}
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
  }, [
    columns,
    store,
    focusedCell,
    focusedBusId,
    onRowClick,
    onColumnClick,
    onColumnRightClick,
    onCellClick,
    onCellDoubleClick,
    onCellRightClick,
  ]);

  // Handle cell click to focus
  const handleCellClick = useCallback((params: {row: {id: RowKey}; field: string}) => {
    if (params.field === 'rowLabel') {
      onRowClick(params.row.id);
    }
  }, [onRowClick]);

  return (
    <ThemeProvider theme={modulationTableTheme}>
      <div style={{ height: '100%', width: '100%' }}>
        <DataGrid
          rows={gridRows}
          columns={gridColumns}
          disableRowSelectionOnClick
          disableColumnSelector
          disableColumnFilter
          disableColumnMenu
          hideFooter
          rowHeight={28}
          columnHeaderHeight={40}
          onCellClick={handleCellClick}
          sx={{
            '& .MuiDataGrid-columnHeader:first-of-type': {
              position: 'sticky',
              left: 0,
              zIndex: 3,
              backgroundColor: '#242424',
            },
            '& .MuiDataGrid-cell:first-of-type': {
              position: 'sticky',
              left: 0,
              zIndex: 1,
              backgroundColor: '#242424',
            },
          }}
        />
      </div>
    </ThemeProvider>
  );
});
