/**
 * @file Domain.test.ts - Tests for Domain system
 */

import { describe, it, expect } from 'vitest';
import {
  createSimpleDomain,
  createDomain,
  domainsAreCompatible,
  validateDomainCompatibility,
  DomainMismatchError,
} from '../Domain';

describe('Domain', () => {
  describe('createSimpleDomain', () => {
    it('should create domain with numeric element IDs', () => {
      const domain = createSimpleDomain('test', 5);

      expect(domain.id).toBe('test');
      expect(domain.elements).toEqual(['0', '1', '2', '3', '4']);
      expect(domain.topology).toBeUndefined();
    });

    it('should create empty domain for count 0', () => {
      const domain = createSimpleDomain('empty', 0);

      expect(domain.id).toBe('empty');
      expect(domain.elements).toEqual([]);
    });
  });

  describe('createDomain', () => {
    it('should create domain with custom element IDs', () => {
      const domain = createDomain('custom', ['a', 'b', 'c']);

      expect(domain.id).toBe('custom');
      expect(domain.elements).toEqual(['a', 'b', 'c']);
    });

    it('should handle empty element list', () => {
      const domain = createDomain('empty', []);

      expect(domain.id).toBe('empty');
      expect(domain.elements).toEqual([]);
    });
  });

  describe('domainsAreCompatible', () => {
    it('should return true for identical domains', () => {
      const a = createSimpleDomain('a', 3);
      const b = createSimpleDomain('b', 3);

      expect(domainsAreCompatible(a, b)).toBe(true);
    });

    it('should return false for different element counts', () => {
      const a = createSimpleDomain('a', 3);
      const b = createSimpleDomain('b', 5);

      expect(domainsAreCompatible(a, b)).toBe(false);
    });

    it('should return false for different element IDs', () => {
      const a = createDomain('a', ['1', '2', '3']);
      const b = createDomain('b', ['a', 'b', 'c']);

      expect(domainsAreCompatible(a, b)).toBe(false);
    });

    it('should return false for different element order', () => {
      const a = createDomain('a', ['1', '2', '3']);
      const b = createDomain('b', ['3', '2', '1']);

      expect(domainsAreCompatible(a, b)).toBe(false);
    });

    it('should return true for compatible domains with same elements', () => {
      const a = createDomain('a', ['x', 'y', 'z']);
      const b = createDomain('b', ['x', 'y', 'z']);

      expect(domainsAreCompatible(a, b)).toBe(true);
    });

    it('should handle empty domains', () => {
      const a = createDomain('a', []);
      const b = createDomain('b', []);

      expect(domainsAreCompatible(a, b)).toBe(true);
    });
  });

  describe('validateDomainCompatibility', () => {
    it('should not throw for compatible domains', () => {
      const a = createSimpleDomain('a', 3);
      const b = createSimpleDomain('b', 3);

      expect(() => {
        validateDomainCompatibility(a, b, 'test');
      }).not.toThrow();
    });

    it('should throw DomainMismatchError for incompatible domains', () => {
      const a = createSimpleDomain('a', 3);
      const b = createSimpleDomain('b', 5);

      expect(() => {
        validateDomainCompatibility(a, b, 'test context');
      }).toThrow(DomainMismatchError);
    });

    it('should include context in error message', () => {
      const a = createSimpleDomain('domainA', 3);
      const b = createSimpleDomain('domainB', 5);

      try {
        validateDomainCompatibility(a, b, 'zip operation');
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DomainMismatchError);
        const error = err as DomainMismatchError;
        expect(error.message).toContain('zip operation');
        expect(error.message).toContain('domainA');
        expect(error.message).toContain('domainB');
      }
    });
  });

  describe('DomainMismatchError', () => {
    it('should contain expected properties', () => {
      const error = new DomainMismatchError('domainA', 'domainB', 'test');

      expect(error.name).toBe('DomainMismatchError');
      expect(error.expectedDomain).toBe('domainA');
      expect(error.actualDomain).toBe('domainB');
      expect(error.context).toBe('test');
    });
  });

  describe('Element identity stability', () => {
    it('should maintain stable element IDs across multiple domain creations', () => {
      const domain1 = createSimpleDomain('test', 3);
      const domain2 = createSimpleDomain('test', 3);

      // Same IDs should be generated
      expect(domain1.elements).toEqual(domain2.elements);
    });

    it('should preserve custom element ID ordering', () => {
      const ids = ['z', 'y', 'x', 'w'];
      const domain = createDomain('ordered', ids);

      // Order must be preserved for stable iteration
      expect(domain.elements).toEqual(ids);
    });
  });
});
