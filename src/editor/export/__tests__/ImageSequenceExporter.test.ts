/**
 * ImageSequenceExporter Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageSequenceExporter } from '../ImageSequenceExporter';
import type { ImageSequenceExportConfig } from '../types';
import { InvalidExportConfigError, ExportCancelledError } from '../types';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { StepRenderAssemble } from '../../compiler/ir/schedule';

// Mock OffscreenCanvas for Node.js testing
class MockOffscreenCanvas {
  width: number;
  height: number;
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
    return new Blob(['mock'], { type: _options?.type ?? 'image/png' });
  }
}

if (typeof globalThis !== 'undefined' && typeof OffscreenCanvas === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = MockOffscreenCanvas;
}

function createTestProgram(): CompiledProgramIR {
  const renderAssembleStep: StepRenderAssemble = {
    kind: 'renderAssemble', id: 'render-assemble' as unknown as never, deps: [],
    instance2dListSlot: -1 as unknown as never, pathBatchListSlot: -1 as unknown as never, outFrameSlot: 0,
  };
  return {
    irVersion: 1, patchId: 'test', patchRevision: 1, compileId: 'test', seed: 42,
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

  it('throws for invalid frame range', async () => {
    await expect(exporter.export(program, createTestConfig({ startFrame: 10, endFrame: 5 }))).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid fps', async () => {
    await expect(exporter.export(program, createTestConfig({ fps: 0 }))).rejects.toThrow(InvalidExportConfigError);
  });

  it('throws for invalid quality', async () => {
    await expect(exporter.export(program, createTestConfig({ quality: 101 }))).rejects.toThrow(InvalidExportConfigError);
  });
});
