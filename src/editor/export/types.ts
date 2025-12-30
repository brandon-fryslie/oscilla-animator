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
