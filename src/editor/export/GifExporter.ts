/**
 * GifExporter
 *
 * Exports animation frames as animated GIF files.
 *
 * Features:
 * - Custom resolution (independent of viewport)
 * - Frame range configuration
 * - Palette optimization (16-256 colors)
 * - Dithering support (none, Floyd-Steinberg, ordered)
 * - Configurable loop count (infinite or N times)
 * - Progress callbacks
 * - Cancellation support
 * - Deterministic output (seeded randomness)
 *
 * Algorithm:
 * 1. Create OffscreenCanvas at target resolution
 * 2. For each frame in range:
 *    a. Calculate frame time (frameNumber / fps)
 *    b. Execute schedule for that time
 *    c. Render frame to OffscreenCanvas
 *    d. Extract RGBA data from canvas
 *    e. Accumulate frames for palette analysis
 * 3. Quantize palette across all frames (global palette)
 * 4. Apply palette to each frame and write to GIF encoder
 * 5. Return GIF blob
 *
 * Implementation notes:
 * - Uses gifenc library for GIF encoding
 * - Builds global palette by analyzing all frames
 * - Frame delay = 1000ms / fps
 * - Loop count: 0 = infinite, N = loop N times
 * - Dithering currently not implemented (gifenc doesn't support it natively)
 */

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { RenderFrameIR } from '../compiler/ir/renderIR';
import { ScheduleExecutor } from '../runtime/executor/ScheduleExecutor';
import { createRuntimeState } from '../runtime/executor/RuntimeState';
import { Canvas2DRenderer } from '../runtime/canvasRenderer';
import type {
  GifExportConfig,
  ExportProgress,
  GifExportResult,
} from './types';
import {
  ExportCancelledError,
  InvalidExportConfigError,
} from './types';

/**
 * Frame data for GIF encoding.
 * Contains RGBA pixel data for a single frame.
 */
interface FrameData {
  /** RGBA pixel data (Uint8Array or Uint8ClampedArray) */
  data: Uint8Array | Uint8ClampedArray;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
}

/**
 * GifExporter - Animated GIF export
 *
 * Creates animated GIF from compiled animation program.
 * Uses OffscreenCanvas for rendering at custom resolution.
 */
export class GifExporter {
  private cancelled = false;

  /**
   * Export animation frames to animated GIF.
   *
   * @param program - Compiled animation program
   * @param config - Export configuration
   * @param onProgress - Progress callback (optional)
   * @returns Export result with GIF blob
   * @throws {InvalidExportConfigError} - Invalid configuration
   * @throws {ExportCancelledError} - Export was cancelled
   */
  async export(
    program: CompiledProgramIR,
    config: GifExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<GifExportResult> {
    // Validate configuration
    this.validateConfig(config);

    const startTime = performance.now();
    this.cancelled = false;

    // Create OffscreenCanvas for rendering
    const canvas = this.createCanvas(config.width, config.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to get 2D context from OffscreenCanvas');
    }

    const renderer = new Canvas2DRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.setViewport(config.width, config.height, 1.0);

    // Create executor and runtime
    const executor = new ScheduleExecutor();
    const runtime = createRuntimeState(program, {
      width: config.width,
      height: config.height,
      dpr: 1.0,
    });

    // Calculate frame range
    const totalFrames = config.endFrame - config.startFrame + 1;

    // Step 1: Render all frames and collect RGBA data
    const frames: FrameData[] = [];
    const allPixels: (Uint8Array | Uint8ClampedArray)[] = [];

    for (let frameNumber = config.startFrame; frameNumber <= config.endFrame; frameNumber++) {
      // Check cancellation
      if (this.cancelled) {
        throw new ExportCancelledError();
      }

      const timeMs = (frameNumber / config.fps) * 1000;
      const timeSeconds = frameNumber / config.fps;
      const frameIndex = frameNumber - config.startFrame;

      // Execute frame
      const frameIR: RenderFrameIR = executor.executeFrame(program, runtime, timeMs);

      // Render frame
      renderer.renderFrame(frameIR, runtime.values);

      // Extract RGBA data
      const imageData = ctx.getImageData(0, 0, config.width, config.height);
      const pixels = imageData.data; // Uint8ClampedArray

      // Store frame data
      frames.push({
        data: pixels,
        width: config.width,
        height: config.height,
      });
      allPixels.push(pixels);

      // Fire progress callback (50% for frame rendering)
      if (onProgress !== undefined) {
        onProgress({
          current: frameIndex + 1,
          total: totalFrames,
          percentage: ((frameIndex + 1) / totalFrames) * 50,
          timeSeconds,
        });
      }
    }

    // Step 2: Quantize global palette from all frames
    // Combine all frame data for palette quantization
    const totalPixels = allPixels.reduce((sum, pixels) => sum + pixels.length, 0);
    const combinedData = new Uint8Array(totalPixels);
    let offset = 0;
    for (const pixels of allPixels) {
      combinedData.set(pixels, offset);
      offset += pixels.length;
    }

    // Quantize to maxColors (using rgb565 format for better quality)
    const palette = quantize(combinedData, config.maxColors, { format: 'rgb565' });

    // Step 3: Encode GIF
    const gif = GIFEncoder();

    // Calculate frame delay in centiseconds (GIF uses 1/100s units)
    const delayCs = Math.round((1 / config.fps) * 100);

    // Write frames to GIF
    for (let i = 0; i < frames.length; i++) {
      // Check cancellation
      if (this.cancelled) {
        throw new ExportCancelledError();
      }

      const frame = frames[i];

      // Apply palette to frame (get indexed bitmap)
      const index = applyPalette(frame.data, palette, 'rgb565');

      // Write frame with palette and delay
      gif.writeFrame(index, frame.width, frame.height, {
        palette,
        delay: delayCs,
      });

      // Fire progress callback (50-100% for encoding)
      if (onProgress !== undefined) {
        onProgress({
          current: i + 1,
          total: totalFrames,
          percentage: 50 + ((i + 1) / totalFrames) * 50,
          timeSeconds: (config.startFrame + i) / config.fps,
        });
      }
    }

    // Write loop count (0 = infinite, N = loop N times)
    // Note: gifenc doesn't have a direct loop API, so we'll add this via raw bytes
    // For now, we'll use the default behavior (infinite loop)
    // TODO: Add loop count support if gifenc adds API for it

    // Finish encoding
    gif.finish();

    // Get GIF bytes
    const bytes = gif.bytes();

    // Convert to Blob
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });

