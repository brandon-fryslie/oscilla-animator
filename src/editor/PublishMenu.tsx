/**
 * PublishMenu Component
 *
 * Context menu for publishing output ports to buses.
 * Allows publishing to existing buses, creating new bus from output,
 * or stopping publication.
 */

import { observer } from 'mobx-react-lite';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from './stores';
import type { RootStore } from './stores';
import type { Bus, TypeDesc, PortRef, Publisher, Block, Slot } from './types';
import { SLOT_TYPE_TO_TYPE_DESC, isDirectlyCompatible } from './types';
import { BusCreationDialog } from './BusCreationDialog';
import './PublishMenu.css';

interface PublishMenuProps {
  isOpen: boolean;
  onClose: () => void;
  /** Port being published */
  portRef: PortRef;
  /** Position to render menu */
  position: { x: number; y: number };
}

/**
 * Get compatible buses for a port's type.
 */
function getCompatibleBuses(store: RootStore, portType: TypeDesc): Bus[] {
  return store.busStore.buses.filter((bus: Bus) => isDirectlyCompatible(bus.type, portType));
}

/**
 * Get publishers from this port to any buses.
 */
function getPortPublishers(store: RootStore, portRef: PortRef): Publisher[] {
  return store.busStore.publishers.filter(
    (p: Publisher) =>
      p.from.blockId === portRef.blockId &&
      p.from.slotId === portRef.slotId
  );
}

/**
 * Check if a port is already publishing to a bus.
 */
function isPortPublishingToBus(store: RootStore, portRef: PortRef, busId: string): boolean {
  return store.busStore.publishers.some(
    (p: Publisher) =>
      p.busId === busId &&
      p.from.blockId === portRef.blockId &&
      p.from.slotId === portRef.slotId
  );
}

/**
 * Publish menu component.
 */
export const PublishMenu = observer((props: PublishMenuProps) => {
  const store = useStore();
  const { isOpen, onClose, portRef, position } = props;
  const [showBusSubmenu, setShowBusSubmenu] = useState(false);
  const [isCreationDialogOpen, setIsCreationDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get the port's TypeDesc
  const block = store.patchStore.blocks.find((b: Block) => b.id === portRef.blockId);
  const slot = block?.outputs.find((s: Slot) => s.id === portRef.slotId);

  if (!slot) {
    return null; // Port not found
  }

  const portTypeDesc = SLOT_TYPE_TO_TYPE_DESC[slot.type];
  if (!portTypeDesc) {
    console.warn(`No TypeDesc found for slot type: ${slot.type}`);
    return null;
  }

  const compatibleBuses = getCompatibleBuses(store, portTypeDesc);
  const currentPublishers = getPortPublishers(store, portRef);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handlePublishToBus = (busId: string) => {
    // Add publisher
    store.busStore.addPublisher(busId, portRef.blockId, portRef.slotId);
    onClose();
  };

  const handleCreateNewBus = () => {
    setIsCreationDialogOpen(true);
  };

  const handleStopPublishing = (publisherId: string) => {
    store.busStore.removePublisher(publisherId);
    onClose();
  };

  const handleBusCreated = (_busId: string) => {
    // Auto-publish is handled by BusCreationDialog's autoPublish props
    setIsCreationDialogOpen(false);
    onClose();
  };

  if (!isOpen) return null;

  // Calculate position to keep menu on screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 1000,
  };

  return createPortal(
    <>
      <div ref={menuRef} className="publish-menu" style={menuStyle}>
        <div className="publish-menu-header">
          <h4 className="publish-menu-title">Publish Output</h4>
          <span className="publish-menu-type-hint">
            {portTypeDesc.world} · {portTypeDesc.domain}
          </span>
        </div>

        {/* Publish to bus... (with submenu) */}
        <div
          className="publish-menu-item"
          onMouseEnter={() => setShowBusSubmenu(true)}
          onMouseLeave={() => setShowBusSubmenu(false)}
        >
          <span>Publish to bus...</span>
          <span className="publish-menu-arrow">▶</span>

          {/* Submenu */}
          {showBusSubmenu && (
            <div className="publish-menu-submenu">
              {compatibleBuses.length === 0 ? (
                <div className="publish-menu-submenu-empty">No compatible buses</div>
              ) : (
                compatibleBuses.map((bus: Bus) => {
                  const isPublishing = isPortPublishingToBus(store, portRef, bus.id);
                  return (
                    <div
                      key={bus.id}
                      className={`publish-menu-submenu-item ${isPublishing ? 'active' : ''}`}
                      onClick={() => !isPublishing && handlePublishToBus(bus.id)}
                      title={isPublishing ? 'Already publishing' : `Publish to ${bus.name}`}
                    >
                      <span className="publish-menu-submenu-name">{bus.name}</span>
                      {isPublishing && <span className="publish-menu-checkmark">✓</span>}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Create new bus from output */}
        <div
          className="publish-menu-item"
          onClick={handleCreateNewBus}
          title="Create a new bus from this output"
        >
          <span>Create new bus from output</span>
        </div>

        {/* Stop publishing (one item per bus) */}
        {currentPublishers.length > 0 && (
          <>
            <div className="publish-menu-separator" />
            {currentPublishers.map((publisher: Publisher) => {
              const bus = store.busStore.buses.find((b: Bus) => b.id === publisher.busId);
              const busName = bus?.name || 'Unknown';
              return (
                <div
                  key={publisher.id}
                  className="publish-menu-item stop"
                  onClick={() => handleStopPublishing(publisher.id)}
                  title={`Stop publishing to ${busName}`}
                >
                  <span>Stop publishing to {busName}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Bus creation dialog */}
      <BusCreationDialog
        isOpen={isCreationDialogOpen}
        onClose={() => setIsCreationDialogOpen(false)}
        onCreated={handleBusCreated}
        suggestedType={portTypeDesc}
        autoPublishFromBlock={portRef.blockId}
        autoPublishFromPort={portRef.slotId}
      />
    </>,
    document.body
  );
});
