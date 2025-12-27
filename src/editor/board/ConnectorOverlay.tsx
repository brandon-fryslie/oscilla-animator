/**
 * ConnectorOverlay Component
 *
 * SVG layer that renders short connectors between blocks.
 * Only draws arrows for edges that qualify (d <= Lmax).
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md (D4)
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import type { LayoutResult, LayoutConnector } from '../layout';
import type { EmphasisState } from '../stores/EmphasisStore';
import './Board.css';

export interface ConnectorOverlayProps {
  layout: LayoutResult;
  emphasis: EmphasisState;
}

/**
 * ConnectorOverlay renders SVG arrows for short edges.
 */
export const ConnectorOverlay = observer<ConnectorOverlayProps>(function ConnectorOverlay({
  layout,
  emphasis,
}) {
  const { connectors, boundsWorld } = layout;

  // Compute SVG viewBox from world bounds
  const viewBox = `${boundsWorld.x} ${boundsWorld.y} ${boundsWorld.width} ${boundsWorld.height}`;

  return (
    <svg className="connector-overlay" viewBox={viewBox}>
      <defs>
        {/* Arrowhead marker */}
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" className="connector-arrowhead" />
        </marker>

        {/* Glowing arrowhead marker */}
        <marker
          id="arrowhead-glow"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" className="connector-arrowhead" fill="#4a9eff" />
        </marker>
      </defs>

      {/* Render connectors */}
      {connectors.map((connector) => {
        const isGlowing = emphasis.connectorGlowEdges.has(connector.id);
        return (
          <ConnectorPath
            key={connector.id}
            connector={connector}
            isGlowing={isGlowing}
          />
        );
      })}
    </svg>
  );
});

/**
 * ConnectorPath renders a single arrow path.
 */
interface ConnectorPathProps {
  connector: LayoutConnector;
  isGlowing: boolean;
}

const ConnectorPath = React.memo<ConnectorPathProps>(function ConnectorPath({
  connector,
  isGlowing,
}) {
  const { from, to, style } = connector;

  // Compute path based on style
  const pathData = computeConnectorPath(from.x, from.y, to.x, to.y, style);

  return (
    <path
      d={pathData}
      className={`connector ${isGlowing ? 'glow' : ''}`}
      markerEnd={`url(#${isGlowing ? 'arrowhead-glow' : 'arrowhead'})`}
    />
  );
});

/**
 * Compute SVG path data for a connector.
 */
function computeConnectorPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: 'straight' | 'elbow' | 'curve'
): string {
  switch (style) {
    case 'straight':
      return `M ${x1} ${y1} L ${x2} ${y2}`;

    case 'elbow': {
      // Elbow connector with horizontal midpoint
      const midX = (x1 + x2) / 2;
      return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    }

    case 'curve': {
      // Smooth bezier curve
      const dx = x2 - x1;
      const cx1 = x1 + dx * 0.5;
      const cy1 = y1;
      const cx2 = x1 + dx * 0.5;
      const cy2 = y2;
      return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    }

    default:
      return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
}
