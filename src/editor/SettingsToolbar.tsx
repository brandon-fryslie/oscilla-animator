/**
 * Settings Toolbar
 *
 * Top toolbar with dropdowns for editor settings:
 * - Lane layout/mode (Simple vs Advanced)
 * - Connection settings
 * - Palette filtering
 */

import { observer } from 'mobx-react-lite';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from './stores';
import { PRESET_LAYOUTS } from './laneLayouts';
import { getAllMacroKeys, getMacroDisplayName } from './macros';
import { isDefined } from './types/helpers';
import type { Patch } from './types';
import './SettingsToolbar.css';

const STARTUP_MACRO_KEY = 'oscilla-startup-macro';

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
 * Startup/Play icon.
 */
function StartupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 3L13 8L4 13V3Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Get the startup macro from localStorage, or return the first macro if not set/invalid.
 */
export function getStartupMacro(): string {
  const allMacros = getAllMacroKeys();
  if (allMacros.length === 0) return '';

  try {
    const saved = localStorage.getItem(STARTUP_MACRO_KEY);
    if (saved && allMacros.includes(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }

  return allMacros[0];
}

/**
 * Save the startup macro to localStorage.
 */
function setStartupMacro(macroKey: string): void {
  try {
    localStorage.setItem(STARTUP_MACRO_KEY, macroKey);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Startup Macro dropdown - allows selecting which macro loads on startup.
 */
function StartupMacroDropdown() {
  const [currentMacro, setCurrentMacro] = useState(() => getStartupMacro());
  const allMacros = getAllMacroKeys();

  const handleSelect = (macroKey: string) => {
    setStartupMacro(macroKey);
    setCurrentMacro(macroKey);
  };

  return (
    <Dropdown icon={<StartupIcon />} label="Startup">
      <MenuHeader>Load on Startup</MenuHeader>
      {allMacros.map((macroKey) => (
        <MenuItem
          key={macroKey}
          label={getMacroDisplayName(macroKey)}
          checked={currentMacro === macroKey}
          onClick={() => handleSelect(macroKey)}
        />
      ))}
    </Dropdown>
  );
}

/**
 * Error toast notification component.
 */
function ErrorToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="error-toast">
      <span className="error-toast-message">{message}</span>
      <button className="error-toast-close" onClick={onClose} title="Dismiss">
        ×
      </button>
    </div>
  );
}

/**
 * Generate filename with ISO timestamp format.
 * Example: patch-2025-12-27-14-30-45.oscilla.json
 */
function generatePatchFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19);
  return `patch-${timestamp}.oscilla.json`;
}

/**
 * Validate basic patch structure before attempting to load.
 * Returns error message if invalid, null if valid.
 */
function validatePatchStructure(patch: unknown): string | null {
  if (typeof patch !== 'object' || patch === null) {
    return 'Invalid JSON file. Expected an object.';
  }

  const p = patch as Partial<Patch>;

  if (typeof p.version !== 'number') {
    return 'Invalid patch file. Missing required field: version';
  }

  if (p.version !== 2) {
    return `Unsupported patch version: ${p.version}. This file may have been created by a newer version.`;
  }

  if (!Array.isArray(p.blocks)) {
    return 'Invalid patch file. Missing required field: blocks';
  }

  if (!Array.isArray(p.connections)) {
    return 'Invalid patch file. Missing required field: connections';
  }

  return null;
}

/**
 * Detect if platform is macOS.
 */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/**
 * Settings Toolbar component.
 */
export const SettingsToolbar = observer(({ onShowHelp, onOpenPaths, isPathsModalOpen, showHelpNudge, onDesignerView, onPerformanceView }: SettingsToolbarProps): React.ReactElement => {
  const store = useStore();
  const currentLayout = store.viewStore.currentLayout;
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Save current patch to a JSON file (download to disk).
   */
  const handleSavePatch = useCallback(() => {
    try {
      const patch = store.toJSON();
      const json = JSON.stringify(patch, null, 2);
      const filename = generatePatchFilename();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to save patch:', err);
      setError('Failed to save patch. Please check the console for details.');
    }
  }, [store]);

  /**
   * Load patch from a JSON file (from disk).
   */
  const handleLoadPatch = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle file selection from file picker.
   */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) ?? '';

        // Parse JSON
        let patch: unknown;
        try {
          patch = JSON.parse(text);
        } catch (err) {
          console.error('JSON parse error:', err);
          setError('Invalid JSON file. Please check the file format.');
          return;
        }

        // Validate structure
        const validationError = validatePatchStructure(patch);
        if (validationError !== null) {
          console.error('Patch validation error:', validationError);
          setError(validationError);
          return;
        }

        // Confirm before loading (will replace current patch)
        const confirmed = window.confirm(
          'Load this patch? Current patch will be replaced. Unsaved changes will be lost.'
        );
        if (!confirmed) {
          return;
        }

        // Load patch
        store.loadPatch(patch as Patch);

        // Reset file input to allow reloading same file
        if (fileInputRef.current !== null) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        console.error('Failed to load patch:', err);
        setError('Failed to load patch. Please check the console for details.');
      }
    };

    reader.onerror = () => {
      console.error('FileReader error');
      setError('Failed to read file. Please try again.');
    };

    reader.readAsText(file);
  }, [store]);

  /**
   * Handle keyboard shortcuts.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const isTyping = (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;

      const modKey = IS_MAC ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl+S: Save
      if (modKey && e.key === 's') {
        e.preventDefault();
        handleSavePatch();
      }

      // Cmd/Ctrl+O: Load
      if (modKey && e.key === 'o') {
        e.preventDefault();
        handleLoadPatch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSavePatch, handleLoadPatch]);

  const shortcutKey = IS_MAC ? 'Cmd' : 'Ctrl';

  return (
    <div className="settings-toolbar">
      {/* Error toast */}
      {error !== null && (
        <ErrorToast message={error} onClose={() => setError(null)} />
      )}

      {/* Hidden file input for loading patches */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.oscilla.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

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

        {/* Startup Macro Selector */}
        <StartupMacroDropdown />

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

        {/* Action buttons */}
        <button
          className="toolbar-action-btn"
          onClick={handleSavePatch}
          title={`Save patch (${shortcutKey}+S)`}
        >
          Save
        </button>
        <button
          className="toolbar-action-btn"
          onClick={handleLoadPatch}
          title={`Load patch (${shortcutKey}+O)`}
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
