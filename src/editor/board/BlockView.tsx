/**
 * BlockView Component
 *
 * Renders a single block at a computed position.
 * Shows collapsed/hovered/focused states.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md (E1)
 */

import { observer } from 'mobx-react-lite';
import type { LayoutNodeView } from '../layout';
import { useStore } from '../stores';
import { getBlockDefinition } from '../blocks';
import './Board.css';

export interface BlockViewProps {
  blockId: string;
  node: LayoutNodeView;
  isHovered: boolean;
  isFocused: boolean;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

/**
 * BlockView renders a single block with position from layout engine.
 */
export const BlockView = observer<BlockViewProps>(function BlockView({
  blockId,
  node,
  isHovered,
  isFocused,
  isDimmed,
  onMouseEnter,
  onMouseLeave,
  onClick,
}) {
  const { patchStore } = useStore();

  // Find the block data
  const block = patchStore.blocks.find((b) => b.id === blockId);
  if (block === undefined) return null;

  // Get block definition for metadata
  const blockDef = getBlockDefinition(block.type);
  if (blockDef === undefined) return null;

  // Compute CSS classes
  const classes = [
    'block-view',
    isFocused ? 'focused' : '',
    isDimmed ? 'dimmed' : '',
    isHovered ? 'highlighted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Role badge text
  const roleLabel = node.role;

  // Minimal parameter summary for collapsed state
  const paramSummary = computeParamSummary(block);

  return (
    <div
      className={classes}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Header */}
      <div className="block-header">
        <div className="block-name" title={block.label !== '' ? block.label : blockDef.label}>
          {block.label !== '' ? block.label : blockDef.label}
        </div>
        <div className="block-role-badge">{roleLabel}</div>
      </div>

      {/* Collapsed summary */}
      {paramSummary.length > 0 && <div className="block-summary">{paramSummary}</div>}

      {/* Port rails (visible on hover/focus) */}
      {(isHovered || isFocused) && (
        <div className="block-ports">
          {/* Input ports */}
          {blockDef.inputs.length > 0 && (
            <div className="port-rail">
              {blockDef.inputs.slice(0, 4).map((port) => (
                <PortItem
                  key={port.id}
                  blockId={blockId}
                  portId={port.id}
                  label={port.label}
                  direction="input"
                />
              ))}
              {blockDef.inputs.length > 4 && (
                <div className="port-item">
                  <span style={{ fontSize: '10px', color: '#666' }}>
                    +{blockDef.inputs.length - 4} more
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Output ports */}
          {blockDef.outputs.length > 0 && (
            <div className="port-rail">
              {blockDef.outputs.slice(0, 4).map((port) => (
                <PortItem
                  key={port.id}
                  blockId={blockId}
                  portId={port.id}
                  label={port.label}
                  direction="output"
                />
              ))}
              {blockDef.outputs.length > 4 && (
                <div className="port-item">
                  <span style={{ fontSize: '10px', color: '#666' }}>
                    +{blockDef.outputs.length - 4} more
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * PortItem renders a single port indicator.
 */
interface PortItemProps {
  blockId: string;
  portId: string;
  label: string;
  direction: 'input' | 'output';
}

const PortItem = observer<PortItemProps>(function PortItem({
  blockId,
  portId,
  label,
  direction,
}) {
  const { patchStore } = useStore();

  // Check if port is connected
  const isConnected =
    direction === 'input'
      ? patchStore.connections.some(
          (c) => c.to.blockId === blockId && c.to.slotId === portId
        )
      : patchStore.connections.some(
          (c) => c.from.blockId === blockId && c.from.slotId === portId
        );

  return (
    <div className={`port-item ${direction}`}>
      <div className={`port-indicator ${isConnected ? 'connected' : ''}`} />
      <div className="port-label">{label}</div>
    </div>
  );
});

/**
 * Compute a minimal parameter summary for collapsed state.
 * Shows critical params (predefined per block type).
 */
function computeParamSummary(block: { type: string; params: Record<string, unknown> }): string {
  // Define critical params per block type
  const criticalParams: Record<string, string[]> = {
    NumberSource: ['value'],
    Oscillator: ['frequency', 'amplitude'],
    Scale: ['inMin', 'inMax', 'outMin', 'outMax'],
    Ease: ['mode'],
    Circle: ['radius'],
    Rectangle: ['width', 'height'],
  };

  const keys = criticalParams[block.type];
  if (keys === undefined || keys.length === 0) {
    return '';
  }

  const parts = keys
    .map((key) => {
      const value = block.params[key];
      if (value === undefined) {
        return null;
      }
      return `${key}=${formatParamValue(value)}`;
    })
    .filter((item): item is string => item !== null);

  return parts.join(', ');
}

/**
 * Format a parameter value for display.
 */
function formatParamValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}
