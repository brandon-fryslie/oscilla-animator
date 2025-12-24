/**
 * Recipe View Component
 *
 * A secondary view that presents modulation bindings as human-readable descriptions.
 * Features:
 * - Semantic grouping by target (renderer, domain, etc.)
 * - Plain English descriptions ("Radius breathes with phaseA")
 * - Click to jump to table cell
 */

import { observer } from 'mobx-react-lite';
import { useMemo, useCallback } from 'react';
import type { ModulationTableStore } from './ModulationTableStore';
import type { RowKey } from './types';
import type { LensDefinition } from '../types';

interface RecipeViewProps {
  store: ModulationTableStore;
  onJumpToCell?: (rowKey: RowKey, busId: string) => void;
}

/**
 * Generate a human-readable description for a lens chain
 */
function describeLensChain(lensChain: readonly LensDefinition[] | undefined): string {
  if (!lensChain || lensChain.length === 0) {
    return 'directly';
  }

  const descriptions: string[] = [];

  for (const lens of lensChain) {
    switch (lens.type) {
      case 'ease':
        descriptions.push(`smoothed with ${lens.params.easing || 'easing'}`);
        break;
      case 'Ease':
        descriptions.push('smoothed');
        break;
      case 'scale':
      case 'Gain':
        const scale = (lens.params.scale as number) ?? (lens.params.gain as number) ?? 1;
        const offset = (lens.params.offset as number) ?? (lens.params.bias as number) ?? 0;
        if (offset !== 0) {
          descriptions.push(`scaled ${scale}× + ${offset}`);
        } else if (scale !== 1) {
          descriptions.push(`scaled ${scale}×`);
        }
        break;
      case 'quantize':
        descriptions.push(`snapped to ${lens.params.steps} steps`);
        break;
      case 'slew':
      case 'Slew':
        descriptions.push('smoothed over time');
        break;
      case 'clamp':
      case 'Clamp':
        descriptions.push(`clamped to [${lens.params.min}, ${lens.params.max}]`);
        break;
      case 'broadcast':
        descriptions.push('broadcast to all elements');
        break;
      case 'perElementOffset':
        descriptions.push('with per-element offset');
        break;
      case 'warp':
        descriptions.push('warped');
        break;
      case 'PhaseOffset':
        descriptions.push(`offset by ${lens.params.offset}`);
        break;
      case 'PingPong':
        descriptions.push('ping-pong');
        break;
      case 'HueShift':
        descriptions.push('hue-shifted');
        break;
      case 'Rotate2D':
        descriptions.push('rotated');
        break;
      default:
        descriptions.push(`via ${lens.type}`);
    }
  }

  return descriptions.join(', ');
}

/**
 * Generate a poetic verb for the relationship based on bus type
 */
function getRelationshipVerb(busType: string): string {
  switch (busType) {
    case 'phase':
      return 'dances with';
    case 'number':
      return 'responds to';
    case 'color':
      return 'takes color from';
    case 'trigger':
      return 'pulses with';
    default:
      return 'follows';
  }
}

/**
 * Get a friendly name for a port based on its label
 */
function getPortNiceName(label: string): string {
  // Common port name mappings
  const niceNames: Record<string, string> = {
    'Rows': 'Row count',
    'Columns': 'Column count',
    'Spacing': 'Element spacing',
    'Origin X': 'Horizontal origin',
    'Origin Y': 'Vertical origin',
    'radius': 'Size',
    'opacity': 'Visibility',
    'rotation': 'Rotation',
    'hue': 'Color hue',
    'saturation': 'Color intensity',
    'brightness': 'Brightness',
  };
  return niceNames[label] || label;
}

/**
 * Recipe item representing a single binding
 */
interface RecipeItem {
  rowKey: RowKey;
  busId: string;
  portLabel: string;
  blockLabel: string;
  busName: string;
  busType: string;
  lensChain: readonly LensDefinition[] | undefined;
  description: string;
}

/**
 * Recipe View component
 */
export const RecipeView = observer(({ store, onJumpToCell }: RecipeViewProps) => {
  // Build recipe items from bound cells
  const recipeItems = useMemo(() => {
    const items: RecipeItem[] = [];
    const rows = store.visibleRows;
    const columns = store.visibleColumns;
    const cells = store.cells;

    for (const cell of cells) {
      if (cell.status !== 'bound') continue;

      const row = rows.find((r) => r.key === cell.rowKey);
      const column = columns.find((c) => c.busId === cell.busId);
      if (!row || !column) continue;

      const lensDescription = describeLensChain(cell.lensChain);
      const verb = getRelationshipVerb(column.type.domain);
      const portName = getPortNiceName(row.label);

      const description = cell.lensChain && cell.lensChain.length > 0
        ? `${portName} ${verb} ${column.name}, ${lensDescription}`
        : `${portName} ${verb} ${column.name} ${lensDescription}`;

      items.push({
        rowKey: cell.rowKey,
        busId: cell.busId,
        portLabel: row.label,
        blockLabel: row.blockId,
        busName: column.name,
        busType: column.type.domain,
        lensChain: cell.lensChain,
        description,
      });
    }

    return items;
  }, [store.visibleRows, store.visibleColumns, store.cells]);

  // Group items by block
  const groupedItems = useMemo(() => {
    const groups: Record<string, RecipeItem[]> = {};
    for (const item of recipeItems) {
      if (!groups[item.blockLabel]) {
        groups[item.blockLabel] = [];
      }
      groups[item.blockLabel].push(item);
    }
    return groups;
  }, [recipeItems]);

  const handleItemClick = useCallback(
    (item: RecipeItem) => {
      if (onJumpToCell) {
        onJumpToCell(item.rowKey, item.busId);
      }
    },
    [onJumpToCell]
  );

  if (recipeItems.length === 0) {
    return (
      <div className="recipe-view">
        <div className="recipe-empty">
          <p>No modulation bindings yet.</p>
          <p>Click cells in the table to create bindings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recipe-view">
      <div className="recipe-header">
        <span className="recipe-title">Recipe</span>
        <span className="recipe-count">{recipeItems.length} bindings</span>
      </div>

      <div className="recipe-list">
        {Object.entries(groupedItems).map(([blockLabel, items]) => (
          <div key={blockLabel} className="recipe-group">
            <div className="recipe-group-header">{blockLabel}</div>
            {items.map((item, idx) => (
              <div
                key={`${item.rowKey}-${item.busId}-${idx}`}
                className="recipe-item"
                onClick={() => handleItemClick(item)}
                title="Click to jump to table cell"
              >
                <span className="recipe-bus-badge" data-type={item.busType}>
                  {item.busName}
                </span>
                <span className="recipe-description">{item.description}</span>
                {item.lensChain && item.lensChain.length > 0 && (
                  <span className="recipe-lens-count">
                    {item.lensChain.length} lens{item.lensChain.length > 1 ? 'es' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
