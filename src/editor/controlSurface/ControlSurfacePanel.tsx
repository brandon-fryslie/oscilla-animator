/**
 * Control Surface Panel Component
 *
 * The main Control Surface UI - a fixed instrument panel that exposes
 * the meaningful dimensions of an animation.
 *
 * Layout (always in this order):
 * - Transport (global: play/stop/scrub) - handled by parent
 * - TIME section
 * - MOTION section
 * - STYLE section
 * - CHAOS section
 * - ADVANCED section (optional, collapsed by default)
 *
 * Key principles:
 * - Fixed format instrument panel, not a free-form inspector
 * - Width is fixed (muscle memory matters)
 * - Independent of lane scrolling
 */

import { observer } from 'mobx-react-lite';
import { useCallback } from 'react';
import type { ControlSurfaceStore } from './store';
import type {
  SurfaceSection,
  SurfaceControl,
  SectionKind,
} from './types';
import {
  isNumberControl,
  isEnumControl,
  isToggleControl,
  isXYControl,
  isColorControl,
} from './types';
import {
  NumberControlUI,
  EnumControlUI,
  ToggleControlUI,
  XYControlUI,
  ColorControlUI,
} from './controls';
import './ControlSurface.css';

// =============================================================================
// Section Icons
// =============================================================================

const SECTION_ICONS: Record<SectionKind, string> = {
  time: '⏱',
  motion: '↗',
  style: '✦',
  chaos: '🎲',
  advanced: '⚙',
};

const SECTION_DESCRIPTIONS: Record<SectionKind, string> = {
  time: 'Controls that affect when things happen',
  motion: 'Controls that affect where and how things move',
  style: 'Controls that affect how it looks',
  chaos: 'Controls that affect variation and exploration',
  advanced: 'Additional fine-tuning controls',
};

// =============================================================================
// Main Panel
// =============================================================================

interface ControlSurfacePanelProps {
  store: ControlSurfaceStore;
}

export const ControlSurfacePanel = observer(({ store }: ControlSurfacePanelProps) => {
  const { surface } = store;

  // Handler for randomizing seed (dice button)
  // IMPORTANT: Hooks must be called unconditionally before any early returns
  const handleDice = useCallback(() => {
    store.randomizeSeed();
  }, [store]);

  // Handler for resetting all controls
  const handleResetAll = useCallback(() => {
    store.resetAll();
  }, [store]);

  if (!surface) {
    return (
      <div className="control-surface-panel">
        <div className="control-surface-empty">
          <p>No controls available</p>
          <p className="control-surface-hint">
            Drop a macro to generate a control surface
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="control-surface-panel">
      {/* Header */}
      <div className="control-surface-header">
        <h2>{surface.title}</h2>
        <div className="control-surface-actions">
          <button
            className="surface-action-btn dice-btn"
            onClick={handleDice}
            title="Randomize seed"
          >
            🎲
          </button>
          <button
            className="surface-action-btn reset-btn"
            onClick={handleResetAll}
            title="Reset all controls"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="control-surface-sections">
        {surface.sections.map((section) => (
          <SectionPanel
            key={section.id}
            section={section}
            store={store}
          />
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// Section Panel
// =============================================================================

interface SectionPanelProps {
  section: SurfaceSection;
  store: ControlSurfaceStore;
}

const SectionPanel = observer(({ section, store }: SectionPanelProps) => {
  const { kind, title, collapsed, controls } = section;

  // IMPORTANT: Hooks must be called unconditionally before any early returns
  const handleToggle = useCallback(() => {
    store.toggleSection(section.id);
  }, [store, section.id]);

  const handleResetSection = useCallback(() => {
    store.resetSection(section.id);
  }, [store, section.id]);

  const icon = SECTION_ICONS[kind];
  const description = SECTION_DESCRIPTIONS[kind];

  // Skip rendering if no controls in section
  if (controls.length === 0) {
    return null;
  }

  return (
    <div className={`control-section ${collapsed ? 'collapsed' : ''}`}>
      <div className="section-header" onClick={handleToggle}>
        <span className="section-icon">{icon}</span>
        <span className="section-title">{title}</span>
        <span className="section-count">{controls.length}</span>
        <button
          className="section-reset-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleResetSection();
          }}
          title="Reset section"
        >
          ↺
        </button>
        <span className={`section-chevron ${collapsed ? 'collapsed' : ''}`}>
          ▼
        </span>
      </div>

      {!collapsed && (
        <div className="section-body">
          <p className="section-description">{description}</p>
          <div className="section-controls">
            {controls.map((control) => (
              <ControlRenderer
                key={control.id}
                control={control}
                store={store}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Control Renderer
// =============================================================================

interface ControlRendererProps {
  control: SurfaceControl;
  store: ControlSurfaceStore;
}

const ControlRenderer = observer(({ control, store }: ControlRendererProps) => {
  const handleChange = useCallback(
    (value: unknown) => {
      store.updateControlValue(control.id, value);
    },
    [store, control.id]
  );

  const handleReset = useCallback(() => {
    store.resetControl(control.id);
  }, [store, control.id]);

  if (isNumberControl(control)) {
    return (
      <NumberControlUI
        control={control}
        onChange={handleChange as (v: number) => void}
        onReset={handleReset}
      />
    );
  }

  if (isEnumControl(control)) {
    return (
      <EnumControlUI
        control={control}
        onChange={handleChange as (v: string) => void}
        onReset={handleReset}
      />
    );
  }

  if (isToggleControl(control)) {
    return (
      <ToggleControlUI
        control={control}
        onChange={handleChange as (v: boolean) => void}
        onReset={handleReset}
      />
    );
  }

  if (isXYControl(control)) {
    return (
      <XYControlUI
        control={control}
        onChange={handleChange as (v: { x: number; y: number }) => void}
        onReset={handleReset}
      />
    );
  }

  if (isColorControl(control)) {
    return (
      <ColorControlUI
        control={control}
        onChange={handleChange as (v: string) => void}
        onReset={handleReset}
      />
    );
  }

  // Fallback for unknown control type - use exhaustive check pattern
  // This should never happen if all control types are properly handled
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _exhaustiveCheck: never = control;
  return (
    <div className="control-unknown">
      Unknown control type
    </div>
  );
});
