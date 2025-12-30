/**
 * VideoExporter Tests
 *
 * Tests for video export with WebCodecs API integration.
 * Mocks VideoEncoder and VideoFrame APIs for unit testing.
 */

import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { VideoExporter } from '../VideoExporter';
import type { VideoExportConfig } from '../types';
import { InvalidExportConfigError, ExportCancelledError } from '../types';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { StepRenderAssemble } from '../../compiler/ir/schedule';

// Track the current program seed for mock determinism
let currentProgramSeed = 42;

// Mock OffscreenCanvas for Node.js testing
class MockOffscreenCanvas {
  width: number;
  height: number;
  private frameCounter = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(),
      fillStyle: '', globalAlpha: 1, globalCompositeOperation: 'source-over',
      transform: vi.fn(), fill: vi.fn(), stroke: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      strokeStyle: '', lineWidth: 1, strokeRect: vi.fn(),
    };
  }

  async convertToBlob(_options?: { type?: string }): Promise<Blob> {
    // Generate deterministic blob content based on seed and frame counter
    const content = `mock-seed${currentProgramSeed}-frame${this.frameCounter++}-${this.width}x${this.height}`;
    return new Blob([content], { type: _options?.type ?? 'image/png' });
  }
}

// Mock VideoFrame
class MockVideoFrame {
  timestamp: number;
  duration?: number;

  constructor(_canvas: MockOffscreenCanvas, options: { timestamp: number; duration: number }) {
    this.timestamp = options.timestamp;
    this.duration = options.duration;
  }

  close() {
    // Mock cleanup
  }
}

// Mock EncodedVideoChunk
class MockEncodedVideoChunk {
  type: 'key' | 'delta';
  timestamp: number;
  duration: number | null;
  byteLength: number;
  private data: Uint8Array;

  constructor(init: { type: 'key' | 'delta'; timestamp: number; duration: number | null; data: Uint8Array }) {
    this.type = init.type;
    this.timestamp = init.timestamp;
    this.duration = init.duration;
    this.data = init.data;
    this.byteLength = init.data.byteLength;
  }

  copyTo(destination: Uint8Array) {
    destination.set(this.data);
  }
}

// Mock VideoEncoder
class MockVideoEncoder {
  private config: VideoEncoderConfig | null = null;
  private outputCallback: ((chunk: MockEncodedVideoChunk) => void) | null = null;
  private encodeQueue: Array<{ frame: MockVideoFrame; options?: VideoEncoderEncodeOptions }> = [];
  private closed = false;
  private frameCount = 0;

  constructor(init: { output: (chunk: EncodedVideoChunk) => void; error: (error: Error) => void }) {
    this.outputCallback = init.output as (chunk: MockEncodedVideoChunk) => void;
    // Error callback stored but not used in successful tests
  }

  configure(config: VideoEncoderConfig) {
    if (this.closed) {
      throw new Error('Encoder is closed');
    }
    this.config = config;
  }

  encode(frame: MockVideoFrame, options?: VideoEncoderEncodeOptions) {
    if (this.closed) {
      throw new Error('Encoder is closed');
    }
    if (!this.config) {
      throw new Error('Encoder not configured');
    }

    // Queue the frame for async processing
    this.encodeQueue.push({ frame, options });

    // Simulate async encoding (processed during flush)
    this.frameCount++;
  }

  async flush() {
    if (this.closed) {
      throw new Error('Encoder is closed');
    }

    // Process all queued frames
    for (const { frame, options } of this.encodeQueue) {
      // Generate mock encoded chunk
      const chunkData = new Uint8Array(1024); // Mock 1KB chunk
      const chunk = new MockEncodedVideoChunk({
        type: options?.keyFrame ? 'key' : 'delta',
        timestamp: frame.timestamp,
        duration: frame.duration ?? null,
        data: chunkData,
      });

      // Call output callback
      if (this.outputCallback) {
        this.outputCallback(chunk);
      }
    }

    // Clear queue
    this.encodeQueue = [];
  }

  close() {
    this.closed = true;
    this.encodeQueue = [];
  }

  static async isConfigSupported(config: VideoEncoderConfig): Promise<{ supported: boolean; config?: VideoEncoderConfig }> {
    // Mock support check - support h264 and vp9
    const supported = config.codec === 'avc1.42001f' || config.codec === 'vp09.00.10.08';
    return { supported, config: supported ? config : undefined };
  }
}

