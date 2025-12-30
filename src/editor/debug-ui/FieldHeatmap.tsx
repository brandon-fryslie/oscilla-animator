/**
 * FieldHeatmap Component
 *
 * Renders field values as a colored grid using a colormap.
 * Grid dimensions auto-detected (square) or manually configured.
 *
 * Features:
 * - Turbo colormap (blue → green → yellow → red)
 * - Auto-scaling based on field min/max
 * - Hover tooltip showing (index, value)
 * - Canvas-based for performance
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { FieldStats } from '../debug/FieldStats';
import './FieldHeatmap.css';

interface FieldHeatmapProps {
  /** Field values to visualize */
  fieldValues: Float32Array;

  /** Field statistics (for colormap scaling) */
  stats: FieldStats;

  /** Grid columns (auto-detected if not provided) */
  cols?: number;

  /** Grid rows (auto-detected if not provided) */
  rows?: number;

  /** Canvas width in pixels */
  width?: number;

  /** Canvas height in pixels */
  height?: number;

  /** Manual colormap range (default: auto-scale from stats) */
  colorRange?: { min: number; max: number };
}

/**
 * Turbo colormap lookup table (256 entries).
 * Maps value in [0, 1] to RGB color.
 *
 * Turbo is perceptually uniform and colorblind-friendly.
 * Blue (low) → Cyan → Green → Yellow → Orange → Red (high)
 */
const TURBO_COLORMAP: [number, number, number][] = [
  [48,18,59],[50,21,67],[51,24,74],[52,27,81],[53,30,88],[54,33,95],
  [55,36,102],[56,39,109],[57,42,115],[58,45,121],[59,47,128],[60,50,134],
  [61,53,139],[62,56,145],[63,59,151],[63,62,156],[64,64,162],[65,67,167],
  [65,70,172],[66,73,177],[66,75,181],[67,78,186],[68,81,191],[68,84,195],
  [68,86,199],[69,89,203],[69,92,207],[69,94,211],[70,97,214],[70,100,218],
  [70,102,221],[70,105,224],[70,107,227],[71,110,230],[71,113,233],[71,115,235],
  [71,118,238],[71,120,240],[71,123,242],[70,125,244],[70,128,246],[70,130,248],
  [70,133,250],[70,135,251],[69,138,252],[69,140,253],[68,143,254],[67,145,254],
  [66,148,255],[65,150,255],[64,153,255],[62,155,254],[61,158,254],[59,160,253],
  [58,163,252],[56,165,251],[55,168,250],[53,171,248],[51,173,247],[49,175,245],
  [47,178,244],[46,180,242],[44,183,240],[42,185,238],[40,188,235],[39,190,233],
  [37,192,231],[35,195,228],[34,197,226],[32,199,223],[31,201,221],[30,203,218],
  [28,205,216],[27,208,213],[26,210,210],[26,212,208],[25,213,205],[24,215,202],
  [24,217,200],[24,219,197],[24,221,194],[24,222,192],[24,224,189],[25,226,187],
  [25,227,185],[26,228,182],[28,230,180],[29,231,178],[31,233,175],[32,234,172],
  [34,235,170],[37,236,167],[39,238,164],[42,239,161],[44,240,158],[47,241,155],
  [50,242,152],[53,243,148],[56,244,145],[60,245,142],[63,246,138],[67,247,135],
  [70,248,132],[74,248,128],[78,249,125],[82,250,122],[85,250,118],[89,251,115],
  [93,252,111],[97,252,108],[101,253,105],[105,253,102],[109,254,98],[113,254,95],
  [117,254,92],[121,254,89],[125,255,86],[128,255,83],[132,255,81],[136,255,78],
  [139,255,75],[143,255,73],[146,255,71],[150,254,68],[153,254,66],[156,254,64],
  [159,253,63],[161,253,61],[164,252,60],[167,252,58],[169,251,57],[172,251,56],
  [175,250,55],[177,249,54],[180,248,54],[183,247,53],[185,246,53],[188,245,52],
  [190,244,52],[193,243,52],[195,241,52],[198,240,52],[200,239,52],[203,237,52],
  [205,236,52],[208,234,52],[210,233,53],[212,231,53],[215,229,53],[217,228,54],
  [219,226,54],[221,224,55],[223,223,55],[225,221,55],[227,219,56],[229,217,56],
  [231,215,57],[233,213,57],[235,211,57],[236,209,58],[238,207,58],[239,205,58],
  [241,203,58],[242,201,58],[244,199,58],[245,197,58],[246,195,58],[247,193,58],
  [248,190,57],[249,188,57],[250,186,57],[251,184,56],[251,182,55],[252,179,54],
  [252,177,54],[253,174,53],[253,172,52],[254,169,51],[254,167,50],[254,164,49],
  [254,161,48],[254,158,47],[254,155,45],[254,153,44],[254,150,43],[254,147,42],
  [254,144,41],[253,141,39],[253,138,38],[252,135,37],[252,132,35],[251,129,34],
  [251,126,33],[250,123,31],[249,120,30],[249,117,29],[248,114,28],[247,111,26],
  [246,108,25],[245,105,24],[244,102,23],[243,99,21],[242,96,20],[241,93,19],
  [240,91,18],[239,88,17],[237,85,16],[236,83,15],[235,80,14],[234,78,13],
  [232,75,12],[231,73,12],[229,71,11],[228,69,10],[226,67,10],[225,65,9],
  [223,63,8],[221,61,8],[220,59,7],[218,57,7],[216,55,6],[214,53,6],
  [212,51,5],[210,49,5],[208,47,5],[206,45,4],[204,43,4],[202,42,4],
  [200,40,3],[197,38,3],[195,37,3],[193,35,2],[190,33,2],[188,32,2],
  [185,30,2],[183,29,2],[180,27,1],[178,26,1],[175,24,1],[172,23,1],
  [169,22,1],[167,20,1],[164,19,1],[161,18,1],[158,16,1],[155,15,1],
  [152,14,1],[149,13,1],[146,11,1],[142,10,1],[139,9,2],[136,8,2],
  [133,7,2],[129,6,2],[126,5,2],[122,4,3]
];

