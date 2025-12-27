/**
 * @file Transaction Operations Tests
 * @description Tests for Op inversion and validation.
 */

import { computeInverse, validateOp, type Op, type Entity } from '../ops';
import type { Block, Connection, Bus } from '../../types';

describe('computeInverse', () => {
  describe('Add ops', () => {
    it('inverts Add to Remove with entity payload', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const op: Op = {
        type: 'Add',
        table: 'blocks',
        entity: block,
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'Remove',
        table: 'blocks',
        id: 'block-1',
        removed: block,
      });
    });
  });

  describe('Remove ops', () => {
    it('inverts Remove to Add with restored entity', () => {
      const connection: Connection = {
        id: 'conn-1',
        from: { blockId: 'block-1', slotId: 'out', direction: 'output' },
        to: { blockId: 'block-2', slotId: 'in', direction: 'input' },
      };

      const op: Op = {
        type: 'Remove',
        table: 'connections',
        id: 'conn-1',
        removed: connection,
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'Add',
        table: 'connections',
        entity: connection,
      });
    });
  });

  describe('Update ops', () => {
    it('inverts Update by swapping prev/next', () => {
      const prevBus: Bus = {
        id: 'bus-1',
        name: 'Test Bus',
        type: {
          world: 'signal',
          domain: 'number',
          category: 'core',
          busEligible: true,
        },
        combineMode: 'sum',
        defaultValue: 0,
        sortKey: 0,
      };

      const nextBus: Bus = {
        ...prevBus,
        name: 'Updated Bus',
        combineMode: 'average',
      };

      const op: Op = {
        type: 'Update',
        table: 'buses',
        id: 'bus-1',
        prev: prevBus,
        next: nextBus,
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'Update',
        table: 'buses',
        id: 'bus-1',
        prev: nextBus,
        next: prevBus,
      });
    });
  });

  describe('SetBlockPosition ops', () => {
    it('inverts SetBlockPosition by swapping prev/next', () => {
      const op: Op = {
        type: 'SetBlockPosition',
        blockId: 'block-1',
        prev: { x: 100, y: 200 },
        next: { x: 150, y: 250 },
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'SetBlockPosition',
        blockId: 'block-1',
        prev: { x: 150, y: 250 },
        next: { x: 100, y: 200 },
      });
    });
  });

  describe('SetTimeRoot ops', () => {
    it('inverts SetTimeRoot by swapping prev/next', () => {
      const op: Op = {
        type: 'SetTimeRoot',
        prev: 'block-1',
        next: 'block-2',
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'SetTimeRoot',
        prev: 'block-2',
        next: 'block-1',
      });
    });

    it('handles undefined values', () => {
      const op: Op = {
        type: 'SetTimeRoot',
        prev: undefined,
        next: 'block-1',
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'SetTimeRoot',
        prev: 'block-1',
        next: undefined,
      });
    });
  });

  describe('SetTimelineHint ops', () => {
    it('inverts SetTimelineHint by swapping prev/next', () => {
      const op: Op = {
        type: 'SetTimelineHint',
        prev: { duration: 5 },
        next: { duration: 10 },
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'SetTimelineHint',
        prev: { duration: 10 },
        next: { duration: 5 },
      });
    });
  });

  describe('Many ops', () => {
    it('inverts Many by reversing and inverting each op', () => {
      const block1: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Block 1',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const block2: Block = {
        id: 'block-2',
        type: 'test',
        label: 'Block 2',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const op: Op = {
        type: 'Many',
        ops: [
          { type: 'Add', table: 'blocks', entity: block1 },
          { type: 'Add', table: 'blocks', entity: block2 },
          { type: 'SetTimeRoot', prev: undefined, next: 'block-1' },
        ],
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'Many',
        ops: [
          { type: 'SetTimeRoot', prev: 'block-1', next: undefined },
          { type: 'Remove', table: 'blocks', id: 'block-2', removed: block2 },
          { type: 'Remove', table: 'blocks', id: 'block-1', removed: block1 },
        ],
      });
    });

    it('handles nested Many ops', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Block',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const op: Op = {
        type: 'Many',
        ops: [
          { type: 'Add', table: 'blocks', entity: block },
          {
            type: 'Many',
            ops: [
              { type: 'SetBlockPosition', blockId: 'block-1', prev: { x: 0, y: 0 }, next: { x: 100, y: 100 } },
            ],
          },
        ],
      };

      const inverse = computeInverse(op);

      expect(inverse).toEqual({
        type: 'Many',
        ops: [
          {
            type: 'Many',
            ops: [
              { type: 'SetBlockPosition', blockId: 'block-1', prev: { x: 100, y: 100 }, next: { x: 0, y: 0 } },
            ],
          },
          { type: 'Remove', table: 'blocks', id: 'block-1', removed: block },
        ],
      });
    });
  });

  describe('round-trip property', () => {
    it('double inversion equals original for Add', () => {
      const block: Block = {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      };

      const op: Op = { type: 'Add', table: 'blocks', entity: block };
      const inverse = computeInverse(op);
      const doubleInverse = computeInverse(inverse);

      expect(doubleInverse).toEqual(op);
    });

    it('double inversion equals original for Update', () => {
      const prev: Entity = {
        id: 'bus-1',
        name: 'Old',
        type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
        combineMode: 'sum',
        defaultValue: 0,
        sortKey: 0,
      } as Bus;

      const next: Entity = { ...prev, name: 'New' } as Bus;

      const op: Op = { type: 'Update', table: 'buses', id: 'bus-1', prev, next };
      const inverse = computeInverse(op);
      const doubleInverse = computeInverse(inverse);

      expect(doubleInverse).toEqual(op);
    });
  });
});

