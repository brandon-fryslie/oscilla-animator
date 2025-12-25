/**
 * Replace Utilities Tests
 *
 * Tests for block replacement functionality:
 * - findCompatibleReplacements
 * - mapConnections
 * - copyCompatibleParams
 */

import { describe, it, expect } from 'vitest';
import {
  findCompatibleReplacements,
  mapConnections,
  copyCompatibleParams,
} from '../replaceUtils';
import type { Block, Connection } from '../types';
import type { BlockDefinition } from '../blocks/types';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockBlock(overrides: Partial<Block>): Block {
  return {
    id: 'block-1',
    type: 'TestBlock',
    label: 'Test Block',
    category: 'Math',
    inputs: [],
    outputs: [],
    params: {},
    ...overrides,
  };
}

function createMockDefinition(overrides: Partial<BlockDefinition>): BlockDefinition {
  return {
    type: 'MockBlock',
    label: 'Mock Block',
    form: 'primitive',
    subcategory: 'Math',
    description: 'A test block',
    inputs: [],
    outputs: [],
    defaultParams: {},
    paramSchema: [],
    color: '#666',
    laneKind: 'Scalars',
    ...overrides,
  };
}

function createMockConnection(
  fromBlockId: string,
  fromSlot: string,
  toBlockId: string,
  toSlot: string
): Connection {
  return {
    id: `conn-${fromBlockId}-${fromSlot}-${toBlockId}-${toSlot}`,
    from: { blockId: fromBlockId, slotId: fromSlot },
    to: { blockId: toBlockId, slotId: toSlot },
  };
}

// =============================================================================
// findCompatibleReplacements Tests
// =============================================================================

