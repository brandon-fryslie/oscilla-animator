/**
 * Default Source Utils Tests
 *
 * Tests for materializeDefaultSource utility.
 * Verifies correct handling of all type worlds and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { IRBuilderImpl } from '../IRBuilderImpl';
import { materializeDefaultSource } from '../defaultSourceUtils';
import type { TypeDesc } from '../types';
import { asTypeDesc } from '../types';

// Helper to create TypeDesc
function makeType(
  world: TypeDesc['world'],
  domain: TypeDesc['domain'] = 'float'
): TypeDesc {
  return asTypeDesc({ world, domain });
}

describe('materializeDefaultSource', () => {
  describe('signal (numeric)', () => {
    it('returns sig ref with allocated slot', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('signal', 'float');
      const value = 42;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'sig') {
        expect(typeof ref.id).toBe('number');
        expect(typeof ref.slot).toBe('number');
      }
    });

    it('handles zero values', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('signal', 'float');
      const value = 0;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('sig');
    });

    it('handles negative values', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('signal', 'float');
      const value = -123.45;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('sig');
    });
  });

  describe('signal (non-numeric)', () => {
    it('returns scalarConst for string values (no coercion!)', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('signal', 'color');
      const value = '#ff0000';

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        expect(typeof ref.constId).toBe('number');
      }
    });

    it('returns scalarConst for vec3 values', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('signal', 'vec3');
      const value = [1, 2, 3];

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        expect(typeof ref.constId).toBe('number');
      }
    });

    it('stores non-numeric value in const pool unchanged', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('signal', 'color');
      const value = '#00ff00';

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        const constPool = builder.getConstPool();
        expect(constPool[ref.constId]).toBe('#00ff00');
      }
    });
  });

  describe('field', () => {
    it('returns field ref with allocated slot', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('field', 'float');
      const value = 3.14;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'field') {
        expect(typeof ref.id).toBe('number');
        expect(typeof ref.slot).toBe('number');
      }
    });

    it('handles array values for fields', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('field', 'vec3');
      const value = [1, 2, 3];

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('field');
    });
  });

  describe('scalar', () => {
    it('returns scalarConst for scalar types', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('scalar', 'float');
      const value = 123;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        expect(typeof ref.constId).toBe('number');
      }
    });

    it('stores value in const pool', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('scalar', 'path');
      const value = 'test-value';

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        const constPool = builder.getConstPool();
        expect(constPool[ref.constId]).toBe('test-value');
      }
    });
  });

  describe('config', () => {
    it('returns scalarConst for non-domain config', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('config', 'float');
      const value = 999;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        expect(typeof ref.constId).toBe('number');
      }
    });

    it('stores config value in const pool', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('config', 'path');
      const value = 'config-string';

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'scalarConst') {
        const constPool = builder.getConstPool();
        expect(constPool[ref.constId]).toBe('config-string');
      }
    });
  });

  describe('config (domain="domain")', () => {
    it('returns special/domain ref for domain config', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('config', 'domain');
      const value = 10;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      if (ref !== null && ref.k === 'special') {
        expect(ref.tag).toBe('domain');
        expect(typeof ref.id).toBe('number');
      }
    });

    it('handles numeric domain values', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('config', 'domain');
      const value = 5;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('special');
    });

    it('coerces string to number for domain', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('config', 'domain');
      const value = '20';

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('special');
    });

    it('handles non-finite values safely', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('config', 'domain');
      const value = NaN;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('special');
      // Should create domain with count=0 (safe default)
    });
  });

  describe('event', () => {
    it('returns null for event types', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('event', 'trigger');
      const value = undefined;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).toBeNull();
    });

    it('returns null regardless of value', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('event', 'trigger');
      const value = 'should-be-ignored';

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles boolean values for scalar', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('scalar', 'boolean');
      const value = true;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('scalarConst');
    });

    it('handles null values', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('scalar', 'float');
      const value = null;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('scalarConst');
    });

    it('handles undefined values', () => {
      const builder = new IRBuilderImpl();
      const type = makeType('scalar', 'float');
      const value = undefined;

      const ref = materializeDefaultSource(builder, type, value);

      expect(ref).not.toBeNull();
      expect(ref?.k).toBe('scalarConst');
    });
  });
});
