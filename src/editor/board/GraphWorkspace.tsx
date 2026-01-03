/**
 * GraphWorkspace Component
 *
 * Main container for the structured graph board.
 * Computes layout, manages viewport, renders blocks and connectors.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md (D1)
 */

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../stores';
import { computeLayout } from '../layout';
import type { GraphData } from '../layout';
import { getBlockDefinition } from '../blocks';
import { ViewportSurface } from './ViewportSurface';
import { BoardScene } from './BoardScene';
import { ConnectorOverlay } from './ConnectorOverlay';
import { BoardHUD } from './BoardHUD';
import './Board.css';

export interface GraphWorkspaceProps {
  graphId: string;
}

/**
 * GraphWorkspace is the main board container.
 * Computes layout and renders all board components.
 */
export const GraphWorkspace = observer<GraphWorkspaceProps>(function GraphWorkspace({
  graphId: _graphId,
}) {
  const {
    patchStore,
    // busStore removed - use patchStore.busBlocks
    viewportStore,
    emphasisStore,
    selectionStore,
  } = useStore();

  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 800, height: 600 });

  // Track workspace size for zoom-to-fit
  useEffect(() => {
    const element = workspaceRef.current;
    if (element === null) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setWorkspaceSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Build graph data from patch store
  const graphData = useMemo<GraphData>(() => {
    return {
      blocks: patchStore.blocks.map((block) => {
        const blockDef = getBlockDefinition(block.type);
        return {
          id: block.id,
          type: block.type,
          label: block.label.length > 0 ? block.label : blockDef?.label ?? 'Unknown',
          role: inferBlockRole(block.type),
          inputs: (blockDef?.inputs ?? []).map((input: { id: string; label: string }) => ({
            id: input.id,
            label: input.label,
            direction: 'input' as const,
          })),
          outputs: (blockDef?.outputs ?? []).map((output: { id: string; label: string }) => ({
            id: output.id,
            label: output.label,
            direction: 'output' as const,
          })),
        };
      }),
      directBindings: patchStore.edges.map((edge) => ({
        id: `${edge.from.blockId}:${edge.from.slotId}->${edge.to.blockId}:${edge.to.slotId}`,
        from: { blockId: edge.from.blockId, portId: edge.from.slotId },
        to: { blockId: edge.to.blockId, portId: edge.to.slotId },
      })),
      // Bus-Block Unification: Publishers are edges TO BusBlocks, listeners are FROM
      busBindings: (() => {
        const busBlockIds = new Set(patchStore.blocks.filter(b => b.type === 'BusBlock').map(b => b.id));
        const publishers = patchStore.edges
          .filter(e => busBlockIds.has(e.to.blockId))
          .map(e => ({
            blockId: e.from.blockId,
            portId: e.from.slotId,
            busId: e.to.blockId, // BusBlock ID = bus ID
            direction: 'publish' as const,
          }));
        const listeners = patchStore.edges
          .filter(e => busBlockIds.has(e.from.blockId))
          .map(e => ({
            blockId: e.to.blockId,
            portId: e.to.slotId,
            busId: e.from.blockId, // BusBlock ID = bus ID
            direction: 'subscribe' as const,
          }));
        return [...publishers, ...listeners];
      })(),
    };
  }, [patchStore.blocks, patchStore.edges]);

  // Compute layout
  const layout = useMemo(() => {
    const viewportRect = viewportStore.getVisibleWorldBounds(
      workspaceSize.width,
      workspaceSize.height
    );

    return computeLayout(graphData, {
      density: viewportStore.viewport.density,
      focusedBlockId: emphasisStore.focusedBlockId ?? undefined,
      focusedBusId: emphasisStore.focusedBusId ?? undefined,
      hoveredBlockId: undefined,
      viewportRectWorld: viewportRect,
    });
  }, [
    graphData,
    viewportStore,
    emphasisStore.focusedBlockId,
    emphasisStore.focusedBusId,
    workspaceSize,
  ]);

  // Viewport change handler
  const handleViewportChange = useCallback(
    (changes: Partial<typeof viewportStore.viewport>) => {
      viewportStore.setViewport(changes);
    },
    [viewportStore]
  );

  // Zoom to fit handler
  const handleZoomToFit = useCallback(() => {
    viewportStore.zoomToFit(
      layout.boundsWorld,
      workspaceSize.width,
      workspaceSize.height
    );
  }, [viewportStore, layout.boundsWorld, workspaceSize]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    viewportStore.setZoom(viewportStore.viewport.zoom * 1.1);
  }, [viewportStore]);

  const handleZoomOut = useCallback(() => {
    viewportStore.setZoom(viewportStore.viewport.zoom * 0.9);
  }, [viewportStore]);

  const handleDensityChange = useCallback(
    (density: typeof viewportStore.viewport.density) => {
      viewportStore.setDensity(density);
    },
    [viewportStore]
  );

  // Block interaction handlers
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);

  const handleBlockMouseEnter = useCallback(
    (blockId: string) => {
      setHoveredBlockId(blockId);
      emphasisStore.hoverBlock(blockId);
    },
    [emphasisStore]
  );

  const handleBlockMouseLeave = useCallback(
    (_blockId: string) => {
      setHoveredBlockId(null);
      emphasisStore.clearHover();
    },
    [emphasisStore]
  );

  const handleBlockClick = useCallback(
    (blockId: string) => {
      // Focus the block
      emphasisStore.focusBlock(blockId);
      selectionStore.selectBlock(blockId);
    },
    [emphasisStore, selectionStore]
  );

  // Compute visible viewport rect for virtualization
  const viewportRectWorld = useMemo(
    () =>
      viewportStore.getVisibleWorldBounds(workspaceSize.width, workspaceSize.height),
    [viewportStore, workspaceSize]
  );

  return (
    <div
      ref={workspaceRef}
      className={`graph-workspace density-${viewportStore.viewport.density}`}
    >
      <ViewportSurface
        viewport={viewportStore.viewport}
        onViewportChange={handleViewportChange}
        onZoomToFit={handleZoomToFit}
      >
        {/* Connector overlay (behind blocks) */}
        <ConnectorOverlay layout={layout} emphasis={emphasisStore.emphasis} />

        {/* Block scene */}
        <BoardScene
          layout={layout}
          graphId={_graphId}
          viewportRectWorld={viewportRectWorld}
          hoveredBlockId={hoveredBlockId}
          focusedBlockId={emphasisStore.focusedBlockId}
          highlightedBlockIds={emphasisStore.emphasis.highlightedBlockIds}
          onBlockMouseEnter={handleBlockMouseEnter}
          onBlockMouseLeave={handleBlockMouseLeave}
          onBlockClick={handleBlockClick}
        />
      </ViewportSurface>

      {/* HUD controls (overlay) */}
      <BoardHUD
        density={viewportStore.viewport.density}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomToFit={handleZoomToFit}
        onDensityChange={handleDensityChange}
      />
    </div>
  );
});

/**
 * Infer block role from block type.
 * This is a temporary helper - should be part of block metadata.
 */
function inferBlockRole(
  blockType: string
): 'time' | 'identity' | 'state' | 'operator' | 'render' | 'io' {
  // Time blocks
  if (blockType.includes('Time') || blockType === 'Cycle' || blockType === 'Finite') {
    return 'time';
  }

  // Identity blocks
  if (
    blockType === 'NumberSource' ||
    blockType === 'Vec2Source' ||
    blockType === 'ColorSource'
  ) {
    return 'identity';
  }

  // Render blocks
  if (
    blockType === 'Circle' ||
    blockType === 'Rectangle' ||
    blockType === 'Line' ||
    blockType === 'Path' ||
    blockType === 'SVGPathSource'
  ) {
    return 'render';
  }

  // IO blocks
  if (blockType === 'Preview' || blockType === 'Output') {
    return 'io';
  }

  // State blocks
  if (blockType.includes('State') || blockType.includes('Memory')) {
    return 'state';
  }

  // Default to operator
  return 'operator';
}
