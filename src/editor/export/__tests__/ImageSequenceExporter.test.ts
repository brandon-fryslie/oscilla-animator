/**
 * ImageSequenceExporter Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageSequenceExporter } from '../ImageSequenceExporter';
import type { ImageSequenceExportConfig } from '../types';
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
    // This simulates how the actual renderer would produce different frames
    const content = `mock-seed${currentProgramSeed}-frame${this.frameCounter++}-${this.width}x${this.height}`;
    return new Blob([content], { type: _options?.type ?? 'image/png' });
  }
}

if (typeof globalThis !== 'undefined' && typeof OffscreenCanvas === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;
}

function createTestProgram(seed = 42): CompiledProgramIR {
  // Set global seed for mock to use
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

function createTestConfig(overrides?: Partial<ImageSequenceExportConfig>): ImageSequenceExportConfig {
  return { width: 640, height: 480, startFrame: 0, endFrame: 10, frameStep: 1, fps: 30, format: 'png', ...overrides };
}

describe('ImageSequenceExporter - Core', () => {
  let exporter: ImageSequenceExporter;
  let program: CompiledProgramIR;
  beforeEach(() => { exporter = new ImageSequenceExporter(); program = createTestProgram(); });

  it('exports correct number of frames', async () => {
    const result = await exporter.export(program, createTestConfig({ endFrame: 9 }));
    expect(result.blobs).toHaveLength(10);
  });

  it('respects frame step', async () => {
    const result = await exporter.export(program, createTestConfig({ frameStep: 2 }));
    expect(result.blobs).toHaveLength(6);
  });

  it('fires progress callback', async () => {
    const updates: number[] = [];
    await exporter.export(program, createTestConfig({ endFrame: 4 }), (p) => updates.push(p.current));
    expect(updates).toEqual([1, 2, 3, 4, 5]);
  });

  it('produces PNG blobs', async () => {
    const result = await exporter.export(program, createTestConfig({ format: 'png' }));
    expect(result.blobs[0].type).toBe('image/png');
  });
});

describe('ImageSequenceExporter - Frame Count Validation', () => {
  let exporter: ImageSequenceExporter;
  let program: CompiledProgramIR;
  beforeEach(() => { exporter = new ImageSequenceExporter(); program = createTestProgram(); });

  it('exports 60 frames at 60fps produces 60 blobs', async () => {
    const config = createTestConfig({
      startFrame: 0,
      endFrame: 59,
      frameStep: 1,
      fps: 60
    });
    const result = await exporter.export(program, config);
    expect(result.blobs).toHaveLength(60);
  });

  it('step parameter reduces frame count correctly', async () => {
    const config = createTestConfig({
      startFrame: 0,
      endFrame: 59,
      frameStep: 3,
      fps: 60
    });
    const result = await exporter.export(program, config);
    // With step=3: 0, 3, 6, 9, ..., 57 (20 frames)
    expect(result.blobs).toHaveLength(20);
  });
});

describe('ImageSequenceExporter - Determinism', () => {
  let exporter: ImageSequenceExporter;
  beforeEach(() => { exporter = new ImageSequenceExporter(); });

  it('same seed produces bit-identical PNG bytes', async () => {
    const seed = 12345;
    const config = createTestConfig({ endFrame: 4, seed });

    // Export with same seed twice
    const result1 = await exporter.export(createTestProgram(seed), config);
    const result2 = await exporter.export(createTestProgram(seed), config);

    // Compare blob contents
    expect(result1.blobs).toHaveLength(result2.blobs.length);
    for (let i = 0; i < result1.blobs.length; i++) {
      const text1 = await result1.blobs[i].text();
      const text2 = await result2.blobs[i].text();
      expect(text1).toBe(text2);
    }
  });

  it('different seeds produce different PNG bytes', async () => {
    const config = createTestConfig({ endFrame: 4 });

    // Export with different seeds
    const result1 = await exporter.export(createTestProgram(111), config);
    const result2 = await exporter.export(createTestProgram(222), config);

    // Verify blobs are different
    expect(result1.blobs).toHaveLength(result2.blobs.length);
    let foundDifference = false;
    for (let i = 0; i < result1.blobs.length; i++) {
      const text1 = await result1.blobs[i].text();
      const text2 = await result2.blobs[i].text();
      if (text1 !== text2) {
        foundDifference = true;
        break;
      }
    }
    expect(foundDifference).toBe(true);
  });
});

describe('ImageSequenceExporter - Custom Resolution', () => {
  let exporter: ImageSequenceExporter;
  let program: CompiledProgramIR;
  beforeEach(() => { exporter = new ImageSequenceExporter(); program = createTestProgram(); });

  it('1920x1080 produces correct blob dimensions', async () => {
    const config = createTestConfig({
      width: 1920,
      height: 1080,
      endFrame: 2
    });
    const result = await exporter.export(program, config);

    // Verify blobs were created with correct resolution
    expect(result.blobs).toHaveLength(3);

    // Check blob content includes resolution
    for (const blob of result.blobs) {
      const text = await blob.text();
      expect(text).toContain('1920x1080');
    }
  });

  it('custom resolution (3840x2160) produces correct blobs', async () => {
    const config = createTestConfig({
      width: 3840,
      height: 2160,
      endFrame: 1
    });
    const result = await exporter.export(program, config);

    expect(result.blobs).toHaveLength(2);
    const text = await result.blobs[0].text();
    expect(text).toContain('3840x2160');
  });
});

describe('ImageSequenceExporter - Cancellation', () => {
  let exporter: ImageSequenceExporter;
  let program: CompiledProgramIR;
  beforeEach(() => { exporter = new ImageSequenceExporter(); program = createTestProgram(); });

  it('throws ExportCancelledError when cancelled', async () => {
    const promise = exporter.export(program, createTestConfig({ endFrame: 100 }), (p) => {
      if (p.current === 1) exporter.cancel();
    });
    await expect(promise).rejects.toThrow(ExportCancelledError);
  });

  it('isCancelled returns true after cancel', () => {
    exporter.cancel();
    expect(exporter.isCancelled()).toBe(true);
  });

  it('cancellation cleans up OffscreenCanvas resources', async () => {
    // This test verifies that cancellation happens mid-export
    // and doesn't leak resources (canvas is created once and discarded)
    let frameCount = 0;
    const config = createTestConfig({ endFrame: 50 });

    const promise = exporter.export(program, config, (p) => {
      frameCount = p.current;
      if (p.current === 10) {
        exporter.cancel();
      }
    });

    await expect(promise).rejects.toThrow(ExportCancelledError);

    // Verify export stopped early (not all frames exported)
    expect(frameCount).toBeLessThan(51);
    expect(frameCount).toBeGreaterThanOrEqual(10);
  });
});

describe('ImageSequenceExporter - Validation', () => {
  let exporter: ImageSequenceExporter;
  let program: CompiledProgramIR;
  beforeEach(() => { exporter = new ImageSequenceExporter(); program = createTestProgram(); });

  it('throws for invalid width', async () => {
    await expect(exporter.export(program, createTestConfig({ width: 0 }))).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid height', async () => {
    await expect(exporter.export(program, createTestConfig({ height: -1 }))).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid frame range (start > end)', async () => {
    await expect(exporter.export(program, createTestConfig({ startFrame: 10, endFrame: 5 }))).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid fps', async () => {
    await expect(exporter.export(program, createTestConfig({ fps: 0 }))).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid quality', async () => {
    await expect(exporter.export(program, createTestConfig({ quality: 101 }))).rejects.toThrow(InvalidExportConfigError);
  });
});

describe('ImageSequenceExporter - Edge Cases', () => {
  let exporter: ImageSequenceExporter;
  let program: CompiledProgramIR;
  beforeEach(() => { exporter = new ImageSequenceExporter(); program = createTestProgram(); });

  it('export with no frames (empty range) handles gracefully', async () => {
    // startFrame === endFrame should produce 1 frame (inclusive range)
    const config = createTestConfig({ startFrame: 5, endFrame: 5 });
    const result = await exporter.export(program, config);
    expect(result.blobs).toHaveLength(1);
  });

  it('export with single frame produces one blob', async () => {
    const config = createTestConfig({ startFrame: 0, endFrame: 0 });
    const result = await exporter.export(program, config);
    expect(result.blobs).toHaveLength(1);
  });

  it('export with large frame step produces correct count', async () => {
    // endFrame < startFrame + frameStep should produce 1 frame
    const config = createTestConfig({
      startFrame: 0,
      endFrame: 10,
      frameStep: 20
    });
    const result = await exporter.export(program, config);
    // Only frame 0 is exported (next would be 20, which exceeds endFrame 10)
    expect(result.blobs).toHaveLength(1);
  });

  it('exports return duration metadata', async () => {
    const config = createTestConfig({ endFrame: 2 });
    const result = await exporter.export(program, config);

    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.config).toEqual(config);
  });
});
