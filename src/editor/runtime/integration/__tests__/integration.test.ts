/**
 * @file Integration Tests - Type Adapter + SignalBridge
 * @description
 * These tests demonstrate that the type adapter and signal bridge work together
 * to enable field materialization with broadcast nodes.
 *
 * This is a simplified integration test for Sprint 1. Full CompilerRuntime
 * integration with the 8-pass compiler will be completed in Sprint 2.
 */

import { describe, it, expect, beforeEach } from "vitest";
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
import type { TypeDesc as CompilerTypeDesc } from "../../../compiler/ir/types";
import { asTypeDesc } from "../../../compiler/ir/types";
=======
<<<<<<< HEAD
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
import type { TypeDesc } from as CompilerTypeDesc } from "../../../compiler/ir/types";;
import { asTypeDesc } from
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
import type { TypeDesc as CompilerTypeDesc } from "../../../compiler/ir/types";
import { asTypeDesc } from "../../../compiler/ir/types";
=======
<<<<<<< HEAD
<<<<<<< HEAD
import type { TypeDesc } from as CompilerTypeDesc } from "../../../compiler/ir/types";;
import { asTypeDesc } from
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> b2e904e (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
import type { TypeDesc } from as CompilerTypeDesc } from "../../../compiler/ir/types";;
import { asTypeDesc } from
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> df0d5fe (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> aabe157 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> c8569eb (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> ab90c94 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
=======
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
>>>>>>> f5d7ece (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> cbecc82 (fix(types): Complete TypeDesc contract migration for production code)
<<<<<<< HEAD
>>>>>>> 94bb084 (fix(types): Complete TypeDesc contract migration for production code)
=======
=======
=======
import type { TypeDesc as CompilerTypeDesc , asTypeDesc} from "../../../compiler/ir/types";
>>>>>>> 64db43c (fix(types): Complete TypeDesc contract migration for production code)
=======
import type { TypeDesc } from as CompilerTypeDesc } from "../../../compiler/ir/types";;
import { asTypeDesc } from
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6bf4024 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> f986fdc (feat(types): Migrate 90% of TypeDesc literals to new contract)
import {
  compilerToRuntimeType,
  canBroadcastToField,
} from "../typeAdapter";
import { SignalBridge } from "../SignalBridge";
import { materialize, type MaterializerEnv } from "../../field/Materializer";
import { FieldBufferPool } from "../../field/BufferPool";
import { createFieldHandleCache } from "../../field/FieldHandle";
import type {
  FieldExprIR,
  FieldHandle,
  FieldEnv,
  SigExprId,
  SlotHandles,
} from "../../field/types";
import { numberType } from "../../field/types";

// Helper to create valid CompilerTypeDesc from partial spec
function makeType(world: CompilerTypeDesc["world"], domain: CompilerTypeDesc["domain"], extras?: Partial<CompilerTypeDesc>): CompilerTypeDesc {
  return asTypeDesc({ world, domain, ...extras });
}

describe("Integration: Type Adapter + SignalBridge", () => {
  let bridge: SignalBridge;
  let pool: FieldBufferPool;

  beforeEach(() => {
    bridge = new SignalBridge();
    pool = new FieldBufferPool();
  });

  describe("Type conversion for field materialization", () => {
    it("should convert compiler field type to runtime type", () => {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      const compilerType = makeType("field", "float");
=======
      const compilerType: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compilerType: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compilerType = makeType("field", "float");
=======
      const compilerType: CompilerTypeDesc = { world: "field", domain: "float", category: "core", busEligible: true };
<<<<<<< HEAD
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)

      const runtimeType = compilerToRuntimeType(compilerType);

      expect(runtimeType).toEqual({ kind: "number" });
    });

    it("should convert compiler signal type for broadcast", () => {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      const compilerType = makeType("signal", "float");
=======
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compilerType = makeType("signal", "float");
=======
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
<<<<<<< HEAD
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)

      expect(canBroadcastToField(compilerType)).toBe(true);

      const runtimeType = compilerToRuntimeType(compilerType);
      expect(runtimeType).toEqual({ kind: "number" });
    });

    it("should convert vec2 types for position fields", () => {
      const compilerType = makeType("field", "vec2", { semantics: "point" });

      const runtimeType = compilerToRuntimeType(compilerType);

      expect(runtimeType).toEqual({ kind: "vec2" });
    });

    it("should convert color types for fill fields", () => {
      const compilerType = makeType("signal", "color");

      expect(canBroadcastToField(compilerType)).toBe(true);

      const runtimeType = compilerToRuntimeType(compilerType);
      expect(runtimeType).toEqual({ kind: "color" });
    });
  });

  describe("Signal bridge for broadcast field materialization", () => {
    it("should evaluate broadcast field using signal bridge", () => {
      // Register a signal closure
      const sigId: SigExprId = 1;
      bridge.registerSignal(sigId, (t) => t / 1000); // Linear signal: t/1000

      // Create a broadcast field handle
      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId,
        domainId: 0,
        type: numberType,
      };

      // Create field IR nodes (use 'sampleSignal' kind)
      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: sigId,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: 2000, // 2 seconds
          signalBridge: bridge,
        },
        sigNodes: [],
        constants: {
          get: () => 0,
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 5, // 5 elements
      };

      // Materialize the field
      const buffer = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "test-broadcast",
        },
        env
      ) as Float32Array;

      // All elements should have the same value (signal value = 2000/1000 = 2)
      expect(buffer.length).toBe(5);
      expect(buffer[0]).toBe(2);
      expect(buffer[1]).toBe(2);
      expect(buffer[2]).toBe(2);
      expect(buffer[3]).toBe(2);
      expect(buffer[4]).toBe(2);
    });

    it("should support time-varying signals in broadcast", () => {
      const sigId: SigExprId = 2;
      bridge.registerSignal(sigId, (t) => Math.sin(t / 1000));

      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId,
        domainId: 0,
        type: numberType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: sigId,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: Math.PI * 500, // sin(π/2) = 1
          signalBridge: bridge,
        },
        sigNodes: [],
        constants: {
          get: () => 0,
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 3,
      };

      const buffer = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "test-sin",
        },
        env
      ) as Float32Array;

      expect(buffer.length).toBe(3);
      expect(buffer[0]).toBeCloseTo(1, 10);
      expect(buffer[1]).toBeCloseTo(1, 10);
      expect(buffer[2]).toBeCloseTo(1, 10);
    });

    it("should support multiple signals in same frame", () => {
      // Register two signals
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(2, (t) => t * 2);

      const handle1: FieldHandle = {
        kind: "Broadcast",
        sigId: 1,
        domainId: 0,
        type: numberType,
      };

      const handle2: FieldHandle = {
        kind: "Broadcast",
        sigId: 2,
        domainId: 0,
        type: numberType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: 1,
          domainId: 0,
          type: numberType,
        },
        {
          kind: "sampleSignal",
          signalSlot: 2,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const createEnv = (fieldId: number, _sigId: number): MaterializerEnv => ({
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => (fieldId === 0 ? handle1 : handle2),
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: 100,
          signalBridge: bridge,
        },
        sigNodes: [],
        constants: {
          get: () => 0,
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 2,
      });

      // Materialize first field
      const buffer1 = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "sig1",
        },
        createEnv(0, 1)
      ) as Float32Array;

      // Materialize second field
      const buffer2 = materialize(
        {
          fieldId: 1,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "sig2",
        },
        createEnv(1, 2)
      ) as Float32Array;

      expect(buffer1[0]).toBe(100);
      expect(buffer2[0]).toBe(200);
    });
  });

  describe("End-to-end: Compiler type → Runtime materialization", () => {
    it("should materialize a field with compiler-converted type", () => {
      // Start with compiler type
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      const compilerType = makeType("signal", "float");
=======
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
      const compilerType = makeType("signal", "float");
=======
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "float", category: "core", busEligible: true };
<<<<<<< HEAD
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)

      // Convert to runtime type
      const runtimeType = compilerToRuntimeType(compilerType);
      expect(runtimeType.kind).toBe("number");

      // Register signal in bridge
      const sigId: SigExprId = 10;
      bridge.registerSignal(sigId, () => 42);

      // Create field handle with runtime type
      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId,
        domainId: 0,
        type: runtimeType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: sigId,
          domainId: 0,
          type: runtimeType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: 0,
          signalBridge: bridge,
        },
        sigNodes: [],
        constants: {
          get: () => 0,
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 10,
      };

      // Materialize
      const buffer = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "compiler-type-test",
        },
        env
      ) as Float32Array;

      // Verify output
      expect(buffer.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(buffer[i]).toBe(42);
      }
    });

    it("should handle type conversion errors gracefully", () => {
      const unsupportedType = makeType("scalar", "float");

      expect(() => compilerToRuntimeType(unsupportedType)).toThrow();
    });
  });

  describe("Buffer pooling integration", () => {
    it("should reuse buffers across materializations", () => {
      const sigId: SigExprId = 20;
      bridge.registerSignal(sigId, () => 123);

      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId,
        domainId: 0,
        type: numberType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: sigId,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: 0,
          signalBridge: bridge,
        },
        sigNodes: [],
        constants: {
          get: () => 0,
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 5,
      };

      // First materialization
      const buffer1 = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "pooling-test",
        },
        env
      );

      // Release back to pool
      pool.releaseAll();
      env.cache.clear();

      // Second materialization (should reuse buffer)
      const buffer2 = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "pooling-test",
        },
        env
      );

      // Same buffer reused
      expect(buffer1).toBe(buffer2);
    });
  });
});

