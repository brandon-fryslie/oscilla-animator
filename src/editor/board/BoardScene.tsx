/**
 * BoardScene Component
 *
 * Renders blocks at computed positions from layout engine.
 * Handles virtualization (only render visible blocks).
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md (D3)
 */

import { observer } from 'mobx-react-lite';
import type { LayoutResult } from '../layout';
import type { Rect } from '../stores/ViewportStore';
import { BlockView } from './BlockView';
import './Board.css';

export interface BoardSceneProps {
  layout: LayoutResult;
  graphId: string;
  viewportRectWorld?: Rect;
  hoveredBlockId: string | null;
  focusedBlockId: string | null;
  highlightedBlockIds: Set<string>;
  onBlockMouseEnter: (blockId: string) => void;
  onBlockMouseLeave: (blockId: string) => void;
  onBlockClick: (blockId: string) => void;
}

/**
 * BoardScene renders all blocks at their computed positions.
 */
export const BoardScene = observer<BoardSceneProps>(function BoardScene({
  layout,
  graphId: _graphId,
  viewportRectWorld,
  hoveredBlockId,
  focusedBlockId,
  highlightedBlockIds,
  onBlockMouseEnter,
  onBlockMouseLeave,
  onBlockClick,
}) {
  const { nodes } = layout;

  // Optionally filter to visible blocks (virtualization)
  const visibleBlockIds =
    viewportRectWorld !== undefined
      ? filterVisibleBlocks(nodes, viewportRectWorld)
      : Object.keys(nodes);

  // Determine dimming: if something is focused, dim everything not highlighted
  const isDimmingActive = focusedBlockId !== null;

  return (
    <div className="board-scene">
      {visibleBlockIds.map((blockId) => {
        const node = nodes[blockId];
        if (node === undefined) return null;

        const isHovered = hoveredBlockId === blockId;
        const isFocused = focusedBlockId === blockId;
        const isHighlighted = highlightedBlockIds.has(blockId);
        const isDimmed = isDimmingActive && !isHighlighted && !isFocused;

        return (
          <BlockView
            key={blockId}
            blockId={blockId}
            node={node}
            isHovered={isHovered}
            isFocused={isFocused}
            isDimmed={isDimmed}
            onMouseEnter={() => onBlockMouseEnter(blockId)}
            onMouseLeave={() => onBlockMouseLeave(blockId)}
            onClick={() => onBlockClick(blockId)}
          />
        );
      })}
    </div>
  );
});

/**
 * Filter blocks to only those visible in the viewport.
 * Used for virtualization to reduce DOM size.
 */
function filterVisibleBlocks(
  nodes: Record<string, { x: number; y: number; w: number; h: number }>,
  viewportRect: Rect
): string[] {
  const visible: string[] = [];

  for (const [blockId, node] of Object.entries(nodes)) {
    // Check if node bounding box intersects viewport
    if (
      node.x + node.w >= viewportRect.x &&
      node.x <= viewportRect.x + viewportRect.width &&
      node.y + node.h >= viewportRect.y &&
      node.y <= viewportRect.y + viewportRect.height
    ) {
      visible.push(blockId);
    }
  }

  return visible;
}
