/**
 * Canvas2DRenderer
 *
 * A deterministic, stateless Canvas runtime that executes RenderCmds.
 *
 * Supports:
 * - Instances with per-element transforms + styles
 * - Glyph kinds: circle, rect, star, polyline
 * - Grouping with per-group transform/opacity/blend
 * - Paths for visualizers
 *
 * What it does NOT do:
 * - No time logic, no looping, no phase
 * - No graph evaluation, no adapters/lenses
 * - No domain semantics / identity logic
 * - No automatic sorting heuristics
 */

import type {
  RenderCmd,
  RenderTree,
  ClearCommand,
  GroupCommand,
  Instances2DCommand,
  Path2DCommand,
  ColorRGBA,
  BlendMode,
  Transform2D,
} from './renderCmd';
import { colorToCss, unpackToColorRGBA } from './renderCmd';

// =============================================================================
// Types
// =============================================================================

export interface RenderStats {
  drawCallCount: number;
  stateChangeCount: number;
  renderTimeMs: number;
  instanceCount: number;
}

// =============================================================================
// Helpers
// =============================================================================

function setBlendMode(ctx: CanvasRenderingContext2D, mode: BlendMode | undefined): void {
  switch (mode) {
    case 'add':
      ctx.globalCompositeOperation = 'lighter';
      return;
    case 'multiply':
      ctx.globalCompositeOperation = 'multiply';
      return;
    case 'screen':
      ctx.globalCompositeOperation = 'screen';
      return;
    case 'normal':
    default:
      ctx.globalCompositeOperation = 'source-over';
      return;
  }
}

function applyTransform(ctx: CanvasRenderingContext2D, t: Transform2D): void {
  ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
}

