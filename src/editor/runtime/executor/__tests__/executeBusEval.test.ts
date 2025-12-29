/**
 * executeBusEval Tests
 *
 * Verifies bus combine logic with silent values.
 *
 * Test Coverage:
 * - Combine modes: sum, average, min, max, last, product
 * - Silent value handling (zero, default, const)
 * - Publisher filtering
 *
 * References:
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 2
 * - src/editor/runtime/executor/steps/executeBusEval.ts
 */

import { describe, it, expect } from "vitest";
import { executeBusEval } from "../steps/executeBusEval";
import { createRuntimeState } from "../RuntimeState";
import type { StepBusEval, CompiledProgramIR } from "../../../compiler/ir";

interface TestContext {
  program: CompiledProgramIR;
  runtime: ReturnType<typeof createRuntimeState>;
}

interface Publisher {
  enabled: boolean;
  sortKey: number;
  srcSlot: number;
  publisherId: string;
}

// Helper to create test program and runtime with pre-configured slots
function createTestContext(slotCount: number = 150): TestContext {
  const program: CompiledProgramIR = {
    irVersion: 1,
    patchId: "test",
    patchRevision: 1,
    compileId: "test",
    seed: 42,
    timeModel: { kind: "infinite", windowMs: 10000 },
    types: { types: [] },
    nodes: { nodes: [] },
    buses: { buses: [] },
    lenses: { lenses: [] },
    adapters: { adapters: [] },
    fields: { exprs: [] },
    constants: {
      json: [],
      f64: new Float64Array([42, 99, 3.14]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [],
    },
    stateLayout: { cells: [], f64Size: 0, f32Size: 0, i32Size: 0 },
    schedule: {
      steps: [{
        kind: "busEval" as const,
        id: "test" as unknown as never,
        deps: [],
        busIndex: 0 as unknown as never,
        outSlot: 100,
        publishers: [],
        combine: { mode: "sum" as const },
        silent: { kind: "zero" as const },
        busType: { world: "signal", domain: "number" } as unknown as never,
      }],
      stepIdToIndex: {},
      deps: { fwdDeps: {}, revDeps: {} },
      determinism: { sortKeyRanges: {} },
      caching: { perFrame: [], untilInvalidated: [] },
    },
    outputs: { outputs: [] },
  } as unknown as CompiledProgramIR;

  // Add slots manually since we bypass extractSlotMeta
  const stepPublishers = (program.schedule.steps[0] as unknown as { publishers: Publisher[] }).publishers;
  for (let i = 0; i < slotCount; i++) {
    stepPublishers.push({
      enabled: i < 10, // First 10 enabled
      sortKey: i,
      srcSlot: i,
      publisherId: `pub${i}`,
    });
  }

  const runtime = createRuntimeState(program);
  return { program, runtime };
}

describe("executeBusEval - Combine Modes", () => {
  it("sum mode adds all publisher values", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 10);
    runtime.values.write(1, 20);
    runtime.values.write(2, 30);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: true, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "sum" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(60);
  });

  it("average mode computes mean", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 10);
    runtime.values.write(1, 20);
    runtime.values.write(2, 30);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: true, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "average" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(20);
  });

  it("min mode returns minimum", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 50);
    runtime.values.write(1, 10);
    runtime.values.write(2, 30);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: true, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "min" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(10);
  });

  it("max mode returns maximum", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 50);
    runtime.values.write(1, 10);
    runtime.values.write(2, 30);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: true, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "max" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(50);
  });

  it("last mode returns last value", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 10);
    runtime.values.write(1, 20);
    runtime.values.write(2, 30);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: true, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "last" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(30);
  });

  it("product mode multiplies values", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 2);
    runtime.values.write(1, 3);
    runtime.values.write(2, 4);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: true, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "product" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(24);
  });
});

describe("executeBusEval - Silent Values", () => {
  it("writes zero when no publishers", () => {
    const { program, runtime } = createTestContext();

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [],
      combine: { mode: "sum" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(0);
  });

  it("reads const pool for silent const", () => {
    const { program, runtime } = createTestContext();

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [],
      combine: { mode: "sum" },
      silent: { kind: "const", constId: 1 }, // 99
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(99);
  });

  it("writes silent when all disabled", () => {
    const { program, runtime } = createTestContext();

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: false, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
      ],
      combine: { mode: "sum" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(0);
  });
});

describe("executeBusEval - Publisher Filtering", () => {
  it("skips disabled publishers", () => {
    const { program, runtime } = createTestContext();

    runtime.values.write(0, 10);
    runtime.values.write(1, 20);
    runtime.values.write(2, 30);

    const step: StepBusEval = {
      kind: "busEval",
      id: "test" as unknown as never,
      deps: [],
      busIndex: 0 as unknown as never,
      outSlot: 100,
      publishers: [
        { enabled: true, sortKey: 0, srcSlot: 0, publisherId: "pub1" },
        { enabled: false, sortKey: 1, srcSlot: 1, publisherId: "pub2" },
        { enabled: true, sortKey: 2, srcSlot: 2, publisherId: "pub3" },
      ],
      combine: { mode: "sum" },
      silent: { kind: "zero" },
      busType: { world: "signal", domain: "number" } as unknown as never,
    };

    executeBusEval(step, program, runtime);
    expect(runtime.values.read(100)).toBe(40); // 10 + 30
  });
});