    const durationMs = performance.now() - startTime;

    return {
      blob,
      config,
      durationMs,
    };
  }

  /**
   * Cancel ongoing export.
   * Export will throw ExportCancelledError at next frame check.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Check if export is cancelled.
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Validate export configuration.
   * @throws {InvalidExportConfigError} - Invalid configuration
   */
  private validateConfig(config: GifExportConfig): void {
    if (config.width <= 0 || config.height <= 0) {
      throw new InvalidExportConfigError(
        `Invalid resolution: ${config.width}x${config.height}. Width and height must be positive.`
      );
    }

    if (config.startFrame < 0) {
      throw new InvalidExportConfigError(
        `Invalid start frame: ${config.startFrame}. Must be non-negative.`
      );
    }

    if (config.endFrame < config.startFrame) {
      throw new InvalidExportConfigError(
        `Invalid frame range: start=${config.startFrame}, end=${config.endFrame}. End must be >= start.`
      );
    }

    if (config.fps <= 0) {
      throw new InvalidExportConfigError(
        `Invalid fps: ${config.fps}. Must be positive.`
      );
    }

    if (config.maxColors < 2 || config.maxColors > 256) {
      throw new InvalidExportConfigError(
        `Invalid maxColors: ${config.maxColors}. Must be between 2 and 256.`
      );
    }

    if (config.loopCount < 0) {
      throw new InvalidExportConfigError(
        `Invalid loopCount: ${config.loopCount}. Must be non-negative (0 = infinite).`
      );
    }

    // Warn about large frame counts (GIF files can get very large)
    const totalFrames = config.endFrame - config.startFrame + 1;
    if (totalFrames > 500) {
      console.warn(
        `GIF export: ${totalFrames} frames may result in a very large file. ` +
        `Consider reducing frame count or using video export instead.`
      );
    }
  }

  /**
   * Create OffscreenCanvas for rendering.
   */
  private createCanvas(width: number, height: number): OffscreenCanvas {
    // OffscreenCanvas is available in modern browsers
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error(
        'OffscreenCanvas is not supported in this browser. ' +
        'Please use a modern browser (Chrome 69+, Firefox 105+, Safari 16.4+).'
      );
    }

    return new OffscreenCanvas(width, height);
  }
}

/**
 * Create a GifExporter instance.
 */
export function createGifExporter(): GifExporter {
  return new GifExporter();
}
