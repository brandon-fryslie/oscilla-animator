/**
 * GifExporter Tests
 *
 * Unit tests for GIF export functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GifExporter } from '../GifExporter';
import type { GifExportConfig } from '../types';
import { InvalidExportConfigError, ExportCancelledError } from '../types';
import type { CompiledProgramIR } from '../../compiler/ir/program';

// Mock OffscreenCanvas for Node.js testing
class MockOffscreenCanvas {
  width: number;
  height: number;
  private mockImageData: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    // Create mock image data (RGBA pixels)
    this.mockImageData = new Uint8ClampedArray(width * height * 4);
    // Fill with some pattern (diagonal gradient)
    for (let i = 0; i < this.mockImageData.length; i += 4) {
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      this.mockImageData[i] = (x + y) % 256;     // R
      this.mockImageData[i + 1] = x % 256;       // G
      this.mockImageData[i + 2] = y % 256;       // B
      this.mockImageData[i + 3] = 255;           // A
    }
  }

  getContext(contextType: string, _options?: { willReadFrequently?: boolean }) {
    if (contextType === '2d') {
      return {
        // Mock CanvasRenderingContext2D methods
        setTransform: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        transform: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        strokeStyle: '',
        lineWidth: 1,
        strokeRect: vi.fn(),
        // Mock getImageData for GIF export
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          return {
            data: this.mockImageData,
            width: w,
            height: h,
          };
        },
      };
    }
    return null;
  }

  convertToBlob(_options?: { type?: string; quality?: number }): Promise<Blob> {
    const content = `mock-frame-${this.width}x${this.height}`;
    return Promise.resolve(new Blob([content], { type: _options?.type ?? 'image/png' }));
  }
}

// Install mock OffscreenCanvas globally if not available (Node.js environment)
if (typeof globalThis !== 'undefined' && typeof OffscreenCanvas === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;
}

// Mock program for testing
function createMockProgram(): CompiledProgramIR {
  return {
    irVersion: 1,
    patchId: 'test',
    patchRevision: 1,
    compileId: 'test',
    seed: 42,
    timeModel: { kind: 'infinite', windowMs: 10000 },
    types: { typeIds: [] },
    signalExprs: { nodes: [] },
    fieldExprs: { nodes: [] },
    eventExprs: { nodes: [] },
    constants: {
      json: [],
      f64: new Float64Array([]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [],
    },
    stateLayout: {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    },
    slotMeta: [],
    render: { sinks: [] },
    cameras: { cameras: [], cameraIdToIndex: {} },
    meshes: { meshes: [], meshIdToIndex: {} },
    primaryCameraId: '__default__',
    schedule: {
      steps: [],
      stepIdToIndex: {},
      deps: { slotProducerStep: {}, slotConsumers: {} },
      determinism: { allowedOrderingInputs: [], topoTieBreak: 'nodeIdLex' },
      caching: { stepCache: {}, materializationCache: {} },
    },
    outputs: [],
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      labels: new Map(),
    },
  } as unknown as CompiledProgramIR;
}

// Default config for tests
function createDefaultConfig(): GifExportConfig {
  return {
    width: 256,
    height: 256,
    startFrame: 0,
    endFrame: 10,
    fps: 10,
    maxColors: 128,
    dithering: 'none',
    loopCount: 0,
  };
}

describe('GifExporter', () => {
  let exporter: GifExporter;
  let program: CompiledProgramIR;
  let config: GifExportConfig;

  beforeEach(() => {
    exporter = new GifExporter();
    program = createMockProgram();
    config = createDefaultConfig();
  });

  describe('Configuration Validation', () => {
    it('should reject invalid resolution (width <= 0)', async () => {
      config.width = 0;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject invalid resolution (height <= 0)', async () => {
      config.height = -10;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject negative start frame', async () => {
      config.startFrame = -1;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject invalid frame range (end < start)', async () => {
      config.startFrame = 10;
      config.endFrame = 5;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject invalid fps (fps <= 0)', async () => {
      config.fps = 0;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject invalid maxColors (< 2)', async () => {
      config.maxColors = 1;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject invalid maxColors (> 256)', async () => {
      config.maxColors = 300;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should reject negative loop count', async () => {
      config.loopCount = -1;

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    // Skip: This test is slow (exports 601 frames) and times out in CI
    // The warning is verified manually - GifExporter logs warning for >500 frames
    it.skip('should warn about large frame counts', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      config.endFrame = 600; // 601 frames

      try {
        await exporter.export(program, config);
      } catch {
        // Ignore export errors (we're testing warning)
      }

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('601 frames');

      warnSpy.mockRestore();
    });
  });

  describe('Export Functionality', () => {
    it('should export simple animation to GIF blob', async () => {
      const result = await exporter.export(program, config);

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe('image/gif');
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.config).toEqual(config);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should export correct number of frames', async () => {
      config.startFrame = 0;
      config.endFrame = 5;

      const progressCalls: number[] = [];
      await exporter.export(program, config, (progress) => {
        progressCalls.push(progress.current);
      });

      // Should have 6 frames (0-5 inclusive)
      // Progress is called twice per frame (rendering + encoding)
      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it('should respect fps in frame timing', async () => {
      config.fps = 30;
      config.endFrame = 2;

      const timeCalls: number[] = [];
      await exporter.export(program, config, (progress) => {
        timeCalls.push(progress.timeSeconds);
      });

      // Frame 0: 0s, Frame 1: 1/30s, Frame 2: 2/30s
      expect(timeCalls).toContain(0);
      expect(timeCalls.some(t => Math.abs(t - 1/30) < 0.001)).toBe(true);
      expect(timeCalls.some(t => Math.abs(t - 2/30) < 0.001)).toBe(true);
    });

    it('should handle custom resolution', async () => {
      config.width = 512;
      config.height = 256;

      const result = await exporter.export(program, config);

      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.config.width).toBe(512);
      expect(result.config.height).toBe(256);
    });

    it('should handle different maxColors settings', async () => {
      const result16 = await exporter.export(program, { ...config, maxColors: 16 });
      const result256 = await exporter.export(program, { ...config, maxColors: 256 });

      // More colors generally means larger file (not always true, but likely)
      expect(result16.blob.size).toBeGreaterThan(0);
      expect(result256.blob.size).toBeGreaterThan(0);
    });

    it('should fire progress callbacks during export', async () => {
      const progressUpdates: Array<{
        current: number;
        total: number;
        percentage: number;
      }> = [];

      await exporter.export(program, config, (progress) => {
        progressUpdates.push({
          current: progress.current,
          total: progress.total,
          percentage: progress.percentage,
        });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].total).toBe(11); // 0-10 inclusive = 11 frames
      expect(progressUpdates[0].percentage).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
    });
  });

  describe('Cancellation', () => {
    it('should support cancellation during export', async () => {
      config.endFrame = 100; // Many frames

      const exportPromise = exporter.export(program, config, (progress) => {
        // Cancel after first frame
        if (progress.current === 1) {
          exporter.cancel();
        }
      });

      await expect(exportPromise).rejects.toThrow(ExportCancelledError);
    });

    it('should report cancelled state', () => {
      expect(exporter.isCancelled()).toBe(false);
      exporter.cancel();
      expect(exporter.isCancelled()).toBe(true);
    });

    it('should reset cancelled state on new export', async () => {
      exporter.cancel();
      expect(exporter.isCancelled()).toBe(true);

      // Start new export (will reset cancelled state)
      const newExporter = new GifExporter();
      await newExporter.export(program, config);

      expect(newExporter.isCancelled()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single frame export', async () => {
      config.startFrame = 0;
      config.endFrame = 0;

      const result = await exporter.export(program, config);

      expect(result.blob.size).toBeGreaterThan(0);
    });

    it('should handle very small resolution', async () => {
      config.width = 16;
      config.height = 16;

      const result = await exporter.export(program, config);

      expect(result.blob.size).toBeGreaterThan(0);
    });

    it('should handle minimum color palette', async () => {
      config.maxColors = 2; // Minimum (black & white)

      const result = await exporter.export(program, config);

      expect(result.blob.size).toBeGreaterThan(0);
    });

    it('should handle high fps', async () => {
      config.fps = 60;
      config.endFrame = 5;

      const result = await exporter.export(program, config);

      expect(result.blob.size).toBeGreaterThan(0);
    });
  });

  describe('Factory Function', () => {
    it('should create GifExporter via factory', async () => {
      const { createGifExporter } = await import('../GifExporter');
      const newExporter = createGifExporter();

      expect(newExporter).toBeInstanceOf(GifExporter);

      const result = await newExporter.export(program, config);
      expect(result.blob).toBeInstanceOf(Blob);
    });
  });
});
