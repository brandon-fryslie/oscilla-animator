/**
 * FieldHistogram Component
 *
 * Renders field value distribution as a histogram.
 * Shows bins and counts to visualize data distribution.
 *
 * Features:
 * - Auto-binning (default: 20 bins)
 * - Bar chart visualization
 * - Hover tooltip showing bin range and count
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { FieldStats } from '../debug/FieldStats';
import './FieldHistogram.css';

interface FieldHistogramProps {
  /** Field values to histogram */
  fieldValues: Float32Array;

  /** Field statistics */
  stats: FieldStats;

  /** Number of bins (default: 20) */
  bins?: number;

  /** Canvas width in pixels */
  width?: number;

  /** Canvas height in pixels */
  height?: number;
}

interface BinData {
  min: number;
  max: number;
  count: number;
}

/**
 * Compute histogram bins from field values.
 */
function computeHistogram(
  fieldValues: Float32Array,
  stats: FieldStats,
  binCount: number
): BinData[] {
  // Handle empty or invalid fields
  if (stats.count === 0 || stats.nanCount + stats.infCount === stats.count) {
    return [];
  }

  const bins: BinData[] = [];
  const range = stats.max - stats.min || 1;
  const binWidth = range / binCount;

  // Initialize bins
  for (let i = 0; i < binCount; i++) {
    bins.push({
      min: stats.min + i * binWidth,
      max: stats.min + (i + 1) * binWidth,
      count: 0,
    });
  }

  // Count values in each bin
  for (let i = 0; i < fieldValues.length; i++) {
    const value = fieldValues[i];

    // Skip NaN/Inf
    if (!Number.isFinite(value)) continue;

    // Find bin index
    let binIndex = Math.floor((value - stats.min) / binWidth);

    // Clamp to valid bin range
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= binCount) binIndex = binCount - 1;

    bins[binIndex].count++;
  }

  return bins;
}

export function FieldHistogram({
  fieldValues,
  stats,
  bins = 20,
  width = 300,
  height = 200,
}: FieldHistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredBin, setHoveredBin] = useState<{ bin: BinData; index: number } | null>(null);

  // Compute histogram
  const histogram = computeHistogram(fieldValues, stats, bins);
  const maxCount = Math.max(...histogram.map(b => b.count), 1);

  // Render histogram to canvas
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

    if (histogram.length === 0) {
      // Draw "no data" message
      ctx.fillStyle = '#999';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No valid data', width / 2, height / 2);
      return;
    }

    const barWidth = width / histogram.length;
    const padding = 2; // Padding between bars

    // Draw bars
    histogram.forEach((bin, i) => {
      const barHeight = (bin.count / maxCount) * (height - 20); // Leave space for x-axis
      const x = i * barWidth;
      const y = height - barHeight - 10; // Offset from bottom

      // Determine bar color
      const isHovered = hoveredBin !== null && hoveredBin.index === i;
      const fillColor = isHovered ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.6)';

      // Draw bar
      ctx.fillStyle = fillColor;
      ctx.fillRect(x + padding, y, barWidth - padding * 2, barHeight);

      // Draw bar border
      ctx.strokeStyle = 'rgba(59, 130, 246, 1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + padding, y, barWidth - padding * 2, barHeight);
    });

    // Draw x-axis
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 10);
    ctx.lineTo(width, height - 10);
    ctx.stroke();
  }, [histogram, maxCount, width, height, hoveredBin]);

  // Handle mouse move for hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const barWidth = width / histogram.length;
    const binIndex = Math.floor(x / barWidth);

    if (binIndex >= 0 && binIndex < histogram.length) {
      setHoveredBin({ bin: histogram[binIndex], index: binIndex });
    } else {
      setHoveredBin(null);
    }
  }, [histogram, width]);

  const handleMouseLeave = useCallback(() => {
    setHoveredBin(null);
  }, []);

  return (
    <div className="field-histogram">
      <canvas
        ref={canvasRef}
        className="field-histogram-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ width, height, cursor: 'crosshair' }}
      />

      {hoveredBin !== null && (
        <div className="field-histogram-tooltip">
          <div className="field-histogram-tooltip-row">
            <span className="field-histogram-tooltip-label">Range:</span>
            <span className="field-histogram-tooltip-value">
              {hoveredBin.bin.min.toFixed(2)} – {hoveredBin.bin.max.toFixed(2)}
            </span>
          </div>
          <div className="field-histogram-tooltip-row">
            <span className="field-histogram-tooltip-label">Count:</span>
            <span className="field-histogram-tooltip-value">{hoveredBin.bin.count}</span>
          </div>
        </div>
      )}

      <div className="field-histogram-stats">
        <span className="field-histogram-stat">Bins: {bins}</span>
        <span className="field-histogram-stat">Max: {maxCount}</span>
      </div>
    </div>
  );
}
