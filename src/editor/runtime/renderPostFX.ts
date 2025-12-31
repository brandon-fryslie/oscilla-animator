/**
 * PostFX Pass Rendering
 *
 * Implements post-processing effects for Canvas2D rendering.
 */

import type {
  PostFXPassIR,
  RenderPassHeaderIR,
} from "../compiler/ir/renderIR";
import type { ValueStore } from "../compiler/ir/stores";

/**
 * Apply RenderPassHeaderIR to Canvas context.
 * (Duplicated from renderPassExecutors - could be shared)
 */
function applyPassHeader(
  ctx: CanvasRenderingContext2D,
  header: RenderPassHeaderIR,
): void {
  if (header.view !== undefined) {
    const t = header.view;
    ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
  }

  if (header.clip !== undefined) {
    ctx.beginPath();
    switch (header.clip.kind) {
      case "rect": {
        const { x, y, w, h } = header.clip;
        ctx.rect(x, y, w, h);
        break;
      }
      case "circle": {
        const { x, y, radius } = header.clip;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        break;
      }
      case "path":
        console.warn("renderPostFX: path-based clipping not implemented");
        break;
    }
    ctx.clip();
  }

  if (header.blend !== undefined) {
    switch (header.blend.mode) {
      case "normal":
        ctx.globalCompositeOperation = "source-over";
        break;
      case "add":
        ctx.globalCompositeOperation = "lighter";
        break;
      case "multiply":
        ctx.globalCompositeOperation = "multiply";
        break;
      case "screen":
        ctx.globalCompositeOperation = "screen";
        break;
    }
    if (header.blend.opacity !== undefined) {
      ctx.globalAlpha *= header.blend.opacity;
    }
  }
}

/**
 * Render a PostFX pass to Canvas.
 */
export function renderPostFXPass(
  pass: PostFXPassIR,
  ctx: CanvasRenderingContext2D,
  _valueStore: ValueStore,
): void {
  if (!pass.header.enabled) {
    return;
  }

  ctx.save();
  try {
    applyPassHeader(ctx, pass.header);

    switch (pass.effect.kind) {
      case "blur":
        applyBlurEffect(ctx, pass.effect.radiusX, pass.effect.radiusY);
        break;
      case "bloom":
        applyBloomEffect(ctx, pass.effect.threshold, pass.effect.intensity, pass.effect.radius);
        break;
      case "vignette":
        applyVignetteEffect(ctx, pass.effect.intensity, pass.effect.softness);
        break;
      case "colorGrade":
        applyColorGradeEffect(ctx, pass.effect.matrix);
        break;
      default: {
        const _exhaustive: never = pass.effect;
        console.warn(`renderPostFXPass: unknown effect kind ${(_exhaustive as { kind: string }).kind}`);
      }
    }
  } finally {
    ctx.restore();
  }
}

function applyBlurEffect(
  ctx: CanvasRenderingContext2D,
  radiusX: number,
  radiusY: number
): void {
  const radius = (radiusX + radiusY) / 2;
  if (radius <= 0) return;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = ctx.canvas.width;
  tempCanvas.height = ctx.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx == null) {
    console.warn('applyBlurEffect: failed to create temporary canvas context');
    return;
  }

  tempCtx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

function applyBloomEffect(
  ctx: CanvasRenderingContext2D,
  _threshold: number,
  intensity: number,
  radius: number
): void {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = ctx.canvas.width;
  tempCanvas.height = ctx.canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx == null) {
    console.warn('applyBloomEffect: failed to create temporary canvas context');
    return;
  }

  tempCtx.drawImage(ctx.canvas, 0, 0);
  tempCtx.globalCompositeOperation = 'lighter';
  tempCtx.globalAlpha = intensity;
  tempCtx.filter = `blur(${radius}px)`;
  tempCtx.drawImage(tempCanvas, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = intensity;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

function applyVignetteEffect(
  ctx: CanvasRenderingContext2D,
  intensity: number,
  softness: number
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.sqrt(cx * cx + cy * cy);

  const gradient = ctx.createRadialGradient(cx, cy, radius * softness, cx, cy, radius);
  gradient.addColorStop(0, `rgba(0,0,0,0)`);
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function applyColorGradeEffect(
  _ctx: CanvasRenderingContext2D,
  _matrix: number[]
): void {
  console.warn(
    'applyColorGradeEffect: color matrix transformation not implemented yet. ' +
    'Requires pixel-level manipulation via ImageData.'
  );
}
