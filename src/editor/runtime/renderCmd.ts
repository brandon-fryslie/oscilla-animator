/**
 * Canvas 2D Render Command Types
 *
 * RenderTree is the only boundary between patch content and drawing.
 * The renderer never sees domain-specific concepts like "radius" -
 * it only sees transforms, styles, and glyphs.
 *
 * Supports:
 * - Instances with per-element transforms + styles
 * - Glyph kinds: circle, rect, star, polyline
 * - Grouping with per-group transform/opacity/blend
 * - Paths for visualizers
 *
 * Designed to be serializable and Rust/WASM friendly (no closures).
 */

// =============================================================================
// Color
// =============================================================================

export interface ColorRGBA {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  a: number; // 0..1
}

// =============================================================================
// Blend Mode
// =============================================================================

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen';

// =============================================================================
// Transform2D - 2x3 affine matrix
// =============================================================================

export interface Transform2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Identity transform */
export const IDENTITY_TRANSFORM: Transform2D = {
  a: 1, b: 0,
  c: 0, d: 1,
  e: 0, f: 0,
};

/** Create transform from position and scale */
export function transformFromPosScale(x: number, y: number, scale: number): Transform2D {
  return { a: scale, b: 0, c: 0, d: scale, e: x, f: y };
}

/** Create transform from position, rotation, and scale */
export function transformFromPosRotScale(
  x: number,
  y: number,
  rotation: number,
  scale: number
): Transform2D {
  const cos = Math.cos(rotation) * scale;
  const sin = Math.sin(rotation) * scale;
  return { a: cos, b: sin, c: -sin, d: cos, e: x, f: y };
}

// =============================================================================
// Style2D
// =============================================================================

export interface Style2D {
  fill?: ColorRGBA;
  stroke?: ColorRGBA;
  strokeWidth?: number;
  opacity?: number; // Multiplies fill/stroke alpha
}

// =============================================================================
// Glyph2D - Shape types
// =============================================================================

export type Glyph2D =
  | { kind: 'circle' }                              // Radius comes from scale in transform
  | { kind: 'rect' }                                // Size comes from scale in transform
  | { kind: 'star'; points: number; inner: number } // inner in 0..1
  | { kind: 'polyline'; closed?: boolean };         // Uses points buffer

// =============================================================================
// Render Commands
// =============================================================================

/**
 * Clear the canvas with a color.
 */
export interface ClearCommand {
  kind: 'clear';
  color: ColorRGBA;
}

/**
 * Group of commands with optional transform, opacity, and blend mode.
 */
export interface GroupCommand {
  kind: 'group';
  transform?: Transform2D;
  opacity?: number;
  blend?: BlendMode;
  children: RenderCmd[];
}

/**
 * Draw multiple instances of the same glyph with per-instance transforms and styles.
 *
 * Transform convention: glyph is unit-sized at origin, transform scales/translates it.
 * - Circle: radius 0.5 at origin
 * - Rect: 1x1 centered at origin
 * - Star: fits in unit circle
 */
export interface Instances2DCommand {
  kind: 'instances2d';

  /** The glyph shape to draw */
  glyph: Glyph2D;

  /** Per-instance transforms. Length N*6 (a,b,c,d,e,f for each instance) */
  transforms: Float32Array;

  /** Per-instance fill colors. Packed RGBA8 (0xRRGGBBAA). Optional, length N */
  styleFill?: Uint32Array;

  /** Per-instance stroke colors. Packed RGBA8. Optional, length N */
  styleStroke?: Uint32Array;

  /** Per-instance stroke widths. Optional, length N */
  strokeWidth?: Float32Array;

  /** Per-instance opacity. Optional, length N */
  opacity?: Float32Array;
}

/**
 * Draw a path/polyline.
 */
export interface Path2DCommand {
  kind: 'path2d';
  /** Points as [x0, y0, x1, y1, ...] */
  points: Float32Array;
  closed?: boolean;
  style: Style2D;
}

/**
 * Union of all render commands.
 */
export type RenderCmd =
  | ClearCommand
  | GroupCommand
  | Instances2DCommand
  | Path2DCommand;

/**
 * The render tree - a list of commands to execute.
 */
export interface RenderTree {
  cmds: RenderCmd[];
}

// =============================================================================
// Color Helpers
// =============================================================================

/**
 * Pack RGBA values (0-255 each) into a single Uint32.
 */
export function packRGBA(r: number, g: number, b: number, a: number): number {
  return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff);
}

/**
 * Unpack a Uint32 to RGBA values (0-255 each).
 */
export function unpackRGBA(packed: number): [number, number, number, number] {
  const r = (packed >>> 24) & 0xff;
  const g = (packed >>> 16) & 0xff;
  const b = (packed >>> 8) & 0xff;
  const a = packed & 0xff;
  return [r, g, b, a];
}

/**
 * Unpack a Uint32 to ColorRGBA (0-1 each).
 */
export function unpackToColorRGBA(packed: number): ColorRGBA {
  const [r, g, b, a] = unpackRGBA(packed);
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

/**
 * Convert ColorRGBA to CSS rgba string.
 */
export function colorToCss(c: ColorRGBA): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r},${g},${b},${c.a})`;
}

/**
 * Parse a CSS color string to ColorRGBA.
 */
export function parseColor(color: string): ColorRGBA {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return { r, g, b, a: 1 };
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return { r, g, b, a: 1 };
    } else if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      return { r, g, b, a };
    }
  }

  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match !== null) {
      const r = parseInt(match[1], 10) / 255;
      const g = parseInt(match[2], 10) / 255;
      const b = parseInt(match[3], 10) / 255;
      const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
      return { r, g, b, a };
    }
  }

  // Fallback to white
  return { r: 1, g: 1, b: 1, a: 1 };
}
