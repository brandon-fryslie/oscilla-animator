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
 * - MUI DataGrid for stable column widths
 */

import { observer } from 'mobx-react-lite';
import { useRef, useCallback, useState, useEffect } from 'react';
import type { ModulationTableStore } from './ModulationTableStore';
import type { RowKey } from './types';
import type { LensDefinition } from '../types';
import { LensChainEditorPopover } from './LensChainEditor';
import { ModulationTableGrid } from './ModulationTableGrid';
import './ModulationTable.css';

interface ModulationTableProps {
  store: ModulationTableStore;
}

/**
 * Section table for either Publishers or Listeners.
 */
const SectionTable = observer(
  ({
    title,
    direction,
    store,
    onSectionCollapse,
  }: {
    title: string;
    direction: 'input' | 'output';
    store: ModulationTableStore;
    onSectionCollapse?: () => void;
  }) => {
    const icon = direction === 'output' ? '↑' : '↓';
    const hint = direction === 'output' ? 'output → bus' : 'bus → input';

    // Get filtered rows and data for this direction
    const rows = store.getRowsByDirection(direction);
    const columns = store.visibleColumns;
    const cells = store.cells;

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
          {/* MUI DataGrid replaces HTML table */}
          {rows.length > 0 ? (
            <ModulationTableGrid
              store={store}
              rows={rows}
              columns={columns}
              cells={cells}
              onCellClick={(rowKey, busId, _e) => store.setFocusedCell(rowKey, busId)}
              onCellDoubleClick={(rowKey, busId) => {
                const cell = store.getCell(rowKey, busId);
                if (!cell) return;

                if (cell.status === 'bound') {
                  store.unbindCell(rowKey, busId);
                } else if (cell.status === 'empty' || cell.status === 'convertible') {
                  store.bindCell(rowKey, busId, cell.suggestedChain ? [...cell.suggestedChain] : undefined);
                }
              }}
              onCellRightClick={(_e, _rowKey, _busId) => {
                // Context menu handled in parent - placeholder for now
              }}
              onRowClick={(rowKey) => {
                const row = rows.find((r) => r.key === rowKey);
                if (row) {
                  store.setFocusedBlock(row.blockId);
                }
              }}
              onColumnClick={(busId) => store.toggleColumnExpanded(busId)}
              onColumnRightClick={(_e, _busId) => {
                // Context menu handled in parent - placeholder for now
              }}
            />
          ) : (
            <div className="section-empty">
              No {direction === 'output' ? 'publisher' : 'listener'} ports
            </div>
          )}
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
    type: 'cell' | 'column' | 'row';
    rowKey?: RowKey;
    busId?: string;
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
  const pinnedBusIds = new Set(store.viewState.pinnedBusIds);

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
              store={store}
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
              store={store}
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
                {/* Only show Edit Lenses for listener (input) cells */}
                {store.getCell(contextMenu.rowKey!, contextMenu.busId!)?.direction === 'input' && (
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
                )}
              </>
            )}
            {contextMenu.type === 'column' && (
              <>
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
