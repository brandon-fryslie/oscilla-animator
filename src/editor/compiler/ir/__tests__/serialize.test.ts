/**
 * IR Serialization Tests
 *
 * Tests for serializeProgram/deserializeProgram functions.
 */

import { describe, it, expect } from 'vitest';
import type { CompiledProgramIR } from '../program';
import {
  serializeProgram,
  deserializeProgram,
  serializeProgramToJSON,
  deserializeProgramFromJSON,
} from '../serialize';

describe('IR Serialization', () => {
  // Minimal test program
  const createTestProgram = (): CompiledProgramIR => ({
    irVersion: 1,
    patchId: 'test-patch',
    patchRevision: 1,
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
    nodes: {
      nodes: [],
    },
    buses: {
      buses: [],
    },
    lenses: {
      lenses: [],
    },
    adapters: {
      adapters: [],
    },
    fields: {
      nodes: [],
    },
    constants: {
      json: [null, true, 'test', 42],
      f64: new Float64Array([1.1, 2.2, 3.3]),
      f32: new Float32Array([4.4, 5.5, 6.6]),
      i32: new Int32Array([7, 8, 9]),
      constIndex: [
        { k: 'json', idx: 0 },
        { k: 'f64', idx: 0 },
        { k: 'f32', idx: 0 },
        { k: 'i32', idx: 0 },
      ],
    },
    stateLayout: {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    },
    schedule: {
      steps: [],
      stepIdToIndex: {},
      deps: {
        slotProducerStep: {},
        slotConsumers: {},
        busDependsOnSlots: {},
        busProvidesSlot: {},
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
    meta: {
      sourceMap: {},
      names: {
        nodes: {},
        buses: {},
        steps: {},
      },
    },
  });

  describe('serializeProgram', () => {
    it('should serialize program to JSON-compatible object', () => {
      const program = createTestProgram();
      const serialized = serializeProgram(program);

      // Check structure
      expect(serialized.irVersion).toBe(1);
      expect(serialized.patchId).toBe('test-patch');
      expect(serialized.seed).toBe(12345);

      // Check typed arrays are converted to regular arrays
      expect(Array.isArray(serialized.constants.f64)).toBe(true);
      expect(Array.isArray(serialized.constants.f32)).toBe(true);
      expect(Array.isArray(serialized.constants.i32)).toBe(true);

      // Check values are preserved (f64 is exact, f32 has precision loss)
      expect(serialized.constants.f64).toEqual([1.1, 2.2, 3.3]);
      expect(serialized.constants.f32.length).toBe(3);
      // Float32 precision is different, just check length
      expect(serialized.constants.i32).toEqual([7, 8, 9]);
    });

    it('should preserve all fields', () => {
      const program = createTestProgram();
      const serialized = serializeProgram(program);

      expect(serialized.timeModel).toEqual(program.timeModel);
      expect(serialized.types).toEqual(program.types);
      expect(serialized.nodes).toEqual(program.nodes);
      expect(serialized.buses).toEqual(program.buses);
      expect(serialized.schedule).toEqual(program.schedule);
      expect(serialized.meta).toEqual(program.meta);
    });
  });

  describe('deserializeProgram', () => {
    it('should deserialize to CompiledProgramIR', () => {
      const program = createTestProgram();
      const serialized = serializeProgram(program);
      const deserialized = deserializeProgram(serialized);

      // Check structure
      expect(deserialized.irVersion).toBe(1);
      expect(deserialized.patchId).toBe('test-patch');
      expect(deserialized.seed).toBe(12345);

      // Check typed arrays are restored
      expect(deserialized.constants.f64).toBeInstanceOf(Float64Array);
      expect(deserialized.constants.f32).toBeInstanceOf(Float32Array);
      expect(deserialized.constants.i32).toBeInstanceOf(Int32Array);

      // Check values are preserved
      expect(Array.from(deserialized.constants.f64)).toEqual([1.1, 2.2, 3.3]);
      // Float32 has precision loss, but round-trip is consistent
      expect(deserialized.constants.f32.length).toBe(3);
      expect(Array.from(deserialized.constants.i32)).toEqual([7, 8, 9]);
    });

    it('should round-trip serialize/deserialize correctly', () => {
      const program = createTestProgram();
      const serialized = serializeProgram(program);
      const deserialized = deserializeProgram(serialized);

      // Check all fields match
      expect(deserialized.irVersion).toBe(program.irVersion);
      expect(deserialized.patchId).toBe(program.patchId);
      expect(deserialized.seed).toBe(program.seed);
      expect(deserialized.timeModel).toEqual(program.timeModel);
      expect(deserialized.types).toEqual(program.types);
      expect(deserialized.nodes).toEqual(program.nodes);
      expect(deserialized.constants.json).toEqual(program.constants.json);
    });
  });

  describe('serializeProgramToJSON', () => {
    it('should serialize to JSON string', () => {
      const program = createTestProgram();
      const json = serializeProgramToJSON(program);

      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(0);

      // Should be valid JSON
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should support pretty printing', () => {
      const program = createTestProgram();
      const compact = serializeProgramToJSON(program, false);
      const pretty = serializeProgramToJSON(program, true);

      // Pretty version should be longer (includes whitespace)
      expect(pretty.length).toBeGreaterThan(compact.length);

      // Both should be valid JSON
      expect(() => JSON.parse(compact)).not.toThrow();
      expect(() => JSON.parse(pretty)).not.toThrow();

      // Both should deserialize to same program
      const fromCompact = deserializeProgramFromJSON(compact);
      const fromPretty = deserializeProgramFromJSON(pretty);
      expect(fromCompact.seed).toBe(fromPretty.seed);
    });
  });

  describe('deserializeProgramFromJSON', () => {
    it('should deserialize from JSON string', () => {
      const program = createTestProgram();
      const json = serializeProgramToJSON(program);
      const deserialized = deserializeProgramFromJSON(json);

      expect(deserialized.irVersion).toBe(program.irVersion);
      expect(deserialized.patchId).toBe(program.patchId);
      expect(deserialized.seed).toBe(program.seed);
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserializeProgramFromJSON('invalid json')).toThrow();
    });
  });

  describe('Round-trip fidelity', () => {
    it('should preserve exact values through serialize/deserialize', () => {
      const program = createTestProgram();
      const json = serializeProgramToJSON(program);
      const restored = deserializeProgramFromJSON(json);

      // Check constants round-trip (values may differ due to Float32 precision)
      const originalF64 = Array.from(program.constants.f64);
      const restoredF64 = Array.from(restored.constants.f64);
      expect(restoredF64).toEqual(originalF64);

      // Float32 precision - check that values round-trip consistently
      const originalF32 = Array.from(program.constants.f32);
      const restoredF32 = Array.from(restored.constants.f32);
      expect(restoredF32).toEqual(originalF32); // Same precision loss on both sides

      const originalI32 = Array.from(program.constants.i32);
      const restoredI32 = Array.from(restored.constants.i32);
      expect(restoredI32).toEqual(originalI32);
    });
  });
});
