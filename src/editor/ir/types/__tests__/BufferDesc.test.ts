/**
 * Tests for BufferDesc type guards and validation
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_COLOR_BUFFER_DESC,
  CANONICAL_PATH_COMMAND_DESC,
  CANONICAL_FLATTEN_TOL_PX,
  isColorBufferDesc,
  isPathCommandStreamDesc,
  isBufferDesc,
  isFlattenOff,
  isFlattenOn,
  validateFlattenPolicy,
  type ColorBufferDesc,
  type PathCommandStreamDesc,
  type FlattenPolicy,
} from '../BufferDesc';

describe('BufferDesc', () => {
  describe('ColorBufferDesc', () => {
    it('CANONICAL_COLOR_BUFFER_DESC has correct values', () => {
      expect(CANONICAL_COLOR_BUFFER_DESC.kind).toBe('u8x4');
      expect(CANONICAL_COLOR_BUFFER_DESC.encoding).toBe('linear_premul_rgba8');
      expect(CANONICAL_COLOR_BUFFER_DESC.channelOrder).toBe('RGBA');
      expect(CANONICAL_COLOR_BUFFER_DESC.strideBytes).toBe(4);
    });

    it('CANONICAL_COLOR_BUFFER_DESC is frozen (immutable)', () => {
      expect(Object.isFrozen(CANONICAL_COLOR_BUFFER_DESC)).toBe(true);
    });

    it('isColorBufferDesc accepts valid descriptor', () => {
      const valid: ColorBufferDesc = {
        kind: 'u8x4',
        encoding: 'linear_premul_rgba8',
        channelOrder: 'RGBA',
        strideBytes: 4,
      };
      expect(isColorBufferDesc(valid)).toBe(true);
    });

    it('isColorBufferDesc accepts canonical constant', () => {
      expect(isColorBufferDesc(CANONICAL_COLOR_BUFFER_DESC)).toBe(true);
    });

    it('isColorBufferDesc rejects invalid kind', () => {
      const invalid = {
        kind: 'f32x4', // wrong kind
        encoding: 'linear_premul_rgba8',
        channelOrder: 'RGBA',
        strideBytes: 4,
      };
      expect(isColorBufferDesc(invalid)).toBe(false);
    });

    it('isColorBufferDesc rejects invalid encoding', () => {
      const invalid = {
        kind: 'u8x4',
        encoding: 'srgb_rgba8', // wrong encoding
        channelOrder: 'RGBA',
        strideBytes: 4,
      };
      expect(isColorBufferDesc(invalid)).toBe(false);
    });

    it('isColorBufferDesc rejects invalid channel order', () => {
      const invalid = {
        kind: 'u8x4',
        encoding: 'linear_premul_rgba8',
        channelOrder: 'BGRA', // wrong order
        strideBytes: 4,
      };
      expect(isColorBufferDesc(invalid)).toBe(false);
    });

    it('isColorBufferDesc rejects invalid stride', () => {
      const invalid = {
        kind: 'u8x4',
        encoding: 'linear_premul_rgba8',
        channelOrder: 'RGBA',
        strideBytes: 8, // wrong stride
      };
      expect(isColorBufferDesc(invalid)).toBe(false);
    });

    it('isColorBufferDesc rejects null', () => {
      expect(isColorBufferDesc(null)).toBe(false);
    });

    it('isColorBufferDesc rejects undefined', () => {
      expect(isColorBufferDesc(undefined)).toBe(false);
    });

    it('isColorBufferDesc rejects primitives', () => {
      expect(isColorBufferDesc(42)).toBe(false);
      expect(isColorBufferDesc('color')).toBe(false);
      expect(isColorBufferDesc(true)).toBe(false);
    });
  });

  describe('PathCommandStreamDesc', () => {
    it('CANONICAL_PATH_COMMAND_DESC has correct values', () => {
      expect(CANONICAL_PATH_COMMAND_DESC.opcodeWidth).toBe(16);
      expect(CANONICAL_PATH_COMMAND_DESC.endianness).toBe('LE');
    });

    it('CANONICAL_PATH_COMMAND_DESC is frozen (immutable)', () => {
      expect(Object.isFrozen(CANONICAL_PATH_COMMAND_DESC)).toBe(true);
    });

    it('isPathCommandStreamDesc accepts valid descriptor', () => {
      const valid: PathCommandStreamDesc = {
        opcodeWidth: 16,
        endianness: 'LE',
      };
      expect(isPathCommandStreamDesc(valid)).toBe(true);
    });

    it('isPathCommandStreamDesc accepts canonical constant', () => {
      expect(isPathCommandStreamDesc(CANONICAL_PATH_COMMAND_DESC)).toBe(true);
    });

    it('isPathCommandStreamDesc rejects invalid opcode width', () => {
      const invalid = {
        opcodeWidth: 8, // wrong width
        endianness: 'LE',
      };
      expect(isPathCommandStreamDesc(invalid)).toBe(false);
    });

    it('isPathCommandStreamDesc rejects invalid endianness', () => {
      const invalid = {
        opcodeWidth: 16,
        endianness: 'BE', // wrong endianness
      };
      expect(isPathCommandStreamDesc(invalid)).toBe(false);
    });

    it('isPathCommandStreamDesc rejects null', () => {
      expect(isPathCommandStreamDesc(null)).toBe(false);
    });

    it('isPathCommandStreamDesc rejects primitives', () => {
      expect(isPathCommandStreamDesc(42)).toBe(false);
      expect(isPathCommandStreamDesc('path')).toBe(false);
    });
  });

  describe('FlattenPolicy', () => {
    it('CANONICAL_FLATTEN_TOL_PX has expected value', () => {
      expect(CANONICAL_FLATTEN_TOL_PX).toBe(0.75);
    });

    it('isFlattenOff detects off policy', () => {
      const policy: FlattenPolicy = { kind: 'off' };
      expect(isFlattenOff(policy)).toBe(true);
      expect(isFlattenOn(policy)).toBe(false);
    });

    it('isFlattenOn detects on policy', () => {
      const policy: FlattenPolicy = {
        kind: 'on',
        tolerancePx: CANONICAL_FLATTEN_TOL_PX,
      };
      expect(isFlattenOn(policy)).toBe(true);
      expect(isFlattenOff(policy)).toBe(false);
    });

    it('validateFlattenPolicy accepts off policy', () => {
      const policy: FlattenPolicy = { kind: 'off' };
      expect(() => validateFlattenPolicy(policy)).not.toThrow();
    });

    it('validateFlattenPolicy accepts canonical tolerance', () => {
      const policy: FlattenPolicy = {
        kind: 'on',
        tolerancePx: CANONICAL_FLATTEN_TOL_PX,
      };
      expect(() => validateFlattenPolicy(policy)).not.toThrow();
    });

    it('validateFlattenPolicy rejects non-canonical tolerance', () => {
      // Type assertion via 'unknown' needed since FlattenPolicy type prevents this at compile time
      const invalidPolicy = {
        kind: 'on',
        tolerancePx: 1.0, // non-canonical
      } as unknown as FlattenPolicy;

      expect(() => validateFlattenPolicy(invalidPolicy)).toThrow(
        /must use canonical tolerance/
      );
    });

    it('validateFlattenPolicy error message includes canonical value', () => {
      const invalidPolicy = {
        kind: 'on',
        tolerancePx: 2.5,
      } as unknown as FlattenPolicy;

      expect(() => validateFlattenPolicy(invalidPolicy)).toThrow('0.75');
    });
  });

  describe('BufferDesc union', () => {
    it('isBufferDesc accepts ColorBufferDesc', () => {
      expect(isBufferDesc(CANONICAL_COLOR_BUFFER_DESC)).toBe(true);
    });

    it('isBufferDesc accepts PathCommandStreamDesc', () => {
      expect(isBufferDesc(CANONICAL_PATH_COMMAND_DESC)).toBe(true);
    });

    it('isBufferDesc rejects invalid objects', () => {
      expect(isBufferDesc({ kind: 'invalid' })).toBe(false);
      expect(isBufferDesc(null)).toBe(false);
      expect(isBufferDesc(undefined)).toBe(false);
      expect(isBufferDesc(42)).toBe(false);
    });
  });
});
