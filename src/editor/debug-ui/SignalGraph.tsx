/**
 * SignalGraph Component
 *
 * Canvas-based waveform visualization for signal history.
 * Features:
 * - Auto-scaling Y-axis based on min/max
 * - Grid rendering with time divisions
 * - Crosshair on hover with (t, value) tooltip
 * - Smooth rendering at 60fps
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { SignalHistoryBuffer } from '../debug/SignalHistoryBuffer';
import './SignalGraph.css';

interface SignalGraphProps {
  /** History buffer to visualize */
  buffer: SignalHistoryBuffer;
  /** Canvas width in pixels */
  width?: number;
  /** Canvas height in pixels */
  height?: number;
  /** Waveform color */
  color?: string;
  /** Label for the signal */
  label?: string;
}

/**
 * SignalGraph renders a time-series waveform on canvas.
 */
export function SignalGraph({
  buffer,
  width = 400,
  height = 150,
  color = '#3b82f6',
  label,
}: SignalGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{ t: number; value: number; x: number; y: number } | null>(null);

  // Render waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get samples and bounds
    const samples = buffer.getSamples();
    if (samples.length === 0) {
      // Draw empty state
      drawEmptyState(ctx, width, height);
      return;
    }

    const bounds = buffer.getBounds();
    const timeRange = buffer.getTimeRange();

    if (!timeRange) return;

    // Draw grid
    drawGrid(ctx, width, height, timeRange);

    // Draw waveform
    drawWaveform(ctx, width, height, samples, timeRange, bounds, color);

    // Draw axes labels
    drawAxes(ctx, width, height, timeRange, bounds);
  }, [buffer, width, height, color]);

  // Handle mouse movement for crosshair
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Convert pixel coordinates to data coordinates
      const samples = buffer.getSamples();
      const timeRange = buffer.getTimeRange();
      const bounds = buffer.getBounds();

      if (samples.length === 0 || !timeRange) {
        setHoverInfo(null);
        return;
      }

      // Map x to time
      const padding = 40;
      const graphWidth = width - padding * 2;
      const relX = (x - padding) / graphWidth;
      const t = timeRange.start + relX * (timeRange.end - timeRange.start);

      // Find nearest sample
      let nearestSample = samples[0];
      let minDist = Math.abs(samples[0].t - t);

      for (const sample of samples) {
        const dist = Math.abs(sample.t - t);
        if (dist < minDist) {
          minDist = dist;
          nearestSample = sample;
        }
      }

      // Map sample back to pixel coordinates
      const sampleX = padding + ((nearestSample.t - timeRange.start) / (timeRange.end - timeRange.start)) * graphWidth;
      const graphHeight = height - padding * 2;
      const sampleY = padding + graphHeight - ((nearestSample.value - bounds.min) / (bounds.max - bounds.min)) * graphHeight;

      setHoverInfo({
        t: nearestSample.t,
        value: nearestSample.value,
        x: sampleX,
        y: sampleY,
      });
    },
    [buffer, width, height]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  return (
    <div className="signal-graph-container">
      {label && <div className="signal-graph-label">{label}</div>}
      <div className="signal-graph-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: hoverInfo ? 'crosshair' : 'default' }}
        />
        {hoverInfo && (
          <>
            {/* Crosshair */}
            <div
              className="signal-graph-crosshair-v"
              style={{ left: hoverInfo.x }}
            />
            <div
              className="signal-graph-crosshair-h"
              style={{ top: hoverInfo.y }}
            />
            {/* Tooltip */}
            <div
              className="signal-graph-tooltip"
              style={{
                left: hoverInfo.x + 10,
                top: hoverInfo.y - 10,
              }}
            >
              <div>t: {hoverInfo.t.toFixed(3)}s</div>
              <div>value: {hoverInfo.value.toFixed(3)}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Draw empty state message.
 */
function drawEmptyState(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#6b7280';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No data', width / 2, height / 2);
}

/**
 * Draw grid lines and divisions.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeRange: { start: number; end: number }
) {
  const padding = 40;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;

  // Determine grid divisions based on time range
  const duration = timeRange.end - timeRange.start;
  const divisions = calculateDivisions(duration);

  // Vertical grid lines (time divisions)
  for (let i = 0; i <= divisions; i++) {
    const x = padding + (i / divisions) * graphWidth;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }

  // Horizontal grid lines (value divisions)
  const valueDivisions = 4;
  for (let i = 0; i <= valueDivisions; i++) {
    const y = padding + (i / valueDivisions) * graphHeight;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
}

/**
 * Calculate appropriate number of grid divisions based on time range.
 */
function calculateDivisions(duration: number): number {
  if (duration <= 1) return 10; // 0.1s divisions
  if (duration <= 5) return 10; // 0.5s divisions
  if (duration <= 10) return 10; // 1s divisions
  return 10;
}

/**
 * Draw the waveform.
 */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  samples: Array<{ t: number; value: number }>,
  timeRange: { start: number; end: number },
  bounds: { min: number; max: number },
  color: string
) {
  if (samples.length < 2) return;

  const padding = 40;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  // Map samples to pixel coordinates
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const x = padding + ((sample.t - timeRange.start) / (timeRange.end - timeRange.start)) * graphWidth;
    const y = padding + graphHeight - ((sample.value - bounds.min) / (bounds.max - bounds.min)) * graphHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

/**
 * Draw axis labels.
 */
function drawAxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeRange: { start: number; end: number },
  bounds: { min: number; max: number }
) {
  const padding = 40;

  ctx.fillStyle = '#6b7280';
  ctx.font = '11px monospace';

  // Time labels (X-axis)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${timeRange.start.toFixed(2)}s`, padding, height - padding + 5);

  ctx.textAlign = 'right';
  ctx.fillText(`${timeRange.end.toFixed(2)}s`, width - padding, height - padding + 5);

  // Value labels (Y-axis)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(bounds.max.toFixed(2), padding - 5, padding);

  ctx.textBaseline = 'bottom';
  ctx.fillText(bounds.min.toFixed(2), padding - 5, height - padding);
}
