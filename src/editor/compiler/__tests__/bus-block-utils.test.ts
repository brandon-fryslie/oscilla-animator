/**
 * BusBlock Recognition Utilities Tests
 *
 * Sprint: Bus-Block Unification - Sprint 2 (Compiler Unification)
 * Created: 2026-01-01
 *
 * P0 Acceptance Criteria:
 * - getBusBlocks() returns all blocks with type === 'BusBlock'
 * - getBusById() returns correct BusBlock by ID
 * - Compiler reads block.params.combine for combine policy
 * - Compiler reads block.params.defaultValue for fallback
 * - 5+ unit tests for bus block utilities
 */

import { describe, it, expect } from 'vitest';
import {
  getBusBlocks,
  getBusById,
  getBusBlockCombineMode,
  getBusBlockDefaultValue,
  isBusBlock,
  type PatchWithBlocks,
} from '../bus-block-utils';
import type { Block } from '../../types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock BusBlock for testing.
 */
function createBusBlock(
  id: string,
  params: Record<string, unknown> = {}
): Block {
  return {
    id,
    type: 'BusBlock',
    label: `Bus ${id}`,
    inputs: [
      {
        id: 'in',
        label: 'Publishers',
        type: 'Signal<float>',
        direction: 'input',
      },
    ],
    outputs: [
      {
        id: 'out',
        label: 'Bus Output',
        type: 'Signal<float>',
        direction: 'output',
      },
    ],
    params: {
      busId: id,
      busName: `Bus ${id}`,
      busType: { domain: 'float', world: 'signal', category: 'core' },
      combine: { when: 'multi', mode: 'last' },
      defaultValue: 0,
      ...params,
    },
    category: 'Other',
    description: `Bus: ${id}`,
  };
}

/**
 * Create a regular (non-bus) block for testing.
 */
function createRegularBlock(id: string, type: string): Block {
  return {
    id,
    type,
    label: `Block ${id}`,
    inputs: [],
    outputs: [],
    params: {},
    category: 'Math',
    description: `Regular block ${id}`,
  };
}

/**
 * Create a patch with blocks.
 */
function createPatch(blocks: Block[]): PatchWithBlocks {
  return { blocks };
}

// ============================================================================
// P0 Tests: BusBlock Recognition
// ============================================================================

