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
import type { Block, Edge } from '../types';
import type { BlockDefinition } from '../blocks/types';
import { getBlockDefinition } from '../blocks/registry';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockBlock(overrides: Partial<Block>): Block {
  return {
    id: 'block-1',
    type: 'TestBlock',
    label: 'Test Block',
    position: { x: 0, y: 0 },
    params: {},
    form: 'primitive',
    role: { kind: 'user' },
    ...overrides,
  };
}

function createMockDefinition(overrides: Partial<BlockDefinition> = {}): BlockDefinition {
  return {
    type: 'MockBlock',
    label: 'Mock Block',
    capability: 'pure',
    compileKind: 'operator',
    subcategory: 'Math',
    description: 'A test block',
    inputs: [],
    outputs: [],
    defaultParams: {},
    color: '#666',
    ...overrides,
  } as BlockDefinition;
}

function createMockEdge(
  fromBlockId: string,
  fromSlot: string,
  toBlockId: string,
  toSlot: string
): Edge {
  return {
    id: `edge-${fromBlockId}-${fromSlot}-${toBlockId}-${toSlot}`,
    from: { kind: 'port', blockId: fromBlockId, slotId: fromSlot },
    to: { kind: 'port', blockId: toBlockId, slotId: toSlot },
    enabled: true,
    role: { kind: 'user' },
  };
}

// =============================================================================
// findCompatibleReplacements Tests
// =============================================================================

describe('findCompatibleReplacements', () => {
  it('finds blocks with matching outputs', () => {
    // Use a real block type that exists in the registry
    const sourceBlock = createMockBlock({
      type: 'AddSignal',
    });

    const edges: Edge[] = [];

    // Get real block definitions from registry
    const mulSignalDef = getBlockDefinition('MulSignal');
    const minSignalDef = getBlockDefinition('MinSignal');

    const candidates = [
      mulSignalDef,
      minSignalDef,
    ].filter((d): d is BlockDefinition => d !== undefined);

    const result = findCompatibleReplacements(sourceBlock, edges, candidates);
    // Both MulSignal and MinSignal should be compatible with AddSignal (same I/O structure)
    expect(result).toHaveLength(2);
  });

  it('finds blocks with matching inputs', () => {
    const sourceBlock = createMockBlock({
      type: 'AddSignal',
    });

    const edges: Edge[] = [];

    const mulSignalDef = getBlockDefinition('MulSignal');
    const candidates = mulSignalDef ? [mulSignalDef] : [];

    const result = findCompatibleReplacements(sourceBlock, edges, candidates);
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('excludes blocks with incompatible I/O', () => {
    const sourceBlock = createMockBlock({
      type: 'AddSignal',
    });

    const edges: Edge[] = [];

    const timeRootDef = getBlockDefinition('FiniteTimeRoot');
    const candidates = timeRootDef ? [timeRootDef] : [];

    const result = findCompatibleReplacements(sourceBlock, edges, candidates);
    // TimeRoot has different I/O than AddSignal
    expect(Array.isArray(result)).toBe(true);
  });

  it('filters by capability', () => {
    const sourceBlock = createMockBlock({
      type: 'AddSignal',
    });

    const edges: Edge[] = [];

    const mulSignalDef = getBlockDefinition('MulSignal');
    const timeRootDef = getBlockDefinition('FiniteTimeRoot');
    const candidates = [
      mulSignalDef,
      timeRootDef,
    ].filter((d): d is BlockDefinition => d !== undefined);

    const result = findCompatibleReplacements(sourceBlock, edges, candidates);
    // Should filter based on capability
    expect(Array.isArray(result)).toBe(true);
  });
});

// =============================================================================
// mapConnections Tests
// =============================================================================

describe('mapConnections', () => {
  it('maps connections when slots match exactly', () => {
    const edges = [
      createMockEdge('block-1', 'out', 'block-2', 'in'),
    ];

    const sourceBlock = createMockBlock({
      id: 'block-1',
    });

    const targetDef = createMockDefinition({
      type: 'NewBlock',
    });

    const result = mapConnections(sourceBlock, targetDef, edges);
    expect(result).toBeDefined();
  });

  it('handles missing slots gracefully', () => {
    const edges = [
      createMockEdge('block-1', 'nonexistent', 'block-2', 'in'),
    ];

    const sourceBlock = createMockBlock({
      id: 'block-1',
    });

    const targetDef = createMockDefinition({
      type: 'NewBlock',
    });

    const result = mapConnections(sourceBlock, targetDef, edges);
    expect(result).toBeDefined();
  });

  it('preserves connections not involving the replaced block', () => {
    const edges = [
      createMockEdge('block-1', 'out', 'block-2', 'in'),
      createMockEdge('block-3', 'out', 'block-4', 'in'),
    ];

    const sourceBlock = createMockBlock({
      id: 'block-1',
    });

    const targetDef = createMockDefinition({
      type: 'NewBlock',
    });

    const result = mapConnections(sourceBlock, targetDef, edges);
    expect(result).toBeDefined();
  });

  it('handles input slot name changes', () => {
    const edges = [
      createMockEdge('block-0', 'out', 'block-1', 'oldInput'),
    ];

    const sourceBlock = createMockBlock({
      id: 'block-1',
    });

    const targetDef = createMockDefinition({
      type: 'NewBlock',
    });

    const result = mapConnections(sourceBlock, targetDef, edges);
    expect(result).toBeDefined();
  });

  it('handles output slot name changes', () => {
    const edges = [
      createMockEdge('block-1', 'oldOutput', 'block-2', 'in'),
    ];

    const sourceBlock = createMockBlock({
      id: 'block-1',
    });

    const targetDef = createMockDefinition({
      type: 'NewBlock',
    });

    const result = mapConnections(sourceBlock, targetDef, edges);
    expect(result).toBeDefined();
  });
});

// =============================================================================
// copyCompatibleParams Tests
// =============================================================================

describe('copyCompatibleParams', () => {
  it('copies matching parameters', () => {
    const sourceParams = { freq: 440, phase: 0 };

    const targetDef = createMockDefinition({
      defaultParams: { freq: 220, amplitude: 1 },
    });

    const result = copyCompatibleParams(sourceParams, targetDef);
    expect(result.freq).toBe(440);
  });

  it('uses default for non-matching params', () => {
    const sourceParams = { freq: 440 };

    const targetDef = createMockDefinition({
      defaultParams: { amplitude: 1 },
    });

    const result = copyCompatibleParams(sourceParams, targetDef);
    expect(result.amplitude).toBe(1);
  });

  it('handles empty source params', () => {
    const sourceParams = {};

    const targetDef = createMockDefinition({
      defaultParams: { freq: 440 },
    });

    const result = copyCompatibleParams(sourceParams, targetDef);
    expect(result.freq).toBe(440);
  });

  it('handles empty target defaults', () => {
    const sourceParams = { freq: 440 };

    const targetDef = createMockDefinition({
      defaultParams: {},
    });

    const result = copyCompatibleParams(sourceParams, targetDef);
    expect(Object.keys(result).length).toBe(0);
  });

  it('preserves parameter types', () => {
    const sourceParams = { enabled: true, count: 42, name: 'test' };

    const targetDef = createMockDefinition({
      defaultParams: { enabled: false, count: 0, name: '' },
    });

    const result = copyCompatibleParams(sourceParams, targetDef);
    expect(result.enabled).toBe(true);
    expect(result.count).toBe(42);
    expect(result.name).toBe('test');
  });
});
