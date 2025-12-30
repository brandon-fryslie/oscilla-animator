/**
 * RuntimeSnapshot Tests
 *
 * Tests for runtime state snapshot capture functionality.
 */

import { describe, it, expect } from 'vitest';
import { captureRuntimeSnapshot } from '../RuntimeSnapshot';
import { createRuntimeState } from '../../runtime/executor/RuntimeState';
import type { CompiledProgramIR } from '../../compiler/ir/program';

/**
 * Create a minimal test program for snapshot testing
 */
function createTestProgram(): CompiledProgramIR {
  return {
    slotMeta: [
      {
        slot: 0,
        storage: 'f64',
        offset: 0,
        type: { world: 'signal', domain: 'float' },
      },
      {
        slot: 1,
        storage: 'f64',
        offset: 1,
        type: { world: 'signal', domain: 'phase' },
      },
      {
        slot: 2,
        storage: 'object',
        offset: 0,
        type: { world: 'field', domain: 'float' },
      },
    ],
    stateLayout: {
      cells: [
        {
          stateId: 0,
          storage: 'f64',
          offset: 0,
          size: 1,
          nodeId: 'test-node',
          role: 'accumulator',
        },
      ],
      f64Size: 1,
      f32Size: 0,
      i32Size: 0,
    },
    constants: {
      json: [],
      f64: new Float64Array([0.5]),
      f32: new Float32Array([]),
      i32: new Int32Array([]),
      constIndex: [{ k: 'f64', idx: 0 }],
    },
    schedule: {
      steps: [],
      initialSlotValues: {},
    },
  } as unknown as CompiledProgramIR;
}

describe('RuntimeSnapshot', () => {
  describe('captureRuntimeSnapshot', () => {
    it('captures runtime metadata', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      const snapshot = captureRuntimeSnapshot(runtime);

      expect(snapshot.metadata).toBeDefined();
      expect(snapshot.metadata.frameId).toBe(0); // Initial frame ID
      expect(snapshot.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
      expect(snapshot.metadata.slotCount).toBe(3); // 3 slots in test program
    });

    it('captures ValueStore slots', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      // Write some test values
      runtime.values.write(0, 1.23);
      runtime.values.write(1, 0.5);
      runtime.values.write(2, new Float32Array([1, 2, 3]));

      const snapshot = captureRuntimeSnapshot(runtime);

      expect(snapshot.valueStore.slots).toHaveLength(3);

      // Check slot 0 (f64 scalar)
      const slot0 = snapshot.valueStore.slots[0];
      expect(slot0.slot).toBe(0);
      expect(slot0.storage).toBe('f64');
      expect(slot0.type.world).toBe('signal');
      expect(slot0.type.domain).toBe('float');
      expect(slot0.value).toBe(1.23);

      // Check slot 1 (f64 phase)
      const slot1 = snapshot.valueStore.slots[1];
      expect(slot1.slot).toBe(1);
      expect(slot1.storage).toBe('f64');
      expect(slot1.type.world).toBe('signal');
      expect(slot1.type.domain).toBe('phase');
      expect(slot1.value).toBe(0.5);

      // Check slot 2 (object - Float32Array)
      const slot2 = snapshot.valueStore.slots[2];
      expect(slot2.slot).toBe(2);
      expect(slot2.storage).toBe('object');
      expect(slot2.type.world).toBe('field');
      expect(slot2.value).toBeDefined();
      expect(typeof slot2.value).toBe('object');
      expect((slot2.value as { _type: string })._type).toBe('Float32Array');
    });

    it('serializes typed arrays correctly', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      // Write a Float32Array with integer values (avoids precision issues)
      const testArray = new Float32Array([1, 2, 3, 4, 5]);
      runtime.values.write(2, testArray);

      const snapshot = captureRuntimeSnapshot(runtime);
      const slot2 = snapshot.valueStore.slots[2];
      const serialized = slot2.value as { _type: string; length: number; values: number[] };

      expect(serialized._type).toBe('Float32Array');
      expect(serialized.length).toBe(5);
      expect(serialized.values).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles large typed arrays (truncates to 100 elements)', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      // Write a large Float32Array (200 elements)
      const largeArray = new Float32Array(200).fill(1.0);
      runtime.values.write(2, largeArray);

      const snapshot = captureRuntimeSnapshot(runtime);
      const slot2 = snapshot.valueStore.slots[2];
      const serialized = slot2.value as { _type: string; length: number; values: number[] };

      expect(serialized._type).toBe('Float32Array');
      expect(serialized.length).toBe(200); // Original length preserved
      expect(serialized.values.length).toBe(100); // Truncated to 100 for performance
    });

    it('captures StateBuffer cells', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      const snapshot = captureRuntimeSnapshot(runtime);

      // StateBuffer capture is currently limited (no layout access)
      // This test verifies the structure exists
      expect(snapshot.stateBuffer).toBeDefined();
      expect(snapshot.stateBuffer.cells).toBeDefined();
      expect(Array.isArray(snapshot.stateBuffer.cells)).toBe(true);
    });

    it('produces JSON-serializable output', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      runtime.values.write(0, 1.23);
      runtime.values.write(1, 0.5);
      runtime.values.write(2, new Float32Array([1, 2, 3]));

      const snapshot = captureRuntimeSnapshot(runtime);

      // Should be able to stringify and parse without errors
      const json = JSON.stringify(snapshot);
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);

      const parsed = JSON.parse(json);
      expect(parsed.metadata.frameId).toBe(0);
      expect(parsed.valueStore.slots).toHaveLength(3);
    });

    it('handles NaN and Inf values', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      runtime.values.write(0, NaN);
      runtime.values.write(1, Infinity);

      const snapshot = captureRuntimeSnapshot(runtime);

      // NaN and Infinity are JSON-serializable (become null)
      const json = JSON.stringify(snapshot);
      expect(json).toBeDefined();
    });

    it('captures frame ID correctly', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      runtime.frameId = 42;

      const snapshot = captureRuntimeSnapshot(runtime);

      expect(snapshot.metadata.frameId).toBe(42);
    });

    it('captures multiple snapshots independently', () => {
      const program = createTestProgram();
      const runtime = createRuntimeState(program);

      // First snapshot
      runtime.values.write(0, 1.0);
      const snapshot1 = captureRuntimeSnapshot(runtime);

      // Clear for new frame
      runtime.values.clear();

      // Second snapshot with different value
      runtime.values.write(0, 2.0);
      const snapshot2 = captureRuntimeSnapshot(runtime);

      // Snapshots should be independent
      expect(snapshot1.valueStore.slots[0].value).toBe(1.0);
      expect(snapshot2.valueStore.slots[0].value).toBe(2.0);
    });
  });
});