// Setup global mocks
beforeAll(() => {
  if (typeof globalThis !== 'undefined') {
    if (typeof OffscreenCanvas === 'undefined') {
      (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;
    }
    if (typeof VideoFrame === 'undefined') {
      (globalThis as unknown as Record<string, unknown>).VideoFrame = MockVideoFrame;
    }
    if (typeof VideoEncoder === 'undefined') {
      (globalThis as unknown as Record<string, unknown>).VideoEncoder = MockVideoEncoder;
    }
  }
});

function createTestProgram(seed = 42): CompiledProgramIR {
  currentProgramSeed = seed;

  const renderAssembleStep: StepRenderAssemble = {
    kind: 'renderAssemble', id: 'render-assemble' as unknown as never, deps: [],
    instance2dListSlot: -1 as unknown as never, pathBatchListSlot: -1 as unknown as never, outFrameSlot: 0,
  };
  return {
    irVersion: 1, patchId: 'test', patchRevision: 1, compileId: 'test', seed,
    timeModel: { kind: 'infinite', windowMs: 10000 },
    types: { types: [] }, nodes: { nodes: [] }, buses: { buses: [] }, lenses: { lenses: [] },
    adapters: { adapters: [] }, fields: { exprs: [] },
    constants: { json: [], f64: new Float64Array([]), f32: new Float32Array([]), i32: new Int32Array([]), constIndex: [] },
    stateLayout: { cells: [], f64Size: 0, f32Size: 0, i32Size: 0 },
    schedule: { steps: [renderAssembleStep], stepIdToIndex: {}, deps: { fwdDeps: {}, revDeps: {} },
      determinism: { sortKeyRanges: {} }, caching: { perFrame: [], untilInvalidated: [] } },
    outputs: [{ id: 'render', kind: 'renderFrame', slot: 0 as unknown as never }],
  } as unknown as CompiledProgramIR;
}

function createTestConfig(overrides?: Partial<VideoExportConfig>): VideoExportConfig {
  return {
    width: 640,
    height: 480,
    startFrame: 0,
    endFrame: 10,
    fps: 30,
    codec: 'h264',
    bitrate: 5_000_000,
    ...overrides
  };
}

describe('VideoExporter - Core', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('exports video blob with correct format', async () => {
    const config = createTestConfig({ endFrame: 9 });
    const result = await exporter.export(program, config);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.format).toBe('mp4'); // h264 -> mp4
    expect(result.config).toEqual(config);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('H.264 codec produces MP4 format', async () => {
    const config = createTestConfig({ codec: 'h264', endFrame: 4 });
    const result = await exporter.export(program, config);

    expect(result.format).toBe('mp4');
    expect(result.blob.type).toBe('video/mp4');
  });

  it('VP9 codec produces WebM format', async () => {
    const config = createTestConfig({ codec: 'vp9', endFrame: 4 });
    const result = await exporter.export(program, config);

    expect(result.format).toBe('webm');
    expect(result.blob.type).toBe('video/webm');
  });

  it('fires progress callback on each frame', async () => {
    const updates: number[] = [];
    const config = createTestConfig({ endFrame: 4 });

    await exporter.export(program, config, (p) => updates.push(p.current));

    // Should have progress for frames 0, 1, 2, 3, 4 (5 total)
    expect(updates).toEqual([1, 2, 3, 4, 5]);
  });

  it('progress percentage increases from 0 to 100', async () => {
    const percentages: number[] = [];
    const config = createTestConfig({ endFrame: 9 });

    await exporter.export(program, config, (p) => percentages.push(p.percentage));

    // First should be 10% (frame 1 of 10), last should be 100%
    expect(percentages[0]).toBe(10);
    expect(percentages[percentages.length - 1]).toBe(100);
    // Should be monotonically increasing
    for (let i = 1; i < percentages.length; i++) {
      expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]);
    }
  });
});

describe('VideoExporter - Configuration Validation', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('throws for invalid width', async () => {
    const config = createTestConfig({ width: 0 });
    await expect(exporter.export(program, config)).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid height', async () => {
    const config = createTestConfig({ height: -1 });
    await expect(exporter.export(program, config)).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid frame range (start > end)', async () => {
    const config = createTestConfig({ startFrame: 10, endFrame: 5 });
    await expect(exporter.export(program, config)).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid fps', async () => {
    const config = createTestConfig({ fps: 0 });
    await expect(exporter.export(program, config)).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid bitrate', async () => {
    const config = createTestConfig({ bitrate: -1000 });
    await expect(exporter.export(program, config)).rejects.toThrow(InvalidExportConfigError);
  });
});

