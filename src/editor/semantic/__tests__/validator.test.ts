/**
 * Validator tests
 *
 * Tests for the semantic validator - the single source of truth
 * for graph validation rules.
 */

import { describe, it, expect } from 'vitest';
import { Validator } from '../validator';
import type { PatchDocument } from '../types';

describe('Validator', () => {
  describe('TimeRoot constraint validation', () => {
    it('should require exactly one TimeRoot', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'block1',
            type: 'GridDomain',
            inputs: [],
            outputs: [{ id: 'domain', type: 'Domain' }],
          },
        ],
        connections: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('E_TIME_ROOT_MISSING');
    });

    it('should reject multiple TimeRoots', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time1',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'time2',
            type: 'FiniteTimeRoot',
            inputs: [],
            outputs: [{ id: 'progress', type: 'Signal<Unit>' }],
          },
        ],
        connections: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('E_TIME_ROOT_MULTIPLE');
    });

    it('should accept exactly one TimeRoot', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time1',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'render',
            type: 'RenderInstances2D',
            inputs: [],
            outputs: [{ id: 'render', type: 'Render' }],
          },
        ],
        connections: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      // Should have no TimeRoot errors
      const timeRootErrors = result.errors.filter((e) =>
        e.code.includes('TIME_ROOT')
      );
      expect(timeRootErrors).toHaveLength(0);
    });
  });

  describe('unique writer validation', () => {
    it('should reject multiple wires to same input', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source1',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'source2',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source1', slotId: 'value' },
            to: { blockId: 'target', slotId: 'value' },
          },
          {
            id: 'conn2',
            from: { blockId: 'source2', slotId: 'value' },
            to: { blockId: 'target', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const multiWriterErrors = result.errors.filter((e) =>
        e.title.includes('Multiple writers')
      );
      expect(multiWriterErrors.length).toBeGreaterThan(0);
    });

    it('should allow single wire to input', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'target', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const multiWriterErrors = result.errors.filter((e) =>
        e.message.includes('Multiple writers')
      );
      expect(multiWriterErrors).toHaveLength(0);
    });
  });

  describe('type compatibility validation', () => {
    it('should reject incompatible types', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'ColorFromHex',
            inputs: [{ id: 'hex', type: 'Field<string>' }],
            outputs: [{ id: 'color', type: 'Field<color>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'target', slotId: 'hex' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const typeErrors = result.errors.filter((e) => e.code === 'E_TYPE_MISMATCH');
      expect(typeErrors.length).toBeGreaterThan(0);
    });

    it('should accept compatible types', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'target', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const typeErrors = result.errors.filter((e) => e.code === 'E_TYPE_MISMATCH');
      expect(typeErrors).toHaveLength(0);
    });
  });

  describe('cycle detection', () => {
    it('should reject cycles', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'a',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
          {
            id: 'b',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'a', slotId: 'scaled' },
            to: { blockId: 'b', slotId: 'value' },
          },
          {
            id: 'conn2',
            from: { blockId: 'b', slotId: 'scaled' },
            to: { blockId: 'a', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const cycleErrors = result.errors.filter((e) => e.code === 'E_CYCLE_DETECTED');
      expect(cycleErrors.length).toBeGreaterThan(0);
    });

    it('should accept acyclic graphs', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'a',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'b',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'a', slotId: 'value' },
            to: { blockId: 'b', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const cycleErrors = result.errors.filter((e) => e.code === 'E_CYCLE_DETECTED');
      expect(cycleErrors).toHaveLength(0);
    });
  });

  describe('endpoint validation', () => {
    it('should reject connections with missing blocks', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'nonexistent', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const endpointErrors = result.errors.filter((e) =>
        e.message.includes('missing block')
      );
      expect(endpointErrors.length).toBeGreaterThan(0);
    });

    it('should reject connections with missing slots', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'nonexistent' },
            to: { blockId: 'target', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const endpointErrors = result.errors.filter((e) =>
        e.message.includes('missing output slot')
      );
      expect(endpointErrors.length).toBeGreaterThan(0);
    });
  });

  describe('preflight validation', () => {
    it('should preflight reject incompatible connection', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'ColorFromHex',
            inputs: [{ id: 'hex', type: 'Field<string>' }],
            outputs: [{ id: 'color', type: 'Field<color>' }],
          },
        ],
        connections: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.canAddConnection(
        patch,
        { blockId: 'source', slotId: 'value' },
        { blockId: 'target', slotId: 'hex' }
      );

      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe('E_TYPE_MISMATCH');
    });

    it('should preflight reject connection that would create cycle', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'a',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
          {
            id: 'b',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'a', slotId: 'scaled' },
            to: { blockId: 'b', slotId: 'value' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.canAddConnection(
        patch,
        { blockId: 'b', slotId: 'scaled' },
        { blockId: 'a', slotId: 'value' }
      );

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_CYCLE_DETECTED')).toBe(true);
    });

    it('should preflight accept valid connection', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'Oscillator',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<number>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.canAddConnection(
        patch,
        { blockId: 'source', slotId: 'value' },
        { blockId: 'target', slotId: 'value' }
      );

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('bus warnings', () => {
    it('should warn about empty buses', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
        ],
        connections: [],
        buses: [
          {
            id: 'energy',
            name: 'energy',
            type: {
              world: 'signal',
              domain: 'number',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'sum',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
        publishers: [],
        listeners: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.code).toBe('W_BUS_NO_PUBLISHERS');
    });
  });
});
