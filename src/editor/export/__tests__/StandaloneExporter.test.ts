/**
 * StandaloneExporter Tests
 *
 * Tests for standalone HTML player export.
 */

import { describe, it, expect } from 'vitest';
import { StandaloneExporter } from '../StandaloneExporter';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { StandaloneExportConfig } from '../types';
import { InvalidExportConfigError } from '../types';

describe('StandaloneExporter', () => {
  // Minimal test program fixture for standalone exporter tests
  const createTestProgram = (): CompiledProgramIR => ({
    irVersion: 1,
    patchId: 'test-patch',
    compileId: 'test-compile-id',
    seed: 12345,
    timeModel: {
      kind: 'cyclic',
      periodMs: 1000,
      mode: 'loop',
      phaseDomain: '0..1',
    },
    types: {
      typeIds: [],
    },
    signalExprs: {
      nodes: [],
    },
    fieldExprs: {
      nodes: [],
    },
    eventExprs: {
      nodes: [],
    },
    constants: {
      json: [],
    },
    stateLayout: {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    },
    slotMeta: [],
    render: {
      sinks: [],
    },
    cameras: {
      cameras: [],
      cameraIdToIndex: {},
    },
    meshes: {
      meshes: [],
      meshIdToIndex: {},
    },
    primaryCameraId: '__default__',
    schedule: {
      steps: [],
      stepIdToIndex: {},
      deps: {
        slotProducerStep: {},
        slotConsumers: {},
      },
      determinism: {
        allowedOrderingInputs: [],
        topoTieBreak: 'nodeIdLex',
      },
      caching: {
        stepCache: {},
        materializationCache: {},
      },
    },
    outputs: [],
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      labels: new Map(),
    },
  }) as unknown as CompiledProgramIR;

  const createTestConfig = (): StandaloneExportConfig => ({
    width: 1920,
    height: 1080,
    includeControls: true,
    bundleMode: 'cdn',
    seed: 12345,
  });

  describe('export', () => {
    it('should export HTML blob with CDN mode', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe('text/html;charset=utf-8');
      expect(result.config).toEqual(config);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('should throw for inline mode (not yet implemented)', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        bundleMode: 'inline',
      };

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should include controls when enabled', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        includeControls: true,
      };

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).toContain('id="controls"');
      expect(html).toContain('id="play-pause"');
      expect(html).toContain('id="scrubber"');
      expect(html).toContain('id="loop-toggle"');
    });

    it('should exclude controls when disabled', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        includeControls: false,
      };

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).not.toContain('id="controls"');
      expect(html).not.toContain('id="play-pause"');
    });

    it('should embed serialized IR program', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      // Check that program data is embedded
      expect(html).toContain('const programData =');
      expect(html).toContain('"irVersion":1');
      expect(html).toContain('"patchId":"test-patch"');
      expect(html).toContain('"seed":12345');
    });

    it('should set canvas dimensions from config', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        width: 800,
        height: 600,
      };

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).toContain('width="800"');
      expect(html).toContain('height="600"');
      expect(html).toContain('width: 800');
      expect(html).toContain('height: 600');
    });
  });

  describe('validation', () => {
    it('should throw on invalid width', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        width: 0,
      };

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should throw on invalid height', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        height: -1,
      };

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should throw on resolution too large', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        width: 10000,
        height: 10000,
      };

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should throw on invalid CDN URL', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        bundleMode: 'cdn',
        cdnBaseUrl: 'not a valid url',
      };

      await expect(exporter.export(program, config)).rejects.toThrow(
        InvalidExportConfigError
      );
    });

    it('should accept valid CDN URL', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config: StandaloneExportConfig = {
        ...createTestConfig(),
        bundleMode: 'cdn',
        cdnBaseUrl: 'https://cdn.example.com/runtime.js',
      };

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).toContain('https://cdn.example.com/runtime.js');
    });
  });

  describe('HTML structure', () => {
    it('should generate valid HTML5 document', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</html>');
    });

    it('should include responsive viewport meta tag', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).toContain('<meta name="viewport"');
    });

    it('should include runtime initialization code', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      // Check for runtime initialization
      expect(html).toContain('OscillaRuntime.deserializeProgram');
      expect(html).toContain('OscillaRuntime.Canvas2DRenderer');
      expect(html).toContain('OscillaRuntime.ScheduleExecutor');
      expect(html).toContain('OscillaRuntime.createRuntimeState');
    });

    it('should include animation loop', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);
      const html = await result.blob.text();

      expect(html).toContain('function animate');
      expect(html).toContain('requestAnimationFrame');
      expect(html).toContain('executor.executeFrame');
      expect(html).toContain('renderer.renderFrame');
    });
  });

  describe('file size', () => {
    it('should report accurate blob size', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);

      expect(result.sizeBytes).toBe(result.blob.size);
    });

    it('should produce reasonably sized HTML (CDN mode)', async () => {
      const exporter = new StandaloneExporter();
      const program = createTestProgram();
      const config = createTestConfig();

      const result = await exporter.export(program, config);

      // CDN mode should be < 50KB for minimal program
      expect(result.sizeBytes).toBeLessThan(50 * 1024);
    });
  });
});
