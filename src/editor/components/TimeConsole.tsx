/**
 * TimeConsole Component
 *
 * Mode-aware time control console that replaces the linear timeline scrubber.
 * Switches between three UI modes based on TimeModel.kind:
 * - finite: Bounded progress bar with start/end
 * - cyclic: Phase ring (stub for now)
 * - infinite: Sliding window (stub for now)
 *
 * Supports three collapse levels for space efficiency:
 * - expanded: Full controls with all visualizations
 * - minimal: Single compact row with essential info
 * - hidden: Small chip to restore controls
 *
 * Always-present controls: Run/Freeze, Speed, Seed
 */

import { memo, useState, useRef, useCallback } from 'react';
import type { TimeModel, CuePoint } from '../compiler/types';
import type { PlayState } from '../runtime';
import './TimeConsole.css';

// =============================================================================
// Collapse Level Type
// =============================================================================

export type CollapseLevel = 'expanded' | 'minimal' | 'hidden';

// =============================================================================
// Types
// =============================================================================

export interface TimeConsoleProps {
  timeModel: TimeModel;
  currentTime: number;
  playState: PlayState;
  speed: number;
  seed: number;
  cuePoints: readonly CuePoint[];

  // Infinite mode state
  viewOffset?: number;

  // Collapse state (controlled or internal)
  collapseLevel?: CollapseLevel;
  onCollapseLevelChange?: (level: CollapseLevel) => void;
  defaultCollapseLevel?: CollapseLevel;

  // Callbacks
  onScrub: (tMs: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onSeedChange: (seed: number) => void;
  onViewOffsetChange?: (offset: number) => void;
  onWindowChange?: (windowMs: number) => void;
}

interface FiniteControlsProps {
  durationMs: number;
  currentTime: number;
  onScrub: (tMs: number) => void;
  cuePoints: readonly CuePoint[];
}

interface InfiniteControlsProps {
  windowMs: number;
  currentTime: number;
  viewOffset: number;
  collapseLevel: CollapseLevel;
  onViewOffsetChange: (offset: number) => void;
  onWindowChange: (windowMs: number) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}.${millis.toString().padStart(2, '0')}s`;
}

function formatViewOffset(ms: number): string {
  if (Math.abs(ms) < 10) return '0s';
  const sign = ms < 0 ? '-' : '+';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)}s`;
}

// =============================================================================
// FiniteControls Component
// =============================================================================

const FiniteControls = memo(function FiniteControls({
  durationMs,
  currentTime,
  onScrub,
  cuePoints,
}: FiniteControlsProps) {
  const progress = durationMs > 0 ? (currentTime / durationMs) * 100 : 0;
  const isEnded = durationMs > 0 && currentTime >= durationMs;

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    onScrub(Number(e.target.value));
  };

  return (
    <div className="finite-controls">
      {/* Time Readouts */}
      <div className="finite-readouts">
        <span className="finite-time-display">
          Time: {formatTime(currentTime)} / {formatTime(durationMs)}
        </span>
        <span className="finite-progress-display">
          Progress: {Math.round(progress)}%
          {isEnded && <span className="finite-ended-badge">ENDED</span>}
        </span>
      </div>

      {/* Bounded Scrubber */}
      <div className="finite-scrubber">
        <span className="finite-time-label finite-time-start">{formatTime(0)}</span>

        <div className="finite-scrubber-container">
          <input
            type="range"
            className="finite-scrubber-input"
            min={0}
            max={durationMs}
            step={16}
            value={currentTime}
            onChange={handleScrub}
          />

          {/* Cue Point Markers */}
          {cuePoints.map((cue, i) => {
            const percent = durationMs > 0 ? (cue.tMs / durationMs) * 100 : 0;
            return (
              <div
                key={`cue-${i}`}
                className={`finite-cue-marker cue-${cue.kind ?? 'marker'}`}
                style={{ left: `${percent}%` }}
                title={`${cue.label} (${formatTime(cue.tMs)})`}
              />
            );
          })}
        </div>

        <span className="finite-time-label finite-time-end">{formatTime(durationMs)}</span>
      </div>
    </div>
  );
});

// =============================================================================
// CyclicControls Placeholder
// =============================================================================

