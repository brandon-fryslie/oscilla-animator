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
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'source2',
            type: 'NumberSource',
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
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'target',
            type: 'Scale',
            inputs: [{ id: 'phase', type: 'Signal<phase>' }],
            outputs: [{ id: 'scaled', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'target', slotId: 'phase' },
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const typeErrors = result.errors.filter((e) => e.code === 'E_TYPE_MISMATCH');
      expect(typeErrors).toHaveLength(1);
      expect(typeErrors[0]?.primaryTarget).toEqual({
        kind: 'port',
        blockId: 'target',
        portId: 'phase',
      });
    });

    it('should accept compatible connections', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'source',
            type: 'NumberSource',
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
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'missing', slotId: 'value' },
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

  describe('reserved bus validation', () => {
    it('should accept correct reserved bus contracts', () => {
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
            id: 'phaseA',
            name: 'phaseA',
            type: {
              world: 'signal',
              domain: 'phase',
              semantics: 'primary',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: 0,
            sortKey: 0,
          },
          {
            id: 'energy',
            name: 'energy',
            type: {
              world: 'signal',
              domain: 'number',
              semantics: 'energy',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'sum',
            defaultValue: 0,
            sortKey: 1,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const reservedBusErrors = result.errors.filter((e) =>
        e.code.includes('RESERVED_BUS')
      );
      expect(reservedBusErrors).toHaveLength(0);
    });

    it('should reject reserved bus with wrong type', () => {
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
            id: 'phaseA',
            name: 'phaseA',
            type: {
              world: 'signal',
              domain: 'number', // Wrong domain for phaseA
              semantics: 'primary',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const typeMismatchErrors = result.errors.filter(
        (e) => e.code === 'E_RESERVED_BUS_TYPE_MISMATCH'
      );
      expect(typeMismatchErrors).toHaveLength(1);
      expect(typeMismatchErrors[0]?.message).toContain(
        'must have type signal:phase'
      );
    });

    it('should reject reserved bus with wrong combine mode', () => {
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
              semantics: 'energy',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last', // Wrong combine mode for energy
            defaultValue: 0,
            sortKey: 0,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const combineModeErrors = result.errors.filter(
        (e) => e.code === 'E_RESERVED_BUS_COMBINE_MODE_MISMATCH'
      );
      expect(combineModeErrors).toHaveLength(1);
      expect(combineModeErrors[0]?.message).toContain(
        'must use combineMode="sum"'
      );
    });

    it('should allow non-reserved buses with any configuration', () => {
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
            id: 'custom',
            name: 'customBus',
            type: {
              world: 'signal',
              domain: 'color',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: '#ffffff',
            sortKey: 0,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const reservedBusErrors = result.errors.filter((e) =>
        e.code.includes('RESERVED_BUS')
      );
      expect(reservedBusErrors).toHaveLength(0);
    });
  });

  describe('TimeRoot upstream dependency validation', () => {
    it('should accept TimeRoot with no upstream dependencies', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<number>' }],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
        ],
        connections: [],
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
            type: 'CycleTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<number>' }],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'default',
            type: 'DefaultSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Scalar<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'default', slotId: 'value' },
            to: { blockId: 'time', slotId: 'period' },
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
            type: 'CycleTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<number>' }],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
        ],
        connections: [
          {
            id: 'conn1',
            from: { blockId: 'source', slotId: 'value' },
            to: { blockId: 'time', slotId: 'period' },
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

    it('should reject TimeRoot with bus listener', () => {
      const patch: PatchDocument = {
        blocks: [
          {
            id: 'time',
            type: 'CycleTimeRoot',
            inputs: [{ id: 'period', type: 'Scalar<number>' }],
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
        listeners: [
          {
            id: 'listener1',
            busId: 'energy',
            to: { blockId: 'time', slotId: 'period', dir: 'input' },
            enabled: true,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const busListenerErrors = result.errors.filter(
        (e) => e.code === 'E_TIME_ROOT_BUS_LISTENER'
      );
      expect(busListenerErrors).toHaveLength(1);
      expect(busListenerErrors[0]?.message).toContain(
        'TimeRoot cannot have bus listeners'
      );
    });
  });

  describe('combine mode compatibility validation', () => {
    it('should accept compatible combine modes', () => {
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
            id: 'numbers',
            name: 'numbers',
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
          {
            id: 'phases',
            name: 'phases',
            type: {
              world: 'signal',
              domain: 'phase',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: 0,
            sortKey: 1,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const combineModeErrors = result.errors.filter(
        (e) => e.code === 'E_BUS_COMBINE_MODE_INCOMPATIBLE'
      );
      expect(combineModeErrors).toHaveLength(0);
    });

    it('should reject incompatible combine modes', () => {
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
            id: 'phases',
            name: 'phases',
            type: {
              world: 'signal',
              domain: 'phase',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'sum', // Incompatible with phase domain
            defaultValue: 0,
            sortKey: 0,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const combineModeErrors = result.errors.filter(
        (e) => e.code === 'E_BUS_COMBINE_MODE_INCOMPATIBLE'
      );
      expect(combineModeErrors).toHaveLength(1);
      expect(combineModeErrors[0]?.message).toContain(
        'cannot use combineMode="sum"'
      );
      expect(combineModeErrors[0]?.message).toContain('Allowed modes: last');
    });

    it('should skip compatibility check for reserved buses', () => {
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
            id: 'phaseA',
            name: 'phaseA',
            type: {
              world: 'signal',
              domain: 'phase',
              semantics: 'primary',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'sum', // Wrong for reserved bus, but handled by reserved bus validation
            defaultValue: 0,
            sortKey: 0,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      // Should get reserved bus error, not compatibility error
      const combineModeErrors = result.errors.filter(
        (e) => e.code === 'E_BUS_COMBINE_MODE_INCOMPATIBLE'
      );
      const reservedBusErrors = result.errors.filter(
        (e) => e.code === 'E_RESERVED_BUS_COMBINE_MODE_MISMATCH'
      );

      expect(combineModeErrors).toHaveLength(0);
      expect(reservedBusErrors).toHaveLength(1);
    });
  });

  describe('multiple publisher validation', () => {
    it('should warn about multiple publishers on control buses', () => {
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
            type: 'PhaseClock',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
          {
            id: 'source2',
            type: 'PhaseClock',
            inputs: [],
            outputs: [{ id: 'phase', type: 'Signal<phase>' }],
          },
        ],
        connections: [],
        buses: [
          {
            id: 'phaseA',
            name: 'phaseA',
            type: {
              world: 'signal',
              domain: 'phase',
              semantics: 'primary',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'last',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
        publishers: [
          {
            id: 'pub1',
            busId: 'phaseA',
            from: { blockId: 'source1', slotId: 'phase', dir: 'output' },
            enabled: true,
            sortKey: 0,
          },
          {
            id: 'pub2',
            busId: 'phaseA',
            from: { blockId: 'source2', slotId: 'phase', dir: 'output' },
            enabled: true,
            sortKey: 1,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const multiplePubWarnings = result.warnings.filter(
        (e) => e.code === 'W_BUS_MULTIPLE_PUBLISHERS_CONTROL'
      );
      expect(multiplePubWarnings).toHaveLength(1);
      expect(multiplePubWarnings[0]?.message).toContain(
        'Control-plane bus "phaseA" has 2 publishers'
      );
    });

    it('should allow multiple publishers on data buses', () => {
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
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
          },
          {
            id: 'source2',
            type: 'NumberSource',
            inputs: [],
            outputs: [{ id: 'value', type: 'Signal<number>' }],
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
              semantics: 'energy',
              category: 'core',
              busEligible: true,
            },
            combineMode: 'sum',
            defaultValue: 0,
            sortKey: 0,
          },
        ],
        publishers: [
          {
            id: 'pub1',
            busId: 'energy',
            from: { blockId: 'source1', slotId: 'value', dir: 'output' },
            enabled: true,
            sortKey: 0,
          },
          {
            id: 'pub2',
            busId: 'energy',
            from: { blockId: 'source2', slotId: 'value', dir: 'output' },
            enabled: true,
            sortKey: 1,
          },
        ],
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      const multiplePubWarnings = result.warnings.filter(
        (e) => e.code === 'W_BUS_MULTIPLE_PUBLISHERS_CONTROL'
      );
      expect(multiplePubWarnings).toHaveLength(0);
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
      };

      const validator = new Validator(patch, 1);
      const result = validator.validateAll(patch);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.code).toBe('W_BUS_NO_PUBLISHERS');
    });
  });
});