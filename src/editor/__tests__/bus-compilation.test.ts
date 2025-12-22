/**
 * Bus Compilation Tests (Phase 2)
 *
 * Tests Signal bus compilation, publisher ordering, combine modes,
 * and error handling per DOD-2025-12-16-consolidated.md
 */

import { describe, it, expect } from 'vitest';
import { compilePatch } from '../compiler/compile';
import type { CompilerPatch, BlockRegistry, CompileCtx, Seed } from '../compiler/types';
import type { Bus, Publisher, Listener } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a minimal compile context for testing.
 */
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
 * Create a minimal block registry with test blocks.
 */
function createTestRegistry(): BlockRegistry {
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

    // Simple number source
    NumberSource: {
      type: 'NumberSource',
      inputs: [],
      outputs: [{ name: 'value', type: { kind: 'Signal:number' }, required: true }],
      compile: ({ params }) => ({
        value: { kind: 'Signal:number', value: () => (params.value as number) ?? 0 },
      }),
    },
    // Simple number consumer (outputs RenderTreeProgram for patch output)
    NumberSink: {
      type: 'NumberSink',
      inputs: [{ name: 'input', type: { kind: 'Signal:number' }, required: true }],
      outputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' }, required: true }],
      compile: ({ inputs }) => {
        const input = inputs.input;
        if (input?.kind !== 'Signal:number') {
          return {
            program: {
              kind: 'Error',
              message: 'NumberSink requires Signal:number input',
            },
          };
        }
        return {
          program: {
            kind: 'RenderTreeProgram',
            value: {
              signal: (t: number, ctx: any) => ({
                kind: 'group',
                id: 'root',
                children: [],
                meta: { value: input.value(t, ctx) },
              }),
              event: () => [],
            },
          },
        };
      },
    },
  };
}

// =============================================================================
// Happy Path Tests
// =============================================================================

