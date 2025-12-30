/**
 * Bundle Arity Validation Tests (Sprint 2)
 *
 * Tests that bundle arity mismatches are detected and produce clear error messages.
 */

import { describe, it, expect } from 'vitest';
import { areSlotTypesCompatible, getTypeMismatchMessage, getTypeDesc } from '../index';
import type { SlotType } from '../../types';

describe('Bundle Arity Validation', () => {
  describe('areSlotTypesCompatible with bundle arity', () => {
    it('rejects vec3 to scalar connection', () => {
      const vec3: SlotType = 'Signal<vec3>';
      const scalar: SlotType = 'Signal<float>';

      expect(areSlotTypesCompatible(vec3, scalar)).toBe(false);
    });

    it('rejects vec2 to scalar connection', () => {
      const vec2: SlotType = 'Signal<vec2>';
      const scalar: SlotType = 'Signal<float>';

      expect(areSlotTypesCompatible(vec2, scalar)).toBe(false);
    });

    it('rejects color (RGBA) to scalar connection', () => {
      const color: SlotType = 'Signal<color>';
      const scalar: SlotType = 'Signal<float>';

      expect(areSlotTypesCompatible(color, scalar)).toBe(false);
    });

    it('rejects vec3 to vec2 connection (different arity)', () => {
      const vec3: SlotType = 'Signal<vec3>';
      const vec2: SlotType = 'Signal<vec2>';

      expect(areSlotTypesCompatible(vec3, vec2)).toBe(false);
    });

    it('accepts scalar to scalar connection', () => {
      const float1: SlotType = 'Signal<float>';
      const float2: SlotType = 'Signal<float>';

      expect(areSlotTypesCompatible(float1, float2)).toBe(true);
    });

    it('accepts vec2 to vec2 connection', () => {
      const vec2a: SlotType = 'Signal<vec2>';
      const vec2b: SlotType = 'Field<vec2>';

      // Different worlds, so should fail on world check first
      expect(areSlotTypesCompatible(vec2a, vec2b)).toBe(false);

      // Same world should pass
      const vec2c: SlotType = 'Signal<vec2>';
      expect(areSlotTypesCompatible(vec2a, vec2c)).toBe(true);
    });

    it('accepts vec3 to vec3 connection', () => {
      const vec3a: SlotType = 'Signal<vec3>';
      const vec3b: SlotType = 'Signal<vec3>';

      expect(areSlotTypesCompatible(vec3a, vec3b)).toBe(true);
    });

    it('accepts color to color connection', () => {
      const color1: SlotType = 'Signal<color>';
      const color2: SlotType = 'Signal<color>';

      expect(areSlotTypesCompatible(color1, color2)).toBe(true);
    });
  });

  describe('getTypeMismatchMessage with bundle arity', () => {
    it('provides clear error for vec3 to scalar mismatch', () => {
      const vec3Type = getTypeDesc('Signal<vec3>');
      const scalarType = getTypeDesc('Signal<float>');

      expect(vec3Type).toBeDefined();
      expect(scalarType).toBeDefined();

      const message = getTypeMismatchMessage(vec3Type!, scalarType!);

      // Should mention component count difference
      expect(message).toContain('3 component');
      expect(message).toContain('1 component');
      expect(message).toContain('Vec3');
      expect(message).toContain('Scalar');
    });

    it('provides clear error for vec2 to scalar mismatch', () => {
      const vec2Type = getTypeDesc('Signal<vec2>');
      const scalarType = getTypeDesc('Signal<float>');

      expect(vec2Type).toBeDefined();
      expect(scalarType).toBeDefined();

      const message = getTypeMismatchMessage(vec2Type!, scalarType!);

      expect(message).toContain('2 component');
      expect(message).toContain('1 component');
      expect(message).toContain('Vec2');
      expect(message).toContain('Scalar');
    });

    it('provides clear error for color to scalar mismatch', () => {
      const colorType = getTypeDesc('Signal<color>');
      const scalarType = getTypeDesc('Signal<float>');

      expect(colorType).toBeDefined();
      expect(scalarType).toBeDefined();

      const message = getTypeMismatchMessage(colorType!, scalarType!);

      expect(message).toContain('4 component');
      expect(message).toContain('1 component');
      expect(message).toContain('Color');
    });

    it('provides clear error for vec3 to vec2 mismatch', () => {
      const vec3Type = getTypeDesc('Signal<vec3>');
      const vec2Type = getTypeDesc('Signal<vec2>');

      expect(vec3Type).toBeDefined();
      expect(vec2Type).toBeDefined();

      const message = getTypeMismatchMessage(vec3Type!, vec2Type!);

      expect(message).toContain('3 component');
      expect(message).toContain('2 component');
    });

    it('provides clear error for different worlds', () => {
      const signalType = getTypeDesc('Signal<float>');
      const fieldType = getTypeDesc('Field<float>');

      expect(signalType).toBeDefined();
      expect(fieldType).toBeDefined();

      const message = getTypeMismatchMessage(signalType!, fieldType!);

      expect(message).toContain('different worlds');
      expect(message).toContain('signal');
      expect(message).toContain('field');
    });
  });

  describe('Bundle arity defaults to 1', () => {
    it('treats types without explicit bundleArity as scalar (arity=1)', () => {
      const floatType = getTypeDesc('Signal<float>');
      const intType = getTypeDesc('Signal<int>');

      expect(floatType?.bundleArity).toBe(1);
      expect(intType?.bundleArity).toBe(1);
    });

    it('vec2 has bundleArity=2', () => {
      const vec2Type = getTypeDesc('Signal<vec2>');
      expect(vec2Type?.bundleArity).toBe(2);
    });

    it('vec3 has bundleArity=3', () => {
      const vec3Type = getTypeDesc('Signal<vec3>');
      expect(vec3Type?.bundleArity).toBe(3);
    });

    it('color has bundleArity=4 (RGBA)', () => {
      const colorType = getTypeDesc('Signal<color>');
      expect(colorType?.bundleArity).toBe(4);
    });
  });
});
