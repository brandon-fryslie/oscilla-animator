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

import { memo, useState, useCallback } from 'react';
import type { TimeModel, CuePoint } from '../compiler/types';
import type { PlayState } from '../runtime';
import { PhaseIndicator } from './PhaseIndicator';
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

interface CyclicControlsProps {
  timeModel: TimeModel;
  currentTime: number;
  playState: PlayState;
}

interface InfiniteControlsProps {
  timeModel: TimeModel;
  currentTime: number;
  playState: PlayState;
  collapseLevel: CollapseLevel;
  onPlay: () => void;
  onPause: () => void;
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
// CyclicControls Component
// =============================================================================

const CyclicControls = memo(function CyclicControls({
  timeModel,
  currentTime,
  playState,
}: CyclicControlsProps) {
  // Guard: ensure we have a cyclic time model
  if (timeModel.kind !== 'cyclic') {
    return null;
  }

  const { periodMs, mode = 'loop' } = timeModel;
  const isPaused = playState !== 'playing';

  // Calculate phase (0..1)
  const phase = currentTime >= 0 ? (currentTime % periodMs) / periodMs : 0;

  // Calculate cycle index (number of completed cycles)
  const cycleIndex: int = currentTime >= 0 ? Math.floor(currentTime / periodMs) : 0;

  // For pingpong mode, adjust phase to show the actual direction
  const displayPhase = mode === 'pingpong' && cycleIndex % 2 === 1
    ? 1 - phase
    : phase;

  return (
    <div className="cyclic-controls">
      {/* Phase Ring Visualization */}
      <div className="cyclic-ring-container">
        <PhaseIndicator
          timeModel={timeModel}
          currentTime={currentTime}
          playState={playState}
          size="large"
        />
        {isPaused && <div className="cyclic-pause-overlay">⏸</div>}
      </div>

      {/* Readouts */}
      <div className="cyclic-readouts">
        <div className="cyclic-readout-row">
          <span className="cyclic-readout-label">Phase A:</span>
          <span className="cyclic-readout-value">{displayPhase.toFixed(2)}</span>
        </div>
        <div className="cyclic-readout-row">
          <span className="cyclic-readout-label">Cycle #:</span>
          <span className="cyclic-readout-value">{cycleIndex}</span>
        </div>
        <div className="cyclic-readout-row">
          <span className="cyclic-readout-label">Period:</span>
          <span className="cyclic-readout-value">{(periodMs / 1000).toFixed(2)}s</span>
        </div>
        <div className="cyclic-readout-row">
          <span className="cyclic-readout-label">Mode:</span>
          <span className={`cyclic-mode-badge mode-${mode}`}>
            {mode === 'loop' ? '🔁 Loop' : '↔️ Pingpong'}
          </span>
        </div>
      </div>
    </div>
  );
});

// =============================================================================
// InfiniteControls Component - Simplified with PhaseIndicator
// =============================================================================

const InfiniteControls = memo(function InfiniteControls({
  timeModel,
  currentTime,
  playState,
  collapseLevel,
  onPlay,
  onPause,
}: InfiniteControlsProps) {
  const isPaused = playState !== 'playing';

  const handleClick = useCallback(() => {
    if (isPaused) {
      onPlay();
    } else {
      onPause();
    }
  }, [isPaused, onPlay, onPause]);

  // Size based on collapse level
  const indicatorSize = collapseLevel === 'hidden' ? 'small' : 'medium';

  return (
    <div
      className={`infinite-controls-simple ${isPaused ? 'paused' : ''} ${collapseLevel === 'hidden' ? 'compact' : ''}`}
      onClick={handleClick}
      title={isPaused ? 'Click to resume' : 'Click to freeze'}
    >
      <PhaseIndicator
        timeModel={timeModel}
        currentTime={currentTime}
        playState={playState}
        size={indicatorSize}
      />
      {isPaused && <div className="infinite-pause-overlay">⏸</div>}
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
  collapseLevel: controlledCollapseLevel,
  onCollapseLevelChange,
  defaultCollapseLevel = 'hidden',
  onScrub,
  onPlay,
  onPause,
  onReset,
  onSpeedChange,
  onSeedChange,
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
    // Special compact chip for infinite mode - just PhaseIndicator with pause overlay
    if (timeModel.kind === 'infinite') {
      return (
        <div className="time-console-chip infinite-chip" onClick={handleExpand}>
          <InfiniteControls
            timeModel={timeModel}
            currentTime={currentTime}
            playState={playState}
            collapseLevel="hidden"
            onPlay={onPlay}
            onPause={onPause}
          />
        </div>
      );
    }

    // Standard chip for finite/cyclic modes
    return (
      <div className="time-console-chip" onClick={handleExpand}>
        <span className={`chip-badge chip-${timeModel.kind}`}>
          {timeModel.kind.charAt(0).toUpperCase()}
        </span>
        {/* DO NOT add elapsed time display for cyclic/infinite modes.
            Elapsed time is only meaningful for finite animations with a defined duration.
            For cyclic mode, phase is the relevant metric (shown in expanded view).
            For infinite mode, wall-clock time is irrelevant to the animation. */}
        {timeModel.kind === 'finite' && (
          <span className="chip-time">{formatElapsedTime(currentTime)}</span>
        )}
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
            timeModel={timeModel}
            currentTime={currentTime}
            playState={playState}
            collapseLevel="minimal"
            onPlay={onPlay}
            onPause={onPause}
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
        {timeModel.kind === 'cyclic' && (
          <CyclicControls
            timeModel={timeModel}
            currentTime={currentTime}
            playState={playState}
          />
        )}
        {timeModel.kind === 'infinite' && (
          <InfiniteControls
            timeModel={timeModel}
            currentTime={currentTime}
            playState={playState}
            collapseLevel="expanded"
            onPlay={onPlay}
            onPause={onPause}
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
