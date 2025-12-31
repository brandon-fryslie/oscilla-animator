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

/**
 * Apply color grading matrix transformation to canvas.
 *
 * Uses ImageData pixel manipulation to apply a color transformation matrix.
 * Matrix format: 3x3 (RGB only) or 4x4/5x4 (RGBA with offset).
 *
 * For 3x3 matrix (9 elements):
 *   R' = m[0]*R + m[1]*G + m[2]*B
 *   G' = m[3]*R + m[4]*G + m[5]*B
 *   B' = m[6]*R + m[7]*G + m[8]*B
 *
 * For 5x4 matrix (20 elements, with offset column):
 *   R' = m[0]*R + m[1]*G + m[2]*B + m[3]*A + m[4]
 *   G' = m[5]*R + m[6]*G + m[7]*B + m[8]*A + m[9]
 *   B' = m[10]*R + m[11]*G + m[12]*B + m[13]*A + m[14]
 *   A' = m[15]*R + m[16]*G + m[17]*B + m[18]*A + m[19]
 *
 * @param ctx - Canvas rendering context
 * @param matrix - Color transformation matrix (9 or 20 elements)
 */
function applyColorGradeEffect(
  ctx: CanvasRenderingContext2D,
  matrix: number[]
): void {
  if (matrix.length === 0) {
    // Empty matrix - no transformation
    return;
  }

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  if (w === 0 || h === 0) {
    // Empty canvas - nothing to process
    return;
  }

  // Get image data from canvas
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data; // Uint8ClampedArray [r,g,b,a, r,g,b,a, ...]

  // Determine matrix format
  const is3x3 = matrix.length === 9;
  const is5x4 = matrix.length === 20;

  if (!is3x3 && !is5x4) {
    console.warn(
      `applyColorGradeEffect: invalid matrix length ${matrix.length}. ` +
      `Expected 9 (3x3) or 20 (5x4). Using identity transform.`
    );
    return;
  }

  // Apply color matrix to each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i + 0];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (is3x3) {
      // 3x3 matrix (RGB only, preserve alpha)
      const rNew = matrix[0] * r + matrix[1] * g + matrix[2] * b;
      const gNew = matrix[3] * r + matrix[4] * g + matrix[5] * b;
      const bNew = matrix[6] * r + matrix[7] * g + matrix[8] * b;

      data[i + 0] = Math.max(0, Math.min(255, rNew));
      data[i + 1] = Math.max(0, Math.min(255, gNew));
      data[i + 2] = Math.max(0, Math.min(255, bNew));
      // Alpha unchanged
    } else {
      // 5x4 matrix (RGBA with offset)
      const rNew = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[3] * a + matrix[4];
      const gNew = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[8] * a + matrix[9];
      const bNew = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[13] * a + matrix[14];
      const aNew = matrix[15] * r + matrix[16] * g + matrix[17] * b + matrix[18] * a + matrix[19];

      data[i + 0] = Math.max(0, Math.min(255, rNew));
      data[i + 1] = Math.max(0, Math.min(255, gNew));
      data[i + 2] = Math.max(0, Math.min(255, bNew));
      data[i + 3] = Math.max(0, Math.min(255, aNew));
    }
  }

  // Put modified image data back to canvas
  ctx.putImageData(imageData, 0, 0);
}
