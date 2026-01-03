/**
 * Validator tests
 *
 * Tests for the semantic validator - the single source of truth
 * for graph validation rules.
 *
 * NOTE: After bus-block unification (2026-01-02), buses are now BusBlocks.
 * Tests for reserved bus validation, combine mode validation, and publisher
 * warnings have been removed as these are now handled by BusBlock definitions.
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
        edges: [],
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
            type: 'InfiniteTimeRoot',
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
        edges: [],
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
            type: 'InfiniteTimeRoot',
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
        edges: [],
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
            type: 'InfiniteTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source1',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
          {
            id: 'source2',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<float>' }],
            outputs: [{ id: 'scaled', type: 'Signal<float>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'source1', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'target', slotId: 'value' },
          role: { kind: 'user' },
          },
          {
            id: 'conn2',
            from: { kind: 'port', blockId: 'source2', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'target', slotId: 'value' },
          role: { kind: 'user' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const multipleWriterErrors = result.errors.filter(
        (e) => e.title === 'Multiple writers'
      );
      expect(multipleWriterErrors).toHaveLength(1);
    });
  });

  describe('type compatibility validation', () => {
    it('should reject incompatible connections', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'source',
            type: 'NumberSource',
            inputs: [],
            // Signal<float> is incompatible with Signal<Point> (vec2 domain)
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'position', type: 'Signal<Point>' }],
            outputs: [{ id: 'scaled', type: 'Signal<Point>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'source', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'target', slotId: 'position' },
          role: { kind: 'user' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const typeErrors = result.errors.filter((e) => e.code === 'E_TYPE_MISMATCH');
      expect(typeErrors).toHaveLength(1);
      expect(typeErrors[0]?.primaryTarget).toEqual({
        kind: 'port',
        portRef: { blockId: 'target', slotId: 'position', direction: 'input' },
      });
    });

    it('should accept compatible connections', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'source',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<float>' }],
            outputs: [{ id: 'scaled', type: 'Signal<float>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'source', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'target', slotId: 'value' },
          role: { kind: 'user' },
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
            type: 'InfiniteTimeRoot',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'a',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<float>' }],
            outputs: [{ id: 'scaled', type: 'Signal<float>' }],
          },
          {
            id: 'b',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<float>' }],
            outputs: [{ id: 'scaled', type: 'Signal<float>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'time', slotId: 'phase' },
            enabled: true,
            to: { kind: 'port', blockId: 'a', slotId: 'value' },
          role: { kind: 'user' },
          },
          {
            id: 'conn2',
            from: { kind: 'port', blockId: 'a', slotId: 'scaled' },
            enabled: true,
            to: { kind: 'port', blockId: 'b', slotId: 'value' },
          role: { kind: 'user' },
          },
          {
            id: 'conn3',
            from: { kind: 'port', blockId: 'b', slotId: 'scaled' },
            enabled: true,
            to: { kind: 'port', blockId: 'a', slotId: 'value' },
          role: { kind: 'user' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const cycleErrors = result.errors.filter((e) => e.code === 'E_CYCLE_DETECTED');
      expect(cycleErrors).toHaveLength(1);
    });
  });

  describe('endpoint validation', () => {
    it('should reject connections to missing blocks', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'source',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'source', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'missing', slotId: 'value' },
          role: { kind: 'user' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.ok).toBe(false);
      const endpointErrors = result.errors.filter(
        (e) => e.code === 'E_INVALID_CONNECTION'
      );
      expect(endpointErrors.length).toBeGreaterThan(0);
    });
  });

  describe('TimeRoot upstream dependency validation', () => {
    it('should accept TimeRoot with no upstream dependencies', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'InfiniteTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<float>' }],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
        ],
        edges: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const timeRootDepErrors = result.errors.filter(
        (e) => e.code === 'E_TIME_ROOT_UPSTREAM_DEPENDENCY'
      );
      expect(timeRootDepErrors).toHaveLength(0);
    });

    it('should accept TimeRoot with DefaultSource input', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'InfiniteTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<float>' }],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'default',
            type: 'DefaultSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Scalar<float>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'default', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'time', slotId: 'period' },
          role: { kind: 'user' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const timeRootDepErrors = result.errors.filter(
        (e) => e.code === 'E_TIME_ROOT_UPSTREAM_DEPENDENCY'
      );
      expect(timeRootDepErrors).toHaveLength(0);
    });

    it('should reject TimeRoot with evaluated block input', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'InfiniteTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<float>' }],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
        ],
        edges: [
          {
            id: 'conn1',
            from: { kind: 'port', blockId: 'source', slotId: 'value' },
            enabled: true,
            to: { kind: 'port', blockId: 'time', slotId: 'period' },
          role: { kind: 'user' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const timeRootDepErrors = result.errors.filter(
        (e) => e.code === 'E_TIME_ROOT_UPSTREAM_DEPENDENCY'
      );
      expect(timeRootDepErrors).toHaveLength(1);
      expect(timeRootDepErrors[0]?.message).toContain(
        'TimeRoot cannot depend on block "NumberSource"'
      );
    });
  });

  describe('preflight validation', () => {
    it('should allow valid connections', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'source',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<float>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'value', type: 'Signal<float>' }],
            outputs: [{ id: 'scaled', type: 'Signal<float>' }],
          },
        ],
        edges: [],
      };

      const validator = new Validator(patch, 1);
      const result = validator.canAddConnection(
        patch,
        { blockId: 'source', slotId: 'value', direction: 'output' },
        { blockId: 'target', slotId: 'value', direction: 'input' }
      );

      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
