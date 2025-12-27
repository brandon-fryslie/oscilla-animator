/**
 * Tests for Color Quantization Kernel
 *
 * Validates correctness, determinism, and edge cases for color quantization.
 */

import { describe, it, expect } from 'vitest';
import {
  quantizeColorRGBA,
  quantizeColorRGBABatch,
  dequantizeColorRGBA,
  unpremultiplyColor,
} from '../ColorQuantize';

describe('ColorQuantize', () => {
  describe('quantizeColorRGBA', () => {
    it('quantizes fully opaque white correctly', () => {
      const result = quantizeColorRGBA(1, 1, 1, 1);
      expect(result).toEqual(new Uint8Array([255, 255, 255, 255]));
    });

    it('quantizes half-transparent red correctly (premultiplied)', () => {
      const result = quantizeColorRGBA(1, 0, 0, 0.5);
      // Premultiplied: r = 1 * 0.5 = 0.5 → 128
      expect(result).toEqual(new Uint8Array([128, 0, 0, 128]));
    });

    it('quantizes fully transparent to zero (color irrelevant)', () => {
      const result = quantizeColorRGBA(1, 1, 1, 0);
      // Alpha = 0, so RGB is premultiplied to 0
      expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
    });

    it('quantizes opaque green correctly', () => {
      const result = quantizeColorRGBA(0, 1, 0, 1);
      expect(result).toEqual(new Uint8Array([0, 255, 0, 255]));
    });

    it('quantizes opaque blue correctly', () => {
      const result = quantizeColorRGBA(0, 0, 1, 1);
      expect(result).toEqual(new Uint8Array([0, 0, 255, 255]));
    });

    it('quantizes mid-gray correctly', () => {
      const result = quantizeColorRGBA(0.5, 0.5, 0.5, 1);
      // 0.5 * 255 = 127.5, rounds to 128
      expect(result).toEqual(new Uint8Array([128, 128, 128, 255]));
    });

    it('quantizes 25% transparent cyan correctly', () => {
      const result = quantizeColorRGBA(0, 1, 1, 0.75);
      // Premultiplied: G = 1 * 0.75 = 0.75 → 191, B = 1 * 0.75 = 0.75 → 191
      expect(result).toEqual(new Uint8Array([0, 191, 191, 191]));
    });

    it('clamps HDR red values correctly', () => {
      const result = quantizeColorRGBA(2.5, 0, 0, 1);
      // Input clamped to [0, 1] before quantization
      expect(result).toEqual(new Uint8Array([255, 0, 0, 255]));
    });

    it('clamps negative values to zero', () => {
      const result = quantizeColorRGBA(-0.5, 0.5, 0.5, 1);
      expect(result).toEqual(new Uint8Array([0, 128, 128, 255]));
    });

    it('clamps alpha > 1 correctly', () => {
      const result = quantizeColorRGBA(1, 1, 1, 1.5);
      // Alpha clamped to 1
      expect(result).toEqual(new Uint8Array([255, 255, 255, 255]));
    });

    it('clamps alpha < 0 correctly', () => {
      const result = quantizeColorRGBA(1, 1, 1, -0.5);
      // Alpha clamped to 0, RGB premultiplied to 0
      expect(result).toEqual(new Uint8Array([0, 0, 0, 0]));
    });

    it('handles edge case: 0.5 rounds to 128 (not 127)', () => {
      const result = quantizeColorRGBA(0.5, 0.5, 0.5, 1);
      // Math.round(0.5 * 255) = Math.round(127.5) = 128
      expect(result[0]).toBe(128);
      expect(result[1]).toBe(128);
      expect(result[2]).toBe(128);
    });

    it('is deterministic: same input produces same output', () => {
      const input: [number, number, number, number] = [0.7, 0.3, 0.9, 0.6];
      const results = Array.from({ length: 100 }, () => quantizeColorRGBA(...input));

      // All results should be identical
      const first = results[0];
      for (const result of results) {
        expect(result).toEqual(first);
      }
    });

    it('is deterministic: 100 iterations with varying inputs', () => {
      const inputs: Array<[number, number, number, number]> = [
        [0.1, 0.2, 0.3, 0.4],
        [0.9, 0.8, 0.7, 0.6],
        [0.5, 0.5, 0.5, 0.5],
        [1, 0, 0, 1],
        [0, 1, 0, 1],
        [0, 0, 1, 1],
      ];

      for (const input of inputs) {
        const results = Array.from({ length: 100 }, () => quantizeColorRGBA(...input));
        const first = results[0];

        for (const result of results) {
          expect(result).toEqual(first);
        }
      }
    });
  });

  describe('quantizeColorRGBABatch', () => {
    it('quantizes multiple colors correctly', () => {
      const floatColors = [
        1,
        0,
        0,
        1, // red
        0,
        1,
        0,
        1, // green
        0,
        0,
        1,
        1, // blue
      ];
      const result = quantizeColorRGBABatch(floatColors);

      expect(result).toEqual(
        new Uint8Array([
          255, 0, 0, 255, // red
          0, 255, 0, 255, // green
          0, 0, 255, 255, // blue
        ])
      );
    });

    it('handles empty array', () => {
      const result = quantizeColorRGBABatch([]);
      expect(result).toEqual(new Uint8Array([]));
    });

    it('handles single color', () => {
      const result = quantizeColorRGBABatch([0.5, 0.5, 0.5, 1]);
      expect(result).toEqual(new Uint8Array([128, 128, 128, 255]));
    });

    it('throws on invalid array length (not multiple of 4)', () => {
      expect(() => quantizeColorRGBABatch([1, 0, 0])).toThrow(
        'colors array length must be multiple of 4'
      );
    });

    it('handles premultiplication in batch', () => {
      const floatColors = [
        1,
        0,
        0,
        0.5, // half-transparent red
        0,
        1,
        0,
        0.25, // quarter-transparent green
      ];
      const result = quantizeColorRGBABatch(floatColors);

      expect(result).toEqual(
        new Uint8Array([
          128,
          0,
          0,
          128, // premul red
          0,
          64,
          0,
          64, // premul green (0.25 * 255 = 63.75 → 64)
        ])
      );
    });
  });

  describe('dequantizeColorRGBA', () => {
    it('dequantizes opaque white correctly', () => {
      const u8Color = new Uint8Array([255, 255, 255, 255]);
      const result = dequantizeColorRGBA(u8Color);

      expect(result.r).toBeCloseTo(1, 5);
      expect(result.g).toBeCloseTo(1, 5);
      expect(result.b).toBeCloseTo(1, 5);
      expect(result.a).toBeCloseTo(1, 5);
    });

    it('dequantizes premultiplied color (does not unpremultiply)', () => {
      const u8Color = new Uint8Array([128, 0, 0, 128]);
      const result = dequantizeColorRGBA(u8Color);

      // Premultiplied values: r=0.5, g=0, b=0, a=0.5
      expect(result.r).toBeCloseTo(0.5019, 3); // 128/255
      expect(result.g).toBeCloseTo(0, 5);
      expect(result.b).toBeCloseTo(0, 5);
      expect(result.a).toBeCloseTo(0.5019, 3);
    });

    it('throws on invalid array length', () => {
      expect(() => dequantizeColorRGBA(new Uint8Array([255, 255, 255]))).toThrow(
        'expected Uint8Array of length 4'
      );
    });
  });

  describe('unpremultiplyColor', () => {
    it('unpremultiplies half-transparent red correctly', () => {
      const u8Color = new Uint8Array([128, 0, 0, 128]); // premul (0.5, 0, 0, 0.5)
      const result = unpremultiplyColor(u8Color);

      // Unpremultiply: r = 0.5 / 0.5 = 1
      expect(result.r).toBeCloseTo(1, 5);
      expect(result.g).toBeCloseTo(0, 5);
      expect(result.b).toBeCloseTo(0, 5);
      expect(result.a).toBeCloseTo(0.5019, 3);
    });

    it('handles fully transparent color (avoids division by zero)', () => {
      const u8Color = new Uint8Array([0, 0, 0, 0]);
      const result = unpremultiplyColor(u8Color);

      expect(result.r).toBe(0);
      expect(result.g).toBe(0);
      expect(result.b).toBe(0);
      expect(result.a).toBe(0);
    });

    it('unpremultiplies opaque color (no change)', () => {
      const u8Color = new Uint8Array([255, 128, 64, 255]);
      const result = unpremultiplyColor(u8Color);

      expect(result.r).toBeCloseTo(1, 5);
      expect(result.g).toBeCloseTo(0.5019, 3);
      expect(result.b).toBeCloseTo(0.251, 3);
      expect(result.a).toBeCloseTo(1, 5);
    });

    it('throws on invalid array length', () => {
      expect(() => unpremultiplyColor(new Uint8Array([255, 255, 255]))).toThrow(
        'expected Uint8Array of length 4'
      );
    });
  });

  describe('round-trip consistency', () => {
    it('quantize → dequantize preserves value (with precision loss)', () => {
      const original = { r: 0.7, g: 0.3, b: 0.9, a: 0.6 };
      const quantized = quantizeColorRGBA(original.r, original.g, original.b, original.a);
      const dequantized = dequantizeColorRGBA(quantized);

      // Premultiplied values, so precision loss is expected
      // Check that we're within 1/255 tolerance
      expect(Math.abs(dequantized.r - original.r * original.a)).toBeLessThan(1 / 255);
      expect(Math.abs(dequantized.g - original.g * original.a)).toBeLessThan(1 / 255);
      expect(Math.abs(dequantized.b - original.b * original.a)).toBeLessThan(1 / 255);
      expect(Math.abs(dequantized.a - original.a)).toBeLessThan(1 / 255);
    });

    it('quantize → unpremultiply recovers original color (with precision loss)', () => {
      const original = { r: 0.7, g: 0.3, b: 0.9, a: 0.6 };
      const quantized = quantizeColorRGBA(original.r, original.g, original.b, original.a);
      const unpremul = unpremultiplyColor(quantized);

      // Check that unpremultiplied color is close to original
      expect(Math.abs(unpremul.r - original.r)).toBeLessThan(2 / 255);
      expect(Math.abs(unpremul.g - original.g)).toBeLessThan(2 / 255);
      expect(Math.abs(unpremul.b - original.b)).toBeLessThan(2 / 255);
      expect(Math.abs(unpremul.a - original.a)).toBeLessThan(1 / 255);
    });
  });
});