/**
 * Map value in [0, 1] to RGB color using Turbo colormap.
 */
function turboColor(t: number): [number, number, number] {
  // Clamp to [0, 1]
  const clamped = Math.max(0, Math.min(1, t));

  // Map to colormap index [0, 255]
  const index = Math.floor(clamped * 255);

  return TURBO_COLORMAP[index];
}

/**
 * Auto-detect grid dimensions for a field.
 * Prefers square grids (sqrt(n) x sqrt(n)).
 */
function autoGridDimensions(count: number): { rows: number; cols: number } {
  if (count === 0) {
    return { rows: 0, cols: 0 };
  }

  // Try to make a square grid
  const sqrt = Math.ceil(Math.sqrt(count));
  const cols = sqrt;
  const rows = Math.ceil(count / cols);

  return { rows, cols };
}

export function FieldHeatmap({
  fieldValues,
  stats,
  cols,
  rows,
  width = 300,
  height = 300,
  colorRange,
}: FieldHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ index: number; value: number; row: number; col: number } | null>(null);

  // Auto-detect grid dimensions if not provided
  const gridDims = cols !== undefined && rows !== undefined
    ? { rows, cols }
    : autoGridDimensions(fieldValues.length);

  // Determine colormap range
  const range = colorRange ?? { min: stats.min, max: stats.max };
  const rangeSpan = range.max - range.min || 1; // Avoid division by zero

  // Render heatmap to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    // Set canvas resolution
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Cell dimensions
    const cellWidth = width / gridDims.cols;
    const cellHeight = height / gridDims.rows;

    // Render each cell
    for (let i = 0; i < fieldValues.length; i++) {
      const value = fieldValues[i];
      const row = Math.floor(i / gridDims.cols);
      const col = i % gridDims.cols;

      // Skip if out of grid bounds
      if (row >= gridDims.rows) continue;

      // Map value to [0, 1] for colormap
      const t = (value - range.min) / rangeSpan;
      const [r, g, b] = turboColor(t);

      // Draw cell
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(
        col * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight
      );

      // Draw cell border (subtle)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.strokeRect(
        col * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight
      );
    }

    // Highlight hovered cell
    if (hoveredCell !== null) {
      const { row, col } = hoveredCell;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        col * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight
      );
    }
  }, [fieldValues, gridDims, range, rangeSpan, width, height, hoveredCell]);

  // Handle mouse move for hover tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cellWidth = width / gridDims.cols;
    const cellHeight = height / gridDims.rows;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    if (row >= 0 && row < gridDims.rows && col >= 0 && col < gridDims.cols) {
      const index = row * gridDims.cols + col;
      if (index < fieldValues.length) {
        const value = fieldValues[index];
        setHoveredCell({ index, value, row, col });
        return;
      }
    }

    setHoveredCell(null);
  }, [fieldValues, gridDims, width, height]);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  return (
    <div className="field-heatmap">
      <canvas
        ref={canvasRef}
        className="field-heatmap-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ width, height, cursor: 'crosshair' }}
      />

      {hoveredCell !== null && (
        <div className="field-heatmap-tooltip">
          <div className="field-heatmap-tooltip-row">
            <span className="field-heatmap-tooltip-label">Index:</span>
            <span className="field-heatmap-tooltip-value">{hoveredCell.index}</span>
          </div>
          <div className="field-heatmap-tooltip-row">
            <span className="field-heatmap-tooltip-label">Value:</span>
            <span className="field-heatmap-tooltip-value">{hoveredCell.value.toFixed(3)}</span>
          </div>
          <div className="field-heatmap-tooltip-row">
            <span className="field-heatmap-tooltip-label">Grid:</span>
            <span className="field-heatmap-tooltip-value">({hoveredCell.row}, {hoveredCell.col})</span>
          </div>
        </div>
      )}

      <div className="field-heatmap-colorbar">
        <span className="field-heatmap-colorbar-label">{range.min.toFixed(2)}</span>
        <div className="field-heatmap-colorbar-gradient" style={{
          background: `linear-gradient(to right, rgb(48,18,59), rgb(122,4,3))`
        }} />
        <span className="field-heatmap-colorbar-label">{range.max.toFixed(2)}</span>
      </div>
    </div>
  );
}
