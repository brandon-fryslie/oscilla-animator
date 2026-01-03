/**
 * Bus Contracts Tests
 *
 * Tests for reserved bus validation and combine mode compatibility.
 */

import { describe, it, expect } from 'vitest';
import type { TypeDesc } from '../../ir/types/TypeDesc';
import {
  RESERVED_BUS_CONTRACTS,
  validateReservedBus,
  validateCombineModeCompatibility,
  validateBusIRSupport,
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
  });

  describe('validateReservedBus', () => {
    it('should validate correct reserved bus (phaseA)', () => {
      const type: TypeDesc = {
        world: 'signal',
        domain: 'float',
        semantics: 'phase(primary)',
        category: 'core',
        busEligible: true,
      };
      const errors = validateReservedBus('phaseA', type, 'last');
      expect(errors).toHaveLength(0);
    });

    it('should detect type mismatch for reserved bus', () => {
      const type: TypeDesc = {
        world: 'signal',
        domain: 'float',
        semantics: 'energy', // Wrong semantics
        category: 'core',
        busEligible: true,
      };
      const errors = validateReservedBus('phaseA', type, 'last');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe('E_RESERVED_BUS_TYPE_MISMATCH');
    });

    it('should detect combine mode mismatch for reserved bus', () => {
      const type: TypeDesc = {
        world: 'signal',
        domain: 'float',
        semantics: 'phase(primary)',
        category: 'core',
        busEligible: true,
      };
      const errors = validateReservedBus('phaseA', type, 'sum'); // Wrong combine mode
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe('E_RESERVED_BUS_COMBINE_MODE_MISMATCH');
    });

    it('should allow custom bus names without validation', () => {
      const type: TypeDesc = {
        world: 'signal',
        domain: 'float',
        category: 'core',
        busEligible: true,
      };
      const errors = validateReservedBus('myCustomBus', type, 'sum');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateCombineModeCompatibility', () => {
    it('should allow all modes for float domain', () => {
      expect(validateCombineModeCompatibility('float', 'sum')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'average')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'max')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'min')).toBeNull();
      expect(validateCombineModeCompatibility('float', 'last')).toBeNull();
    });

    it('should only allow "last" for vec2 domain', () => {
      expect(validateCombineModeCompatibility('vec2', 'last')).toBeNull();
      const error = validateCombineModeCompatibility('vec2', 'sum');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('E_BUS_COMBINE_MODE_INCOMPATIBLE');
    });

    it('should only allow "last" for color domain', () => {
      expect(validateCombineModeCompatibility('color', 'last')).toBeNull();
      const error = validateCombineModeCompatibility('color', 'sum');
      expect(error).not.toBeNull();
    });

    it('should allow "sum" and "last" for duration', () => {
      expect(validateCombineModeCompatibility('duration', 'sum')).toBeNull();
      expect(validateCombineModeCompatibility('duration', 'last')).toBeNull();
      const error = validateCombineModeCompatibility('duration', 'average');
      expect(error).not.toBeNull();
    });

    it('should allow any mode for unknown domains', () => {
      expect(validateCombineModeCompatibility('unknownDomain', 'sum')).toBeNull();
      expect(validateCombineModeCompatibility('unknownDomain', 'last')).toBeNull();
    });
  });

  describe('validateBusIRSupport', () => {
    it('should allow numeric signal buses', () => {
      const floatType: TypeDesc = {
        world: 'signal',
        domain: 'float',
        category: 'core',
        busEligible: true,
      };
      expect(validateBusIRSupport('testBus', floatType)).toBeNull();

      const intType: TypeDesc = {
        world: 'signal',
        domain: 'int',
        category: 'core',
        busEligible: true,
      };
      expect(validateBusIRSupport('testBus', intType)).toBeNull();
    });

    it('should allow numeric field buses', () => {
      const floatType: TypeDesc = {
        world: 'field',
        domain: 'float',
        category: 'core',
        busEligible: true,
      };
      expect(validateBusIRSupport('testBus', floatType)).toBeNull();
    });

    it('should reject non-numeric signal buses', () => {
      const vec2Type: TypeDesc = {
        world: 'signal',
        domain: 'vec2',
        category: 'core',
        busEligible: true,
      };
      const error = validateBusIRSupport('testBus', vec2Type);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('E_BUS_UNSUPPORTED_IR_TYPE');
      expect(error?.domain).toBe('vec2');
    });

    it('should reject non-numeric field buses', () => {
      const colorType: TypeDesc = {
        world: 'field',
        domain: 'color',
        category: 'core',
        busEligible: true,
      };
      const error = validateBusIRSupport('testBus', colorType);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('E_BUS_UNSUPPORTED_IR_TYPE');
    });

    it('should allow event buses', () => {
      const eventType: TypeDesc = {
        world: 'event',
        domain: 'trigger',
        category: 'core',
        busEligible: true,
      };
      expect(validateBusIRSupport('pulse', eventType)).toBeNull();
    });
  });
});
