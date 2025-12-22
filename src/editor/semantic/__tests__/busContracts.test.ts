/**
 * Bus Contracts Tests
 *
 * Tests for reserved bus validation and combine mode compatibility.
 */

import { describe, it, expect } from 'vitest';
import type { TypeDesc } from '../../types';
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
          domain: 'phase',
          semantics: 'primary',
          category: 'core',
          busEligible: true,
        },
        combineMode: 'last',
        description: 'Primary phase signal',
      });

      expect(RESERVED_BUS_CONTRACTS.energy).toEqual({
        type: {
          world: 'signal',
          domain: 'number',
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
        domain: 'phase',
        semantics: 'primary',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('phaseA', correctPhaseA, 'last');
      expect(errors).toHaveLength(0);
    });

    it('should reject reserved bus with wrong type', () => {
      const wrongType: TypeDesc = {
        world: 'signal',
        domain: 'number', // Wrong domain
        semantics: 'primary',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('phaseA', wrongType, 'last');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E_RESERVED_BUS_TYPE_MISMATCH');
      expect(errors[0].message).toContain('must have type signal:phase');
    });

    it('should reject reserved bus with wrong combine mode', () => {
      const correctType: TypeDesc = {
        world: 'signal',
        domain: 'phase',
        semantics: 'primary',
        category: 'core',
        busEligible: true,
      };

      const errors = validateReservedBus('phaseA', correctType, 'sum' as any);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E_RESERVED_BUS_COMBINE_MODE_MISMATCH');
      expect(errors[0].message).toContain('must use combineMode="last"');
    });

    it('should validate multiple errors for reserved bus', () => {
      const wrongType: TypeDesc = {
        world: 'field', // Wrong world
        domain: 'number', // Wrong domain
        semantics: 'wrong', // Wrong semantics
        category: 'internal', // Wrong category
        busEligible: false, // Wrong busEligible
      };

      const errors = validateReservedBus('energy', wrongType, 'last' as any);
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
      expect(validateCombineModeCompatibility('number', 'sum')).toBeNull();
      expect(validateCombineModeCompatibility('number', 'average')).toBeNull();
      expect(validateCombineModeCompatibility('number', 'max')).toBeNull();
      expect(validateCombineModeCompatibility('number', 'min')).toBeNull();
      expect(validateCombineModeCompatibility('number', 'last')).toBeNull();

      // Phase domain only allows last
      expect(validateCombineModeCompatibility('phase', 'last')).toBeNull();

      // Trigger domain allows last
      expect(validateCombineModeCompatibility('trigger', 'last')).toBeNull();
    });

    it('should reject incompatible combine modes', () => {
      const error = validateCombineModeCompatibility('phase', 'sum');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('E_BUS_COMBINE_MODE_INCOMPATIBLE');
      expect(error!.message).toContain('cannot use combineMode="sum"');
      expect(error!.expected).toEqual(['last']);
      expect(error!.actual).toBe('sum');
    });

    it('should reject incompatible modes for trigger domain', () => {
      const error = validateCombineModeCompatibility('trigger', 'sum');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('E_BUS_COMBINE_MODE_INCOMPATIBLE');
      expect(error!.expected).toEqual(['last']);
    });

    it('should allow unknown domains (graceful degradation)', () => {
      // Unknown domains should not throw errors, just return null
      expect(validateCombineModeCompatibility('unknownDomain', 'sum')).toBeNull();
    });

    it('should handle field domains correctly', () => {
      expect(validateCombineModeCompatibility('vec2', 'last')).toBeNull();
      expect(validateCombineModeCompatibility('vec2', 'layer')).toBeNull();

      const error = validateCombineModeCompatibility('vec2', 'sum');
      expect(error).not.toBeNull();
      expect(error!.expected).toEqual(['last', 'layer']);
    });
  });
});