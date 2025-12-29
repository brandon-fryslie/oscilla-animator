/**
 * ContextMenu Component
 *
 * Right-click context menu for ports, showing disconnect options.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import { getConnectionsForPort, findCompatiblePorts } from './portUtils';
import './ContextMenu.css';

/**
 * ContextMenu renders a right-click menu for port operations.
 * Shows disconnect options with optional confirmation.
 */
export const ContextMenu = observer(() => {
  const store = useStore();
  const { contextMenu } = store.uiStore.uiState;
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Extract values needed for hooks BEFORE any early returns
  const portRef = contextMenu.portRef;
  const isOpen = contextMenu.isOpen && portRef !== null;

  // Get block/slot info for display (needed for useMemo dependency)
  const block = isOpen && portRef !== null ? store.patchStore.blocks.find((b) => b.id === portRef.blockId) : null;
  const slots = isOpen && portRef !== null ? (portRef.direction === 'input' ? block?.inputs : block?.outputs) : null;
  const slot = (slots !== null && slots !== undefined && portRef !== null) ? slots.find((s) => s.id === portRef.slotId) : null;

  // Find compatible ports that can be connected - MUST be before early return
  const compatiblePorts = useMemo(() => {
    if (!isOpen || slot === null || slot === undefined || portRef === null) return [];
    return findCompatiblePorts(
      portRef,
      slot,
      store.patchStore.blocks,
      store.patchStore.connections
    ).slice(0, 8); // Limit to 8 to keep menu compact
  }, [isOpen, portRef, slot, store.patchStore.blocks, store.patchStore.connections]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        store.uiStore.closeContextMenu();
        setShowConfirm(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        store.uiStore.closeContextMenu();
        setShowConfirm(null);
      }
    };

    // Use timeout to avoid immediately closing from the same right-click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, store]);

  if (!isOpen || portRef === null) {
    return null;
  }

  const connections = getConnectionsForPort(
    portRef.blockId,
    portRef.slotId,
    portRef.direction,
    store.patchStore.connections
  );

  const handleConnect = (targetBlockId: string, targetSlotId: string) => {
    if (portRef.direction === 'output') {
      // This port is an output, target is an input
      store.patchStore.connect(portRef.blockId, portRef.slotId, targetBlockId, targetSlotId);
    } else {
      // This port is an input, target is an output
      // Remove existing connection first (input can only have one source)
      const existingConn = connections.find(c => c.to.blockId === portRef.blockId && c.to.slotId === portRef.slotId);
      if (existingConn !== undefined) {
        store.patchStore.disconnect(existingConn.id);
      }
      store.patchStore.connect(targetBlockId, targetSlotId, portRef.blockId, portRef.slotId);
    }
    store.uiStore.closeContextMenu();
  };

  const handleDisconnect = (connectionId: string) => {
    if (store.uiStore.settings.warnBeforeDisconnect && showConfirm !== connectionId) {
      setShowConfirm(connectionId);
      return;
    }

    store.patchStore.disconnect(connectionId);
    setShowConfirm(null);

    // Close menu if no more connections
    const remainingConnections = connections.filter((c) => c.id !== connectionId);
    if (remainingConnections.length === 0) {
      store.uiStore.closeContextMenu();
    }
  };

  const handleDisconnectAll = () => {
    if (store.uiStore.settings.warnBeforeDisconnect && showConfirm !== 'all') {
      setShowConfirm('all');
      return;
    }

    connections.forEach((conn) => store.patchStore.disconnect(conn.id));
    store.uiStore.closeContextMenu();
    setShowConfirm(null);
  };

  const handleCancelConfirm = () => {
    setShowConfirm(null);
  };

  // Calculate position, keeping menu on screen
  const style: React.CSSProperties = {
    left: contextMenu.x,
    top: contextMenu.y,
  };

  return (
    <div className="context-menu-overlay">
      <div ref={menuRef} className="context-menu" style={style}>
        <div className="context-menu-header">
          <span className="context-menu-direction">
            {portRef.direction === 'input' ? '← Input' : 'Output →'}
          </span>
          <span className="context-menu-slot">{slot?.label ?? portRef.slotId}</span>
        </div>

        <div className="context-menu-section">
          <button
            className="context-menu-action"
            onClick={() => {
              store.uiStore.selectBlock(portRef.blockId);
              store.uiStore.closeContextMenu();
            }}
          >
            <span className="context-menu-icon">🔍</span>
            <span>View in Inspector</span>
          </button>
        </div>

        {/* Compatible ports section - for quick connecting */}
        {compatiblePorts.length > 0 && (
          <div className="context-menu-section">
            <div className="context-menu-section-title">
              {portRef.direction === 'output' ? 'Connect to Input' : 'Connect from Output'}
            </div>
            {compatiblePorts.map((target) => (
              <div key={`${target.block.id}:${target.slot.id}`} className="context-menu-item">
                <button
                  className="context-menu-action connect"
                  onClick={() => handleConnect(target.block.id, target.slot.id)}
                >
                  <span className="context-menu-icon">+</span>
                  <span className="context-menu-target-block">{target.block.label}</span>
                  <span className="context-menu-target-slot">{target.slot.label}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {connections.length === 0 ? (
          compatiblePorts.length === 0 && <div className="context-menu-empty">No connections available</div>
        ) : (
          <>
            <div className="context-menu-section">
              <div className="context-menu-section-title">Connections</div>
              {connections.map((conn) => {
                const otherBlockId =
                  portRef.direction === 'output' ? conn.to.blockId : conn.from.blockId;
                const otherSlotId =
                  portRef.direction === 'output' ? conn.to.slotId : conn.from.slotId;
                const otherBlock = store.patchStore.blocks.find((b) => b.id === otherBlockId);
                const otherSlots =
                  portRef.direction === 'output' ? otherBlock?.inputs : otherBlock?.outputs;
                const otherSlot = otherSlots?.find((s) => s.id === otherSlotId);

                const isConfirming = showConfirm === conn.id;

                return (
                  <div key={conn.id} className="context-menu-item">
                    {isConfirming ? (
                      <div className="context-menu-confirm">
                        <span>Disconnect?</span>
                        <button
                          className="context-menu-confirm-btn confirm"
                          onClick={() => handleDisconnect(conn.id)}
                        >
                          Yes
                        </button>
                        <button
                          className="context-menu-confirm-btn cancel"
                          onClick={handleCancelConfirm}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        className="context-menu-action"
                        onClick={() => handleDisconnect(conn.id)}
                      >
                        <span className="context-menu-icon">×</span>
                        <span className="context-menu-target-block">
                          {otherBlock?.label ?? otherBlockId}
                        </span>
                        <span className="context-menu-target-slot">
                          {otherSlot?.label ?? otherSlotId}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {connections.length > 1 && (
              <div className="context-menu-section">
                <div className="context-menu-item">
                  {showConfirm === 'all' ? (
                    <div className="context-menu-confirm">
                      <span>Disconnect all?</span>
                      <button
                        className="context-menu-confirm-btn confirm"
                        onClick={handleDisconnectAll}
                      >
                        Yes
                      </button>
                      <button
                        className="context-menu-confirm-btn cancel"
                        onClick={handleCancelConfirm}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className="context-menu-action disconnect-all"
                      onClick={handleDisconnectAll}
                    >
                      <span className="context-menu-icon">⊗</span>
                      <span>Disconnect All ({connections.length})</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
