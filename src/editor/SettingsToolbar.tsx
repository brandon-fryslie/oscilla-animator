/**
 * Settings Toolbar
 *
 * Top toolbar with dropdowns for editor settings:
 * - Lane layout/mode (Simple vs Advanced)
 * - Connection settings
 * - Palette filtering
 */

import { observer } from 'mobx-react-lite';
import { useState, useRef, useEffect } from 'react';
import { useStore } from './stores';
import { PRESET_LAYOUTS } from './laneLayouts';
import { isDefined } from './types/helpers';
import './SettingsToolbar.css';

interface SettingsToolbarProps {
  onShowHelp?: () => void;
  onOpenPaths: () => void;
  isPathsModalOpen: boolean;
  showHelpNudge?: boolean;
  onDesignerView?: () => void;
  onPerformanceView?: () => void;
}

/**
 * Dropdown menu component with icon trigger.
 */
function Dropdown({
  icon,
  label,
  children,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={ref} className="toolbar-dropdown">
      <button
        className={`toolbar-dropdown-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        title={disabled ? `${label} (coming soon)` : label}
        disabled={disabled}
      >
        <span className="dropdown-icon">{icon}</span>
        <span className="dropdown-label">{label}</span>
        <span className="dropdown-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && !disabled && (
        <div className="toolbar-dropdown-menu">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Menu item component.
 */
function MenuItem({
  label,
  checked,
  onClick,
  disabled = false,
  description,
}: {
  label: string;
  checked?: boolean;
  onClick: () => void;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <button
      className={`dropdown-menu-item ${checked === true ? 'checked' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onClick()}
      disabled={disabled}
    >
      <span className="menu-item-check">{checked === true ? '✓' : ''}</span>
      <span className="menu-item-content">
        <span className="menu-item-label">{label}</span>
        {isDefined(description) && <span className="menu-item-description">{description}</span>}
      </span>
    </button>
  );
}

/**
 * Menu divider.
 */
function MenuDivider() {
  return <div className="dropdown-menu-divider" />;
}

/**
 * Menu section header.
 */
function MenuHeader({ children }: { children: React.ReactNode }) {
  return <div className="dropdown-menu-header">{children}</div>;
}

/**
 * Lanes icon (grid/rows).
 */
function LanesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="3" rx="1" fill="currentColor" opacity="0.6" />
      <rect x="1" y="6.5" width="14" height="3" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="1" y="11" width="14" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Connection icon (nodes connected).
 */
function ConnectionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 8H9.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Filter icon.
 */
function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 4H14M4 8H12M6 12H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Paths icon.
 */
function PathsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 4.5C3 4.22386 3.22386 4 3.5 4H7.5L8.5 5H12.5C12.7761 5 13 5.22386 13 5.5V12.5C13 12.7761 12.7761 13 12.5 13H3.5C3.22386 13 3 12.7761 3 12.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
      />
      <path
        d="M5 7.5H11"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M5 9.5H9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Settings Toolbar component.
 */
export const SettingsToolbar = observer(({ onShowHelp, onOpenPaths, isPathsModalOpen, showHelpNudge, onDesignerView, onPerformanceView }: SettingsToolbarProps) => {
  const store = useStore();
  const currentLayout = store.viewStore.currentLayout;

  return (
    <div className="settings-toolbar">
      <div className="toolbar-left">
        <span className="toolbar-title">Loom Editor</span>
      </div>

      <div className="toolbar-center">
        {/* Lane Layout Dropdown */}
        <Dropdown icon={<LanesIcon />} label="Lanes">
          <MenuHeader>Layout Preset</MenuHeader>
          {PRESET_LAYOUTS.map((layout) => (
            <MenuItem
              key={layout.id}
              label={layout.name}
              description={layout.description}
              checked={currentLayout.id === layout.id}
              onClick={() => store.viewStore.switchLayout(layout.id)}
            />
          ))}
          <MenuDivider />
          <MenuHeader>Mode</MenuHeader>
          <MenuItem
            label="Simple Mode"
            description="Fixed lane structure, guided workflow"
            checked={store.uiStore.settings.advancedLaneMode === false}
            onClick={() => store.uiStore.setAdvancedLaneMode(false)}
          />
          <MenuItem
            label="Advanced Mode"
            description="Customize lanes freely"
            checked={store.uiStore.settings.advancedLaneMode === true}
            onClick={() => store.uiStore.setAdvancedLaneMode(true)}
            disabled={true}
          />
        </Dropdown>

        {/* Connection Settings Dropdown */}
        <Dropdown icon={<ConnectionIcon />} label="Connections">
          <MenuHeader>Auto-Connect</MenuHeader>
          <MenuItem
            label="Auto-connect on drop"
            description="Wire obvious connections automatically"
            checked={store.uiStore.settings.autoConnect === true}
            onClick={() => store.uiStore.setAutoConnect(!store.uiStore.settings.autoConnect)}
            disabled={true}
          />
          <MenuDivider />
          <MenuHeader>Display</MenuHeader>
          <MenuItem
            label="Show type hints"
            description="Display port types on hover"
            checked={store.uiStore.settings.showTypeHints === true}
            onClick={() => store.uiStore.setShowTypeHints(!store.uiStore.settings.showTypeHints)}
          />
          <MenuItem
            label="Highlight compatible"
            description="Glow compatible ports when dragging"
            checked={store.uiStore.settings.highlightCompatible === true}
            onClick={() => store.uiStore.setHighlightCompatible(!store.uiStore.settings.highlightCompatible)}
          />
          <MenuItem
            label="Warn before disconnect"
            description="Show confirmation when disconnecting"
            checked={store.uiStore.settings.warnBeforeDisconnect === true}
            onClick={() => store.uiStore.setWarnBeforeDisconnect(!store.uiStore.settings.warnBeforeDisconnect)}
          />
        </Dropdown>

        {/* Palette Filtering Dropdown */}
        <Dropdown icon={<FilterIcon />} label="Palette">
          <MenuHeader>Filtering</MenuHeader>
          <MenuItem
            label="Filter by lane"
            description="Show blocks matching lane type"
            checked={store.uiStore.settings.filterByLane === true}
            onClick={() => store.uiStore.setFilterByLane(!store.uiStore.settings.filterByLane)}
          />
          <MenuItem
            label="Filter by connection"
            description="Show blocks that can connect to selection"
            checked={store.uiStore.settings.filterByConnection === true}
            onClick={() => store.uiStore.setFilterByConnection(!store.uiStore.settings.filterByConnection)}
          />
          <MenuDivider />
          <MenuHeader>Display</MenuHeader>
          <MenuItem
            label="Show all blocks"
            description="Always show full library"
            checked={store.uiStore.settings.filterByLane === false && store.uiStore.settings.filterByConnection === false}
            onClick={() => {
              store.uiStore.setFilterByLane(false);
              store.uiStore.setFilterByConnection(false);
            }}
          />
        </Dropdown>

        {/* Path Manager */}
        <button
          className={`toolbar-dropdown-trigger ${isPathsModalOpen ? 'active' : ''}`}
          onClick={onOpenPaths}
          title="Manage SVG paths"
        >
          <span className="dropdown-icon"><PathsIcon /></span>
          <span className="dropdown-label">Paths...</span>
        </button>

      </div>

      <div className="toolbar-right">
        {/* View preset icons */}
        {onDesignerView && (
          <button
            className="view-preset-btn"
            onClick={onDesignerView}
            title="Designer View: balanced layout"
          >
            🎨
          </button>
        )}
        {onPerformanceView && (
          <button
            className="view-preset-btn"
            onClick={onPerformanceView}
            title="Performance View: preview focus"
          >
            🎬
          </button>
        )}

        <button
          className={`toolbar-help-btn ${showHelpNudge === true ? 'nudge' : ''}`}
          onClick={() => onShowHelp?.()}
          title="Quick tour / Help"
        >
          ?
        </button>

        <button
          className="toolbar-clear-btn"
          onClick={() => store.clearPatch()}
          title="Clear all blocks and connections"
        >
          Clear All
        </button>

        {/* Action buttons - disabled until Phase 6 */}
        <button
          className="toolbar-action-btn"
          disabled
          title="Save patch (Phase 6)"
        >
          Save
        </button>
        <button
          className="toolbar-action-btn"
          disabled
          title="Load patch (Phase 6)"
        >
          Load
        </button>
        <button
          className="toolbar-action-btn"
          disabled
          title="Export animation (Phase 6)"
        >
          Export
        </button>

        <div className="toolbar-divider" />

        <span className="toolbar-status">
          {store.patchStore.blocks.length} blocks · {store.patchStore.connections.length} connections
        </span>
      </div>
    </div>
  );
});
