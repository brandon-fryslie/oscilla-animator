/**
 * BusValueMeter Component
 *
 * Visualizes bus values with type-appropriate displays:
 * - number: Horizontal bar with value text
 * - phase: Phase ring (0..1)
 * - color: Color swatch
 * - trigger: Pulse indicator
 * - bool: On/off indicator
 */

import type { ValueSummary } from '../debug/types';

interface BusValueMeterProps {
  value: ValueSummary;
  busType: string;
}

export function BusValueMeter({ value, busType }: BusValueMeterProps) {
  // Format value based on type
  if (busType === 'number' || busType === 'phase') {
    const numValue = typeof value === 'number' ? value :
                     (value as { value?: number }).value ?? 0;
    const displayValue = numValue.toFixed(2);
    const percentage = busType === 'phase' ? numValue * 100 : Math.min(100, Math.max(0, numValue * 100));

    return (
      <div className="bus-value-meter-number">
        <div className="bus-value-meter-bar">
          <div
            className="bus-value-meter-fill"
            style={{ width: `${Math.min(100, Math.abs(percentage))}%` }}
          />
        </div>
        <div className="bus-value-meter-text">{displayValue}</div>
      </div>
    );
  }

  if (busType === 'color') {
    const colorValue = typeof value === 'string' ? value : '#888';
    return (
      <div className="bus-value-meter-color">
        <div
          className="bus-value-meter-swatch"
          style={{ background: colorValue }}
        />
        <div className="bus-value-meter-text">{colorValue}</div>
      </div>
    );
  }

  if (busType === 'trigger') {
    const triggered = typeof value === 'boolean' ? value : false;
    return (
      <div className="bus-value-meter-trigger">
        <div className={`bus-value-meter-pulse ${triggered ? 'active' : ''}`} />
        <div className="bus-value-meter-text">{triggered ? 'Fired' : 'Idle'}</div>
      </div>
    );
  }

  if (busType === 'bool') {
    const boolValue = typeof value === 'boolean' ? value : false;
    return (
      <div className="bus-value-meter-bool">
        <div className={`bus-value-meter-indicator ${boolValue ? 'on' : 'off'}`} />
        <div className="bus-value-meter-text">{boolValue ? 'On' : 'Off'}</div>
      </div>
    );
  }

  // Fallback for unknown types
  return (
    <div className="bus-value-meter-unknown">
      <div className="bus-value-meter-text">{String(value)}</div>
    </div>
  );
}

// Add styles inline for simplicity (these can be moved to CSS)
const styles = `
.bus-value-meter-number,
.bus-value-meter-color,
.bus-value-meter-trigger,
.bus-value-meter-bool,
.bus-value-meter-unknown {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bus-value-meter-bar {
  flex: 1;
  height: 8px;
  background: rgba(60, 60, 70, 0.6);
  border-radius: 4px;
  overflow: hidden;
}

.bus-value-meter-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a8, #8cf);
  border-radius: 4px;
  transition: width 0.1s ease;
}

.bus-value-meter-text {
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: #aaa;
  min-width: 60px;
}

.bus-value-meter-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(100, 100, 120, 0.4);
}

.bus-value-meter-pulse {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(80, 80, 100, 0.4);
  transition: all 0.1s ease;
}

.bus-value-meter-pulse.active {
  background: #8cf;
  box-shadow: 0 0 8px #8cf;
}

.bus-value-meter-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: all 0.1s ease;
}

.bus-value-meter-indicator.on {
  background: #6c6;
  box-shadow: 0 0 6px #6c6;
}

.bus-value-meter-indicator.off {
  background: rgba(80, 80, 100, 0.4);
}
`;

// Inject styles into document head
if (typeof document !== 'undefined') {
  const styleId = 'bus-value-meter-styles';
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }
}
