/**
 * VideoExporter
 *
 * Exports animation frames as video files using WebCodecs API.
 *
 * Features:
 * - H.264 and VP9 codec support
 * - Configurable bitrate and quality
 * - Progress callbacks
 * - Cancellation support
 * - Browser support detection with graceful fallback
 *
 * Algorithm:
 * 1. Detect WebCodecs support
 * 2. Configure VideoEncoder with codec, resolution, bitrate
 * 3. Create VideoMuxer for MP4/WebM output
 * 4. For each frame:
 *    a. Render frame to OffscreenCanvas
 *    b. Create VideoFrame from canvas
 *    c. Encode VideoFrame
 *    d. Receive EncodedVideoChunk in output callback
 *    e. Add chunk to muxer
 * 5. Flush encoder and finalize muxer
 * 6. Return video blob
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { RenderFrameIR } from '../compiler/ir/renderIR';
import { ScheduleExecutor } from '../runtime/executor/ScheduleExecutor';
import { createRuntimeState } from '../runtime/executor/RuntimeState';
import { Canvas2DRenderer } from '../runtime/canvasRenderer';
import type {
  VideoExportConfig,
  ExportProgress,
  VideoExportResult,
} from './types';
import {
  ExportCancelledError,
  InvalidExportConfigError,
  UnsupportedFeatureError,
} from './types';
import {
  isWebCodecsSupported,
  createEncoderConfig,
  validateEncoderConfig,
} from './codecs';
import { createVideoMuxer, type VideoMuxer } from './muxer';

/**
 * VideoExporter - Frame-by-frame video export using WebCodecs.
 *
 * Encodes animation frames to H.264 or VP9 and muxes into MP4/WebM container.
 */
export class VideoExporter {
  private cancelled = false;

  /**
   * Export animation frames to video blob.
   *
   * @param program - Compiled animation program
   * @param config - Export configuration
   * @param onProgress - Progress callback (optional)
   * @returns Export result with video blob
   * @throws {UnsupportedFeatureError} - WebCodecs not supported
   * @throws {InvalidExportConfigError} - Invalid configuration
   * @throws {ExportCancelledError} - Export was cancelled
   */
  async export(
    program: CompiledProgramIR,
    config: VideoExportConfig,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<VideoExportResult> {
    // Check WebCodecs support
    if (!isWebCodecsSupported()) {
      throw new UnsupportedFeatureError(
        'WebCodecs',
        'WebCodecs API is not supported in this browser. ' +
        'Video export requires Chrome 94+, Edge 94+, or Safari 16.4+. ' +
        'Consider using image sequence export instead.'
      );
    }

    // Validate configuration
    this.validateConfig(config);

    const startTime = performance.now();
    this.cancelled = false;

    // Create encoder configuration
    const encoderConfig = createEncoderConfig(
      config.codec,
      config.width,
      config.height,
      config.fps,
      config.bitrate
    );

    // Validate encoder config with browser
    await validateEncoderConfig(encoderConfig);

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

    // Create muxer
    const muxer = createVideoMuxer({
      codec: config.codec,
      width: config.width,
      height: config.height,
      fps: config.fps,
    });

    // Calculate frame range
    const totalFrames = config.endFrame - config.startFrame + 1;
    let _encodedFrames = 0;

    // Create encoder with output callback
    const encoder = await this.createEncoder(encoderConfig, muxer, () => {
      _encodedFrames++;
    });

    try {
      // Export frames
      for (let frameNumber = config.startFrame; frameNumber <= config.endFrame; frameNumber++) {
        // Check cancellation
        if (this.cancelled) {
          throw new ExportCancelledError();
        }

        const frameIndex = frameNumber - config.startFrame;
        const timeMs = (frameNumber / config.fps) * 1000;
        const timeSeconds = frameNumber / config.fps;

        // Calculate timestamp in microseconds for VideoFrame
        const timestampUs = (frameNumber / config.fps) * 1_000_000;

        // Execute frame
        const frameIR: RenderFrameIR = executor.executeFrame(program, runtime, timeMs);

        // Render frame
        renderer.renderFrame(frameIR, runtime.values);

        // Create VideoFrame from canvas
        const videoFrame = new VideoFrame(canvas, {
          timestamp: timestampUs,
          // Duration in microseconds (one frame duration)
          duration: (1 / config.fps) * 1_000_000,
        });

        // Encode frame
        // Key frame every 60 frames (2 seconds at 30fps)
        const isKeyFrame = frameNumber % 60 === 0;
        encoder.encode(videoFrame, { keyFrame: isKeyFrame });

        // Clean up VideoFrame
        videoFrame.close();

        // Fire progress callback
        if (onProgress !== undefined) {
          onProgress({
            current: frameIndex + 1,
            total: totalFrames,
            percentage: ((frameIndex + 1) / totalFrames) * 100,
            timeSeconds,
          });
        }
      }

      // Flush encoder (wait for all frames to be encoded)
      await encoder.flush();

      // Close encoder
      encoder.close();

      // Finalize muxer and get video blob
      const blob = await muxer.finalize();

      const durationMs = performance.now() - startTime;

      return {
        blob,
        config,
        durationMs,
        format: muxer.getFormat(),
      };
    } catch (error) {
      // Clean up encoder on error
      try {
        encoder.close();
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
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
  private validateConfig(config: VideoExportConfig): void {
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

    if (config.bitrate <= 0) {
      throw new InvalidExportConfigError(
        `Invalid bitrate: ${config.bitrate}. Must be positive.`
      );
    }
  }

  /**
   * Create OffscreenCanvas for rendering.
   */
  private createCanvas(width: number, height: number): OffscreenCanvas {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new UnsupportedFeatureError(
        'OffscreenCanvas',
        'OffscreenCanvas is not supported in this browser.'
      );
    }

    return new OffscreenCanvas(width, height);
  }

  /**
   * Create VideoEncoder with output callback.
   *
   * @param config - Encoder configuration
   * @param muxer - Video muxer to receive encoded chunks
   * @param onChunk - Callback fired when chunk is encoded
   * @returns Configured VideoEncoder
   */
  private async createEncoder(
    config: VideoEncoderConfig,
    muxer: VideoMuxer,
    onChunk: () => void
  ): Promise<VideoEncoder> {
    return new Promise((resolve, reject) => {
      const encoder = new VideoEncoder({
        output: (chunk) => {
          // Add encoded chunk to muxer (async, but we don't await here)
          // Mediabunny handles backpressure internally
          muxer.addChunk(chunk, chunk.timestamp).catch(error => {
            // If muxing fails, we'll catch it during finalize
            console.error('Muxer error during addChunk:', error);
          });
          onChunk();
        },
        error: (error) => {
          reject(new Error(`Video encoding error: ${error.message}`));
        },
      });

      try {
        encoder.configure(config);
        resolve(encoder);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

/**
 * Create a VideoExporter instance.
 */
export function createVideoExporter(): VideoExporter {
  return new VideoExporter();
}
