/**
 * Type declarations for gifenc library
 *
 * gifenc is a fast and lightweight GIF encoder for JavaScript.
 * See: https://github.com/mattdesl/gifenc
 */

declare module 'gifenc' {
  /**
   * RGB color palette entry (3 bytes: R, G, B)
   */
  export type RGBColor = [number, number, number];

  /**
   * RGBA color palette entry (4 bytes: R, G, B, A)
   */
  export type RGBAColor = [number, number, number, number];

  /**
   * Color palette (array of RGB or RGBA colors)
   */
  export type Palette = RGBColor[] | RGBAColor[];

  /**
   * Pixel format for quantization
   */
  export type PixelFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  /**
   * Options for quantize function
   */
  export interface QuantizeOptions {
    /** Pixel format (default: 'rgb565') */
    format?: PixelFormat;
    /** Enable 1-bit alpha threshold */
    oneBitAlpha?: boolean | number;
    /** Clear RGB values for transparent pixels */
    clearAlpha?: boolean;
    /** Alpha threshold for clearing RGB values */
    clearAlphaThreshold?: number;
    /** Color to use when clearing RGB values */
    clearAlphaColor?: number;
  }

  /**
   * Options for writeFrame method
   */
  export interface WriteFrameOptions {
    /** Color palette for this frame */
    palette?: Palette;
    /** Frame delay in centiseconds (1/100s) */
    delay?: number;
    /** Transparent color index */
    transparent?: number;
    /** Disposal method (0-3) */
    disposal?: number;
  }

  /**
   * GIF Encoder interface
   */
  export interface GIFEncoderInstance {
    /**
     * Write a frame to the GIF
     * @param index - Indexed bitmap (Uint8Array with palette indices)
     * @param width - Frame width in pixels
     * @param height - Frame height in pixels
     * @param options - Frame options (palette, delay, etc.)
     */
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions
    ): void;

    /**
     * Finish encoding and finalize the GIF
     */
    finish(): void;

    /**
     * Get the encoded GIF bytes
     * @returns Uint8Array containing the GIF file data
     */
    bytes(): Uint8Array;
  }

  /**
   * Create a new GIF encoder instance
   * @returns GIF encoder instance
   */
  export function GIFEncoder(): GIFEncoderInstance;

  /**
   * Quantize RGBA image data to a color palette
   * @param rgba - Flat RGBA pixel data (Uint8Array or Uint8ClampedArray)
   * @param maxColors - Maximum number of colors in palette (2-256)
   * @param options - Quantization options
   * @returns Color palette (array of RGB or RGBA colors)
   */
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions
  ): Palette;

  /**
   * Apply palette to RGBA image data
   * @param rgba - Flat RGBA pixel data (Uint8Array or Uint8ClampedArray)
   * @param palette - Color palette (array of RGB or RGBA colors)
   * @param format - Pixel format (default: 'rgb565')
   * @returns Indexed bitmap (Uint8Array with palette indices)
   */
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: PixelFormat
  ): Uint8Array;
}
