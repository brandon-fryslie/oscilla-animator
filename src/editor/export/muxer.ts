/**
 * Video Muxer Abstraction
 *
 * Wraps Mediabunny library for MP4/WebM muxing.
 * Receives EncodedVideoChunk from VideoEncoder and produces final video file.
 */

import {
  Output,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedPacket,
  Mp4OutputFormat,
  WebMOutputFormat,
} from 'mediabunny';
import type { VideoCodec, VideoFormat } from './types';
import { CODEC_TO_FORMAT, FORMAT_TO_MIME } from './codecs';

/**
 * Configuration for video muxer.
 */
export interface MuxerConfig {
  /** Video codec */
  codec: VideoCodec;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Frames per second */
  fps: number;
}

/**
 * VideoMuxer - Wraps Mediabunny for video muxing.
 *
 * Receives encoded video chunks and produces a complete MP4 or WebM file.
 */
export class VideoMuxer {
  private output: Output;
  private videoSource: EncodedVideoPacketSource;
  private target: BufferTarget;
  private readonly format: VideoFormat;
  private started = false;
  private frameCount = 0;

  constructor(config: MuxerConfig) {
    this.format = CODEC_TO_FORMAT[config.codec];
    this.target = new BufferTarget();

    // Map our codec names to Mediabunny's VideoCodec type
    // h264 -> 'avc' (not 'avc1')
    const mediabunnyCodec = config.codec === 'h264' ? ('avc' as const) : ('vp9' as const);

    // Create video source for encoded packets
    this.videoSource = new EncodedVideoPacketSource(mediabunnyCodec);

    // Create output format instance
    const outputFormat = this.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat();

    // Create output with appropriate format
    this.output = new Output({
      target: this.target,
      format: outputFormat,
    });

    // Add video track
    this.output.addVideoTrack(this.videoSource, {
      rotation: 0,
      frameRate: config.fps, // Note: capital R in frameRate
    });
  }

  /**
   * Start the muxer. Must be called before adding chunks.
   */
  async start(): Promise<void> {
    if (!this.started) {
      await this.output.start();
      this.started = true;
    }
  }

  /**
   * Add encoded video chunk to muxer.
   *
   * @param chunk - Encoded video chunk from VideoEncoder
   * @param timestamp - Timestamp in microseconds
   */
  async addChunk(chunk: EncodedVideoChunk, timestamp: number): Promise<void> {
    // Ensure output is started
    if (!this.started) {
      await this.start();
    }

    // Copy chunk data to Uint8Array
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    // Convert timestamp from microseconds to seconds
    const timestampSeconds = timestamp / 1_000_000;

    // Duration is required - calculate from fps if not provided
    const durationSeconds = chunk.duration !== undefined && chunk.duration !== null
      ? chunk.duration / 1_000_000
      : 1 / 60; // Default to 60fps frame duration if not available

    // Create EncodedPacket
    const packet = new EncodedPacket(
      data,
      chunk.type as 'key' | 'delta',
      timestampSeconds,
      durationSeconds
    );

    // Add packet to video source with metadata on first packet
    if (this.frameCount === 0) {
      // First chunk - include encoder metadata if available
      await this.videoSource.add(packet, {
        decoderConfig: {
          codec: chunk.type, // This will be overridden by Mediabunny
        } as EncodedVideoChunkMetadata['decoderConfig'],
      });
    } else {
      // Subsequent chunks - no metadata needed
      await this.videoSource.add(packet);
    }

    this.frameCount++;
  }

  /**
   * Finalize muxing and return video blob.
   *
   * @returns Video blob ready for download
   */
  async finalize(): Promise<Blob> {
    // Finalize output
    await this.output.finalize();

    // Get muxed data from buffer target
    const buffer = this.target.buffer;

    if (!buffer) {
      throw new Error('Muxer finalization failed: no buffer available');
    }

    // Create blob with appropriate MIME type
    const mimeType = FORMAT_TO_MIME[this.format];
    return new Blob([buffer], { type: mimeType });
  }

  /**
   * Get video format (MP4 or WebM).
   */
  getFormat(): VideoFormat {
    return this.format;
  }

  /**
   * Get number of frames added to muxer.
   */
  getFrameCount(): number {
    return this.frameCount;
  }
}

/**
 * Create a VideoMuxer instance.
 *
 * @param config - Muxer configuration
 * @returns VideoMuxer instance
 */
export function createVideoMuxer(config: MuxerConfig): VideoMuxer {
  return new VideoMuxer(config);
}
