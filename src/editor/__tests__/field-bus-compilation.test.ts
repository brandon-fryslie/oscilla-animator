/**
 * Field Bus Compilation Tests
 *
 * Tests Field bus compilation with FieldExpr lazy evaluation.
 * This is the foundation for per-element variation through buses.
 */

import { describe, it, expect } from 'vitest';
import { compilePatch } from '../compiler/compile';
import type { CompilerPatch, BlockRegistry, CompileCtx, Seed, Field } from '../compiler/types';
import type { Bus, Publisher, Listener } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestContext(): CompileCtx {
  return {
    env: {},
    geom: {
      get: <K extends object, V>(_key: K, compute: () => V): V => compute(),
      invalidate: () => {},
    },
  };
}

/**
 * Create a test registry with Field-producing and Field-consuming blocks.
 */
function createFieldTestRegistry(): BlockRegistry {
  return {
    // CycleTimeRoot - required for all patches
    CycleTimeRoot: {
      type: 'CycleTimeRoot',
      inputs: [],
      outputs: [{ name: 'phase', type: { kind: 'Signal:number' }, required: true }],
      compile: ({ params }) => {
        const periodMs = (params.periodMs as number) ?? 3000;
        return {
          phase: { kind: 'Signal:number', value: (t: number) => (t / periodMs) % 1 },
        };
      },
    },

    // Field source - produces Field<number>
    // Field source - produces Field<number>
    FieldNumberSource: {
      type: 'FieldNumberSource',
      inputs: [],
      outputs: [{ name: 'field', type: { kind: 'Field:number' }, required: true }],
      compile: ({ params }) => {
        const baseValue = (params.value as number) ?? 0;
        // Field is bulk form: (seed, n, ctx) => readonly number[]
        const field: Field<number> = (_seed, n, _ctx) => {
          const result: number[] = [];
          for (let i = 0; i < n; i++) {
            result.push(baseValue + i); // Each element gets baseValue + index
          }
          return result;
        };
        return {
          field: { kind: 'Field:number', value: field },
        };
      },
    },

    // Field consumer - sums field values and outputs RenderTreeProgram
    FieldSink: {
      type: 'FieldSink',
      inputs: [{ name: 'field', type: { kind: 'Field:number' }, required: true }],
      outputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' }, required: true }],
      compile: ({ inputs }) => {
        const fieldArtifact = inputs.field;
        if (fieldArtifact?.kind !== 'Field:number') {
          return {
            program: {
              kind: 'Error',
              message: `FieldSink requires Field:number input, got ${fieldArtifact?.kind}`,
            },
          };
        }

        const fieldFn = fieldArtifact.value;

        return {
          program: {
            kind: 'RenderTreeProgram',
            value: {
              signal: (_t: number, _ctx: unknown) => {
                // Evaluate field for 5 elements
                const values = fieldFn(42, 5, { env: {}, geom: null as unknown as any });
                const sum = values.reduce((a, b) => a + b, 0);
                return {
                  kind: 'group' as const,
                  id: 'root',
                  children: [],
                  meta: { sum, values: [...values] },
                };
              },
              event: () => [],
            },
          },
        };
      },
    },

    // Field math - adds two fields
    FieldAdd: {
      type: 'FieldAdd',
      inputs: [
        { name: 'a', type: { kind: 'Field:number' }, required: true },
        { name: 'b', type: { kind: 'Field:number' }, required: true },
      ],
      outputs: [{ name: 'out', type: { kind: 'Field:number' }, required: true }],
      compile: ({ inputs }) => {
        const aArtifact = inputs.a;
        const bArtifact = inputs.b;

        if (aArtifact?.kind !== 'Field:number' || bArtifact?.kind !== 'Field:number') {
          return {
            out: {
              kind: 'Error',
              message: 'FieldAdd requires two Field:number inputs',
            },
          };
        }

        const aField = aArtifact.value;
        const bField = bArtifact.value;

        // Combine fields lazily
        const combined: Field<number> = (seed, n, ctx) => {
          const aValues = aField(seed, n, ctx);
          const bValues = bField(seed, n, ctx);
          const result: number[] = [];
          for (let i = 0; i < n; i++) {
            result.push(aValues[i]! + bValues[i]!);
          }
          return result;
        };

        return {
          out: { kind: 'Field:number', value: combined },
        };
      },
    },
  };
}

// =============================================================================
// Field Bus Compilation Tests
// =============================================================================

