/**
 * ImageSequenceExporter
 *
 * Exports animation frames as PNG/WebP/JPEG image sequences.
 *
 * Features:
 * - Custom resolution (independent of viewport)
 * - Frame range and step configuration
 * - Multiple format support (PNG/WebP/JPEG)
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
 *    d. Convert to Blob
 *    e. Fire progress callback
 *    f. Check cancellation
 * 3. Return array of Blobs
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { RenderFrameIR } from '../compiler/ir/renderIR';
import { ScheduleExecutor } from '../runtime/executor/ScheduleExecutor';
import { createRuntimeState } from '../runtime/executor/RuntimeState';
import { Canvas2DRenderer } from '../runtime/canvasRenderer';
import type {
  ImageSequenceExportConfig,
  ExportProgress,
  ExportResult,
  ImageFormat,
} from './types';
import {
  ExportCancelledError,
  InvalidExportConfigError,
} from './types';

/**
 * ImageSequenceExporter - Frame-by-frame image export
 *
 * Creates image sequence from compiled animation program.
 * Uses OffscreenCanvas for rendering at custom resolution.
 */
export class ImageSequenceExporter {
  private cancelled = false;

  /**
   * Export animation frames to image blobs.
   *
   * @param program - Compiled animation program
   * @param config - Export configuration
   * @param onProgress - Progress callback (optional)
   * @returns Export result with blobs
   * @throws {InvalidExportConfigError} - Invalid configuration
   * @throws {ExportCancelledError} - Export was cancelled
   */
  async export(
    program: CompiledProgramIR,
    config: ImageSequenceExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    // Validate configuration
    this.validateConfig(config);

    const startTime = performance.now();
    this.cancelled = false;

    // Create OffscreenCanvas for rendering
    const canvas = this.createCanvas(config.width, config.height);
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
    const frames = this.calculateFrameRange(config);
    const totalFrames = frames.length;

    // Export frames
    const blobs: Blob[] = [];

    for (let i = 0; i < totalFrames; i++) {
      // Check cancellation
      if (this.cancelled) {
        throw new ExportCancelledError();
      }

      const frameNumber = frames[i];
      const timeMs = (frameNumber / config.fps) * 1000;
      const timeSeconds = frameNumber / config.fps;

      // Execute frame
      const frameIR: RenderFrameIR = executor.executeFrame(program, runtime, timeMs);

      // Render frame
      renderer.renderFrame(frameIR, runtime.values);

      // Convert to blob
      const blob = await this.convertToBlob(canvas, config.format, config.quality);
      blobs.push(blob);

      // Fire progress callback
      if (onProgress !== undefined) {
        onProgress({
          current: i + 1,
          total: totalFrames,
          percentage: ((i + 1) / totalFrames) * 100,
          timeSeconds,
        });
      }
    }

    const durationMs = performance.now() - startTime;

    return {
      blobs,
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
  private validateConfig(config: ImageSequenceExportConfig): void {
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

    if (config.frameStep <= 0) {
      throw new InvalidExportConfigError(
        `Invalid frame step: ${config.frameStep}. Must be positive.`
      );
    }

    if (config.fps <= 0) {
      throw new InvalidExportConfigError(
        `Invalid fps: ${config.fps}. Must be positive.`
      );
    }

    if (config.quality !== undefined && (config.quality < 0 || config.quality > 100)) {
      throw new InvalidExportConfigError(
        `Invalid quality: ${config.quality}. Must be between 0 and 100.`
      );
    }
  }

  /**
   * Calculate frame numbers to export based on config.
   */
  private calculateFrameRange(config: ImageSequenceExportConfig): number[] {
    const frames: number[] = [];
    for (let frame = config.startFrame; frame <= config.endFrame; frame += config.frameStep) {
      frames.push(frame);
    }
    return frames;
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

  /**
   * Convert canvas to Blob with specified format and quality.
   */
  private async convertToBlob(
    canvas: OffscreenCanvas,
    format: ImageFormat,
    quality?: number
  ): Promise<Blob> {
    const mimeType = this.formatToMimeType(format);
    const qualityParam = quality !== undefined ? quality / 100 : undefined;

    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: qualityParam,
    });

    if (blob === null) {
      throw new Error(`Failed to convert canvas to ${format} blob`);
    }

    return blob;
  }

  /**
   * Convert ImageFormat to MIME type.
   */
  private formatToMimeType(format: ImageFormat): string {
    switch (format) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'jpeg':
        return 'image/jpeg';
      default: {
        const _exhaustive: never = format;
        throw new Error(`Unknown image format: ${String(_exhaustive)}`);
      }
    }
  }
}

/**
 * Create an ImageSequenceExporter instance.
 */
export function createImageSequenceExporter(): ImageSequenceExporter {
  return new ImageSequenceExporter();
}
