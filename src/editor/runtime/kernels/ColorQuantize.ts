/**
 * Color Quantization Kernel
 *
 * Converts float RGBA (0-1 range) to u8x4 premultiplied linear RGBA.
 * This is the authoritative color quantization algorithm that must produce
 * identical results in TypeScript and future Rust/WASM implementations.
 *
 * **Encoding Contract:**
 * - Input: float RGBA in [0, 1] range (clamped if out of range)
 * - Output: u8x4 premultiplied linear RGBA [0, 255]
 * - Premultiplication: RGB channels multiplied by alpha BEFORE quantization
 * - Rounding: Math.round() for deterministic results
 * - Byte order: RGBA (R at index 0, A at index 3)
 *
 * @module runtime/kernels/ColorQuantize
 * @see src/editor/ir/types/BufferDesc.ts for ColorBufferDesc contract
 * @see design-docs/13-Renderer/03-Decisions-Color-PathFlattening-Basic3d.md
 */

/**
 * Quantize float RGBA to u8x4 premultiplied linear RGBA.
 *
 * **Algorithm:**
 * 1. Clamp input channels to [0, 1]
 * 2. Premultiply RGB by alpha: (r*a, g*a, b*a, a)
 * 3. Scale to [0, 255]: channel * 255
 * 4. Round to nearest integer: Math.round()
 * 5. Pack into Uint8Array
 *
 * **Determinism:**
 * - Same input always produces same output (critical for caching)
 * - Math.round() ensures consistent rounding across platforms
 * - No floating-point precision drift
 *
 * **Premultiplication:**
 * Applying alpha before quantization is critical for:
 * - Correct alpha blending in renderer (no color bleeding)
 * - Preserving color accuracy at low alpha values
 * - Matching standard premultiplied alpha compositing
 *
 * @param r - Red channel [0, 1] (clamped if out of range)
 * @param g - Green channel [0, 1] (clamped if out of range)
 * @param b - Blue channel [0, 1] (clamped if out of range)
 * @param a - Alpha channel [0, 1] (clamped if out of range)
 * @returns Uint8Array of length 4 with premultiplied RGBA bytes
 *
 * @example
 * ```typescript
 * // Opaque white
 * quantizeColorRGBA(1, 1, 1, 1) // => [255, 255, 255, 255]
 *
 * // Half-transparent red
 * quantizeColorRGBA(1, 0, 0, 0.5) // => [128, 0, 0, 128]
 *
 * // Fully transparent (color irrelevant)
 * quantizeColorRGBA(1, 1, 1, 0) // => [0, 0, 0, 0]
 *
 * // HDR value clamped
 * quantizeColorRGBA(2.5, 1, 1, 1) // => [255, 255, 255, 255]
 * ```
 */
export function quantizeColorRGBA(
  r: number,
  g: number,
  b: number,
  a: number
): Uint8Array {
  // Clamp inputs to [0, 1] to handle HDR/out-of-range values
  const rc = clamp01(r);
  const gc = clamp01(g);
  const bc = clamp01(b);
  const ac = clamp01(a);

  // Premultiply RGB by alpha (critical for correct blending)
  const rPremul = rc * ac;
  const gPremul = gc * ac;
  const bPremul = bc * ac;

  // Scale to [0, 255] and round to nearest integer
  // Math.round() is critical for determinism (not floor/ceil)
  const r255 = Math.round(rPremul * 255);
  const g255 = Math.round(gPremul * 255);
  const b255 = Math.round(bPremul * 255);
  const a255 = Math.round(ac * 255);

  // Pack into RGBA byte array
  const result = new Uint8Array(4);
  result[0] = r255;
  result[1] = g255;
  result[2] = b255;
  result[3] = a255;

  return result;
}

/**
 * Clamp a value to [0, 1] range.
 * @internal
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Batch quantize an array of colors.
 *
 * More efficient than calling quantizeColorRGBA() repeatedly for large arrays.
 *
 * @param colors - Flat array of RGBA values [r0, g0, b0, a0, r1, g1, b1, a1, ...]
 * @returns Uint8Array with premultiplied quantized colors (4 bytes per color)
 *
 * @example
 * ```typescript
 * const floatColors = [1, 0, 0, 1, 0, 1, 0, 1]; // red, green
 * const u8Colors = quantizeColorRGBABatch(floatColors);
 * // => [255, 0, 0, 255, 0, 255, 0, 255]
 * ```
 */
export function quantizeColorRGBABatch(colors: readonly number[]): Uint8Array {
  const numColors = colors.length / 4;
  if (colors.length % 4 !== 0) {
    throw new Error(
      `quantizeColorRGBABatch: colors array length must be multiple of 4, got ${colors.length}`
    );
  }

  const result = new Uint8Array(colors.length);

  for (let i = 0; i < numColors; i++) {
    const offset = i * 4;
    const r = colors[offset];
    const g = colors[offset + 1];
    const b = colors[offset + 2];
    const a = colors[offset + 3];

    // Clamp and premultiply
    const rc = clamp01(r);
    const gc = clamp01(g);
    const bc = clamp01(b);
    const ac = clamp01(a);

    const rPremul = rc * ac;
    const gPremul = gc * ac;
    const bPremul = bc * ac;

    // Quantize and pack
    result[offset] = Math.round(rPremul * 255);
    result[offset + 1] = Math.round(gPremul * 255);
    result[offset + 2] = Math.round(bPremul * 255);
    result[offset + 3] = Math.round(ac * 255);
  }

  return result;
}

/**
 * Convert quantized u8x4 color back to float RGBA (for debugging/export).
 *
 * Note: This is NOT a perfect inverse due to quantization loss.
 * Use only for visualization/debugging, not for color math.
 *
 * @param u8Color - Uint8Array of length 4 (premultiplied RGBA)
 * @returns Object with r, g, b, a in [0, 1] (premultiplied)
 */
export function dequantizeColorRGBA(u8Color: Uint8Array): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (u8Color.length !== 4) {
    throw new Error(`dequantizeColorRGBA: expected Uint8Array of length 4, got ${u8Color.length}`);
  }

  return {
    r: u8Color[0] / 255,
    g: u8Color[1] / 255,
    b: u8Color[2] / 255,
    a: u8Color[3] / 255,
  };
}

/**
 * Unpremultiply a quantized color (for export/display in non-premul contexts).
 *
 * @param u8Color - Uint8Array of length 4 (premultiplied RGBA)
 * @returns Object with r, g, b, a in [0, 1] (straight alpha)
 */
export function unpremultiplyColor(u8Color: Uint8Array): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (u8Color.length !== 4) {
    throw new Error(`unpremultiplyColor: expected Uint8Array of length 4, got ${u8Color.length}`);
  }

  const a = u8Color[3] / 255;

  // Avoid division by zero for fully transparent colors
  if (a === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: u8Color[0] / 255 / a,
    g: u8Color[1] / 255 / a,
    b: u8Color[2] / 255 / a,
    a,
  };
}
