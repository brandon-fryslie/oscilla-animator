/**
 * Tests for ValueRing
 */

import { describe, it, expect } from 'vitest';
import { ValueRing, DEFAULT_VALUE_CAPACITY } from '../ValueRing';
import { ValueTag, encodeScalar, encodeVec2, encodeFieldStats } from '../ValueRecord';

describe('ValueRing', () => {
  describe('Basic operations', () => {
    it('initializes with default capacity', () => {
      const ring = new ValueRing();
      expect(ring.getCapacity()).toBe(DEFAULT_VALUE_CAPACITY);
      expect(ring.size()).toBe(0);
      expect(ring.getWritePtr()).toBe(0);
    });

    it('initializes with custom capacity', () => {
      const ring = new ValueRing(500);
      expect(ring.getCapacity()).toBe(500);
    });

    it('writes a single value record', () => {
      const ring = new ValueRing(100);
      const value = encodeScalar(42.5, 0);

      const idx = ring.writeValue(value);
      expect(idx).toBe(0);
      expect(ring.size()).toBe(1);
      expect(ring.getWritePtr()).toBe(1);
    });

    it('retrieves written value correctly', () => {
      const ring = new ValueRing(100);
      const value = encodeVec2(10.5, -20.25, 2);

      const idx = ring.writeValue(value);
      const retrieved = ring.getValue(idx);

      expect(retrieved).toEqual(value);
    });
  });

  describe('Ring wrapping behavior', () => {
    it('wraps at capacity without allocations', () => {
      const capacity = 10;
      const ring = new ValueRing(capacity);

      // Write more than capacity
      for (let i = 0; i < 15; i++) {
        ring.writeValue(encodeScalar(i, 0));
      }

      expect(ring.getWritePtr()).toBe(15); // Total writes
      expect(ring.size()).toBe(capacity); // Only capacity items retained
    });

    it('overwrites oldest values when full', () => {
      const capacity = 5;
      const ring = new ValueRing(capacity);

      // Write 5 values
      for (let i = 0; i < capacity; i++) {
        ring.writeValue(encodeScalar(i, 0));
      }

      // Write 5 more (should overwrite first 5)
      for (let i = capacity; i < capacity * 2; i++) {
        ring.writeValue(encodeScalar(i, 0));
      }

      // First 5 should be overwritten (undefined)
      expect(ring.getValue(0)).toBeUndefined();
      expect(ring.getValue(4)).toBeUndefined();

      // Last 5 should be valid
      const value5 = ring.getValue(5);
      expect(value5).not.toBeUndefined();
      expect(value5!.tag).toBe(ValueTag.Number);

      const value9 = ring.getValue(9);
      expect(value9).not.toBeUndefined();
    });
  });

  describe('Query API', () => {
    it('getValuesInRange returns correct slice', () => {
      const ring = new ValueRing(100);

      // Write 10 values
      for (let i = 0; i < 10; i++) {
        ring.writeValue(encodeScalar(i * 10, i));
      }

      const slice = ring.getValuesInRange(3, 4);
      expect(slice.length).toBe(4);
      expect(slice[0].typeId).toBe(3);
      expect(slice[1].typeId).toBe(4);
      expect(slice[2].typeId).toBe(5);
      expect(slice[3].typeId).toBe(6);
    });

    it('handles out-of-range queries gracefully', () => {
      const ring = new ValueRing(10);

      ring.writeValue(encodeScalar(42, 0));

      expect(ring.getValue(999)).toBeUndefined();
      expect(ring.getValuesInRange(10, 5)).toEqual([]);
    });
  });

  describe('ValueRecord32 structure preservation', () => {
    it('preserves all fields for scalar values', () => {
      const ring = new ValueRing(10);
      const value = encodeScalar(3.14159, 7);

      const idx = ring.writeValue(value);
      const retrieved = ring.getValue(idx);

      expect(retrieved!.tag).toBe(ValueTag.Number);
      expect(retrieved!.typeId).toBe(7);
      expect(retrieved!.a).toBe(value.a);
      expect(retrieved!.b).toBe(value.b);
      expect(retrieved!.c).toBe(0);
      expect(retrieved!.d).toBe(0);
      expect(retrieved!.e).toBe(0);
      expect(retrieved!.f).toBe(0);
    });

    it('preserves all fields for Vec2 values', () => {
      const ring = new ValueRing(10);
      const value = encodeVec2(100.5, -50.25, 3);

      const idx = ring.writeValue(value);
      const retrieved = ring.getValue(idx);

      expect(retrieved!.tag).toBe(ValueTag.Vec2);
      expect(retrieved!.typeId).toBe(3);
      expect(retrieved!.a).toBe(value.a);
      expect(retrieved!.b).toBe(value.b);
    });

    it('preserves all fields for FieldStats values', () => {
      const ring = new ValueRing(10);
      const value = encodeFieldStats(100, -5.5, 10.25, 6);

      const idx = ring.writeValue(value);
      const retrieved = ring.getValue(idx);

      expect(retrieved!.tag).toBe(ValueTag.FieldStats);
      expect(retrieved!.typeId).toBe(6);
      expect(retrieved!.a).toBe(value.a); // domainId
      expect(retrieved!.b).toBe(100); // n
      expect(retrieved!.c).toBe(value.c); // statMask
      expect(retrieved!.d).toBe(value.d); // min (packed)
      expect(retrieved!.e).toBe(value.e); // max (packed)
      expect(retrieved!.f).toBe(value.f); // hashLow32
    });
  });

  describe('clear operation', () => {
    it('resets write pointer', () => {
      const ring = new ValueRing(100);

      for (let i = 0; i < 50; i++) {
        ring.writeValue(encodeScalar(i, 0));
      }

      expect(ring.size()).toBe(50);

      ring.clear();

      expect(ring.size()).toBe(0);
      expect(ring.getWritePtr()).toBe(0);
    });
  });

  describe('Mixed value types', () => {
    it('stores different value types correctly', () => {
      const ring = new ValueRing(10);

      const scalarIdx = ring.writeValue(encodeScalar(42, 0));
      const vec2Idx = ring.writeValue(encodeVec2(1, 2, 1));
      const statsIdx = ring.writeValue(encodeFieldStats(100, 0, 50, 2));

      const scalar = ring.getValue(scalarIdx);
      const vec2 = ring.getValue(vec2Idx);
      const stats = ring.getValue(statsIdx);

      expect(scalar!.tag).toBe(ValueTag.Number);
      expect(vec2!.tag).toBe(ValueTag.Vec2);
      expect(stats!.tag).toBe(ValueTag.FieldStats);
    });
  });
});
