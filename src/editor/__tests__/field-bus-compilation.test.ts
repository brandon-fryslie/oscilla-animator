/**
 * Field Bus Compilation Tests
 *
 * Tests Field bus compilation with FieldExpr lazy evaluation.
 * This is the foundation for per-element variation through buses.
 */

import { describe, it, expect } from 'vitest';
import { compilePatch } from '../compiler/compile';
import type { CompilerPatch, BlockRegistry, CompileCtx, Seed, Field, Artifact } from '../compiler/types';
import type { Bus, Publisher, Listener } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create canonical buses required for TimeRoot auto-publication.
 * Matches the default buses from BusStore.createDefaultBuses().
 */
function createCanonicalBuses(): Bus[] {
  return [
    {
      id: 'phaseA',
      name: 'phaseA',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(primary)' },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    },
    {
      id: 'pulse',
      name: 'pulse',
      type: { world: 'event', domain: 'trigger', category: 'core', busEligible: true, semantics: 'pulse' },
      combineMode: 'last',
      defaultValue: false,
      sortKey: 0,
    },
    {
      id: 'energy',
      name: 'energy',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'energy' },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    },
  ];
}

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
    // CycleTimeRoot - required for all patches (includes all standard outputs)
    CycleTimeRoot: {
      type: 'CycleTimeRoot',
      inputs: [],
      outputs: [
        { name: 'systemTime', type: { kind: 'Signal:Time' }, required: true },
        { name: 'cycleT', type: { kind: 'Signal:Time' }, required: true },
        { name: 'phase', type: { kind: 'Signal:phase' }, required: true },
        { name: 'wrap', type: { kind: 'Event' }, required: true },
        { name: 'cycleIndex', type: { kind: 'Signal:int' }, required: true },
        { name: 'energy', type: { kind: 'Signal:float' }, required: true },
      ],
      compile: ({ params }: { params: Record<string, unknown> }) => {
        const periodMs = (params.periodMs as number) ?? 3000;
        return {
          systemTime: { kind: 'Signal:Time', value: (t: number) => t },
          cycleT: { kind: 'Signal:Time', value: (t: number) => t % periodMs },
          phase: { kind: 'Signal:phase', value: (t: number) => (t / periodMs) % 1 },
          wrap: { kind: 'Event', value: (t: number, lastT: number) => Math.floor(t / periodMs) > Math.floor(lastT / periodMs) },
          cycleIndex: { kind: 'Signal:int', value: (t: number) => Math.floor(t / periodMs) },
          energy: { kind: 'Signal:float', value: () => 1.0 },
        };
      },
    },

    // Field source - produces Field<float>
    FieldNumberSource: {
      type: 'FieldNumberSource',
      inputs: [],
      outputs: [{ name: 'field', type: { kind: 'Field:float' }, required: true }],
      compile: ({ params }: { params: Record<string, unknown> }) => {
        const baseValue = (params.value as number) ?? 0;
        // Field is bulk form: (seed, n, ctx) => readonly number[]
        const field: Field<float> = (_seed, n, _ctx) => {
        const result: float[] = [];
          for (let i = 0; i < n; i++) {
            result.push(baseValue + i); // Each element gets baseValue + index
          }
          return result;
        };
        return {
          field: { kind: 'Field:float', value: field },
        };
      },
    },

    // Field consumer - sums field values and outputs RenderTreeProgram
    FieldSink: {
      type: 'FieldSink',
      inputs: [{ name: 'field', type: { kind: 'Field:float' }, required: true }],
      outputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' }, required: true }],
      compile: ({ inputs }: { inputs: Record<string, Artifact> }) => {
        const fieldArtifact = inputs.field;
        if (fieldArtifact?.kind !== 'Field:float') {
          return {
            program: {
              kind: 'Error',
              message: `FieldSink requires Field:float input, got ${fieldArtifact?.kind}`,
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
                const ctx = createTestContext();
                const values = fieldFn(42, 5, ctx);
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
        { name: 'a', type: { kind: 'Field:float' }, required: true },
        { name: 'b', type: { kind: 'Field:float' }, required: true },
      ],
      outputs: [{ name: 'out', type: { kind: 'Field:float' }, required: true }],
      compile: ({ inputs }: { inputs: Record<string, Artifact> }) => {
        const aArtifact = inputs.a;
        const bArtifact = inputs.b;

        if (aArtifact?.kind !== 'Field:float' || bArtifact?.kind !== 'Field:float') {
          return {
            out: {
              kind: 'Error',
              message: 'FieldAdd requires two Field:float inputs',
            },
          };
        }

        const aField = aArtifact.value;
        const bField = bArtifact.value;

        // Combine fields lazily
        const combined: Field<float> = (seed, n, ctx) => {
          const aValues = aField(seed, n, ctx);
          const bValues = bField(seed, n, ctx);
          const result: float[] = [];
          for (let i = 0; i < n; i++) {
            const aVal = aValues[i];
            const bVal = bValues[i];
            // Both arrays should have valid indices since we loop from 0 to n
            if (aVal !== undefined && bVal !== undefined) {
              result.push(aVal + bVal);
            }
          }
          return result;
        };

        return {
          out: { kind: 'Field:float', value: combined },
        };
      },
    },
  };
}

// =============================================================================
// Field Bus Compilation Tests
// =============================================================================

describe('Field Bus Compilation', () => {
  it('compiles single Field<float> bus with one publisher and one listener', () => {
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'FieldNumberSource', params: { value: 10 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Test Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      {
        id: 'pub1',
        busId: 'fieldBus1',
        from: { blockId: 'source1', slotId: 'field', direction: 'output' },
        enabled: true,
        sortKey: 0,
      },
    ];

    const listeners: Listener[] = [
      {
        id: 'list1',
        busId: 'fieldBus1',
        to: { blockId: 'sink1', slotId: 'field', direction: 'input' },
        enabled: true,
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers,
      listeners,
      defaultSources: {},
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
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'FieldNumberSource', params: { value: 10 } },
      { id: 'source2', type: 'FieldNumberSource', params: { value: 100 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Sum Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers,
      listeners,
      defaultSources: {},
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
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'FieldNumberSource', params: { value: 10 } },
      { id: 'source2', type: 'FieldNumberSource', params: { value: 100 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Last Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 20 }, // Wins
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers,
      listeners,
      defaultSources: {},
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
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Empty Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 42, // Should produce constant field of 42
      sortKey: 0,
    };

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers: [],
      listeners,
      defaultSources: {},
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
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'FieldNumberSource', params: { value: 0 } },
      { id: 'source2', type: 'FieldNumberSource', params: { value: 10 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Average Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'average',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers,
      listeners,
      defaultSources: {},
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
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'FieldNumberSource', params: { value: 5 } },
      { id: 'source2', type: 'FieldNumberSource', params: { value: 0 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Max Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'max',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers,
      listeners,
      defaultSources: {},
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
    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'source1', type: 'FieldNumberSource', params: { value: 5 } },
      { id: 'source2', type: 'FieldNumberSource', params: { value: 0 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const fieldBus: Bus = {
      id: 'fieldBus1',
      name: 'Min Field Bus',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'min',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'fieldBus1', from: { blockId: 'source1', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'fieldBus1', from: { blockId: 'source2', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 1 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'fieldBus1', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), fieldBus],
      publishers,
      listeners,
      defaultSources: {},
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
        outputs: [{ name: 'phase', type: { kind: 'Signal:float' }, required: true }],
        compile: () => ({
          phase: { kind: 'Signal:float', value: (t: number) => (t / 1000) % 1 },
        }),
      },
    };

    const blocks = [
      { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } },
      { id: 'phaseSource', type: 'PhaseSource', params: {} },
      { id: 'fieldSource', type: 'FieldNumberSource', params: { value: 10 } },
      { id: 'sink1', type: 'FieldSink', params: {} },
    ];

    const phaseBus: Bus = {
      id: 'phaseA',
      name: 'Phase A',
      type: { world: 'signal', domain: 'float', category: 'core', busEligible: true, semantics: 'phase(0..1)' },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const positionBus: Bus = {
      id: 'positions',
      name: 'Positions',
      type: { world: 'field', domain: 'float', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'phaseA', from: { blockId: 'phaseSource', slotId: 'phase', direction: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub2', busId: 'positions', from: { blockId: 'fieldSource', slotId: 'field', direction: 'output' }, enabled: true, sortKey: 0 },
    ];

    const listeners: Listener[] = [
      // Sink listens to positions field bus
      { id: 'list1', busId: 'positions', to: { blockId: 'sink1', slotId: 'field', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [...createCanonicalBuses(), phaseBus, positionBus],
      publishers,
      listeners,
      defaultSources: {},
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