describe('BusBlock Recognition Utilities - P0', () => {
  describe('getBusBlocks()', () => {
    it('should return all BusBlocks from patch', () => {
      const bus1 = createBusBlock('bus1');
      const bus2 = createBusBlock('bus2');
      const regular = createRegularBlock('block1', 'Add');

      const patch = createPatch([bus1, regular, bus2]);
      const busBlocks = getBusBlocks(patch);

      expect(busBlocks).toHaveLength(2);
      expect(busBlocks).toContain(bus1);
      expect(busBlocks).toContain(bus2);
      expect(busBlocks).not.toContain(regular);
    });

    it('should return empty array when no BusBlocks exist', () => {
      const regular1 = createRegularBlock('block1', 'Add');
      const regular2 = createRegularBlock('block2', 'Multiply');

      const patch = createPatch([regular1, regular2]);
      const busBlocks = getBusBlocks(patch);

      expect(busBlocks).toHaveLength(0);
    });

    it('should handle empty patch', () => {
      const patch = createPatch([]);
      const busBlocks = getBusBlocks(patch);

      expect(busBlocks).toHaveLength(0);
    });

    it('should recognize multiple BusBlocks', () => {
      const buses = [
        createBusBlock('bus1'),
        createBusBlock('bus2'),
        createBusBlock('bus3'),
      ];

      const patch = createPatch(buses);
      const busBlocks = getBusBlocks(patch);

      expect(busBlocks).toHaveLength(3);
      expect(busBlocks).toEqual(buses);
    });
  });

  describe('getBusById()', () => {
    it('should find BusBlock by bus ID', () => {
      const bus1 = createBusBlock('bus1');
      const bus2 = createBusBlock('bus2');
      const regular = createRegularBlock('block1', 'Add');

      const patch = createPatch([bus1, regular, bus2]);

      const found = getBusById(patch, 'bus1');
      expect(found).toBe(bus1);
    });

    it('should return undefined when bus not found', () => {
      const bus1 = createBusBlock('bus1');
      const patch = createPatch([bus1]);

      const found = getBusById(patch, 'nonexistent');
      expect(found).toBeUndefined();
    });

    it('should match by block ID when equal to bus ID', () => {
      const bus = createBusBlock('mybus');
      const patch = createPatch([bus]);

      // Should find by block ID (which equals bus ID)
      const found = getBusById(patch, 'mybus');
      expect(found).toBe(bus);
    });

    it('should match by params.busId if different from block ID', () => {
      const bus: Block = {
        ...createBusBlock('differentId'),
        params: {
          busId: 'originalBusId',
          busName: 'My Bus',
          combine: { when: 'multi', mode: 'last' },
          defaultValue: 0,
        },
      };

      const patch = createPatch([bus]);

      // Should find by params.busId
      const found = getBusById(patch, 'originalBusId');
      expect(found).toBe(bus);
    });

    it('should not return non-BusBlocks', () => {
      const regular = createRegularBlock('bus1', 'Add');
      const patch = createPatch([regular]);

      const found = getBusById(patch, 'bus1');
      expect(found).toBeUndefined();
    });
  });

  describe('getBusBlockCombineMode()', () => {
    it('should read combine mode from params', () => {
      const bus = createBusBlock('bus1', {
        combine: { when: 'multi', mode: 'sum' },
      });

      const mode = getBusBlockCombineMode(bus);
      expect(mode).toBe('sum');
    });

    it('should handle different combine modes', () => {
      const modes = ['last', 'sum', 'product', 'min', 'max'];

      for (const expectedMode of modes) {
        const bus = createBusBlock('bus', {
          combine: { when: 'multi', mode: expectedMode },
        });

        const actualMode = getBusBlockCombineMode(bus);
        expect(actualMode).toBe(expectedMode);
      }
    });

    it('should default to "last" when combine not found', () => {
      const bus: Block = {
        ...createBusBlock('bus1'),
        params: {}, // No combine
      };

      const mode = getBusBlockCombineMode(bus);
      expect(mode).toBe('last');
    });

    it('should throw on non-BusBlock', () => {
      const regular = createRegularBlock('block1', 'Add');

      expect(() => getBusBlockCombineMode(regular)).toThrow(
        'getBusBlockCombineMode called on non-BusBlock'
      );
    });
  });

  describe('getBusBlockDefaultValue()', () => {
    it('should read default value from params', () => {
      const bus = createBusBlock('bus1', { defaultValue: 42 });

      const value = getBusBlockDefaultValue(bus);
      expect(value).toBe(42);
    });

    it('should handle different default value types', () => {
      const testCases = [0, 1, -1, 3.14, [0, 0], { r: 1, g: 0, b: 0 }];

      for (const expectedValue of testCases) {
        const bus = createBusBlock('bus', { defaultValue: expectedValue });
        const actualValue = getBusBlockDefaultValue(bus);
        expect(actualValue).toEqual(expectedValue);
      }
    });

    it('should default to 0 when defaultValue not found', () => {
      const bus: Block = {
        ...createBusBlock('bus1'),
        params: {}, // No defaultValue
      };

      const value = getBusBlockDefaultValue(bus);
      expect(value).toBe(0);
    });

    it('should throw on non-BusBlock', () => {
      const regular = createRegularBlock('block1', 'Add');

      expect(() => getBusBlockDefaultValue(regular)).toThrow(
        'getBusBlockDefaultValue called on non-BusBlock'
      );
    });
  });

  describe('isBusBlock()', () => {
    it('should return true for BusBlock type', () => {
      const bus = createBusBlock('bus1');
      expect(isBusBlock(bus)).toBe(true);
    });

    it('should return false for regular blocks', () => {
      const regular = createRegularBlock('block1', 'Add');
      expect(isBusBlock(regular)).toBe(false);
    });

    it('should return false for blocks with similar names', () => {
      const notBus = createRegularBlock('block1', 'BusLike');
      expect(isBusBlock(notBus)).toBe(false);
    });
  });
});
