import { describe, it, expect } from 'vitest';
import {
  typeEquals,
  isCompatible,
  isBusEligible,
  getTypeCategory,
  createTypeDesc,
  type TypeDesc,
} from '../TypeDesc';

describe('TypeDesc', () => {
  describe('getTypeCategory', () => {
    it('returns "core" for core domains', () => {
      expect(getTypeCategory({ world: 'signal', domain: 'float' })).toBe('core');
      expect(getTypeCategory({ world: 'signal', domain: 'float', semantics: 'phase(0..1)' })).toBe('core');
      expect(getTypeCategory({ world: 'field', domain: 'vec2' })).toBe('core');
      expect(getTypeCategory({ world: 'signal', domain: 'color' })).toBe('core');
      expect(getTypeCategory({ world: 'signal', domain: 'trigger' })).toBe('core');
    });

    it('returns "internal" for internal domains', () => {
      expect(getTypeCategory({ world: 'signal', domain: 'renderTree' })).toBe('internal');
      expect(getTypeCategory({ world: 'config', domain: 'domain' })).toBe('internal');
      expect(getTypeCategory({ world: 'field', domain: 'path' })).toBe('internal');
      expect(getTypeCategory({ world: 'signal', domain: 'filterDef' })).toBe('internal');
    });

    it('uses explicit category if provided', () => {
      expect(getTypeCategory({ world: 'signal', domain: 'float', category: 'internal' })).toBe('internal');
      expect(getTypeCategory({ world: 'signal', domain: 'renderTree', category: 'core' })).toBe('core');
    });
  });

  describe('isBusEligible', () => {
    it('returns true for core signal types', () => {
      expect(isBusEligible({ world: 'signal', domain: 'float' })).toBe(true);
      expect(isBusEligible({ world: 'signal', domain: 'float', semantics: 'phase(0..1)' })).toBe(true);
      expect(isBusEligible({ world: 'signal', domain: 'color' })).toBe(true);
    });

    it('returns true for core field types', () => {
      expect(isBusEligible({ world: 'field', domain: 'float' })).toBe(true);
      expect(isBusEligible({ world: 'field', domain: 'vec2' })).toBe(true);
    });

    it('returns true for core scalar types', () => {
      expect(isBusEligible({ world: 'scalar', domain: 'float' })).toBe(true);
    });

    it('returns false for config world', () => {
      expect(isBusEligible({ world: 'config', domain: 'float' })).toBe(false);
    });

    it('returns false for internal domains', () => {
      expect(isBusEligible({ world: 'signal', domain: 'renderTree' })).toBe(false);
      expect(isBusEligible({ world: 'config', domain: 'domain' })).toBe(false);
    });

    it('uses explicit busEligible if provided', () => {
      expect(isBusEligible({ world: 'signal', domain: 'float', busEligible: false })).toBe(false);
      expect(isBusEligible({ world: 'signal', domain: 'renderTree', busEligible: true })).toBe(true);
    });
  });

  describe('typeEquals', () => {
    it('considers same world+domain equal', () => {
      const a: TypeDesc = { world: 'signal', domain: 'float' };
      const b: TypeDesc = { world: 'signal', domain: 'float' };
      expect(typeEquals(a, b)).toBe(true);
    });

    it('considers different domains unequal', () => {
      const a: TypeDesc = { world: 'signal', domain: 'float' };
      const b: TypeDesc = { world: 'signal', domain: 'int' };
      expect(typeEquals(a, b)).toBe(false);
    });

    it('considers different worlds unequal', () => {
      const a: TypeDesc = { world: 'signal', domain: 'float' };
      const b: TypeDesc = { world: 'field', domain: 'float' };
      expect(typeEquals(a, b)).toBe(false);
    });

    it('considers different semantics unequal', () => {
      const a: TypeDesc = { world: 'field', domain: 'vec2', semantics: 'point' };
      const b: TypeDesc = { world: 'field', domain: 'vec2', semantics: 'velocity' };
      expect(typeEquals(a, b)).toBe(false);
    });

    it('treats undefined and missing semantics as equal', () => {
      const a: TypeDesc = { world: 'signal', domain: 'float', semantics: undefined };
      const b: TypeDesc = { world: 'signal', domain: 'float' };
      expect(typeEquals(a, b)).toBe(true);
    });

    it('ignores category and busEligible in equality', () => {
      const a: TypeDesc = { world: 'signal', domain: 'float', category: 'core', busEligible: true };
      const b: TypeDesc = { world: 'signal', domain: 'float', category: 'internal', busEligible: false };
      expect(typeEquals(a, b)).toBe(true);
    });

    it('ignores unit in equality', () => {
      const a: TypeDesc = { world: 'signal', domain: 'time', unit: 'ms' };
      const b: TypeDesc = { world: 'signal', domain: 'time', unit: 'seconds' };
      expect(typeEquals(a, b)).toBe(true);
    });
  });

  describe('isCompatible', () => {
    it('allows same world and domain', () => {
      const from: TypeDesc = { world: 'signal', domain: 'float' };
      const to: TypeDesc = { world: 'signal', domain: 'float' };
      expect(isCompatible(from, to)).toBe(true);
    });

    it('allows scalar → signal promotion', () => {
      const from: TypeDesc = { world: 'scalar', domain: 'float' };
      const to: TypeDesc = { world: 'signal', domain: 'float' };
      expect(isCompatible(from, to)).toBe(true);
    });

    it('allows signal → field broadcast', () => {
      const from: TypeDesc = { world: 'signal', domain: 'float' };
      const to: TypeDesc = { world: 'field', domain: 'float' };
      expect(isCompatible(from, to)).toBe(true);
    });

    it('allows scalar → field (via signal promotion)', () => {
      const from: TypeDesc = { world: 'scalar', domain: 'float' };
      const to: TypeDesc = { world: 'field', domain: 'float' };
      expect(isCompatible(from, to)).toBe(true);
    });

    it('rejects field → signal (needs explicit reduce)', () => {
      const from: TypeDesc = { world: 'field', domain: 'float' };
      const to: TypeDesc = { world: 'signal', domain: 'float' };
      expect(isCompatible(from, to)).toBe(false);
    });

    it('rejects field → scalar', () => {
      const from: TypeDesc = { world: 'field', domain: 'float' };
      const to: TypeDesc = { world: 'scalar', domain: 'float' };
      expect(isCompatible(from, to)).toBe(false);
    });

    it('rejects signal → scalar', () => {
      const from: TypeDesc = { world: 'signal', domain: 'float' };
      const to: TypeDesc = { world: 'scalar', domain: 'float' };
      expect(isCompatible(from, to)).toBe(false);
    });

    it('rejects different domains', () => {
      const from: TypeDesc = { world: 'signal', domain: 'float' };
      const to: TypeDesc = { world: 'signal', domain: 'int' };
      expect(isCompatible(from, to)).toBe(false);
    });

    it('allows point ↔ vec2 compatibility (same world)', () => {
      const from: TypeDesc = { world: 'field', domain: 'point' };
      const to: TypeDesc = { world: 'field', domain: 'vec2' };
      expect(isCompatible(from, to)).toBe(true);
      expect(isCompatible(to, from)).toBe(true);
    });

    it('allows point → vec2 with promotion', () => {
      const from: TypeDesc = { world: 'signal', domain: 'point' };
      const to: TypeDesc = { world: 'field', domain: 'vec2' };
      expect(isCompatible(from, to)).toBe(true);
    });

    it('allows renderTree ↔ renderNode compatibility', () => {
      const from: TypeDesc = { world: 'signal', domain: 'renderTree' };
      const to: TypeDesc = { world: 'signal', domain: 'renderNode' };
      expect(isCompatible(from, to)).toBe(true);
    });
  });

  describe('createTypeDesc', () => {
    it('creates TypeDesc with derived category', () => {
      const type = createTypeDesc({ world: 'signal', domain: 'float' });
      expect(type.category).toBe('core');
      expect(type.busEligible).toBe(true);
    });

    it('creates TypeDesc with internal category for internal domains', () => {
      const type = createTypeDesc({ world: 'signal', domain: 'renderTree' });
      expect(type.category).toBe('internal');
      expect(type.busEligible).toBe(false);
    });

    it('preserves semantics and unit', () => {
      const type = createTypeDesc({ world: 'signal', domain: 'time', unit: 'ms' });
      expect(type.unit).toBe('ms');
    });

    it('sets busEligible false for config world', () => {
      const type = createTypeDesc({ world: 'config', domain: 'float' });
      expect(type.busEligible).toBe(false);
    });
  });
});
