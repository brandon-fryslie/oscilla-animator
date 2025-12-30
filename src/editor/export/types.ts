/**
 * Export Types
 *
 * Type definitions for image sequence and video export functionality.
 */

/**
 * Supported image export formats.
 */
export type ImageFormat = 'png' | 'webp' | 'jpeg';

/**
 * Supported video codecs.
 */
export type VideoCodec = 'h264' | 'vp9';

/**
 * Supported video container formats.
 */
export type VideoFormat = 'mp4' | 'webm';

/**
 * Configuration for image sequence export.
 */
export interface ImageSequenceExportConfig {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Start frame (inclusive) */
  startFrame: number;
  /** End frame (inclusive) */
  endFrame: number;
  /** Frame step (1 = every frame, 2 = every other frame, etc.) */
  frameStep: number;
  /** Frames per second (for time calculation) */
  fps: number;
  /** Output format */
  format: ImageFormat;
  /** Quality (0-100) for JPEG/WebP, ignored for PNG */
  quality?: number;
  /** Seed for deterministic randomness */
  seed?: number;
}

/**
 * Configuration for video export.
 */
export interface VideoExportConfig {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Start frame (inclusive) */
  startFrame: number;
  /** End frame (inclusive) */
  endFrame: number;
  /** Frames per second */
  fps: number;
  /** Video codec */
  codec: VideoCodec;
  /** Bitrate in bits per second (e.g., 5000000 = 5 Mbps) */
  bitrate: number;
  /** Seed for deterministic randomness */
  seed?: number;
}

/**
 * Progress callback for export operations.
 */
export interface ExportProgress {
  /** Current frame being processed */
  current: number;
  /** Total frames to process */
  total: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current frame time in seconds */
  timeSeconds: number;
}

/**
 * Export result containing generated blobs.
 */
export interface ExportResult {
  /** Array of exported image blobs */
  blobs: Blob[];
  /** Export configuration used */
  config: ImageSequenceExportConfig;
  /** Total export time in milliseconds */
  durationMs: number;
}

/**
 * Video export result containing a single video blob.
 */
export interface VideoExportResult {
  /** Exported video blob */
  blob: Blob;
  /** Export configuration used */
  config: VideoExportConfig;
  /** Total export time in milliseconds */
  durationMs: number;
  /** Video container format */
  format: VideoFormat;
}

/**
 * Export error types.
 */
export class ExportError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}

/**
 * Error thrown when export is cancelled.
 */
export class ExportCancelledError extends ExportError {
  constructor() {
    super('Export was cancelled', 'EXPORT_CANCELLED');
  }
}

/**
 * Error thrown when export configuration is invalid.
 */
export class InvalidExportConfigError extends ExportError {
  constructor(message: string) {
    super(message, 'INVALID_CONFIG');
  }
}

/**
 * Error thrown when browser doesn't support required features.
 */
export class UnsupportedFeatureError extends ExportError {
  constructor(feature: string, message?: string) {
    super(
      message ?? `${feature} is not supported in this browser`,
      'UNSUPPORTED_FEATURE'
    );
  }
}