const CyclicControls = memo(function CyclicControls() {
  return (
    <div className="mode-placeholder">
      <span className="mode-placeholder-icon">🔄</span>
      <span className="mode-placeholder-text">CYCLE mode (coming soon)</span>
      <span className="mode-placeholder-hint">Phase ring visualization</span>
    </div>
  );
});

// =============================================================================
// InfiniteControls Component
// =============================================================================

const InfiniteControls = memo(function InfiniteControls({
  windowMs,
  currentTime,
  viewOffset,
  collapseLevel,
  onViewOffsetChange,
  onWindowChange,
}: InfiniteControlsProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; offset: number } | null>(null);
  const [isEditingWindow, setIsEditingWindow] = useState(false);
  const [windowInputValue, setWindowInputValue] = useState(String(windowMs / 1000));

  // The visible window shows time from (currentTime - windowMs + viewOffset) to (currentTime + viewOffset)
  // viewOffset of 0 means "now" is at the right edge
  // negative viewOffset looks into the past (shifts window left)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      offset: viewOffset,
    };
    e.preventDefault();
  }, [viewOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current || !scopeRef.current) return;

    const scopeWidth = scopeRef.current.clientWidth;
    const deltaX = e.clientX - dragStartRef.current.x;
    // Convert pixel delta to time delta (positive drag = look into past = negative offset)
    const deltaMs = (deltaX / scopeWidth) * windowMs;
    const newOffset = dragStartRef.current.offset - deltaMs;

    // Clamp: can't look into future (offset > 0) too much, can look into past
    const clampedOffset = Math.min(0, Math.max(-currentTime, newOffset));
    onViewOffsetChange(clampedOffset);
  }, [isDragging, windowMs, currentTime, onViewOffsetChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    onViewOffsetChange(0); // Reset to "now"
  }, [onViewOffsetChange]);

  const handleWindowEdit = useCallback(() => {
    setWindowInputValue(String(windowMs / 1000));
    setIsEditingWindow(true);
  }, [windowMs]);

  const handleWindowInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setWindowInputValue(e.target.value);
  }, []);

  const handleWindowInputBlur = useCallback(() => {
    const newWindowSec = parseFloat(windowInputValue);
    if (!isNaN(newWindowSec) && newWindowSec > 0) {
      onWindowChange(newWindowSec * 1000);
    }
    setIsEditingWindow(false);
  }, [windowInputValue, onWindowChange]);

  const handleWindowInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleWindowInputBlur();
    } else if (e.key === 'Escape') {
      setIsEditingWindow(false);
    }
  }, [handleWindowInputBlur]);

  // Calculate scope visualization
  const windowStart = currentTime - windowMs + viewOffset;
  const nowPosition = viewOffset === 0 ? 100 : ((currentTime - windowStart) / windowMs) * 100;
  const isViewingPast = viewOffset < -10;

  // Minimal mode: compact single-row display
  if (collapseLevel === 'minimal') {
    return (
      <div
        ref={scopeRef}
        className={`infinite-controls-minimal ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Mini progress bar showing position in window */}
        <div className="infinite-mini-track">
          <div
            className="infinite-mini-now"
            style={{ left: `${Math.min(100, Math.max(0, nowPosition))}%` }}
          />
        </div>
        <span className="infinite-mini-time">{formatElapsedTime(currentTime)}</span>
        {isViewingPast && (
          <span className="infinite-mini-offset">{formatViewOffset(viewOffset)}</span>
        )}
        {isEditingWindow ? (
          <input
            type="number"
            className="infinite-mini-window-input"
            value={windowInputValue}
            onChange={handleWindowInputChange}
            onBlur={handleWindowInputBlur}
            onKeyDown={handleWindowInputKeyDown}
            autoFocus
            min={0.1}
            step={0.1}
          />
        ) : (
          <button className="infinite-mini-window" onClick={handleWindowEdit}>
            {(windowMs / 1000).toFixed(1)}s
          </button>
        )}
      </div>
    );
  }

  // Expanded mode: full controls
  return (
    <div className="infinite-controls">
      {/* Readouts */}
      <div className="infinite-readouts">
        <span className="infinite-now-display">
          Now: {formatElapsedTime(currentTime)}
        </span>
        {isViewingPast && (
          <span className="infinite-offset-display">
            View Offset: {formatViewOffset(viewOffset)}
          </span>
        )}
        <span className="infinite-window-display">
          {isEditingWindow ? (
            <input
              type="number"
              className="infinite-window-input"
              value={windowInputValue}
              onChange={handleWindowInputChange}
              onBlur={handleWindowInputBlur}
              onKeyDown={handleWindowInputKeyDown}
              autoFocus
              min={0.1}
              step={0.1}
            />
          ) : (
            <button className="infinite-window-btn" onClick={handleWindowEdit}>
              Window: {(windowMs / 1000).toFixed(1)}s
            </button>
          )}
        </span>
      </div>

      {/* Sliding Window Scope */}
      <div
        ref={scopeRef}
        className={`infinite-scope ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Time scale markers */}
        <div className="infinite-scope-track">
          {/* Gradient showing time flow */}
          <div className="infinite-scope-gradient" />

          {/* Time tick marks */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const timeAtTick = windowStart + fraction * windowMs;
            return (
              <div
                key={fraction}
                className="infinite-scope-tick"
                style={{ left: `${fraction * 100}%` }}
              >
                <span className="infinite-scope-tick-label">
                  {formatElapsedTime(Math.max(0, timeAtTick))}
                </span>
              </div>
            );
          })}

          {/* "Now" marker */}
          <div
            className="infinite-now-marker"
            style={{ left: `${Math.min(100, Math.max(0, nowPosition))}%` }}
          >
            <div className="infinite-now-line" />
            <span className="infinite-now-label">NOW</span>
          </div>
        </div>

        {/* Drag hint */}
        <div className="infinite-scope-hint">
          {isDragging ? 'Release to stop' : 'Drag to view history • Double-click to return to now'}
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// TimeConsole Component
// =============================================================================

