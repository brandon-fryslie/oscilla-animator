/**
 * Bus Contracts Tests
 *
 * Tests for reserved bus validation and combine mode compatibility.
 */

import { describe, it, expect } from 'vitest';
import type { BusCombineMode, TypeDesc } from '../../types';
import {
  RESERVED_BUS_CONTRACTS,
  validateReservedBus,
  validateCombineModeCompatibility,
  isReservedBusName,
} from '../busContracts';

describe('Bus Contracts', () => {
  describe('Reserved Bus Contracts', () => {
    it('should have correct contracts for all reserved buses', () => {
      expect(RESERVED_BUS_CONTRACTS.phaseA).toEqual({
        type: {
          world: 'signal',
          domain: 'float',
          semantics: 'phase(primary)',
          category: 'core',
          busEligible: true,
        },
        combineMode: 'last',
        description: 'Primary phase signal',
      });

      expect(RESERVED_BUS_CONTRACTS.energy).toEqual({
        type: {
          world: 'signal',
          domain: 'float',
          semantics: 'energy',
          category: 'core',
          busEligible: true,
        },
        combineMode: 'sum',
        description: 'Energy/intensity contributions from multiple sources',
      });
    });

    it('should identify reserved bus names', () => {
      expect(isReservedBusName('phaseA')).toBe(true);
      expect(isReservedBusName('energy')).toBe(true);
      expect(isReservedBusName('customBus')).toBe(false);
      expect(isReservedBusName('')).toBe(false);
    });

    it('should validate correct reserved bus contracts', () => {
      const correctPhaseA: TypeDesc = {
        world: 'signal',
        domain: 'float',
        semantics: 'phase(primary)',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('phaseA', correctPhaseA, 'last');
      expect(errors).toHaveLength(0);
    });

    it('should reject reserved bus with wrong type', () => {
      const wrongType: TypeDesc = {
        world: 'signal',
        domain: 'float', // Wrong semantics
        semantics: 'primary',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('phaseA', wrongType, 'last');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E_RESERVED_BUS_TYPE_MISMATCH');
      expect(errors[0].message).toContain('must have type signal:float');
    });

    it('should reject reserved bus with wrong combine mode', () => {
      const correctType: TypeDesc = {
        world: 'signal',
        domain: 'float',
        semantics: 'phase(primary)',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('phaseA', correctType, 'sum' as BusCombineMode);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E_RESERVED_BUS_COMBINE_MODE_MISMATCH');
      expect(errors[0].message).toContain('must use combineMode="last"');
    });

    it('should validate multiple errors for reserved bus', () => {
      const wrongType: TypeDesc = {
        world: 'field', // Wrong world
        domain: 'float', // Wrong domain
        semantics: 'wrong', // Wrong semantics
        category: 'internal', // Wrong category
        busEligible: false, // Wrong busEligible
      };

      const errors = validateReservedBus('energy', wrongType, 'last' as BusCombineMode);
      expect(errors).toHaveLength(2); // Type error + combine mode error
    });

    it('should allow non-reserved buses with any type', () => {
      const customType: TypeDesc = {
        world: 'signal',
        domain: 'color',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('customBus', customType, 'sum');
      expect(errors).toHaveLength(0);
    });
  });

  describe('Combine Mode Compatibility', () => {
    it('should allow compatible combine modes', () => {
      // Number domain allows many combine modes
      expect(validateCombineModeCompatibility('float', 'sum')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'average')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'max')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'min')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'last')).toBeNull();

      // Trigger domain allows last
      expect(validateCombineModeCompatibility('trigger', 'last')).toBeNull();
    });

    it('should reject incompatible combine modes', () => {
      // Trigger domain only allows last
      const error = validateCombineModeCompatibility('trigger', 'sum');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('E_BUS_COMBINE_MODE_INCOMPATIBLE');
      expect(error!.expected).toEqual(['last']);
    });

    it('should allow unknown domains (graceful degradation)', () => {
      // Unknown domains should not throw errors, just return null
      expect(validateCombineModeCompatibility('unknownDomain', 'sum')).toBeNull();
    });

    it('should handle field domains correctly (AC3: layer mode removed)', () => {
      // AC3: Field domains now only support 'last' (no 'layer' support in runtime)
      // Runtime constraints:
      // - busSemantics.ts line 210-230: 'layer' NOT implemented for fields
      // - Materializer.ts line 1214: only Field<float> supported
      expect(validateCombineModeCompatibility('vec2', 'last')).toBeNull();

      // AC3: 'layer' mode now rejected (was previously in compatibility matrix but not supported by runtime)
      const layerError = validateCombineModeCompatibility('vec2', 'layer');
      expect(layerError).not.toBeNull();
      expect(layerError!.code).toBe('E_BUS_COMBINE_MODE_INCOMPATIBLE');
      expect(layerError!.expected).toEqual(['last']);

      // 'sum' still rejected (vec2 is non-numeric, would fail AC2 compile-time check anyway)
      const sumError = validateCombineModeCompatibility('vec2', 'sum');
      expect(sumError).not.toBeNull();
      expect(sumError!.expected).toEqual(['last']);
    });
  });
});
