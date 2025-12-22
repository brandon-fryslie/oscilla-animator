/**
 * Composite Store Tests
 *
 * Tests for composite validation - ensures TimeRoot blocks
 * cannot be included in composite definitions.
 */

import { describe, it, expect } from 'vitest';
import type { Composite } from '../../types';
import { portRefToKey } from '../../types';
import { validateCompositeDefinition } from '../CompositeStore';

describe('Composite Validation', () => {
  describe('validateCompositeDefinition', () => {
    it('should accept composite without TimeRoot blocks', () => {
      const composite: Composite = {
        id: 'test-composite',
        name: 'Test Composite',
        blocks: [
          {
            id: 'block1',
            type: 'NumberSource',
            label: 'NumberSource',
            category: 'Math',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>', label: 'value', direction: 'output' }],
            params: {},
          },
          {
            id: 'block2',
            type: 'Scale',
            label: 'Scale',
            category: 'Math',
            inputs: [{ id: 'value', type: 'Signal<number>', label: 'value', direction: 'input' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>', label: 'scaled', direction: 'output' }],
            params: { scale: 2 },
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: portRefToKey({ blockId: 'block1', slotId: 'value', direction: 'output' }),
            to: portRefToKey({ blockId: 'block2', slotId: 'value', direction: 'input' }),
          },
        ],
      };

      const result = validateCompositeDefinition(composite);

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject composite with CycleTimeRoot', () => {
      const composite: Composite = {
        id: 'bad-composite',
        name: 'Bad Composite',
        blocks: [
          {
            id: 'timeroot',
            type: 'CycleTimeRoot',
            label: 'CycleTimeRoot',
            category: 'TimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>', label: 'phase', direction: 'output' }],
            params: {},
          },
          {
            id: 'block2',
            type: 'Scale',
            label: 'Scale',
            category: 'Math',
            inputs: [{ id: 'value', type: 'Signal<number>', label: 'value', direction: 'input' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>', label: 'scaled', direction: 'output' }],
            params: { scale: 2 },
          },
        ],
        connections: [],
      };

      const result = validateCompositeDefinition(composite);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E_COMPOSITE_CONTAINS_TIMEROOT');
      expect(result.errors[0].message).toContain('CycleTimeRoot');
      expect(result.errors[0].blockId).toBe('timeroot');
    });

    it('should reject composite with FiniteTimeRoot', () => {
      const composite: Composite = {
        id: 'bad-composite',
        name: 'Bad Composite',
        blocks: [
          {
            id: 'timeroot',
            type: 'FiniteTimeRoot',
            label: 'FiniteTimeRoot',
            category: 'TimeRoot',
            inputs: [{ id: 'duration', type: 'Signal<number>', label: 'duration', direction: 'input' }],
            outputs: [{ id: 'progress', type: 'Signal<Unit>', label: 'progress', direction: 'output' }],
            params: { duration: 1000 },
          },
        ],
        connections: [],
      };

      const result = validateCompositeDefinition(composite);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E_COMPOSITE_CONTAINS_TIMEROOT');
      expect(result.errors[0].message).toContain('FiniteTimeRoot');
    });

    it('should reject composite with InfiniteTimeRoot', () => {
      const composite: Composite = {
        id: 'bad-composite',
        name: 'Bad Composite',
        blocks: [
          {
            id: 'timeroot',
            type: 'InfiniteTimeRoot',
            label: 'InfiniteTimeRoot',
            category: 'TimeRoot',
            inputs: [],
            outputs: [{ id: 't', type: 'Signal<time>', label: 't', direction: 'output' }],
            params: {},
          },
        ],
        connections: [],
      };

      const result = validateCompositeDefinition(composite);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E_COMPOSITE_CONTAINS_TIMEROOT');
      expect(result.errors[0].message).toContain('InfiniteTimeRoot');
    });

    it('should reject composite with multiple TimeRoot blocks', () => {
      const composite: Composite = {
        id: 'very-bad-composite',
        name: 'Very Bad Composite',
        blocks: [
          {
            id: 'timeroot1',
            type: 'CycleTimeRoot',
            label: 'CycleTimeRoot',
            category: 'TimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>', label: 'phase', direction: 'output' }],
            params: {},
          },
          {
            id: 'timeroot2',
            type: 'FiniteTimeRoot',
            label: 'FiniteTimeRoot',
            category: 'TimeRoot',
            inputs: [{ id: 'duration', type: 'Signal<number>', label: 'duration', direction: 'input' }],
            outputs: [{ id: 'progress', type: 'Signal<Unit>', label: 'progress', direction: 'output' }],
            params: { duration: 1000 },
          },
        ],
        connections: [],
      };

      const result = validateCompositeDefinition(composite);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(2); // One error for each TimeRoot
      expect(result.errors[0].code).toBe('E_COMPOSITE_CONTAINS_TIMEROOT');
      expect(result.errors[1].code).toBe('E_COMPOSITE_CONTAINS_TIMEROOT');
    });

    it('should provide helpful error message', () => {
      const composite: Composite = {
        id: 'bad-composite',
        name: 'My Animation Composite',
        blocks: [
          {
            id: 'timeroot',
            type: 'CycleTimeRoot',
            label: 'CycleTimeRoot',
            category: 'TimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>', label: 'phase', direction: 'output' }],
            params: {},
          },
        ],
        connections: [],
      };

      const result = validateCompositeDefinition(composite);

      expect(result.errors[0].message).toContain(
        'Composite definitions cannot contain TimeRoot blocks'
      );
      expect(result.errors[0].message).toContain('My Animation Composite');
      expect(result.errors[0].message).toContain('CycleTimeRoot');
      expect(result.errors[0].message).toContain(
        'TimeRoot defines patch-level time topology and must be unique'
      );
    });
  });
});