describe('findCompatibleReplacements', () => {
  it('filters by lane kind', () => {
    const block = createMockBlock({
      type: 'PhaseBlock',
      category: 'Time',
    });

    const definitions: BlockDefinition[] = [
      createMockDefinition({ type: 'Phase1', laneKind: 'Phase' }),
      createMockDefinition({ type: 'Phase2', laneKind: 'Phase' }),
      createMockDefinition({ type: 'Scalar1', laneKind: 'Scalars' }),
      createMockDefinition({ type: 'Field1', laneKind: 'Fields' }),
    ];

    const compatible = findCompatibleReplacements(block, [], definitions);

    // Should only include blocks with same lane kind (Phase)
    expect(compatible).toHaveLength(2);
    expect(compatible.map((d) => d.type).sort()).toEqual(['Phase1', 'Phase2']);
  });

  it('excludes same block type', () => {
    const block = createMockBlock({
      type: 'TestBlock',
      category: 'Math',
    });

    const definitions: BlockDefinition[] = [
      createMockDefinition({ type: 'TestBlock', laneKind: 'Scalars' }),
      createMockDefinition({ type: 'OtherBlock', laneKind: 'Scalars' }),
    ];

    const compatible = findCompatibleReplacements(block, [], definitions);

    // Should not suggest replacing with same type
    expect(compatible).toHaveLength(1);
    expect(compatible[0].type).toBe('OtherBlock');
  });

  it('excludes macros', () => {
    const block = createMockBlock({
      type: 'TestBlock',
      category: 'Math',
    });

    const definitions: BlockDefinition[] = [
      createMockDefinition({ type: 'Primitive', laneKind: 'Scalars' }),
      createMockDefinition({
        type: 'composite:Composite',
        laneKind: 'Scalars',
        compositeDefinition: {}, // Mark as composite
      }),
      createMockDefinition({ type: 'macro:Macro', laneKind: 'Scalars' }),
    ];

    const compatible = findCompatibleReplacements(block, [], definitions);

    // Should exclude macros (type starts with 'macro:')
    expect(compatible).toHaveLength(2);
    expect(compatible.map((d) => d.type).sort()).toEqual(['Primitive', 'composite:Composite']);
  });

  it('requires all connected inputs satisfiable', () => {
    const block = createMockBlock({
      type: 'BlockWithInputs',
      inputs: [
        { id: 'input1', label: 'In1', direction: 'input', type: 'Signal<number>' },
        { id: 'input2', label: 'In2', direction: 'input', type: 'Signal<color>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('upstream', 'out1', 'block-1', 'input1'),
      createMockConnection('upstream', 'out2', 'block-1', 'input2'),
    ];

    const definitions: BlockDefinition[] = [
      createMockDefinition({
        type: 'FullMatch',
        laneKind: 'Scalars',
        inputs: [
          { id: 'a', label: 'A', direction: 'input', type: 'Signal<number>' },
          { id: 'b', label: 'B', direction: 'input', type: 'Signal<color>' },
        ],
      }),
      createMockDefinition({
        type: 'PartialMatch',
        laneKind: 'Scalars',
        inputs: [
          { id: 'a', label: 'A', direction: 'input', type: 'Signal<number>' },
          // Missing color input
        ],
      }),
      createMockDefinition({
        type: 'NoMatch',
        laneKind: 'Scalars',
        inputs: [],
      }),
    ];

    const compatible = findCompatibleReplacements(block, connections, definitions);

    // Only FullMatch has compatible inputs for both connected slots
    expect(compatible).toHaveLength(1);
    expect(compatible[0].type).toBe('FullMatch');
  });

  it('requires all connected outputs satisfiable', () => {
    const block = createMockBlock({
      type: 'BlockWithOutputs',
      outputs: [
        { id: 'output1', label: 'Out1', direction: 'output', type: 'Signal<number>' },
        { id: 'output2', label: 'Out2', direction: 'output', type: 'Signal<Point>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('block-1', 'output1', 'downstream', 'in1'),
      createMockConnection('block-1', 'output2', 'downstream', 'in2'),
    ];

    const definitions: BlockDefinition[] = [
      createMockDefinition({
        type: 'FullMatch',
        laneKind: 'Scalars',
        outputs: [
          { id: 'a', label: 'A', direction: 'output', type: 'Signal<number>' },
          { id: 'b', label: 'B', direction: 'output', type: 'Signal<Point>' },
        ],
      }),
      createMockDefinition({
        type: 'PartialMatch',
        laneKind: 'Scalars',
        outputs: [
          { id: 'a', label: 'A', direction: 'output', type: 'Signal<number>' },
          // Missing Point output
        ],
      }),
    ];

    const compatible = findCompatibleReplacements(block, connections, definitions);

    // Only FullMatch has compatible outputs for both connected slots
    expect(compatible).toHaveLength(1);
    expect(compatible[0].type).toBe('FullMatch');
  });

  it('handles unconnected blocks - any same-lane block valid', () => {
    const block = createMockBlock({
      type: 'UnconnectedBlock',
      inputs: [{ id: 'in', label: 'In', direction: 'input', type: 'Signal<number>' }],
      outputs: [{ id: 'out', label: 'Out', direction: 'output', type: 'Signal<number>' }],
    });

    const definitions: BlockDefinition[] = [
      createMockDefinition({
        type: 'EmptyBlock',
        laneKind: 'Scalars',
        inputs: [],
        outputs: [],
      }),
      createMockDefinition({
        type: 'DifferentSlots',
        laneKind: 'Scalars',
        inputs: [{ id: 'x', label: 'X', direction: 'input', type: 'Signal<color>' }],
        outputs: [{ id: 'y', label: 'Y', direction: 'output', type: 'Signal<Point>' }],
      }),
    ];

    const compatible = findCompatibleReplacements(block, [], definitions);

    // All same-lane blocks are valid when block has no connections
    expect(compatible).toHaveLength(2);
    expect(compatible.map((d) => d.type).sort()).toEqual(['DifferentSlots', 'EmptyBlock']);
  });

  it('handles blocks with mixed connected and unconnected slots', () => {
    const block = createMockBlock({
      type: 'MixedBlock',
      inputs: [
        { id: 'connectedIn', label: 'Connected', direction: 'input', type: 'Signal<number>' },
        { id: 'unconnectedIn', label: 'Unconnected', direction: 'input', type: 'Signal<color>' },
      ],
      outputs: [
        { id: 'connectedOut', label: 'Connected', direction: 'output', type: 'Signal<Point>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('upstream', 'out', 'block-1', 'connectedIn'),
      createMockConnection('block-1', 'connectedOut', 'downstream', 'in'),
    ];

    const definitions: BlockDefinition[] = [
      createMockDefinition({
        type: 'Valid',
        laneKind: 'Scalars',
        inputs: [
          { id: 'a', label: 'A', direction: 'input', type: 'Signal<number>' },
          // Doesn't need color input since it's not connected
        ],
        outputs: [{ id: 'b', label: 'B', direction: 'output', type: 'Signal<Point>' }],
      }),
      createMockDefinition({
        type: 'Invalid',
        laneKind: 'Scalars',
        inputs: [{ id: 'a', label: 'A', direction: 'input', type: 'Signal<number>' }],
        outputs: [], // Missing required Point output
      }),
    ];

    const compatible = findCompatibleReplacements(block, connections, definitions);

    // Only Valid has all connected slots satisfied
    expect(compatible).toHaveLength(1);
    expect(compatible[0].type).toBe('Valid');
  });
});

// =============================================================================
// mapConnections Tests
// =============================================================================

describe('mapConnections', () => {
  it('preserves compatible input connections', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      inputs: [
        { id: 'oldInput1', label: 'In1', direction: 'input', type: 'Signal<number>' },
        { id: 'oldInput2', label: 'In2', direction: 'input', type: 'Signal<color>' },
      ],
    });

    const newDef = createMockDefinition({
      inputs: [
        { id: 'newInput1', label: 'New In1', direction: 'input', type: 'Signal<number>' },
        { id: 'newInput2', label: 'New In2', direction: 'input', type: 'Signal<color>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('upstream', 'out1', 'old-block', 'oldInput1'),
      createMockConnection('upstream', 'out2', 'old-block', 'oldInput2'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    expect(result.preserved).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);

    // Check that connections are remapped to new slots
    expect(result.preserved[0].toSlot).toBe('newInput1');
    expect(result.preserved[1].toSlot).toBe('newInput2');
  });

  it('preserves compatible output connections', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      outputs: [
        { id: 'oldOutput1', label: 'Out1', direction: 'output', type: 'Signal<number>' },
        { id: 'oldOutput2', label: 'Out2', direction: 'output', type: 'Signal<Point>' },
      ],
    });

    const newDef = createMockDefinition({
      outputs: [
        { id: 'newOutput1', label: 'New Out1', direction: 'output', type: 'Signal<number>' },
        { id: 'newOutput2', label: 'New Out2', direction: 'output', type: 'Signal<Point>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('old-block', 'oldOutput1', 'downstream', 'in1'),
      createMockConnection('old-block', 'oldOutput2', 'downstream', 'in2'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    expect(result.preserved).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);

    // Check that connections are remapped to new slots
    expect(result.preserved[0].fromSlot).toBe('newOutput1');
    expect(result.preserved[1].fromSlot).toBe('newOutput2');
  });

  it('prevents multiple connections to same input slot', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      inputs: [
        { id: 'input1', label: 'In1', direction: 'input', type: 'Signal<number>' },
        { id: 'input2', label: 'In2', direction: 'input', type: 'Signal<number>' },
      ],
    });

    const newDef = createMockDefinition({
      inputs: [
        // Only one input slot of matching type
        { id: 'singleInput', label: 'Single In', direction: 'input', type: 'Signal<number>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('upstream', 'out1', 'old-block', 'input1'),
      createMockConnection('upstream', 'out2', 'old-block', 'input2'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    // Only one connection should be preserved (first one wins)
    expect(result.preserved).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);

    expect(result.preserved[0].toSlot).toBe('singleInput');
    expect(result.dropped[0].reason).toContain('compatible input');
  });

  it('drops incompatible input connections with reason', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      inputs: [
        { id: 'numberInput', label: 'Number', direction: 'input', type: 'Signal<number>' },
        { id: 'colorInput', label: 'Color', direction: 'input', type: 'Signal<color>' },
      ],
    });

    const newDef = createMockDefinition({
      inputs: [
        // Only has number input, missing color
        { id: 'newInput', label: 'New In', direction: 'input', type: 'Signal<number>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('upstream', 'out1', 'old-block', 'numberInput'),
      createMockConnection('upstream', 'out2', 'old-block', 'colorInput'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    expect(result.preserved).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);

    expect(result.dropped[0].reason).toContain('No compatible input slot');
    expect(result.dropped[0].reason).toContain('Color');
  });

  it('drops incompatible output connections with reason', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      outputs: [
        { id: 'numberOutput', label: 'Number', direction: 'output', type: 'Signal<number>' },
        { id: 'pointOutput', label: 'Point', direction: 'output', type: 'Signal<Point>' },
      ],
    });

    const newDef = createMockDefinition({
      outputs: [
        // Only has number output, missing Point
        { id: 'newOutput', label: 'New Out', direction: 'output', type: 'Signal<number>' },
      ],
    });

    const connections: Connection[] = [
      createMockConnection('old-block', 'numberOutput', 'downstream', 'in1'),
      createMockConnection('old-block', 'pointOutput', 'downstream', 'in2'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    expect(result.preserved).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);

    expect(result.dropped[0].reason).toContain('No compatible output slot');
    expect(result.dropped[0].reason).toContain('Point');
  });

  it('handles connections to/from other blocks correctly', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      inputs: [{ id: 'in', label: 'In', direction: 'input', type: 'Signal<number>' }],
      outputs: [{ id: 'out', label: 'Out', direction: 'output', type: 'Signal<number>' }],
    });

    const newDef = createMockDefinition({
      inputs: [{ id: 'newIn', label: 'New In', direction: 'input', type: 'Signal<number>' }],
      outputs: [{ id: 'newOut', label: 'New Out', direction: 'output', type: 'Signal<number>' }],
    });

    const connections: Connection[] = [
      createMockConnection('upstream', 'source', 'old-block', 'in'),
      createMockConnection('old-block', 'out', 'downstream', 'sink'),
      // Unrelated connection between other blocks
      createMockConnection('other1', 'x', 'other2', 'y'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    // Should preserve 2 connections (ignore the unrelated one)
    expect(result.preserved).toHaveLength(2);
    expect(result.dropped).toHaveLength(0);

    // Verify upstream connection
    const upstreamConn = result.preserved.find((c) => c.fromBlockId === 'upstream');
    expect(upstreamConn).toBeDefined();
    expect(upstreamConn!.toSlot).toBe('newIn');

    // Verify downstream connection
    const downstreamConn = result.preserved.find((c) => c.toBlockId === 'downstream');
    expect(downstreamConn).toBeDefined();
    expect(downstreamConn!.fromSlot).toBe('newOut');
  });

  it('handles empty connections array', () => {
    const oldBlock = createMockBlock({
      inputs: [{ id: 'in', label: 'In', direction: 'input', type: 'Signal<number>' }],
    });

    const newDef = createMockDefinition({
      inputs: [{ id: 'in', label: 'In', direction: 'input', type: 'Signal<number>' }],
    });

    const result = mapConnections(oldBlock, newDef, []);

    expect(result.preserved).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  it('handles block with no slots', () => {
    const oldBlock = createMockBlock({
      id: 'old-block',
      inputs: [],
      outputs: [],
    });

    const newDef = createMockDefinition({
      inputs: [],
      outputs: [],
    });

    const connections: Connection[] = [
      createMockConnection('other1', 'x', 'other2', 'y'),
    ];

    const result = mapConnections(oldBlock, newDef, connections);

    expect(result.preserved).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });
});

// =============================================================================
// copyCompatibleParams Tests
// =============================================================================

describe('copyCompatibleParams', () => {
  it('copies parameters with matching keys', () => {
    const oldParams = {
      frequency: 2.5,
      amplitude: 10,
      phase: 0.5,
    };

    const newDef = createMockDefinition({
      defaultParams: {
        frequency: 1.0,
        amplitude: 5.0,
        offset: 0.0,
      },
      paramSchema: [
        { key: 'frequency', type: 'number', label: 'Frequency', defaultValue: 1.0 },
        { key: 'amplitude', type: 'number', label: 'Amplitude', defaultValue: 5.0 },
        { key: 'offset', type: 'number', label: 'Offset', defaultValue: 0.0 },
      ],
    });

    const result = copyCompatibleParams(oldParams, newDef);

    // Should copy matching params and use defaults for new ones
    expect(result).toEqual({
      frequency: 2.5, // Copied from old
      amplitude: 10, // Copied from old
      offset: 0.0, // Default (not in old params)
    });
  });

  it('uses new block defaults for unmatched keys', () => {
    const oldParams = {
      oldParam1: 'value1',
      oldParam2: 42,
    };

    const newDef = createMockDefinition({
      defaultParams: {
        newParam1: 'default1',
        newParam2: 100,
      },
      paramSchema: [
        { key: 'newParam1', type: 'string', label: 'Param 1', defaultValue: 'default1' },
        { key: 'newParam2', type: 'number', label: 'Param 2', defaultValue: 100 },
      ],
    });

    const result = copyCompatibleParams(oldParams, newDef);

    // Should use all defaults since no keys match
    expect(result).toEqual({
      newParam1: 'default1',
      newParam2: 100,
    });
  });

  it('handles empty old params', () => {
    const oldParams = {};

    const newDef = createMockDefinition({
      defaultParams: {
        param1: 'value',
        param2: 123,
      },
      paramSchema: [
        { key: 'param1', type: 'string', label: 'Param 1', defaultValue: 'value' },
        { key: 'param2', type: 'number', label: 'Param 2', defaultValue: 123 },
      ],
    });

    const result = copyCompatibleParams(oldParams, newDef);

    expect(result).toEqual({
      param1: 'value',
      param2: 123,
    });
  });

  it('handles empty param schema', () => {
    const oldParams = {
      someParam: 'value',
    };

    const newDef = createMockDefinition({
      defaultParams: {},
      paramSchema: [],
    });

    const result = copyCompatibleParams(oldParams, newDef);

    expect(result).toEqual({});
  });

  it('preserves parameter types when copying', () => {
    const oldParams = {
      stringParam: 'hello',
      numberParam: 42,
      booleanParam: true,
      arrayParam: [1, 2, 3],
      objectParam: { nested: 'value' },
    };

    const newDef = createMockDefinition({
      defaultParams: {
        stringParam: '',
        numberParam: 0,
        booleanParam: false,
        arrayParam: [],
        objectParam: {},
      },
      paramSchema: [
        { key: 'stringParam', type: 'string', label: 'String', defaultValue: '' },
        { key: 'numberParam', type: 'number', label: 'Number', defaultValue: 0 },
        { key: 'booleanParam', type: 'boolean', label: 'Boolean', defaultValue: false },
        { key: 'arrayParam', type: 'select', label: 'Array', defaultValue: [] },
        { key: 'objectParam', type: 'string', label: 'Object', defaultValue: {} },
      ],
    });

    const result = copyCompatibleParams(oldParams, newDef);

    expect(result).toEqual({
      stringParam: 'hello',
      numberParam: 42,
      booleanParam: true,
      arrayParam: [1, 2, 3],
      objectParam: { nested: 'value' },
    });

    // Verify types are preserved
    expect(typeof result.stringParam).toBe('string');
    expect(typeof result.numberParam).toBe('number');
    expect(typeof result.booleanParam).toBe('boolean');
    expect(Array.isArray(result.arrayParam)).toBe(true);
    expect(typeof result.objectParam).toBe('object');
  });

  it('handles partial overlap of parameters', () => {
    const oldParams = {
      shared1: 10,
      shared2: 'value',
      oldOnly1: true,
      oldOnly2: [1, 2],
    };

    const newDef = createMockDefinition({
      defaultParams: {
        shared1: 1,
        shared2: 'default',
        newOnly1: false,
        newOnly2: 99,
      },
      paramSchema: [
        { key: 'shared1', type: 'number', label: 'Shared 1', defaultValue: 1 },
        { key: 'shared2', type: 'string', label: 'Shared 2', defaultValue: 'default' },
        { key: 'newOnly1', type: 'boolean', label: 'New Only 1', defaultValue: false },
        { key: 'newOnly2', type: 'number', label: 'New Only 2', defaultValue: 99 },
      ],
    });

    const result = copyCompatibleParams(oldParams, newDef);

    expect(result).toEqual({
      shared1: 10, // Copied from old
      shared2: 'value', // Copied from old
      newOnly1: false, // Default (not in old)
      newOnly2: 99, // Default (not in old)
      // oldOnly1 and oldOnly2 are dropped (not in new schema)
    });
  });
});
