/**
 * Video Codec Utilities
 *
 * Browser support detection and codec configuration for WebCodecs API.
 */

import type { VideoCodec, VideoFormat } from './types';
import { UnsupportedFeatureError } from './types';

/**
 * Codec configuration strings for WebCodecs.
 * These strings must match the format expected by VideoEncoder.
 *
 * Reference:
 * - H.264: "avc1.42001f" = Baseline profile, level 3.1
 * - VP9: "vp09.00.10.08" = Profile 0, level 1.0, 8-bit
 */
export const CODEC_STRINGS: Record<VideoCodec, string> = {
  h264: 'avc1.42001f', // H.264 Baseline Profile, Level 3.1
  vp9: 'vp09.00.10.08', // VP9 Profile 0, Level 1.0, 8-bit
};

/**
 * Map video codec to container format.
 */
export const CODEC_TO_FORMAT: Record<VideoCodec, VideoFormat> = {
  h264: 'mp4',
  vp9: 'webm',
};

/**
 * Map video format to MIME type.
 */
export const FORMAT_TO_MIME: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Check if WebCodecs API is available in the current browser.
 */
export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Check if a specific codec is supported by the browser.
 *
 * @param codec - Codec to check
 * @returns True if codec is supported
 */
export async function isCodecSupported(codec: VideoCodec): Promise<boolean> {
  if (!isWebCodecsSupported()) {
    return false;
  }

  const codecString = CODEC_STRINGS[codec];
  const config: VideoEncoderConfig = {
    codec: codecString,
    width: 1920,
    height: 1080,
    bitrate: 5_000_000,
    framerate: 60,
  };

  try {
    const support = await VideoEncoder.isConfigSupported(config);
    return support.supported === true;
  } catch {
    return false;
  }
}

/**
 * Get all supported codecs in the current browser.
 *
 * @returns Array of supported codecs (ordered by preference: h264, vp9)
 */
export async function getSupportedCodecs(): Promise<VideoCodec[]> {
  const codecs: VideoCodec[] = ['h264', 'vp9'];
  const supported: VideoCodec[] = [];

  for (const codec of codecs) {
    if (await isCodecSupported(codec)) {
      supported.push(codec);
    }
  }

  return supported;
}

/**
 * Create VideoEncoder configuration for given parameters.
 *
 * @param codec - Video codec
 * @param width - Video width in pixels
 * @param height - Video height in pixels
 * @param fps - Frames per second
 * @param bitrate - Bitrate in bits per second
 * @returns VideoEncoder configuration
 */
export function createEncoderConfig(
  codec: VideoCodec,
  width: number,
  height: number,
  fps: number,
  bitrate: number
): VideoEncoderConfig {
  return {
    codec: CODEC_STRINGS[codec],
    width,
    height,
    bitrate,
    framerate: fps,
    // Use hardware acceleration if available
    hardwareAcceleration: 'prefer-hardware',
    // Encoding latency mode - quality prioritized over speed for export
    latencyMode: 'quality',
  };
}

/**
 * Validate encoder configuration and throw if unsupported.
 *
 * @param config - Encoder configuration to validate
 * @throws {UnsupportedFeatureError} - If config is not supported
 */
export async function validateEncoderConfig(
  config: VideoEncoderConfig
): Promise<void> {
  if (!isWebCodecsSupported()) {
    throw new UnsupportedFeatureError(
      'WebCodecs',
      'WebCodecs API is not supported in this browser. ' +
      'Video export requires Chrome 94+, Edge 94+, or Safari 16.4+.'
    );
  }

  const support = await VideoEncoder.isConfigSupported(config);

  if (!support.supported) {
    throw new UnsupportedFeatureError(
      'Video codec',
      `Video encoder configuration is not supported by this browser. ` +
      `Codec: ${config.codec}, Resolution: ${config.width}x${config.height}, ` +
      `Bitrate: ${config.bitrate}bps, FPS: ${config.framerate}`
    );
  }
}

/**
 * Calculate recommended bitrate for given resolution.
 * Based on common encoding guidelines:
 * - 720p (1280x720): 2.5-5 Mbps
 * - 1080p (1920x1080): 5-8 Mbps
 * - 4K (3840x2160): 20-50 Mbps
 *
 * @param width - Video width in pixels
 * @param height - Video height in pixels
 * @returns Recommended bitrate in bits per second
 */
export function getRecommendedBitrate(width: number, height: number): number {
  const pixels = width * height;

  // Bitrate scales roughly with pixel count
  // Base: 1920x1080 (2,073,600 pixels) = 5 Mbps (5,000,000 bps)
  const baseBitrate = 5_000_000;
  const basePixels = 1920 * 1080;
  const scaleFactor = pixels / basePixels;

  // Apply non-linear scaling (sqrt) to avoid excessive bitrates at high resolutions
  const recommendedBitrate = baseBitrate * Math.sqrt(scaleFactor);

  // Clamp to reasonable range (1 Mbps - 50 Mbps)
  return Math.max(1_000_000, Math.min(50_000_000, Math.round(recommendedBitrate)));
}
