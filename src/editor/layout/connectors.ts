/**
 * Connector Derivation
 *
 * Computes drawable connectors and overflow links from final block positions.
 * Port anchor calculation and distance-based connector/overflow decision.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Sections 9-10)
 */

import { Lmax, portRailOffset, portRowHeight, topPadding } from './constants';
import type {
  BlockPlacement,
  ConnectorStyle,
  DirectBinding,
  DensityMode,
  LayoutBlockData,
  LayoutConnector,
  OverflowLink,
  PortAnchor,
  Rect,
} from './types';

/**
 * Compute port anchor position.
 *
 * Port positions are deterministic based on port index in block definition.
 *
 * @param blockPlacement - Block placement
 * @param portId - Port ID
 * @param direction - Port direction
 * @param block - Block data (for port ordering)
 * @returns Port anchor position
 */
export function computePortAnchor(
  blockPlacement: BlockPlacement,
  portId: string,
  direction: 'input' | 'output',
  block: LayoutBlockData
): PortAnchor {
  const { x, y, w } = blockPlacement;

  // Find port index
  const ports = direction === 'input' ? block.inputs : block.outputs;
  const portIndex = ports.findIndex((p) => p.id === portId);

  // If port not found, use index 0
  const index = portIndex >= 0 ? portIndex : 0;

  // Compute port Y position
  const portY = y + topPadding + index * portRowHeight;

  // Compute port X position
  const portX =
    direction === 'input' ? x - portRailOffset : x + w + portRailOffset;

  return {
    blockId: blockPlacement.blockId,
    portId,
    x: portX,
    y: portY,
  };
}

/**
 * Compute distance between two port anchors.
 *
 * @param from - From anchor
 * @param to - To anchor
 * @returns Distance in world units
 */
export function computeDistance(from: PortAnchor, to: PortAnchor): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Determine connector style based on positions.
 *
 * Simple heuristic:
 * - straight: if horizontal or vertical
 * - elbow: if different columns
 * - curve: default
 *
 * @param from - From anchor
 * @param to - To anchor
 * @returns Connector style
 */
export function determineConnectorStyle(
  from: PortAnchor,
  to: PortAnchor
): ConnectorStyle {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);

  // If mostly horizontal or vertical, use straight
  if (dx < 10 || dy < 10) {
    return 'straight';
  }

  // If different X (different columns), use elbow
  if (dx > 50) {
    return 'elbow';
  }

  // Default to curve
  return 'curve';
}

/**
 * Check if a point is inside viewport rect (with margin).
 *
 * @param anchor - Port anchor
 * @param viewportRect - Viewport rectangle
 * @param margin - Extra margin around viewport
 * @returns True if anchor is visible
 */
function isAnchorVisible(
  anchor: PortAnchor,
  viewportRect: Rect | undefined,
  margin: number = 100
): boolean {
  if (!viewportRect) return true; // No culling

  return (
    anchor.x >= viewportRect.x - margin &&
    anchor.x <= viewportRect.x + viewportRect.width + margin &&
    anchor.y >= viewportRect.y - margin &&
    anchor.y <= viewportRect.y + viewportRect.height + margin
  );
}

/**
 * Derive connectors and overflow links from direct bindings.
 *
 * - If distance <= Lmax and density != overview: emit LayoutConnector
 * - Otherwise: emit OverflowLink
 *
 * @param edges - Direct bindings
 * @param placements - Block placements
 * @param blocks - Block data (for port ordering)
 * @param density - Density mode
 * @param viewportRect - Viewport rectangle (for culling)
 * @returns Connectors and overflow links
 */
export function deriveConnectors(
  edges: DirectBinding[],
  placements: Map<string, BlockPlacement>,
  blocks: Map<string, LayoutBlockData>,
  density: DensityMode,
  viewportRect?: Rect
): {
  connectors: LayoutConnector[];
  overflowLinks: OverflowLink[];
} {
  const connectors: LayoutConnector[] = [];
  const overflowLinks: OverflowLink[] = [];

  for (const edge of edges) {
    const fromPlacement = placements.get(edge.from.blockId);
    const toPlacement = placements.get(edge.to.blockId);
    const fromBlock = blocks.get(edge.from.blockId);
    const toBlock = blocks.get(edge.to.blockId);

    if (!fromPlacement || !toPlacement || !fromBlock || !toBlock) {
      continue;
    }

    // Compute port anchors
    const fromAnchor = computePortAnchor(
      fromPlacement,
      edge.from.portId,
      'output',
      fromBlock
    );
    const toAnchor = computePortAnchor(toPlacement, edge.to.portId, 'input', toBlock);

    // Check visibility
    const fromVisible = isAnchorVisible(fromAnchor, viewportRect);
    const toVisible = isAnchorVisible(toAnchor, viewportRect);

    // If either endpoint is not visible, create overflow link (culled)
    if (!fromVisible || !toVisible) {
      overflowLinks.push({
        id: edge.id,
        to: toAnchor,
        from: {
          blockId: edge.from.blockId,
          portId: edge.from.portId,
          blockName: fromBlock.label,
        },
        reason: 'culled',
      });
      continue;
    }

    // Compute distance
    const distance = computeDistance(fromAnchor, toAnchor);

    // Overview mode: all connectors become overflow links
    if (density === 'overview') {
      overflowLinks.push({
        id: edge.id,
        to: toAnchor,
        from: {
          blockId: edge.from.blockId,
          portId: edge.from.portId,
          blockName: fromBlock.label,
        },
        reason: 'densityCollapsed',
      });
      continue;
    }

    // Check distance threshold
    if (distance <= Lmax) {
      // Draw connector
      const style = determineConnectorStyle(fromAnchor, toAnchor);

      connectors.push({
        id: edge.id,
        from: fromAnchor,
        to: toAnchor,
        style,
      });
    } else {
      // Too long: overflow link
      overflowLinks.push({
        id: edge.id,
        to: toAnchor,
        from: {
          blockId: edge.from.blockId,
          portId: edge.from.portId,
          blockName: fromBlock.label,
        },
        reason: 'tooLong',
      });
    }
  }

  return { connectors, overflowLinks };
}