describe('Bus Compilation - Happy Path', () => {
  it('compiles single Signal<number> bus with one publisher and one listener', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'NumberSource', params: { value: 42 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Test Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      {
        id: 'pub1',
        busId: 'bus1',
        from: { blockId: 'source1', slotId: 'value', direction: 'output' },
        enabled: true,
        sortKey: 0,
      },
    ];

    const listeners: Listener[] = [
      {
        id: 'list1',
        busId: 'bus1',
        to: { blockId: 'sink1', slotId: 'input', direction: 'input' },
        enabled: true,
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [bus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();
  });

  it('returns default value when bus has no publishers', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Empty Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 99, // Should return this
      sortKey: 0,
    };

    const listeners: Listener[] = [
      {
        id: 'list1',
        busId: 'bus1',
        to: { blockId: 'sink1', slotId: 'input', direction: 'input' },
        enabled: true,
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [bus],
      publishers: [],
      listeners,
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore - accessing meta for test
      expect(output.meta?.value).toBe(99);
    }
  });

  it('combines multiple publishers with "last" mode - highest sortKey wins', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'NumberSource', params: { value: 10 } }],
      ['source2', { id: 'source2', type: 'NumberSource', params: { value: 20 } }],
      ['source3', { id: 'source3', type: 'NumberSource', params: { value: 30 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Multi Publisher Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
      { id: 'pub3', busId: 'bus1', from: { blockId: 'source3', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 30 }, // Highest - should win
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [bus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.value).toBe(30); // source3 has highest sortKey
    }
  });

  it('combines multiple publishers with "sum" mode', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'NumberSource', params: { value: 10 } }],
      ['source2', { id: 'source2', type: 'NumberSource', params: { value: 20 } }],
      ['source3', { id: 'source3', type: 'NumberSource', params: { value: 30 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Sum Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    };

    const publishers: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
      { id: 'pub3', busId: 'bus1', from: { blockId: 'source3', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 30 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [bus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.value).toBe(60); // 10 + 20 + 30
    }
  });
});

// =============================================================================
// sortKey Determinism Tests
// =============================================================================

describe('Bus Compilation - sortKey Determinism', () => {
  it('stable results with same sortKeys using id tie-breaker', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'NumberSource', params: { value: 100 } }],
      ['source2', { id: 'source2', type: 'NumberSource', params: { value: 200 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Tie Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    // Same sortKey - id tie-breaker should make pub2 win (alphabetically later)
    const publishers: Publisher[] = [
      { id: 'pub_z', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 0 },
      { id: 'pub_a', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 0 }, // Should win due to ID
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [bus],
      publishers,
      listeners,
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    if (result.program) {
      const output = result.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      expect(output.meta?.value).toBe(200); // pub2 wins via id tie-breaker
    }
  });

  it('result changes when sortKeys swap', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'NumberSource', params: { value: 100 } }],
      ['source2', { id: 'source2', type: 'NumberSource', params: { value: 200 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Test Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'last',
      defaultValue: 0,
      sortKey: 0,
    };

    // First configuration: pub1 higher sortKey
    const publishers1: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
    ];

    const listeners: Listener[] = [
      { id: 'list1', busId: 'bus1', to: { blockId: 'sink1', slotId: 'input', direction: 'input' }, enabled: true },
    ];

    const patch1: CompilerPatch = {
      blocks,
      connections: [],
      buses: [bus],
      publishers: publishers1,
      listeners,
    };

    const result1 = compilePatch(patch1, createTestRegistry(), 42 as Seed, createTestContext());
    expect(result1.ok).toBe(true);
    let value1: number | undefined;
    if (result1.program) {
      const output1 = result1.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      value1 = output1.meta?.value;
      expect(value1).toBe(100); // pub1 wins
    }

    // Second configuration: swap sortKeys
    const publishers2: Publisher[] = [
      { id: 'pub1', busId: 'bus1', from: { blockId: 'source1', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 10 },
      { id: 'pub2', busId: 'bus1', from: { blockId: 'source2', slotId: 'value', direction: 'output' }, enabled: true, sortKey: 20 },
    ];

    const patch2: CompilerPatch = {
      blocks,
      connections: [],
      buses: [bus],
      publishers: publishers2,
      listeners,
    };

    const result2 = compilePatch(patch2, createTestRegistry(), 42 as Seed, createTestContext());
    expect(result2.ok).toBe(true);
    if (result2.program) {
      const output2 = result2.program.signal(0, { viewport: { w: 800, h: 600, dpr: 1 } });
      // @ts-ignore
      const value2 = output2.meta?.value;
      expect(value2).toBe(200); // pub2 wins
      expect(value2).not.toBe(value1); // Results swapped
    }
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Bus Compilation - Error Handling', () => {
  // NOTE: Field buses are now supported - see field-bus-compilation.test.ts
  // The old "rejects Field bus" test was removed as Field buses now work.

  it('rejects unsupported combine mode for Signal bus', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
    ]);

    const bus: Bus = {
      id: 'bus1',
      name: 'Average Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'average', // Not supported for Signal buses (only Field buses)
      defaultValue: 0,
      sortKey: 0,
    };

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections: [],
      buses: [bus],
      publishers: [],
      listeners: [],
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe('UnsupportedCombineMode');
    expect(result.errors[0]?.message).toContain('average');
    expect(result.errors[0]?.message).toContain('last, sum');
  });
});

// =============================================================================
// Backward Compatibility Tests
// =============================================================================

describe('Bus Compilation - Backward Compatibility', () => {
  it('wire-only patches compile unchanged', () => {
    const blocks = new Map([
      ['timeroot', { id: 'timeroot', type: 'CycleTimeRoot', params: { periodMs: 3000 } }],
      ['source1', { id: 'source1', type: 'NumberSource', params: { value: 42 } }],
      ['sink1', { id: 'sink1', type: 'NumberSink', params: {} }],
    ]);

    const connections = [
      {
        id: 'c1',
        from: { blockId: 'source1', slotId: 'value', direction: 'output' as const },
        to: { blockId: 'sink1', slotId: 'input', direction: 'input' as const },
      },
    ];

    const patch: CompilerPatch = {
      output: { blockId: 'sink1', slotId: 'program', direction: 'output' },
      blocks,
      connections,
      // No buses - should use wire-only compiler
    };

    const result = compilePatch(patch, createTestRegistry(), 42 as Seed, createTestContext());

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.program).toBeDefined();
  });
});