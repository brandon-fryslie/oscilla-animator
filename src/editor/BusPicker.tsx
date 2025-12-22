/**
 * BusPicker Component
 *
 * Two-stage dropdown for binding an input port to a bus with optional lens.
 * Stage 1: Select bus (shows compatible buses filtered by type)
 * Stage 2: Configure lens (optional, can skip)
 */

import { observer } from 'mobx-react-lite';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from './stores';
import type { RootStore } from './stores';
import type { Bus, TypeDesc, PortRef, Listener, LensDefinition } from './types';
import { SLOT_TYPE_TO_TYPE_DESC, isDirectlyCompatible } from './types';
import { BusCreationDialog } from './BusCreationDialog';
import { LensSelector } from './components/LensSelector';
import './BusPicker.css';

interface BusPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Port being bound */
  portRef: PortRef;
  /** Position to render dropdown */
  position: { x: number; y: number };
}

type Stage = 'bus' | 'lens';

/**
 * Get compatible buses for a port's type.
 */
function getCompatibleBuses(store: RootStore, portType: TypeDesc): Bus[] {
  return store.busStore.buses.filter((bus: Bus) => isDirectlyCompatible(bus.type, portType));
}

/**
 * Check if a port is already subscribed to a bus.
 */
function isPortSubscribedToBus(store: RootStore, portRef: PortRef, busId: string): boolean {
  return store.busStore.listeners.some(
    (l: Listener) =>
      l.busId === busId &&
      l.to.blockId === portRef.blockId &&
      l.to.slotId === portRef.slotId
  );
}

/**
 * Bus picker dropdown component with lens selection.
 */
export const BusPicker = observer((props: BusPickerProps) => {
  const store = useStore();
  const { isOpen, onClose, portRef, position } = props;
  const [stage, setStage] = useState<Stage>('bus');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [selectedLens, setSelectedLens] = useState<LensDefinition | undefined>(undefined);
  const [showConvertible, setShowConvertible] = useState(false);
  const [isCreationDialogOpen, setIsCreationDialogOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Reset state when picker opens
  useEffect(() => {
    if (isOpen) {
      setStage('bus');
      setSelectedBusId(null);
      setSelectedLens(undefined);
    }
  }, [isOpen]);

  // Get the port's TypeDesc
  const block = store.patchStore.blocks.find((b) => b.id === portRef.blockId);
  const slot = block?.inputs.find((s) => s.id === portRef.slotId);

  if (slot === undefined || slot === null) {
    return null; // Port not found
  }

  const portTypeDesc = SLOT_TYPE_TO_TYPE_DESC[slot.type];
  if (portTypeDesc === undefined || portTypeDesc === null) {
    console.warn(`No TypeDesc found for slot type: ${slot.type}`);
    return null;
  }

  const compatibleBuses = getCompatibleBuses(store, portTypeDesc);
  const selectedBus = selectedBusId !== null && selectedBusId !== undefined ? store.busStore.getBusById(selectedBusId) : null;

  // Handle click outside to close
  useEffect(() => {
    if (isOpen === false) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stage === 'lens') {
          setStage('bus');
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, stage]);

  const handleSelectBus = (busId: string) => {
    setSelectedBusId(busId);
    setStage('lens');
  };

  const handleSkipLens = () => {
    if (selectedBusId === undefined || selectedBusId === null) return;
    store.busStore.addListener(selectedBusId, portRef.blockId, portRef.slotId, undefined, undefined);
    onClose();
  };

  const handleApplyLens = () => {
    if (selectedBusId === undefined || selectedBusId === null) return;
    store.busStore.addListener(selectedBusId, portRef.blockId, portRef.slotId, undefined, selectedLens);
    onClose();
  };

  const handleBackToBus = () => {
    setStage('bus');
  };

  const handleCreateNewBus = () => {
    setIsCreationDialogOpen(true);
  };

  const handleBusCreated = (busId: string) => {
    setIsCreationDialogOpen(false);
    // Auto-select the new bus and go to lens stage
    setSelectedBusId(busId);
    setStage('lens');
  };

  if (isOpen === false) return null;

  // Calculate position to keep dropdown on screen
  const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 1000,
  };

  return createPortal(
    <>
      <div ref={pickerRef} className="bus-picker" style={dropdownStyle}>
        {/* Stage 1: Bus Selection */}
        {stage === 'bus' && (
          <>
            <div className="bus-picker-header">
              <h4 className="bus-picker-title">Select Bus</h4>
              <span className="bus-picker-type-hint">
                {portTypeDesc.world} · {portTypeDesc.domain}
              </span>
            </div>

            {/* Bus list */}
            <div className="bus-picker-list">
              {compatibleBuses.length === 0 ? (
                <div className="bus-picker-empty">No compatible buses</div>
              ) : (
                compatibleBuses.map((bus) => {
                  const isSubscribed = isPortSubscribedToBus(store, portRef, bus.id);
                  return (
                    <div
                      key={bus.id}
                      className={`bus-picker-item ${isSubscribed ? 'subscribed' : ''}`}
                      onClick={() => !isSubscribed && handleSelectBus(bus.id)}
                      title={isSubscribed ? 'Already subscribed' : `Subscribe to ${bus.name}`}
                    >
                      <span className="bus-picker-item-name">{bus.name}</span>
                      {isSubscribed && <span className="bus-picker-checkmark">✓</span>}
                    </div>
                  );
                })
              )}
            </div>

            {/* Show convertible toggle (disabled in Phase 3) */}
            <div className="bus-picker-toggle">
              <label className="bus-picker-toggle-label" title="Phase 4 feature">
                <input
                  type="checkbox"
                  checked={showConvertible}
                  onChange={(e) => setShowConvertible(e.target.checked)}
                  disabled
                />
                <span>Show convertible</span>
              </label>
            </div>

            {/* Create new bus button */}
            <div className="bus-picker-footer">
              <button
                className="bus-picker-create-btn"
                onClick={handleCreateNewBus}
                title="Create a new bus of this type"
              >
                + Create new bus
              </button>
            </div>
          </>
        )}

        {/* Stage 2: Lens Selection */}
        {stage === 'lens' && selectedBus !== null && selectedBus !== undefined && (
          <>
            <div className="bus-picker-header">
              <button className="bus-picker-back-btn" onClick={handleBackToBus} title="Back to bus selection">
                ←
              </button>
              <div className="bus-picker-header-content">
                <h4 className="bus-picker-title">Configure Lens</h4>
                <span className="bus-picker-bus-name">{selectedBus.name}</span>
              </div>
            </div>

            <div className="bus-picker-lens-panel">
              <p className="bus-picker-lens-hint">
                Lenses transform the bus value before it reaches the input.
              </p>
              <LensSelector
                value={selectedLens}
                onChange={setSelectedLens}
              />
            </div>

            <div className="bus-picker-footer bus-picker-footer--actions">
              <button
                className="bus-picker-skip-btn"
                onClick={handleSkipLens}
                title="Subscribe without lens"
              >
                Skip
              </button>
              <button
                className="bus-picker-apply-btn"
                onClick={handleApplyLens}
                title={selectedLens ? 'Subscribe with lens' : 'Subscribe without lens'}
              >
                {selectedLens ? 'Apply' : 'Subscribe'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Bus creation dialog */}
      <BusCreationDialog
        isOpen={isCreationDialogOpen}
        onClose={() => setIsCreationDialogOpen(false)}
        onCreated={handleBusCreated}
        suggestedType={portTypeDesc}
      />
    </>,
    document.body
  );
});
