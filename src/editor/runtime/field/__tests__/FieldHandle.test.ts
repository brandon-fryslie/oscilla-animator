/**
 * @file FieldHandle Tests
 * @description Tests for field handle evaluation (NOT materialization)
 */

import { describe, it, expect } from 'vitest';
import { evalFieldHandle, createFieldHandleCache, advanceFrameCache } from '../FieldHandle';
import type {
  FieldExprIR,
  FieldEnv,
  SlotHandles,
  FieldHandle,
  InputSlot,
} from '../types';
import { numberType, vec2Type } from '../types';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test field environment
 */
function createTestFieldEnv(): FieldEnv {
  const cache = createFieldHandleCache();

  const slotHandles: SlotHandles = {
    read(_slot: InputSlot): FieldHandle {
      // Simple stub for tests
      return { kind: 'Const', constId: 0, type: numberType };
    },
  };

  return {
    slotHandles,
    cache,
    domainId: 0,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('FieldHandle', () => {
  it('creates const handle', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 42 },
    ];
    const env = createTestFieldEnv();

    const handle = evalFieldHandle(0, env, nodes);

    expect(handle.kind).toBe('Const');
    if (handle.kind === 'Const') {
      expect(handle.constId).toBe(42);
      expect(handle.type).toEqual(numberType);
    }
  });

  it('creates op handle for map operation', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
      { kind: 'map', type: numberType, fn: { opcode: 'negate' }, src: 0 },
    ];
    const env = createTestFieldEnv();

    const handle = evalFieldHandle(1, env, nodes);

    expect(handle.kind).toBe('Op');
    if (handle.kind === 'Op') {
      expect(handle.op).toBe('negate');
      expect(handle.args).toEqual([0]);
      expect(handle.type).toEqual(numberType);
    }
  });

  it('creates zip handle without materializing', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
      { kind: 'const', type: numberType, constId: 1 },
      { kind: 'zip', type: numberType, a: 0, b: 1, fn: { opcode: 'Add' } },
    ];
    const env = createTestFieldEnv();

    const handle = evalFieldHandle(2, env, nodes);

    // Handle should be created WITHOUT materializing the inputs
    expect(handle.kind).toBe('Zip');
    if (handle.kind === 'Zip') {
      expect(handle.op).toBe('Add');
      expect(handle.a).toBe(0);
      expect(handle.b).toBe(1);
      expect(handle.type).toEqual(numberType);
    }
  });

  it('creates broadcast handle for signal sampling', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'sampleSignal', type: numberType, signalSlot: 5, domainId: 0 },
    ];
    const env = createTestFieldEnv();

    const handle = evalFieldHandle(0, env, nodes);

    expect(handle.kind).toBe('Broadcast');
    if (handle.kind === 'Broadcast') {
      expect(handle.sigId).toBe(5);
      expect(handle.domainId).toBe(0);
      expect(handle.type).toEqual(numberType);
    }
  });

  it('creates combine handle for bus combine', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
      { kind: 'const', type: numberType, constId: 1 },
      {
        kind: 'busCombine',
        type: numberType,
        combine: { mode: 'sum' },
        terms: [0, 1],
      },
    ];
    const env = createTestFieldEnv();

    const handle = evalFieldHandle(2, env, nodes);

    expect(handle.kind).toBe('Combine');
    if (handle.kind === 'Combine') {
      expect(handle.mode).toBe('sum');
      expect(handle.terms).toEqual([0, 1]);
      expect(handle.type).toEqual(numberType);
    }
  });

  it('creates source handle', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'source', type: vec2Type, sourceTag: 'positions', domainId: 0 },
    ];
    const env = createTestFieldEnv();

    const handle = evalFieldHandle(0, env, nodes);

    expect(handle.kind).toBe('Source');
    if (handle.kind === 'Source') {
      expect(handle.sourceTag).toBe('positions');
      expect(handle.domainId).toBe(0);
      expect(handle.type).toEqual(vec2Type);
    }
  });

  it('returns same handle instance on cache hit', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 42 },
    ];
    const env = createTestFieldEnv();

    const handle1 = evalFieldHandle(0, env, nodes);
    const handle2 = evalFieldHandle(0, env, nodes);

    // Same frame, same field ID -> same handle instance
    expect(handle1).toBe(handle2);
  });

  it('returns new handle on cache miss (new frame)', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 42 },
    ];
    const env = createTestFieldEnv();

    const handle1 = evalFieldHandle(0, env, nodes);

    // Advance to next frame
    advanceFrameCache(env.cache);

    const handle2 = evalFieldHandle(0, env, nodes);

    // Different frame -> cache miss -> new handle instance
    expect(handle1).not.toBe(handle2);

    // But handles should be equivalent
    expect(handle1).toEqual(handle2);
  });

  it('throws on unknown field kind', () => {
    const nodes = [
      { kind: 'unknown' } as unknown as FieldExprIR,
    ];
    const env = createTestFieldEnv();

    expect(() => evalFieldHandle(0, env, nodes)).toThrow('Unknown field kind');
  });

  it('throws on unknown operation opcode', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
      { kind: 'map', type: numberType, fn: { opcode: 'unknown' }, src: 0 },
    ];
    const env = createTestFieldEnv();

    expect(() => evalFieldHandle(1, env, nodes)).toThrow('Unknown field operation');
  });

  it('throws on unknown zip opcode', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
      { kind: 'const', type: numberType, constId: 1 },
      { kind: 'zip', type: numberType, a: 0, b: 1, fn: { opcode: 'unknown' } },
    ];
    const env = createTestFieldEnv();

    expect(() => evalFieldHandle(2, env, nodes)).toThrow('Unknown field zip operation');
  });
});
