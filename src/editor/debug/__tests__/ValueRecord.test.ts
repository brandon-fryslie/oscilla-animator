/**
 * Tests for ValueRecord encoding/decoding
 */

import { describe, it, expect } from 'vitest';
import {
  ValueTag,
  FieldStatMask,
  packF32,
  unpackF32,
  encodeScalar,
  decodeScalar,
  encodeBoolean,
  decodeBoolean,
  encodeVec2,
  decodeVec2,
  encodeVec3,
  decodeVec3,
  encodeVec4,
  decodeVec4,
  encodeColor,
  decodeColor,
  encodeFieldStats,
  decodeFieldStats,
  encodeHash64,
  decodeHash64,
} from '../ValueRecord';

describe('ValueRecord', () => {
  describe('packF32/unpackF32', () => {
    it('roundtrips float32 values', () => {
      const values = [0, 1, -1, 3.14159, 1e6, -1e6, 0.000001];
      for (const val of values) {
        const packed = packF32(val);
        const unpacked = unpackF32(packed);
        // Float32 precision
        expect(Math.abs(unpacked - val)).toBeLessThan(1e-6);
      }
    });

    it('handles special values', () => {
      expect(unpackF32(packF32(NaN))).toBeNaN();
      expect(unpackF32(packF32(Infinity))).toBe(Infinity);
      expect(unpackF32(packF32(-Infinity))).toBe(-Infinity);
      expect(unpackF32(packF32(0))).toBe(0);
    });
  });

  describe('Scalar encoding', () => {
    it('encodes and decodes scalar numbers', () => {
      const record = encodeScalar(42.5, 0);
      expect(record.tag).toBe(ValueTag.Number);
      expect(record.typeId).toBe(0);

      const decoded = decodeScalar(record);
      expect(decoded).toBeCloseTo(42.5, 5);
    });

    it('roundtrips various scalar values', () => {
      const values = [0, 1, -1, 3.14159, 1000, -1000, 0.001];
      for (const val of values) {
        const record = encodeScalar(val, 5);
        const decoded = decodeScalar(record);
        expect(decoded).toBeCloseTo(val, 5);
      }
    });

    it('preserves NaN and Infinity', () => {
      const nanRecord = encodeScalar(NaN, 0);
      expect(decodeScalar(nanRecord)).toBeNaN();

      const infRecord = encodeScalar(Infinity, 0);
      expect(decodeScalar(infRecord)).toBe(Infinity);

      const negInfRecord = encodeScalar(-Infinity, 0);
      expect(decodeScalar(negInfRecord)).toBe(-Infinity);
    });
  });

  describe('Boolean encoding', () => {
    it('encodes and decodes true', () => {
      const record = encodeBoolean(true, 1);
      expect(record.tag).toBe(ValueTag.Boolean);
      expect(decodeBoolean(record)).toBe(true);
    });

    it('encodes and decodes false', () => {
      const record = encodeBoolean(false, 1);
      expect(record.tag).toBe(ValueTag.Boolean);
      expect(decodeBoolean(record)).toBe(false);
    });
  });

  describe('Vec2 encoding', () => {
    it('encodes and decodes Vec2', () => {
      const record = encodeVec2(10.5, -20.25, 2);
      expect(record.tag).toBe(ValueTag.Vec2);

      const decoded = decodeVec2(record);
      expect(decoded).not.toBeNull();
      expect(decoded!.x).toBeCloseTo(10.5, 5);
      expect(decoded!.y).toBeCloseTo(-20.25, 5);
    });

    it('roundtrips various Vec2 values', () => {
      const vectors = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: -100, y: 100 },
        { x: 3.14, y: 2.71 },
      ];

      for (const vec of vectors) {
        const record = encodeVec2(vec.x, vec.y, 0);
        const decoded = decodeVec2(record);
        expect(decoded!.x).toBeCloseTo(vec.x, 5);
        expect(decoded!.y).toBeCloseTo(vec.y, 5);
      }
    });
  });

  describe('Vec3 encoding', () => {
    it('encodes and decodes Vec3', () => {
      const record = encodeVec3(1.0, 2.0, 3.0, 3);
      expect(record.tag).toBe(ValueTag.Vec3);

      const decoded = decodeVec3(record);
      expect(decoded).not.toBeNull();
      expect(decoded!.x).toBeCloseTo(1.0, 5);
      expect(decoded!.y).toBeCloseTo(2.0, 5);
      expect(decoded!.z).toBeCloseTo(3.0, 5);
    });
  });

  describe('Vec4 encoding', () => {
    it('encodes and decodes Vec4', () => {
      const record = encodeVec4(1.0, 2.0, 3.0, 4.0, 4);
      expect(record.tag).toBe(ValueTag.Vec4);

      const decoded = decodeVec4(record);
      expect(decoded).not.toBeNull();
      expect(decoded!.x).toBeCloseTo(1.0, 5);
      expect(decoded!.y).toBeCloseTo(2.0, 5);
      expect(decoded!.z).toBeCloseTo(3.0, 5);
      expect(decoded!.w).toBeCloseTo(4.0, 5);
    });
  });

  describe('Color encoding', () => {
    it('encodes and decodes RGBA color', () => {
      const record = encodeColor(1.0, 0.5, 0.25, 0.8, 5);
      expect(record.tag).toBe(ValueTag.Color);

      const decoded = decodeColor(record);
      expect(decoded).not.toBeNull();
      expect(decoded!.r).toBeCloseTo(1.0, 5);
      expect(decoded!.g).toBeCloseTo(0.5, 5);
      expect(decoded!.b).toBeCloseTo(0.25, 5);
      expect(decoded!.a).toBeCloseTo(0.8, 5);
    });

    it('roundtrips various colors', () => {
      const colors = [
        { r: 0, g: 0, b: 0, a: 1 },
        { r: 1, g: 1, b: 1, a: 1 },
        { r: 0.5, g: 0.5, b: 0.5, a: 0.5 },
        { r: 1, g: 0, b: 0, a: 1 },
      ];

      for (const color of colors) {
        const record = encodeColor(color.r, color.g, color.b, color.a, 0);
        const decoded = decodeColor(record);
        expect(decoded!.r).toBeCloseTo(color.r, 5);
        expect(decoded!.g).toBeCloseTo(color.g, 5);
        expect(decoded!.b).toBeCloseTo(color.b, 5);
        expect(decoded!.a).toBeCloseTo(color.a, 5);
      }
    });
  });

  describe('FieldStats encoding', () => {
    it('encodes and decodes field statistics', () => {
      const record = encodeFieldStats(100, -5.5, 10.25, 6);
      expect(record.tag).toBe(ValueTag.FieldStats);

      const decoded = decodeFieldStats(record);
      expect(decoded).not.toBeNull();
      expect(decoded!.n).toBe(100);
      expect(decoded!.min).toBeCloseTo(-5.5, 5);
      expect(decoded!.max).toBeCloseTo(10.25, 5);
      expect(decoded!.statMask).toBe(FieldStatMask.HasMinMax);
    });

    it('encodes with optional domainId and hash', () => {
      const record = encodeFieldStats(50, 0, 100, 6, 42, 0xdeadbeef);
      const decoded = decodeFieldStats(record);
      expect(decoded!.n).toBe(50);
      expect(decoded!.domainId).toBe(42);
      expect(decoded!.hashLow32).toBe(0xdeadbeef);
    });
  });

  describe('Hash64 encoding', () => {
    it('encodes and decodes 64-bit hash', () => {
      const record = encodeHash64(0x12345678, 0xabcdef00, 7);
      expect(record.tag).toBe(ValueTag.Hash64);

      const decoded = decodeHash64(record);
      expect(decoded).not.toBeNull();
      expect(decoded!.low).toBe(0x12345678);
      expect(decoded!.high).toBe(0xabcdef00);
    });
  });

  describe('ValueRecord32 structure size', () => {
    it('has 32 bytes of payload (tag + typeId + 6×u32)', () => {
      // This is a conceptual test - in TypeScript we don't have strict memory layout
      // but we verify the structure has the expected fields
      const record = encodeScalar(42, 0);

      expect(record).toHaveProperty('tag');
      expect(record).toHaveProperty('typeId');
      expect(record).toHaveProperty('a');
      expect(record).toHaveProperty('b');
      expect(record).toHaveProperty('c');
      expect(record).toHaveProperty('d');
      expect(record).toHaveProperty('e');
      expect(record).toHaveProperty('f');

      // 8 fields total
      expect(Object.keys(record).length).toBe(8);
    });
  });

  describe('Type safety - decode returns null for wrong tag', () => {
    it('decodeScalar returns null for non-Number tag', () => {
      const record = encodeBoolean(true, 0);
      expect(decodeScalar(record)).toBeNull();
    });

    it('decodeVec2 returns null for non-Vec2 tag', () => {
      const record = encodeScalar(42, 0);
      expect(decodeVec2(record)).toBeNull();
    });

    it('decodeColor returns null for non-Color tag', () => {
      const record = encodeVec4(1, 2, 3, 4, 0);
      expect(decodeColor(record)).toBeNull();
    });

    it('decodeFieldStats returns null for non-FieldStats tag', () => {
      const record = encodeScalar(42, 0);
      expect(decodeFieldStats(record)).toBeNull();
    });
  });
});