describe('Field Bus Compilation', () => {
  it('compiles single Field<number> bus with one publisher and one listener', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'FieldNumberSource', params: { value: 10 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Test Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      {
        id: 'pub1',
        busId: 'fieldBus1',
        from: { blockId: 'source1', slotId: 'field', dir: 'output' },
        enabled: true,
        sortKey: 0,
      },
    ];

    const listeners: Listener[] = [
      {
        id: 'list1',
        busId: 'fieldBus1',
        to: { blockId: 'sink1', slotId: 'field', dir: 'input' },
        enabled: true,
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();

    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // Field produces [10, 11, 12, 13, 14] for 5 elements
      // @ts-ignore - accessing meta for test
      expect(output.meta?.values).toEqual([10, 11, 12, 13, 14]);
      // @ts-ignore
      expect(output.meta?.sum).toBe(60); // 10+11+12+13+14
    }
  });

  it('combines multiple Field publishers with "sum" mode', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'FieldNumberSource', params: { value: 10 } }],
      ['source2', { id: 'source2', type: 'FieldNumberSource', params: { value: 100 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Sum Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // source1: [10, 11, 12, 13, 14]
      // source2: [100, 101, 102, 103, 104]
      // sum: [110, 112, 114, 116, 118]
      // @ts-ignore
      expect(output.meta?.values).toEqual([110, 112, 114, 116, 118]);
    }
  });

  it('combines multiple Field publishers with "last" mode - highest sortKey wins', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'FieldNumberSource', params: { value: 10 } }],
      ['source2', { id: 'source2', type: 'FieldNumberSource', params: { value: 100 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Last Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 20 }, // Wins
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // source2 wins: [100, 101, 102, 103, 104]
      // @ts-ignore
      expect(output.meta?.values).toEqual([100, 101, 102, 103, 104]);
    }
  });

  it('returns default field when bus has no publishers', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Empty Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 42, // Should produce constant field of 42
      sortKey: 0,
    };

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers: [],
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // Default produces constant field: [42, 42, 42, 42, 42]
      // @ts-ignore
      expect(output.meta?.values).toEqual([42, 42, 42, 42, 42]);
    }
  });

  it('supports "average" combine mode for Field buses', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'FieldNumberSource', params: { value: 0 } }],
      ['source2', { id: 'source2', type: 'FieldNumberSource', params: { value: 10 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Average Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'average',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // source1: [0, 1, 2, 3, 4]
      // source2: [10, 11, 12, 13, 14]
      // average: [5, 6, 7, 8, 9]
      // @ts-ignore
      expect(output.meta?.values).toEqual([5, 6, 7, 8, 9]);
    }
  });

  it('supports "max" combine mode for Field buses', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'FieldNumberSource', params: { value: 5 } }],
      ['source2', { id: 'source2', type: 'FieldNumberSource', params: { value: 0 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Max Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'max',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // source1: [5, 6, 7, 8, 9]
      // source2: [0, 1, 2, 3, 4]
      // max: [5, 6, 7, 8, 9]
      // @ts-ignore
      expect(output.meta?.values).toEqual([5, 6, 7, 8, 9]);
    }
  });

  it('supports "min" combine mode for Field buses', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'FieldNumberSource', params: { value: 5 } }],
      ['source2', { id: 'source2', type: 'FieldNumberSource', params: { value: 0 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Min Field Bus',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'min',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [fieldBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createFieldTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // source1: [5, 6, 7, 8, 9]
      // source2: [0, 1, 2, 3, 4]
      // min: [0, 1, 2, 3, 4]
      // @ts-ignore
      expect(output.meta?.values).toEqual([0, 1, 2, 3, 4]);
    }
  });
});

// =============================================================================
// Mixed Bus Tests (Signal + Field in same patch)
// =============================================================================

describe('Mixed Signal and Field Buses', () => {
  it('compiles patch with both Signal and Field buses', () => {
    // This is the common case: phaseA (signal) drives timing,
    // while positions (field) vary per element

    const registry: BlockRegistry = {
      ...createFieldTestRegistry(),
      // Add a signal source for phase
      PhaseSource: {
        type: 'PhaseSource',
        inputs: [],
        outputs: [{ name: 'phase', type: { kind: 'Signal:number' }, required: true }],
        compile: () => ({
          phase: { kind: 'Signal:number', value: (t: number) => (t / 1000) % 1 },
        }),
      },
    };

    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['phaseSource', { id: 'phaseSource', type: 'PhaseSource', params: {} }],
      ['fieldSource', { id: 'fieldSource', type: 'FieldNumberSource', params: { value: 10 } }],
      ['sink1', { id: 'sink1', type: 'FieldSink', params: {} }],
    ]);

    const phaseBus: Bus = {
      id: 'phaseA',
      name: 'Phase A',
      type: { world: 'signal', domain: 'phase', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const positionBus: Bus = {
      id: 'positions',
      name: 'Positions',
      type: { world: 'field', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'phaseA', from: { blockId: 'phaseSource', slotId: 'phase', dir: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'positions', from: { blockId: 'fieldSource', slotId: 'field', dir: 'output' }, enabled: true, sortKey: 0 },
    ];

    const listeners: Listener[] = [
      // Sink listens to positions field bus
      { id: 'list1', busId: 'positions', to: { blockId: 'sink1', slotId: 'field', dir: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', port: 'program' },
      blocks,
      connections: [],
      buses: [phaseBus, positionBus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, registry, 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();

    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.values).toEqual([10, 11, 12, 13, 14]);
    }
  });
});
