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
import type { RenderFrameIR } from '../compiler/ir/renderIR';
import type { ValueStore } from '../compiler/ir/stores';
import { renderInstances2DPass, renderPaths2DPass } from './renderPassExecutors';
import type { RenderFrameIR as SimpleRenderFrameIR } from './executor/IRRuntimeAdapter';

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

/**
 * Unpack u32 packed color to CSS rgba string.
 *
 * Assumes RGBA u32 encoding (little-endian byte order).
 */
function unpackColorU32(packed: number): string {
  const r = (packed >>> 0) & 0xFF;
  const g = (packed >>> 8) & 0xFF;
  const b = (packed >>> 16) & 0xFF;
  const a = (packed >>> 24) & 0xFF;
  return `rgba(${r},${g},${b},${a / 255})`;
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
   * Render a RenderFrameIR.
   *
   * This is the new IR-based rendering path that dispatches on pass.kind
   * and uses the render pass executors (renderInstances2DPass, renderPaths2DPass).
   *
   * Algorithm:
   * 1. Clear canvas based on clear spec
   * 2. Execute each render pass in order
   * 3. Execute optional overlay passes
   *
   * @param frame - RenderFrameIR from executeRenderAssemble
   * @param valueStore - ValueStore containing buffers referenced by BufferRefIR
   * @returns RenderStats for this frame
   */
  renderFrame(frame: RenderFrameIR, valueStore: ValueStore): RenderStats {
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

    // 1. Clear canvas
    if (frame.clear.mode === 'color') {
      const colorRGBA = frame.clear.colorRGBA;
      if (colorRGBA !== undefined) {
        const cssColor = unpackColorU32(colorRGBA);
        ctx.fillStyle = cssColor;
        ctx.fillRect(0, 0, this.width, this.height);
        this.stats.drawCallCount++;
      }
    }

    // 2. Execute render passes
    for (const pass of frame.passes) {
      this.renderPass(pass, valueStore);
    }

    // 3. Execute overlay passes (if any)
    if (frame.overlays) {
      for (const overlay of frame.overlays) {
        this.renderPass(overlay, valueStore);
      }
    }

    this.stats.renderTimeMs = performance.now() - startTime;
    return this.stats;
  }

  /**
   * Render a single pass by dispatching on pass.kind.
   *
   * @param pass - RenderPassIR (Instances2D, Paths2D, or PostFX)
   * @param valueStore - ValueStore for buffer reads
   */
  private renderPass(pass: RenderFrameIR['passes'][0], valueStore: ValueStore): void {
    switch (pass.kind) {
      case 'instances2d':
        renderInstances2DPass(pass, this.ctx, valueStore);
        break;

      case 'paths2d':
        renderPaths2DPass(pass, this.ctx, valueStore);
        break;

      case 'postfx':
        // PostFX not implemented yet - skip silently
        console.warn('Canvas2DRenderer: PostFX passes not implemented yet');
        break;

      default: {
        const _exhaustive: never = pass;
        throw new Error(`Canvas2DRenderer: unknown pass kind ${(_exhaustive as any).kind}`);
      }
    }
  }

  /**
   * Render a SimpleRenderFrameIR (inline buffers, no ValueStore lookup).
   *
   * This is the simplified IR rendering path for Phase E integration.
   * Buffers are stored directly in the pass structure, not via BufferRefIR.
   *
   * @param frame - SimpleRenderFrameIR from executeRenderAssemble
   * @returns RenderStats for this frame
   */
  renderFrameSimple(frame: SimpleRenderFrameIR): RenderStats {
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

    // 1. Clear canvas
    if ('mode' in frame.clear && frame.clear.mode === 'none') {
      // No clear - skip
    } else if ('r' in frame.clear) {
      // RGBA clear color
      const c = frame.clear;
      ctx.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${c.a})`;
      ctx.fillRect(0, 0, this.width, this.height);
      this.stats.drawCallCount++;
    }

    // 2. Execute render passes
    for (const pass of frame.passes) {
      if (pass.kind === 'instances2d') {
        this.renderInstances2DSimple(pass.batch);
      } else if (pass.kind === 'paths2d') {
        this.renderPaths2DSimple(pass.batch);
      }
    }

    this.stats.renderTimeMs = performance.now() - startTime;
    return this.stats;
  }

  /**
   * Render Instances2D batch with inline Float32Array buffers.
   */
  private renderInstances2DSimple(batch: {
    count: number;
    x: Float32Array;
    y: Float32Array;
    radius: Float32Array;
    r: Float32Array;
    g: Float32Array;
    b: Float32Array;
    a: Float32Array;
  }): void {
    const ctx = this.ctx;
    const n = batch.count;

    this.stats.instanceCount += n;

    for (let i = 0; i < n; i++) {
      const x = batch.x[i];
      const y = batch.y[i];
      const r = batch.radius[i];
      const red = batch.r[i];
      const green = batch.g[i];
      const blue = batch.b[i];
      const alpha = batch.a[i];

      ctx.fillStyle = `rgba(${(red * 255) | 0},${(green * 255) | 0},${(blue * 255) | 0},${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      this.stats.drawCallCount++;
    }
  }

  /**
   * Render Paths2D batch with inline buffers.
   */
  private renderPaths2DSimple(batch: {
    cmds: Uint16Array;
    params: Float32Array;
  }): void {
    const ctx = this.ctx;
    const cmds = batch.cmds;
    const p = batch.params;
    let pi = 0;

    ctx.beginPath();
    for (let ci = 0; ci < cmds.length; ci++) {
      const c = cmds[ci];
      switch (c) {
        case 0: { // MoveTo
          const x = p[pi++], y = p[pi++];
          ctx.moveTo(x, y);
          break;
        }
        case 1: { // LineTo
          const x = p[pi++], y = p[pi++];
          ctx.lineTo(x, y);
          break;
        }
        case 2: { // Close
          ctx.closePath();
          break;
        }
        default:
          console.warn(`Canvas2DRenderer: Unknown path cmd ${c}`);
      }
    }
    ctx.stroke();
    this.stats.drawCallCount++;
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
  // Private: Command Execution (Legacy RenderTree path)
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
