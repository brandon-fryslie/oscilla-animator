/**
 * ModulationTableGrid Component
 *
 * MUI DataGrid-based replacement for the HTML table.
 * Implements row grouping with collapsible group headers.
 *
 * Structure:
 * - Group header rows (collapsible) showing block names
 * - Data rows showing individual port bindings
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
 * Row types for the grid - either a group header or a data row.
 */
type GridRowType = 'group' | 'data';

interface GridRowData {
  id: string;
  rowType: GridRowType;
  // Group header fields
  groupKey?: string;
  groupLabel?: string;
  groupCollapsed?: boolean;
  groupRowCount?: number;
  // Data row fields
  rowKey?: RowKey;
  rowLabel?: string;
  portType?: string;
  blockId?: string;
  // Cell data for each column (keyed by busId)
  [busId: string]: unknown;
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
 * ModulationTableGrid using MUI DataGrid with row grouping.
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

  // Determine direction from rows
  const direction = rows.length > 0 ? rows[0].direction : 'input';

  // Get row groups for this direction
  const rowGroups = useMemo(() => {
    return store.getRowGroupsByDirection(direction);
  }, [store, direction]);

  // Build DataGrid rows with group headers interleaved
  const gridRows = useMemo(() => {
    const result: GridRowData[] = [];

    for (const group of rowGroups) {
      // Add group header row
      const groupRow: GridRowData = {
        id: `group:${group.key}`,
        rowType: 'group',
        groupKey: group.key,
        groupLabel: group.label,
        groupCollapsed: group.collapsed,
        groupRowCount: group.rowKeys.length,
      };
      result.push(groupRow);

      // Add data rows if group is not collapsed
      if (!group.collapsed) {
        for (const rowKey of group.rowKeys) {
          const row = rows.find(r => r.key === rowKey);
          if (!row) continue;

          const dataRow: GridRowData = {
            id: rowKey,
            rowType: 'data',
            rowKey: row.key,
            rowLabel: row.label,
            portType: row.type.domain,
            blockId: row.blockId,
          };

          // Add cell data for each column
          for (const column of columns) {
            const cell = cells.find(c => c.rowKey === row.key && c.busId === column.busId);
            dataRow[column.busId] = cell;
          }

          result.push(dataRow);
        }
      }
    }

    return result;
  }, [rowGroups, rows, columns, cells]);

  // Handle group header click to toggle collapse
  const handleGroupClick = useCallback((groupKey: string) => {
    store.toggleGroupCollapse(groupKey);
  }, [store]);

  // Build DataGrid columns
  const gridColumns = useMemo(() => {
    const cols: GridColDef[] = [];

    // First column: Row header (group name or port label)
    cols.push({
      field: 'rowLabel',
      headerName: '',
      width: 150,
      minWidth: 100,
      flex: 0.3,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<GridRowData>) => {
        const rowData = params.row;

        // Group header row
        if (rowData.rowType === 'group') {
          const isCollapsed = rowData.groupCollapsed;
          const chevron = isCollapsed ? '▸' : '▾';

          return (
            <div
              onClick={() => handleGroupClick(rowData.groupKey!)}
              style={{
                width: '100%',
                cursor: 'pointer',
                padding: '6px 8px',
                background: '#2a2a2a',
                borderBottom: '1px solid #3a3a3a',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '12px', color: '#888' }}>{chevron}</span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '12px',
                  color: '#e5e5e5',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {rowData.groupLabel}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  color: '#666',
                  marginLeft: 'auto',
                }}
              >
                {rowData.groupRowCount} port{rowData.groupRowCount !== 1 ? 's' : ''}
              </span>
            </div>
          );
        }

        // Data row
        const rowKey = rowData.rowKey as RowKey;
        const isFocused = focusedCell?.rowKey === rowKey;

        return (
          <div
            onClick={() => onRowClick(rowKey)}
            style={{
              width: '100%',
              cursor: 'pointer',
              padding: '4px 6px 4px 24px', // Indented under group
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
              {rowData.rowLabel as string}
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
              {rowData.portType as string}
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
        width: isExpanded ? 100 : 45,
        minWidth: 32,
        flex: 0,
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
        renderCell: (params: GridRenderCellParams<GridRowData>) => {
          const rowData = params.row;

          // Group header rows get empty cells for data columns
          if (rowData.rowType === 'group') {
            return (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: '#2a2a2a',
                  borderBottom: '1px solid #3a3a3a',
                }}
              />
            );
          }

          // Data row
          const cell = params.value as TableCell | undefined;
          if (!cell) return null;

          const rowKey = rowData.rowKey as RowKey;
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
    handleGroupClick,
  ]);

  // Get row height based on row type
  const getRowHeight = useCallback((params: { id: string | number }) => {
    const id = String(params.id);
    if (id.startsWith('group:')) {
      return 32; // Group header height
    }
    return 28; // Data row height
  }, []);

  return (
    <ThemeProvider theme={modulationTableTheme}>
      <div style={{ height: '100%', width: '100%' }}>
        <DataGrid
          rows={gridRows}
          columns={gridColumns}
          getRowHeight={getRowHeight}
          disableRowSelectionOnClick
          disableColumnSelector
          disableColumnFilter
          disableColumnMenu
          hideFooter
          columnHeaderHeight={40}
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
            // Remove cell padding for custom content
            '& .MuiDataGrid-cell': {
              padding: 0,
            },
          }}
        />
      </div>
    </ThemeProvider>
  );
});
