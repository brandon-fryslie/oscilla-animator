/**
 * BoardHUD Component
 *
 * Always-visible controls for zoom, density, and view options.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md (D5)
 */

import { observer } from 'mobx-react-lite';
import type { DensityMode } from '../stores/ViewportStore';
import './Board.css';

export interface BoardHUDProps {
  density: DensityMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onDensityChange?: (density: DensityMode) => void;
}

/**
 * BoardHUD renders zoom controls and density indicator.
 */
export const BoardHUD = observer<BoardHUDProps>(function BoardHUD({
  density,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onDensityChange,
}) {
  return (
    <div className="board-hud">
      <div className="hud-controls">
        {/* Zoom in */}
        <button
          className="hud-button"
          onClick={onZoomIn}
          title="Zoom In (Ctrl/Cmd +)"
          aria-label="Zoom in"
        >
          <span>+</span>
        </button>

        {/* Zoom out */}
        <button
          className="hud-button"
          onClick={onZoomOut}
          title="Zoom Out (Ctrl/Cmd -)"
          aria-label="Zoom out"
        >
          <span>−</span>
        </button>

        {/* Zoom to fit */}
        <button
          className="hud-button"
          onClick={onZoomToFit}
          title="Zoom to Fit (F)"
          aria-label="Zoom to fit"
        >
          <span>⊡</span>
        </button>

        <div className="hud-separator" />

        {/* Density indicator */}
        <div className="density-indicator" title={`Density: ${density}`}>
          {density === 'overview' && 'COMPACT'}
          {density === 'normal' && 'NORMAL'}
          {density === 'detail' && 'DETAIL'}
        </div>

        {/* Optional: Density cycle button */}
        {onDensityChange !== undefined && (
          <button
            className="hud-button"
            onClick={() => cycleDensity(density, onDensityChange)}
            title="Toggle Density"
            aria-label="Toggle density"
          >
            <span>⊞</span>
          </button>
        )}
      </div>
    </div>
  );
});

/**
 * Cycle through density modes.
 */
function cycleDensity(
  current: DensityMode,
  onChange: (density: DensityMode) => void
): void {
  const modes: DensityMode[] = ['overview', 'normal', 'detail'];
  const currentIndex = modes.indexOf(current);
  const nextIndex = (currentIndex + 1) % modes.length;
  onChange(modes[nextIndex]);
}
