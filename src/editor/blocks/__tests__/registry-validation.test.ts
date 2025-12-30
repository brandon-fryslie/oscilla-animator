import { describe, it, expect } from 'vitest';
import {
  validateBlockDefinition,
  validateBlockDefinitions,
  BlockDefinitionValidationError,
  getKernelPrimitivesSummary,
} from '../registry-validation';
import type { BlockDefinition, KernelBlockDefinition, PureBlockDefinition } from '../types';

describe('registry-validation', () => {
  describe('validateBlockDefinition', () => {
    describe('valid definitions', () => {
      it('accepts valid kernel primitive (time)', () => {
        const def: KernelBlockDefinition = {
          type: 'FiniteTimeRoot',
          label: 'Finite Time',
          capability: 'time',
          kernelId: 'FiniteTimeRoot',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        };

        expect(() => validateBlockDefinition(def)).not.toThrow();
      });

      it('accepts valid kernel primitive (identity)', () => {
        const def: KernelBlockDefinition = {
          type: 'DomainN',
          label: 'Domain N',
          capability: 'identity',
          kernelId: 'DomainN',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        };

        expect(() => validateBlockDefinition(def)).not.toThrow();
      });

      it('accepts valid kernel primitive (render)', () => {
        const def: KernelBlockDefinition = {
          type: 'RenderInstances',
          label: 'Render',
          capability: 'render',
          kernelId: 'RenderInstances',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        };

        expect(() => validateBlockDefinition(def)).not.toThrow();
      });

      it('accepts valid pure primitive', () => {
        const def: PureBlockDefinition = {
          type: 'AddNumbers',
          label: 'Add',
          capability: 'pure',
          compileKind: 'operator',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        };

        expect(() => validateBlockDefinition(def)).not.toThrow();
      });

      it('accepts valid pure composite', () => {
        const def: PureBlockDefinition = {
          type: 'composite:TestComposite',
          label: 'Test Composite',
          capability: 'pure',
          compileKind: 'composite',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
          compositeDefinition: {
            id: 'test',
            label: 'Test',
            description: 'Test composite',
            subcategory: 'Other',
            graph: {
              nodes: {},
              edges: [],
              inputMap: {},
              outputMap: {},
            },
            exposedInputs: [],
            exposedOutputs: [],
          },
        };

        expect(() => validateBlockDefinition(def)).not.toThrow();
      });

      it('accepts valid pure macro', () => {
        const def: PureBlockDefinition = {
          type: 'macro:TestMacro',
          label: 'Test Macro',
          capability: 'pure',
          compileKind: 'composite',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        };

        expect(() => validateBlockDefinition(def)).not.toThrow();
      });
    });

    describe('invalid definitions', () => {
      it('rejects composite claiming non-pure capability', () => {
        const def = {
          type: 'composite:BadComposite',
          label: 'Bad Composite',
          capability: 'time',
          compileKind: 'composite',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
          compositeDefinition: {
            id: 'test',
            label: 'Test',
            description: 'Test composite',
            subcategory: 'Other',
            graph: {
              nodes: {},
              edges: [],
              inputMap: {},
              outputMap: {},
            },
            exposedInputs: [],
            exposedOutputs: [],
          },
        } as unknown as BlockDefinition;

        expect(() => validateBlockDefinition(def)).toThrow(BlockDefinitionValidationError);
        expect(() => validateBlockDefinition(def)).toThrow(
          /composite blocks must have capability: 'pure'/
        );
      });

      it('rejects macro claiming non-pure capability', () => {
        const def = {
          type: 'macro:BadMacro',
          label: 'Bad Macro',
          capability: 'render',
          compileKind: 'composite',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        } as unknown as BlockDefinition;

        expect(() => validateBlockDefinition(def)).toThrow(BlockDefinitionValidationError);
        expect(() => validateBlockDefinition(def)).toThrow(
          /macro blocks must have capability: 'pure'/
        );
      });

      it('rejects unauthorized kernel primitive', () => {
        const def = {
          type: 'FakeTimeRoot',
          label: 'Fake Time',
          capability: 'time',
          kernelId: 'FakeTimeRoot',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        } as unknown as BlockDefinition;

        expect(() => validateBlockDefinition(def)).toThrow(BlockDefinitionValidationError);
        expect(() => validateBlockDefinition(def)).toThrow(/not in KERNEL_PRIMITIVES/);
        expect(() => validateBlockDefinition(def)).toThrow(
          /FiniteTimeRoot, InfiniteTimeRoot/
        );
      });

      it('rejects capability mismatch', () => {
        // DomainN should have 'identity' capability, not 'time'
        const def = {
          type: 'DomainN',
          label: 'Domain N',
          capability: 'time',
          kernelId: 'DomainN',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        } as unknown as BlockDefinition;

        expect(() => validateBlockDefinition(def)).toThrow(BlockDefinitionValidationError);
        expect(() => validateBlockDefinition(def)).toThrow(/Capability mismatch/);
        expect(() => validateBlockDefinition(def)).toThrow(/identity/);
      });

      it('rejects kernelId mismatch', () => {
        const def: KernelBlockDefinition = {
          type: 'FiniteTimeRoot',
          label: 'Finite Time',
          capability: 'time',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        kernelId: 'InfiniteTimeRoot' as any, // Wrong!
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        };

        expect(() => validateBlockDefinition(def)).toThrow(BlockDefinitionValidationError);
        expect(() => validateBlockDefinition(def)).toThrow(/kernelId mismatch/);
      });
    });
  });

  describe('validateBlockDefinitions', () => {
    it('accepts array of valid definitions', () => {
      const defs: BlockDefinition[] = [
        {
          type: 'FiniteTimeRoot',
          label: 'Finite Time',
          capability: 'time',
          kernelId: 'FiniteTimeRoot',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        },
        {
          type: 'AddNumbers',
          label: 'Add',
          capability: 'pure',
          compileKind: 'operator',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        },
      ];

      expect(() => validateBlockDefinitions(defs)).not.toThrow();
    });

    it('accumulates multiple errors', () => {
      const defs = [
        {
          type: 'FakeTimeRoot1',
          label: 'Fake 1',
          capability: 'time',
          kernelId: 'FakeTimeRoot1',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        },
        {
          type: 'FakeTimeRoot2',
          label: 'Fake 2',
          capability: 'time',
          kernelId: 'FakeTimeRoot2',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        },
      ] as unknown as BlockDefinition[];

      expect(() => validateBlockDefinitions(defs)).toThrow(/2 error\(s\)/);
      expect(() => validateBlockDefinitions(defs)).toThrow(/FakeTimeRoot1/);
      expect(() => validateBlockDefinitions(defs)).toThrow(/FakeTimeRoot2/);
    });

    it('includes helpful context in error messages', () => {
      const defs = [
        {
          type: 'FakeTimeRoot',
          label: 'Fake',
          capability: 'time',
          kernelId: 'FakeTimeRoot',
          description: 'Test',
          inputs: [],
          outputs: [],
          defaultParams: {},
          paramSchema: [],
          color: '#000',
        },
      ] as unknown as BlockDefinition[];

      expect(() => validateBlockDefinitions(defs)).toThrow(/KERNEL_PRIMITIVES/);
      expect(() => validateBlockDefinitions(defs)).toThrow(/kernel-primitives.ts/);
    });
  });

  describe('getKernelPrimitivesSummary', () => {
    it('returns all kernel primitives grouped by capability', () => {
      const summary = getKernelPrimitivesSummary();

      expect(summary.time).toContain('FiniteTimeRoot');
      expect(summary.time).toContain('InfiniteTimeRoot');
      expect(summary.time).toHaveLength(2);

      expect(summary.identity).toContain('DomainN');
      expect(summary.identity).toContain('SVGSampleDomain');
      expect(summary.identity).toContain('GridDomain');
      expect(summary.identity).toHaveLength(3);

      expect(summary.state).toContain('IntegrateBlock');
      expect(summary.state).toContain('HistoryBlock');
      expect(summary.state).toContain('TriggerOnWrap');
      expect(summary.state).toContain('PulseDivider');
      expect(summary.state).toContain('EnvelopeAD');
      expect(summary.state).toHaveLength(5);

      expect(summary.render).toContain('RenderInstances');
      expect(summary.render).toContain('RenderStrokes');
      expect(summary.render).toContain('RenderProgramStack');
      expect(summary.render).toContain('RenderInstances2D');
      expect(summary.render).toContain('RenderPaths2D');
      expect(summary.render).toContain('Render2dCanvas');
      expect(summary.render).toHaveLength(6);

      expect(summary.io).toContain('TextSource');
      expect(summary.io).toContain('ImageSource');
      expect(summary.io).toContain('DebugDisplay');
      expect(summary.io).toHaveLength(3);
    });

    it('has exactly 19 total primitives (2 time + 3 identity + 5 state + 6 render + 3 io)', () => {
      const summary = getKernelPrimitivesSummary();
      const total = Object.values(summary).flat().length;
      expect(total).toBe(19);
    });
  });
});
