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
import type { TypeDesc as CompilerTypeDesc } from "../../../compiler/ir/types";
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
} from "../../field/types";
import { numberType } from "../../field/types";

describe("Integration: Type Adapter + SignalBridge", () => {
  let bridge: SignalBridge;
  let pool: FieldBufferPool;

  beforeEach(() => {
    bridge = new SignalBridge();
    pool = new FieldBufferPool();
  });

  describe("Type conversion for field materialization", () => {
    it("should convert compiler field type to runtime type", () => {
      const compilerType: CompilerTypeDesc = { world: "field", domain: "number" };

      const runtimeType = compilerToRuntimeType(compilerType);

      expect(runtimeType).toEqual({ kind: "number" });
    });

    it("should convert compiler signal type for broadcast", () => {
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "number" };

      expect(canBroadcastToField(compilerType)).toBe(true);

      const runtimeType = compilerToRuntimeType(compilerType);
      expect(runtimeType).toEqual({ kind: "number" });
    });

    it("should convert vec2 types for position fields", () => {
      const compilerType: CompilerTypeDesc = {
        world: "field",
        domain: "vec2",
        semantics: "point",
      };

      const runtimeType = compilerToRuntimeType(compilerType);

      expect(runtimeType).toEqual({ kind: "vec2" });
    });

    it("should convert color types for fill fields", () => {
      const compilerType: CompilerTypeDesc = {
        world: "signal",
        domain: "color",
      };

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
            read: () => handle,
          } as any,
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
            read: () => handle,
          } as any,
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

      const createEnv = (fieldId: number, sigId: number): MaterializerEnv => ({
        pool,
        cache: new Map(),
        fieldEnv: {
          cache: fieldCache,
          domainId: 0,
          slotHandles: {
            read: () => (fieldId === 0 ? handle1 : handle2),
          } as any,
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
      const compilerType: CompilerTypeDesc = { world: "signal", domain: "number" };

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
            read: () => handle,
          } as any,
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
      const unsupportedType: CompilerTypeDesc = {
        world: "scalar",
        domain: "number",
      };

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
            read: () => handle,
          } as any,
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