// =============================================================================
// Phase 4: SignalExpr IR Evaluator Integration Tests
// =============================================================================

import { createSigEnv, createSigFrameCache, createConstPool } from "../../signal-expr";
import type { SignalExprIR } from "../../../compiler/ir/signalExpr";
import { OpCode } from "../../../compiler/ir/opcodes";

describe("Integration: Phase 4 SigEvaluator via Materializer", () => {
  let pool: FieldBufferPool;

  beforeEach(() => {
    pool = new FieldBufferPool();
  });

  describe("IR-based signal evaluation", () => {
    it("should evaluate constant signal via SigEvaluator", () => {
      // Create SignalExprIR nodes
      const sigNodes: SignalExprIR[] = [
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        { kind: "const", type: makeType("signal", "float"), constId: 0 },
=======
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        { kind: "const", type: makeType("signal", "float"), constId: 0 },
=======
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
<<<<<<< HEAD
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ];

      // Create proper SigEnv for IR evaluation
      const constPool = createConstPool([42]);
      const cache = createSigFrameCache(10);
      const irEnv = createSigEnv({
        tAbsMs: 1000,
        constPool,
        cache,
      });

      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId: 0,
        domainId: 0,
        type: numberType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: 0,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: 1000,
          // Phase 4: Provide IR evaluation context
          irEnv,
          irNodes: sigNodes,
        },
        sigNodes: [],
        constants: {
          get: (id: number) => constPool.numbers[id],
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 3,
      };

      // Materialize using IR evaluation
      const buffer = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "ir-const-test",
        },
        env
      ) as Float32Array;

      // All elements should have the constant value
      expect(buffer.length).toBe(3);
      expect(buffer[0]).toBe(42);
      expect(buffer[1]).toBe(42);
      expect(buffer[2]).toBe(42);
    });

    it("should evaluate sin(t) signal via SigEvaluator", () => {
      // Create SignalExprIR nodes: sin(t / 1000)
      const sigNodes: SignalExprIR[] = [
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
        { kind: "timeAbsMs", type: makeType("signal", "float") },
        { kind: "const", type: makeType("signal", "float"), constId: 0 },
        {
          kind: "zip",
          type: makeType("signal", "float"),
=======
        { kind: "timeAbsMs", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
        {
          kind: "zip",
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        { kind: "timeAbsMs", type: { world: "signal", domain: "float", category: "core", busEligible: true } },
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
        {
          kind: "zip",
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)
          a: 0,
          b: 1,
          fn: { kind: "opcode", opcode: OpCode.Div },
        },
        {
          kind: "map",
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          type: makeType("signal", "float"),
=======
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
          type: makeType("signal", "float"),
=======
          type: { world: "signal", domain: "float", category: "core", busEligible: true },
<<<<<<< HEAD
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)
          src: 2,
          fn: { kind: "opcode", opcode: OpCode.Sin },
        },
      ];

      // Create proper SigEnv for IR evaluation
      const constPool = createConstPool([1000]); // divisor
      const cache = createSigFrameCache(10);
      const time = Math.PI / 2 * 1000; // sin(π/2) = 1
      const irEnv = createSigEnv({
        tAbsMs: time,
        constPool,
        cache,
      });

      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId: 3, // The sin node
        domainId: 0,
        type: numberType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: 3,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time,
          irEnv,
          irNodes: sigNodes,
        },
        sigNodes: [],
        constants: {
          get: (id: number) => constPool.numbers[id],
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 2,
      };

      // Materialize using IR evaluation
      const buffer = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "ir-sin-test",
        },
        env
      ) as Float32Array;

      // All elements should have sin(π/2) ≈ 1
      expect(buffer.length).toBe(2);
      expect(buffer[0]).toBeCloseTo(1, 5);
      expect(buffer[1]).toBeCloseTo(1, 5);
    });

    it("should prefer IR evaluation over SignalBridge when both available", () => {
      // Create a simple constant node
      const sigNodes: SignalExprIR[] = [
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        { kind: "const", type: makeType("signal", "float"), constId: 0 },
=======
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
        { kind: "const", type: makeType("signal", "float"), constId: 0 },
=======
        { kind: "const", type: { world: "signal", domain: "float", category: "core", busEligible: true }, constId: 0 },
<<<<<<< HEAD
>>>>>>> 8eb3ea5 (feat(types): Migrate 90% of TypeDesc literals to new contract)
<<<<<<< HEAD
>>>>>>> 5161973 (feat(types): Migrate 90% of TypeDesc literals to new contract)
=======
=======
>>>>>>> f5b0eb1 (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 6d6c78f (feat(types): Migrate 90% of TypeDesc literals to new contract)
>>>>>>> 9d8b52e (feat(types): Migrate 90% of TypeDesc literals to new contract)
      ];

      // IR says value is 100
      const constPool = createConstPool([100]);
      const cache = createSigFrameCache(10);
      const irEnv = createSigEnv({
        tAbsMs: 0,
        constPool,
        cache,
      });

      // SignalBridge says value is 999 (should NOT be used)
      const bridge = new SignalBridge();
      bridge.registerSignal(0, () => 999);

      const handle: FieldHandle = {
        kind: "Broadcast",
        sigId: 0,
        domainId: 0,
        type: numberType,
      };

      const fieldNodes: FieldExprIR[] = [
        {
          kind: "sampleSignal",
          signalSlot: 0,
          domainId: 0,
          type: numberType,
        },
      ];

      const fieldCache = createFieldHandleCache();

      const env: MaterializerEnv = {
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
           
          slotHandles: {
            read: (_slot: unknown): FieldHandle => handle,
          } satisfies SlotHandles,
        } as FieldEnv,
        fieldNodes,
        sigEnv: {
          time: 0,
          // Both available - IR should be preferred
          irEnv,
          irNodes: sigNodes,
          signalBridge: bridge,
        },
        sigNodes: [],
        constants: {
          get: (id: number) => constPool.numbers[id],
        },
        sources: {
          get: () => undefined,
        },
        getDomainCount: () => 1,
      };

      const buffer = materialize(
        {
          fieldId: 0,
          domainId: 0,
          format: "f32",
          layout: "scalar",
          usageTag: "ir-preferred-test",
        },
        env
      ) as Float32Array;

      // IR value (100) should be used, not SignalBridge value (999)
      expect(buffer[0]).toBe(100);
    });
  });
});