export const TimeConsole = memo(function TimeConsole({
  timeModel,
  currentTime,
  playState,
  speed,
  seed,
  cuePoints,
  viewOffset = 0,
  collapseLevel: controlledCollapseLevel,
  onCollapseLevelChange,
  defaultCollapseLevel = 'expanded',
  onScrub,
  onPlay,
  onPause,
  onReset,
  onSpeedChange,
  onSeedChange,
  onViewOffsetChange,
  onWindowChange,
}: TimeConsoleProps) {
  // Support both controlled and uncontrolled collapse state
  const [internalCollapseLevel, setInternalCollapseLevel] = useState<CollapseLevel>(defaultCollapseLevel);
  const collapseLevel = controlledCollapseLevel ?? internalCollapseLevel;

  const setCollapseLevel = useCallback((level: CollapseLevel) => {
    if (onCollapseLevelChange) {
      onCollapseLevelChange(level);
    } else {
      setInternalCollapseLevel(level);
    }
  }, [onCollapseLevelChange]);

  const isPlaying = playState === 'playing';

  const handleToggle = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseFloat(e.target.value) || 1;
    const clampedSpeed = Math.max(0.1, Math.min(4, newSpeed));
    onSpeedChange(clampedSpeed);
  };

  const handleSeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSeed = parseInt(e.target.value) || 0;
    onSeedChange(newSeed);
  };

  // Cycle through collapse levels
  const handleCollapse = useCallback(() => {
    const nextLevel: CollapseLevel = collapseLevel === 'expanded' ? 'minimal' : 'hidden';
    setCollapseLevel(nextLevel);
  }, [collapseLevel, setCollapseLevel]);

  const handleExpand = useCallback(() => {
    const nextLevel: CollapseLevel = collapseLevel === 'hidden' ? 'minimal' : 'expanded';
    setCollapseLevel(nextLevel);
  }, [collapseLevel, setCollapseLevel]);

  // Get duration/period for mode-specific controls
  const getDuration = (): number => {
    switch (timeModel.kind) {
      case 'finite':
        return timeModel.durationMs;
      case 'cyclic':
        return timeModel.periodMs;
      case 'infinite':
        return timeModel.windowMs;
    }
  };

  // Hidden mode: show only a small chip to restore
  if (collapseLevel === 'hidden') {
    return (
      <div className="time-console-chip" onClick={handleExpand}>
        <span className={`chip-badge chip-${timeModel.kind}`}>
          {timeModel.kind.charAt(0).toUpperCase()}
        </span>
        <span className="chip-time">{formatElapsedTime(currentTime)}</span>
        <button
          className={`chip-play ${isPlaying ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          title={isPlaying ? 'Freeze' : 'Run'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>
    );
  }

  // Minimal mode: compact single row
  if (collapseLevel === 'minimal') {
    return (
      <div className="time-console-minimal">
        {/* Mode badge */}
        <span className={`mode-badge-mini mode-${timeModel.kind}`}>
          {timeModel.kind.charAt(0).toUpperCase()}
        </span>

        {/* Mode-specific compact controls */}
        {timeModel.kind === 'infinite' && (
          <InfiniteControls
            windowMs={timeModel.windowMs}
            currentTime={currentTime}
            viewOffset={viewOffset}
            collapseLevel="minimal"
            onViewOffsetChange={onViewOffsetChange ?? (() => {})}
            onWindowChange={onWindowChange ?? (() => {})}
          />
        )}
        {timeModel.kind === 'finite' && (
          <div className="finite-mini">
            <span className="finite-mini-time">{formatTime(currentTime)} / {formatTime(getDuration())}</span>
          </div>
        )}
        {timeModel.kind === 'cyclic' && (
          <span className="cyclic-mini-time">{formatElapsedTime(currentTime)}</span>
        )}

        {/* Compact controls */}
        <div className="mini-controls">
          <button
            className={`mini-btn ${isPlaying ? 'active' : ''}`}
            onClick={handleToggle}
            title={isPlaying ? 'Freeze' : 'Run'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="mini-btn"
            onClick={onReset}
            title="Reset"
          >
            ⏮
          </button>
        </div>

        {/* Collapse controls */}
        <div className="mini-collapse-btns">
          <button
            className="collapse-btn"
            onClick={handleExpand}
            title="Expand controls"
          >
            ▲
          </button>
          <button
            className="collapse-btn"
            onClick={handleCollapse}
            title="Hide controls"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }

  // Expanded mode: full controls
  return (
    <div className="time-console">
      {/* Mode Badge + Collapse Button */}
      <div className="time-console-header">
        <span className={`mode-badge mode-${timeModel.kind}`}>
          {timeModel.kind.toUpperCase()}
        </span>
        <button
          className="collapse-btn header-collapse"
          onClick={handleCollapse}
          title="Collapse controls"
        >
          ▼
        </button>
      </div>

      {/* Mode-Specific Controls */}
      <div className="time-console-body">
        {timeModel.kind === 'finite' && (
          <FiniteControls
            durationMs={getDuration()}
            currentTime={currentTime}
            onScrub={onScrub}
            cuePoints={cuePoints}
          />
        )}
        {timeModel.kind === 'cyclic' && <CyclicControls />}
        {timeModel.kind === 'infinite' && (
          <InfiniteControls
            windowMs={timeModel.windowMs}
            currentTime={currentTime}
            viewOffset={viewOffset}
            collapseLevel="expanded"
            onViewOffsetChange={onViewOffsetChange ?? (() => {})}
            onWindowChange={onWindowChange ?? (() => {})}
          />
        )}
      </div>

      {/* Always-Present Controls */}
      <div className="time-console-controls">
        <button
          className={`tc-btn ${isPlaying ? 'active' : ''}`}
          onClick={handleToggle}
          title={isPlaying ? 'Freeze' : 'Run'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <button
          className="tc-btn"
          onClick={onReset}
          title="Reset to start"
        >
          ⏮
        </button>

        <div className="tc-divider" />

        <div className="tc-setting">
          <span className="tc-setting-label">Speed</span>
          <input
            type="number"
            className="tc-setting-input"
            value={speed}
            onChange={handleSpeedChange}
            min={0.1}
            max={4}
            step={0.1}
            title="Playback speed (0.1 - 4x)"
          />
        </div>

        <div className="tc-setting">
          <span className="tc-setting-label">Seed</span>
          <input
            type="number"
            className="tc-setting-input"
            value={seed}
            onChange={handleSeedChange}
            min={0}
            step={1}
            title="Random seed (changes animation variation)"
          />
        </div>
      </div>
    </div>
  );
});

export default TimeConsole;