function withSavedState(ctx: CanvasRenderingContext2D, fn: () => void): void {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

// =============================================================================
// Canvas2DRenderer
// =============================================================================

export class Canvas2DRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  // Stats
  private stats: RenderStats = {
    drawCallCount: 0,
    stateChangeCount: 0,
    renderTimeMs: 0,
    instanceCount: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      throw new Error('Canvas 2D context not available');
    }
    this.ctx = ctx;
  }

  /**
   * Set viewport dimensions and device pixel ratio.
   */
  setViewport(width: number, height: number, dpr: number = 1): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;

    const canvasWidth = Math.floor(width * dpr);
    const canvasHeight = Math.floor(height * dpr);

    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth;
      this.canvas.height = canvasHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    // Set pixel-space transform
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Render a RenderTree.
   */
  render(tree: RenderTree): RenderStats {
    const startTime = performance.now();
    const ctx = this.ctx;

    // Reset stats
    this.stats = {
      drawCallCount: 0,
      stateChangeCount: 0,
      renderTimeMs: 0,
      instanceCount: 0,
    };

    // Reset state each frame
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Execute commands
    for (const cmd of tree.cmds) {
      this.exec(cmd);
    }

    this.stats.renderTimeMs = performance.now() - startTime;
    return this.stats;
  }

  /**
   * Clear the canvas.
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Get the canvas element.
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get last render stats.
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }

  // ===========================================================================
  // Private: Command Execution
  // ===========================================================================

  private exec(cmd: RenderCmd): void {
    switch (cmd.kind) {
      case 'clear':
        this.execClear(cmd);
        break;

      case 'group':
        this.execGroup(cmd);
        break;

      case 'instances2d':
        this.execInstances2D(cmd);
        break;

      case 'path2d':
        this.execPath2D(cmd);
        break;

      default: {
        const _exhaustive: never = cmd;
        throw new Error(`Unknown command: ${(_exhaustive as RenderCmd).kind}`);
      }
    }
  }

  private execClear(cmd: ClearCommand): void {
    const ctx = this.ctx;
    const css = colorToCss(cmd.color);

    withSavedState(ctx, () => {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, this.width, this.height);
    });

    this.stats.drawCallCount++;
  }

  private execGroup(cmd: GroupCommand): void {
    const ctx = this.ctx;

    withSavedState(ctx, () => {
      if (cmd.blend) {
        setBlendMode(ctx, cmd.blend);
        this.stats.stateChangeCount++;
      }
      if (cmd.opacity !== undefined) {
        ctx.globalAlpha *= cmd.opacity;
        this.stats.stateChangeCount++;
      }
      if (cmd.transform != null) {
        applyTransform(ctx, cmd.transform);
        this.stats.stateChangeCount++;
      }

      for (const child of cmd.children) {
        this.exec(child);
      }
    });
  }

  private execPath2D(cmd: Path2DCommand): void {
    const ctx = this.ctx;
    const { points, closed, style } = cmd;

    withSavedState(ctx, () => {
      ctx.beginPath();

      if (points.length >= 2) {
        ctx.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) {
          ctx.lineTo(points[i], points[i + 1]);
        }
        if (closed ?? false) ctx.closePath();
      }

      const opacity = style.opacity ?? 1;

      if (style.fill) {
        const fill: ColorRGBA = { ...style.fill, a: style.fill.a * opacity };
        ctx.fillStyle = colorToCss(fill);
        ctx.fill();
        this.stats.drawCallCount++;
      }

      if (style.stroke) {
        const stroke: ColorRGBA = { ...style.stroke, a: style.stroke.a * opacity };
        ctx.strokeStyle = colorToCss(stroke);
        ctx.lineWidth = style.strokeWidth ?? 1;
        ctx.stroke();
        this.stats.drawCallCount++;
      }
    });
  }

  private execInstances2D(cmd: Instances2DCommand): void {
    const ctx = this.ctx;
    const N = Math.floor(cmd.transforms.length / 6);

    const hasFill = (cmd.styleFill != null) && cmd.styleFill.length === N;
    const hasStroke = (cmd.styleStroke != null) && cmd.styleStroke.length === N;
    const hasStrokeWidth = (cmd.strokeWidth != null) && cmd.strokeWidth.length === N;
    const hasOpacity = (cmd.opacity != null) && cmd.opacity.length === N;

    this.stats.instanceCount += N;

    for (let i = 0; i < N; i++) {
      const a = cmd.transforms[i * 6 + 0];
      const b = cmd.transforms[i * 6 + 1];
      const c = cmd.transforms[i * 6 + 2];
      const d = cmd.transforms[i * 6 + 3];
      const e = cmd.transforms[i * 6 + 4];
      const f = cmd.transforms[i * 6 + 5];

      const opacity = hasOpacity ? cmd.opacity![i] : 1;

      withSavedState(ctx, () => {
        ctx.transform(a, b, c, d, e, f);
        ctx.globalAlpha *= opacity;

        // Apply per-instance style
        let fillCss: string | null = null;
        let strokeCss: string | null = null;

        if (hasFill) {
          const fill = unpackToColorRGBA(cmd.styleFill![i]);
          fillCss = colorToCss(fill);
          ctx.fillStyle = fillCss;
        }

        if (hasStroke) {
          const stroke = unpackToColorRGBA(cmd.styleStroke![i]);
          strokeCss = colorToCss(stroke);
          ctx.strokeStyle = strokeCss;
          ctx.lineWidth = hasStrokeWidth ? cmd.strokeWidth![i] : 1;
        }

        // Draw glyph
        switch (cmd.glyph.kind) {
          case 'circle': {
            ctx.beginPath();
            ctx.arc(0, 0, 0.5, 0, Math.PI * 2); // Unit circle radius 0.5
            if (fillCss) ctx.fill();
            if (strokeCss) ctx.stroke();
            this.stats.drawCallCount++;
            break;
          }

          case 'rect': {
            // Unit square centered at origin
            const x = -0.5, y = -0.5, w = 1, h = 1;
            if (fillCss) ctx.fillRect(x, y, w, h);
            if (strokeCss) ctx.strokeRect(x, y, w, h);
            this.stats.drawCallCount++;
            break;
          }

          case 'star': {
            const points = Math.max(3, cmd.glyph.points | 0);
            const inner = Math.max(0.05, Math.min(0.95, cmd.glyph.inner));

            ctx.beginPath();
            for (let k = 0; k < points * 2; k++) {
              const isOuter = (k % 2) === 0;
              const r = isOuter ? 0.5 : 0.5 * inner;
              const theta = (k / (points * 2)) * Math.PI * 2 - Math.PI / 2;
              const px = Math.cos(theta) * r;
              const py = Math.sin(theta) * r;
              if (k === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();

            if (fillCss != null) ctx.fill();
            if (strokeCss != null) ctx.stroke();
            this.stats.drawCallCount++;
            break;
          }

          case 'polyline': {
            // Polyline glyph for instancing is unusual - typically use Path2DCommand
            // Omitted for now
            break;
          }
        }
      });
    }
  }

  // ===========================================================================
  // Resource Cache
  // ===========================================================================

  /**
   * Clear any cached resources.
   */
  clearCache(): void {
    // Reserved for future path caching
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Canvas2DRenderer for an existing canvas element.
 */
export function createCanvasRenderer(canvas: HTMLCanvasElement): Canvas2DRenderer {
  return new Canvas2DRenderer(canvas);
}
