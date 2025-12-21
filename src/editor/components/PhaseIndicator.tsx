/**
 * PhaseIndicator Component
 *
 * A circular progress indicator for phase visualization:
 * - Infinite mode: Indefinite spinner (always rotating)
 * - Cyclic mode: Time-accurate nested rings for each phase period
 * - Paused state: Slowly pulsing blue glow overlay
 */

import { memo } from 'react';
import type { TimeModel } from '../compiler/types';
import type { PlayState } from '../runtime';
import './PhaseIndicator.css';

export interface PhaseIndicatorProps {
  timeModel: TimeModel;
  currentTime: number;
  playState: PlayState;
  size?: 'small' | 'medium' | 'large';
}

export const PhaseIndicator = memo(function PhaseIndicator({
  timeModel,
  currentTime,
  playState,
  size = 'medium',
}: PhaseIndicatorProps) {
  const isPaused = playState !== 'playing';

  // Size mappings
  const sizeMap = {
    small: 24,
    medium: 36,
    large: 48,
  };
  const diameter = sizeMap[size];
  const strokeWidth = size === 'small' ? 2 : size === 'medium' ? 3 : 4;
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = diameter / 2;

  // Calculate phase progress for cyclic mode
  const getPhaseProgress = (): number => {
    if (timeModel.kind === 'cyclic') {
      const phase = (currentTime % timeModel.periodMs) / timeModel.periodMs;
      return phase;
    }
    if (timeModel.kind === 'finite') {
      return Math.min(1, currentTime / timeModel.durationMs);
    }
    return 0;
  };

  const progress = getPhaseProgress();
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`phase-indicator phase-indicator-${size} ${isPaused ? 'paused' : ''}`}
      title={isPaused ? 'Frozen - click to resume' : 'Running'}
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="phase-indicator-svg"
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="phase-indicator-bg"
          strokeWidth={strokeWidth}
        />

        {/* Progress/spinner circle */}
        {timeModel.kind === 'infinite' ? (
          // Infinite mode: indefinite spinner
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="phase-indicator-spinner"
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
          />
        ) : (
          // Finite/Cyclic mode: progress arc
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="phase-indicator-progress"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}

        {/* Cyclic mode: inner phase ring for sub-phases if applicable */}
        {timeModel.kind === 'cyclic' && (
          <circle
            cx={center}
            cy={center}
            r={radius * 0.6}
            className="phase-indicator-inner"
            strokeWidth={strokeWidth * 0.7}
          />
        )}
      </svg>

      {/* Paused overlay glow */}
      {isPaused && (
        <div className="phase-indicator-paused-glow" />
      )}
    </div>
  );
});

export default PhaseIndicator;
