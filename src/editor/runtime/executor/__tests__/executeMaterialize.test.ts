/**
 * executeMaterialize Tests
 *
 * Tests for the executeMaterialize step executor.
 *
 * References:
 * - .agent_planning/scheduled-runtime/DOD-2025-12-26-092613.md §Deliverable 3
 */

import { describe, it, expect, beforeEach } from "vitest";
import { executeMaterialize } from "../steps/executeMaterialize";
import type { BufferHandle } from "../steps/executeMaterialize";
import { createRuntimeState } from "../RuntimeState";
import type { RuntimeState } from "../RuntimeState";
import type {
  StepMaterialize,
  CompiledProgramIR,
} from "../../../compiler/ir";

// Default effective time for tests
const defaultTime = { tAbsMs: 1000, tModelMs: 1000, phase01: 0.5 };

/**
 * Helper to create a minimal test program IR.
 * Only includes the fields needed by executeMaterialize.
 */
function createMinimalProgram(step: StepMaterialize): CompiledProgramIR {
  return {
    schedule: { steps: [step] },
    // Minimal field expression table - single const node
    fields: {
      nodes: [
        {
          kind: "const",
          type: { world: "field", domain: "float", channels: 1 },
          constId: 0,
        },
      ],
    },
    // Minimal signal expression table
    signalTable: {
      nodes: [],
    },
    // Minimal constant pool
    constants: {
      json: [42], // const value for field node
    },
  } as unknown as CompiledProgramIR;
}

describe("executeMaterialize", () => {
  let runtime: RuntimeState;
  let program: CompiledProgramIR;
  let step: StepMaterialize;

  beforeEach(() => {
    step = {
      id: "mat-1",
      kind: "materialize",
      deps: [],
      materialization: {
        id: "mat-1",
        fieldExprId: "0",
        domainSlot: 0,
        outBufferSlot: 1,
        format: { components: 1, elementType: "f32" },
        policy: "perFrame",
      },
    };

    program = createMinimalProgram(step);
    runtime = createRuntimeState(program);
  });

  describe("domain count validation", () => {
    it("throws when domain count is 0", () => {
      runtime.values.write(0, 0);

      expect(() => {
        executeMaterialize(step, program, runtime, defaultTime);
      }).toThrow("Invalid domain count 0");
    });

    it("throws when domain count is negative", () => {
      runtime.values.write(0, -10);

      expect(() => {
        executeMaterialize(step, program, runtime, defaultTime);
      }).toThrow("Invalid domain count -10");
    });

    it("accepts positive domain counts", () => {
      runtime.values.write(0, 100);

      expect(() => {
        executeMaterialize(step, program, runtime, defaultTime);
      }).not.toThrow();
    });
  });

  describe("buffer allocation", () => {
    it("creates buffer with correct element count for scalar format", () => {
      runtime.values.write(0, 50);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.kind).toBe("buffer");
      expect(handle.data.byteLength).toBe(50 * 4); // 50 f32 elements
    });

    it("creates buffer with correct element count for vec2 format", () => {
      step.materialization.format = { components: 2, elementType: "f32" };
      runtime.values.write(0, 25);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data.byteLength).toBe(25 * 2 * 4); // 25 vec2f32 elements
    });

    it("creates buffer with correct element count for vec4 format", () => {
      step.materialization.format = { components: 4, elementType: "f32" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data.byteLength).toBe(10 * 4 * 4); // 10 vec4f32 elements
    });
  });

  describe("buffer format", () => {
    it("creates Float32Array for f32 format", () => {
      step.materialization.format = { components: 1, elementType: "f32" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data).toBeInstanceOf(Float32Array);
    });

    it("creates Float64Array for f64 format", () => {
      step.materialization.format = { components: 1, elementType: "f64" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data).toBeInstanceOf(Float64Array);
    });

    it("creates Int32Array for i32 format", () => {
      step.materialization.format = { components: 1, elementType: "i32" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data).toBeInstanceOf(Int32Array);
    });

    it("creates Uint32Array for u32 format", () => {
      step.materialization.format = { components: 1, elementType: "u32" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data).toBeInstanceOf(Uint32Array);
    });

    it("creates Uint8Array for u8 format", () => {
      step.materialization.format = { components: 1, elementType: "u8" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data).toBeInstanceOf(Uint8Array);
    });
  });

  describe("buffer pool caching", () => {
    it("returns cached buffer for same field+domain+format within frame", () => {
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);
      const handle1 = runtime.values.read(1) as BufferHandle;

      // Clear the output slot to allow re-write
      runtime.values.clear();
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);
      const handle2 = runtime.values.read(1) as BufferHandle;

      // Same buffer instance should be returned (cached)
      expect(handle1.data).toBe(handle2.data);
    });

    it("returns fresh buffer after newFrame", () => {
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);
      const handle1 = runtime.values.read(1) as BufferHandle;

      // Start new frame
      runtime.frameCache.newFrame();
      runtime.values.clear();
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);
      const handle2 = runtime.values.read(1) as BufferHandle;

      // Different buffer instance after newFrame (cache was cleared)
      expect(handle1.data).not.toBe(handle2.data);
    });

    it("returns different buffers for different formats", () => {
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);
      const handle1 = runtime.values.read(1) as BufferHandle;

      // Change format
      step.materialization.format = { components: 2, elementType: "f32" };
      runtime.values.clear();
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);
      const handle2 = runtime.values.read(1) as BufferHandle;

      // Different buffers for different formats
      expect(handle1.data).not.toBe(handle2.data);
    });
  });

  describe("buffer handle output", () => {
    it("writes buffer handle with correct kind", () => {
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.kind).toBe("buffer");
    });

    it("writes buffer handle with format metadata", () => {
      step.materialization.format = { components: 2, elementType: "f64" };
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.format.components).toBe(2);
      expect(handle.format.elementType).toBe("f64");
    });

    it("writes to correct output slot", () => {
      step.materialization.outBufferSlot = 5;
      // Rebuild program and runtime with updated step
      program = createMinimalProgram(step);
      runtime = createRuntimeState(program);
      runtime.values.write(0, 10);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(5) as BufferHandle;
      expect(handle).toBeDefined();
      expect(handle.kind).toBe("buffer");
    });
  });

  describe("various domain sizes", () => {
    it("handles small domain (N=1)", () => {
      runtime.values.write(0, 1);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data.byteLength).toBe(4); // 1 f32
    });

    it("handles medium domain (N=100)", () => {
      runtime.values.write(0, 100);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data.byteLength).toBe(400); // 100 f32
    });

    it("handles large domain (N=10000)", () => {
      runtime.values.write(0, 10000);

      executeMaterialize(step, program, runtime, defaultTime);

      const handle = runtime.values.read(1) as BufferHandle;
      expect(handle.data.byteLength).toBe(40000); // 10000 f32
    });
  });
});
