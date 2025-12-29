/**
 * Color Kernel Functions
 *
 * Runtime implementations of color operations for the IR executor.
 * These kernels are called by sigMap/fieldMap operations using OpCode.Color*.
 *
 * References:
 * - src/editor/compiler/blocks/signal/ColorLFO.ts (hslToHex implementation)
 * - src/editor/compiler/ir/opcodes.ts (OpCode.ColorHSLToRGB)
 */

/**
 * Convert HSL color to RGB hex string.
 *
 * Algorithm from ColorLFO.ts lines 51-90.
 *
 * @param h - Hue in degrees [0, 360] (wraps automatically)
 * @param s - Saturation [0, 1]
 * @param l - Lightness [0, 1]
 * @returns Hex color string in format '#RRGGBB'
 */
export function colorHSLToRGB(h: number, s: number, l: number): string {
  // Wrap hue to [0, 360)
  h = h % 360;
  if (h < 0) h += 360;

  // Calculate chroma, intermediate, and match
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  // Determine RGB components based on hue sector
  let r: number, g: number, b: number;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  // Convert to hex string
  const toHex = (n: number): string =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Shift hue of a color by a given angle.
 *
 * @param color - Hex color string '#RRGGBB'
 * @param hueShift - Hue shift in degrees
 * @returns New hex color string with shifted hue
 */
export function colorShiftHue(color: string, hueShift: number): string {
  // Parse RGB from hex
  const cleaned = color.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic (gray) - no hue shift possible
    return color;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  // Shift hue and convert back to RGB
  const newHue = (h * 360 + hueShift) % 360;
  return colorHSLToRGB(newHue, s, l);
}

/**
 * Interpolate between two colors in RGB space.
 *
 * @param color1 - Start color '#RRGGBB'
 * @param color2 - End color '#RRGGBB'
 * @param t - Interpolation factor [0, 1]
 * @returns Interpolated color '#RRGGBB'
 */
export function colorLerp(color1: string, color2: string, t: number): string {
  // Parse RGB components
  const parseColor = (hex: string): { r: number; g: number; b: number } => {
    const cleaned = hex.replace(/^#/, '');
    const num = parseInt(cleaned, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  };

  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

  // Interpolate each component
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  // Convert back to hex
  const toHex = (n: number): string =>
    n.toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Scale saturation of a color.
 *
 * @param color - Hex color string '#RRGGBB'
 * @param scale - Saturation scale factor (1.0 = no change, 0.0 = grayscale, >1.0 = more saturated)
 * @returns New hex color string with scaled saturation
 */
export function colorScaleSat(color: string, scale: number): string {
  // Parse RGB from hex
  const cleaned = color.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic - no saturation to scale
    return color;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  // Scale saturation and clamp to [0, 1]
  const newS = Math.max(0, Math.min(1, s * scale));

  // Convert back to RGB
  return colorHSLToRGB(h * 360, newS, l);
}

/**
 * Scale lightness of a color.
 *
 * @param color - Hex color string '#RRGGBB'
 * @param scale - Lightness scale factor (1.0 = no change, 0.0 = black, 2.0 = white)
 * @returns New hex color string with scaled lightness
 */
export function colorScaleLight(color: string, scale: number): string {
  // Parse RGB from hex
  const cleaned = color.replace(/^#/, '');
  const num = parseInt(cleaned, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic - only lightness
    const newL = Math.max(0, Math.min(1, l * scale));
    return colorHSLToRGB(0, 0, newL);
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  // Scale lightness and clamp to [0, 1]
  const newL = Math.max(0, Math.min(1, l * scale));

  // Convert back to RGB
  return colorHSLToRGB(h * 360, s, newL);
}
