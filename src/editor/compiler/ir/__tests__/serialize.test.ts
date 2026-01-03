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
  // Minimal test program aligned to current CompiledProgramIR schema
  const createTestProgram = (): CompiledProgramIR => ({
    // Identity and versioning
    irVersion: 1,
    patchId: 'test-patch',
    seed: 12345,

    // Time model
    timeModel: {
      kind: 'cyclic',
      periodMs: 1000,
      mode: 'loop',
      phaseDomain: '0..1',
    },

    // Type system
    types: {
      typeIds: [],
    },

    // Execution tables
    signalExprs: {
      nodes: [],
    },
    fieldExprs: {
      nodes: [],
    },
    eventExprs: {
      nodes: [],
    },

    // Constants (JSON-only)
    constants: {
      json: [null, true, 'test', 42],
    },

    // State layout
    stateLayout: {
      cells: [],
      f64Size: 0,
      f32Size: 0,
      i32Size: 0,
    },

    // Slot metadata
    slotMeta: [],

    // Render & 3D
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

    // Schedule
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

    // Outputs
    outputs: [],

    // Debug index (mandatory)
    debugIndex: {
      stepToBlock: new Map<string, string>(),
      slotToBlock: new Map<number, string>(),
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

      // Check constants are preserved
      expect(serialized.constants.json).toEqual([null, true, 'test', 42]);

      // Check Maps are converted to objects
      expect(serialized.debugIndex.stepToBlock).toEqual({});
      expect(serialized.debugIndex.slotToBlock).toEqual({});
    });

    it('should preserve all fields', () => {
      const program = createTestProgram();
      const serialized = serializeProgram(program);

      expect(serialized.timeModel).toEqual(program.timeModel);
      expect(serialized.types).toEqual(program.types);
      expect(serialized.schedule).toEqual(program.schedule);
    });

    it('should convert debug index Maps to objects', () => {
      const program = createTestProgram();
      // Cast to mutable Map to add test data
      (program.debugIndex.stepToBlock as Map<string, string>).set('step1', 'block1');
      (program.debugIndex.slotToBlock as Map<number, string>).set(42, 'block2');

      const serialized = serializeProgram(program);

      expect(serialized.debugIndex.stepToBlock).toEqual({ step1: 'block1' });
      expect(serialized.debugIndex.slotToBlock).toEqual({ '42': 'block2' });
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

      // Check constants are preserved
      expect(deserialized.constants.json).toEqual([null, true, 'test', 42]);

      // Check objects are converted back to Maps
      expect(deserialized.debugIndex.stepToBlock).toBeInstanceOf(Map);
      expect(deserialized.debugIndex.slotToBlock).toBeInstanceOf(Map);
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
      expect(deserialized.constants.json).toEqual(program.constants.json);
    });

    it('should restore debug index Maps correctly', () => {
      const program = createTestProgram();
      // Cast to mutable Map to add test data
      (program.debugIndex.stepToBlock as Map<string, string>).set('step1', 'block1');
      (program.debugIndex.slotToBlock as Map<number, string>).set(42, 'block2');

      const serialized = serializeProgram(program);
      const deserialized = deserializeProgram(serialized);

      expect(deserialized.debugIndex.stepToBlock.get('step1')).toBe('block1');
      expect(deserialized.debugIndex.slotToBlock.get(42)).toBe('block2');
    });
  });

  describe('serializeProgramToJSON', () => {
    it('should serialize to JSON string', () => {
      const program = createTestProgram();
      const json = serializeProgramToJSON(program);

      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(0);

      // Should be valid JSON
      expect(() => { JSON.parse(json); }).not.toThrow();
    });

    it('should support pretty printing', () => {
      const program = createTestProgram();
      const compact = serializeProgramToJSON(program, false);
      const pretty = serializeProgramToJSON(program, true);

      // Pretty version should be longer (includes whitespace)
      expect(pretty.length).toBeGreaterThan(compact.length);

      // Both should be valid JSON
      expect(() => { JSON.parse(compact); }).not.toThrow();
      expect(() => { JSON.parse(pretty); }).not.toThrow();

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

      // Check constants round-trip
      expect(restored.constants.json).toEqual(program.constants.json);

      // Check all major sections round-trip
      expect(restored.timeModel).toEqual(program.timeModel);
      expect(restored.types).toEqual(program.types);
      expect(restored.schedule).toEqual(program.schedule);
      expect(restored.stateLayout).toEqual(program.stateLayout);
    });

    it('should preserve debug index through round-trip', () => {
      const program = createTestProgram();
      // Cast to mutable Map to add test data
      (program.debugIndex.stepToBlock as Map<string, string>).set('step1', 'block1');
      (program.debugIndex.stepToBlock as Map<string, string>).set('step2', 'block2');
      (program.debugIndex.slotToBlock as Map<number, string>).set(10, 'blockA');
      (program.debugIndex.slotToBlock as Map<number, string>).set(20, 'blockB');

      const json = serializeProgramToJSON(program);
      const restored = deserializeProgramFromJSON(json);

      // Check Maps are restored with correct values
      expect(restored.debugIndex.stepToBlock.size).toBe(2);
      expect(restored.debugIndex.stepToBlock.get('step1')).toBe('block1');
      expect(restored.debugIndex.stepToBlock.get('step2')).toBe('block2');

      expect(restored.debugIndex.slotToBlock.size).toBe(2);
      expect(restored.debugIndex.slotToBlock.get(10)).toBe('blockA');
      expect(restored.debugIndex.slotToBlock.get(20)).toBe('blockB');
    });
  });
});