describe('VideoExporter - Browser Support', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('exports successfully when WebCodecs is supported', async () => {
    const config = createTestConfig({ endFrame: 2 });
    const result = await exporter.export(program, config);

    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('validates encoder config with browser', async () => {
    const config = createTestConfig({ codec: 'h264', endFrame: 2 });

    // Should not throw - h264 is supported in our mock
    await expect(exporter.export(program, config)).resolves.toBeDefined();
  });
});

describe('VideoExporter - Cancellation', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('throws ExportCancelledError when cancelled', async () => {
    const config = createTestConfig({ endFrame: 100 });

    const promise = exporter.export(program, config, (p) => {
      if (p.current === 1) {
        exporter.cancel();
      }
    });

    await expect(promise).rejects.toThrow(ExportCancelledError);
  });

  it('isCancelled returns true after cancel', () => {
    exporter.cancel();
    expect(exporter.isCancelled()).toBe(true);
  });

  it('cancellation stops export mid-sequence', async () => {
    let frameCount = 0;
    const config = createTestConfig({ endFrame: 50 });

    const promise = exporter.export(program, config, (p) => {
      frameCount = p.current;
      if (p.current === 10) {
        exporter.cancel();
      }
    });

    await expect(promise).rejects.toThrow(ExportCancelledError);

    // Verify export stopped early
    expect(frameCount).toBeLessThan(51);
    expect(frameCount).toBeGreaterThanOrEqual(10);
  });
});

describe('VideoExporter - Custom Resolution', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('1920x1080 resolution produces video blob', async () => {
    const config = createTestConfig({
      width: 1920,
      height: 1080,
      endFrame: 2
    });

    const result = await exporter.export(program, config);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('4K resolution (3840x2160) produces video blob', async () => {
    const config = createTestConfig({
      width: 3840,
      height: 2160,
      endFrame: 1
    });

    const result = await exporter.export(program, config);
    expect(result.blob).toBeInstanceOf(Blob);
  });
});

describe('VideoExporter - Frame Count', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('exports correct number of frames (30 frames)', async () => {
    const progressUpdates: number[] = [];
    const config = createTestConfig({ startFrame: 0, endFrame: 29, fps: 30 });

    await exporter.export(program, config, (p) => progressUpdates.push(p.current));

    // 30 frames (0-29 inclusive)
    expect(progressUpdates.length).toBe(30);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(30);
  });

  it('single frame export produces video', async () => {
    const config = createTestConfig({ startFrame: 0, endFrame: 0 });
    const result = await exporter.export(program, config);

    expect(result.blob).toBeInstanceOf(Blob);
  });
});

describe('VideoExporter - Bitrate Configuration', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('accepts custom bitrate (10 Mbps)', async () => {
    const config = createTestConfig({ bitrate: 10_000_000, endFrame: 2 });
    const result = await exporter.export(program, config);

    expect(result.config.bitrate).toBe(10_000_000);
  });

  it('accepts low bitrate (1 Mbps)', async () => {
    const config = createTestConfig({ bitrate: 1_000_000, endFrame: 2 });
    const result = await exporter.export(program, config);

    expect(result.config.bitrate).toBe(1_000_000);
  });

  it('accepts high bitrate (20 Mbps)', async () => {
    const config = createTestConfig({ bitrate: 20_000_000, endFrame: 2 });
    const result = await exporter.export(program, config);

    expect(result.config.bitrate).toBe(20_000_000);
  });
});

describe('VideoExporter - Edge Cases', () => {
  let exporter: VideoExporter;
  let program: CompiledProgramIR;

  beforeEach(() => {
    exporter = new VideoExporter();
    program = createTestProgram();
  });

  it('export returns duration metadata', async () => {
    const config = createTestConfig({ endFrame: 2 });
    const result = await exporter.export(program, config);

    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.config).toEqual(config);
  });

  it('export with different fps (60fps)', async () => {
    const config = createTestConfig({ fps: 60, endFrame: 59 });
    const result = await exporter.export(program, config);

    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('export with different fps (24fps)', async () => {
    const config = createTestConfig({ fps: 24, endFrame: 23 });
    const result = await exporter.export(program, config);

    expect(result.blob).toBeInstanceOf(Blob);
  });
});
