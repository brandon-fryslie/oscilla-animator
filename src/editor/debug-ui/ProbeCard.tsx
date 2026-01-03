/**
 * Probe Card Component
 *
 * Displays debug probe information when hovering over buses or blocks
 * in probe mode. Shows live signal values and connection info.
 */

import { observer } from 'mobx-react-lite';
import type { ProbeTarget, CursorPosition } from '../stores/DebugUIStore';

interface ProbeCardProps {
  target: ProbeTarget;
  position: CursorPosition;
}

/**
 * ProbeCard - Floating debug info card
 *
 * Renders near the cursor when probe mode is active and hovering over
 * a valid target (bus or block).
 */
export const ProbeCard = observer(function ProbeCard({ target, position }: ProbeCardProps) {
  // Don't render if no target
  if (!target) {
    return null;
  }

  // Position card near cursor with offset
  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x + 16,
    top: position.y + 16,
    zIndex: 10000,
    backgroundColor: 'var(--bg-elevated, #1a1a1a)',
    border: '1px solid var(--border-color, #333)',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '12px',
    fontFamily: 'monospace',
    color: 'var(--text-primary, #e0e0e0)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none',
    maxWidth: '300px',
  };

  const labelStyle: React.CSSProperties = {
    color: 'var(--text-secondary, #888)',
    fontSize: '10px',
    textTransform: 'uppercase',
    marginBottom: '4px',
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 500,
  };

  if (target.type === 'bus') {
    return (
      <div style={style}>
        <div style={labelStyle}>Bus</div>
        <div style={valueStyle}>{target.busId}</div>
      </div>
    );
  }

  if (target.type === 'block') {
    return (
      <div style={style}>
        <div style={labelStyle}>Block</div>
        <div style={valueStyle}>{target.blockId}</div>
      </div>
    );
  }

  return null;
});