describe('validateOp', () => {
  it('validates well-formed Add op', () => {
    const op: Op = {
      type: 'Add',
      table: 'blocks',
      entity: {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      },
    };

    expect(() => validateOp(op)).not.toThrow();
  });

  it('rejects Add op without entity id', () => {
    const op: Op = {
      type: 'Add',
      table: 'blocks',
      entity: {
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      } as any,
    };

    expect(() => validateOp(op)).toThrow('Add op missing entity id');
  });

  it('validates well-formed Remove op', () => {
    const op: Op = {
      type: 'Remove',
      table: 'blocks',
      id: 'block-1',
      removed: {
        id: 'block-1',
        type: 'test',
        label: 'Test',
        inputs: [],
        outputs: [],
        params: {},
        category: 'Other',
      },
    };

    expect(() => validateOp(op)).not.toThrow();
  });

  it('rejects Remove op without removed entity', () => {
    const op: Op = {
      type: 'Remove',
      table: 'blocks',
      id: 'block-1',
      removed: undefined as any,
    };

    expect(() => validateOp(op)).toThrow('Remove op missing removed entity');
  });

  it('validates well-formed Update op', () => {
    const entity: Bus = {
      id: 'bus-1',
      name: 'Test',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    };

    const op: Op = {
      type: 'Update',
      table: 'buses',
      id: 'bus-1',
      prev: entity,
      next: { ...entity, name: 'Updated' },
    };

    expect(() => validateOp(op)).not.toThrow();
  });

  it('validates SetBlockPosition with valid positions', () => {
    const op: Op = {
      type: 'SetBlockPosition',
      blockId: 'block-1',
      prev: { x: 100, y: 200 },
      next: { x: 150, y: 250 },
    };

    expect(() => validateOp(op)).not.toThrow();
  });

  it('rejects SetBlockPosition with invalid position', () => {
    const op: Op = {
      type: 'SetBlockPosition',
      blockId: 'block-1',
      prev: { x: 'invalid' as any, y: 200 },
      next: { x: 150, y: 250 },
    };

    expect(() => validateOp(op)).toThrow('invalid prev position');
  });

  it('validates Many op recursively', () => {
    const block: Block = {
      id: 'block-1',
      type: 'test',
      label: 'Test',
      inputs: [],
      outputs: [],
      params: {},
      category: 'Other',
    };

    const op: Op = {
      type: 'Many',
      ops: [
        { type: 'Add', table: 'blocks', entity: block },
        { type: 'SetBlockPosition', blockId: 'block-1', prev: { x: 0, y: 0 }, next: { x: 100, y: 100 } },
      ],
    };

    expect(() => validateOp(op)).not.toThrow();
  });

  it('rejects Many op with invalid nested op', () => {
    const op: Op = {
      type: 'Many',
      ops: [
        {
          type: 'Add',
          table: 'blocks',
          entity: { type: 'test' } as any, // Missing id
        },
      ],
    };

    expect(() => validateOp(op)).toThrow('Add op missing entity id');
  });
});
