/**
 * Kernel Ops Integration Tests
 *
 * Tests kernel operations with the Edge-based connection model.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyOp } from '../applyOp';
import { invertOp } from '../invertOp';
import type { Patch, Block } from '../../types';
import type { BlockAdd, BlockRemove, WireAdd, WireRemove } from '../ops';

function createTestPatch(): Patch {
  return {
    id: 'patch-test',
    blocks: [],
    edges: [],
    buses: [],
    defaultSources: {},
  };
}

function createTestBlock(id: string, label?: string): Block {
  return {
    id,
    type: 'TestBlock',
    label: label ?? `Block ${id}`,
    position: { x: 0, y: 0 },
    params: { value: 10 },
    form: 'primitive',
    role: { kind: 'user', meta: {} },
  };
}

describe('Kernel Ops Integration', () => {
  let patch: Patch;

  beforeEach(() => {
    patch = createTestPatch();
  });

  it('should add and remove blocks through transactions', () => {
    const block = createTestBlock('b1');
    const addOp: BlockAdd = { op: 'BlockAdd', block };

    // Add block
    const addResult = applyOp(patch, addOp);
    expect(addResult.ok).toBe(true);
    expect(patch.blocks).toHaveLength(1);
    expect(patch.blocks[0].id).toBe('b1');

    // Remove block
    const removeOp: BlockRemove = { op: 'BlockRemove', blockId: 'b1' };
    const removeResult = applyOp(patch, removeOp);
    expect(removeResult.ok).toBe(true);
    expect(patch.blocks).toHaveLength(0);
  });

  it('should add and remove edges through transactions', () => {
    // Setup: Add two blocks first
    const b1 = createTestBlock('b1');
    const b2 = createTestBlock('b2');
    applyOp(patch, { op: 'BlockAdd', block: b1 });
    applyOp(patch, { op: 'BlockAdd', block: b2 });
    expect(patch.blocks).toHaveLength(2);

    // Create an edge for WireAdd
    const wireAddOp: WireAdd = {
      op: 'WireAdd',
      edge: {
        id: 'e1',
        from: { kind: 'port', blockId: 'b1', slotId: 'out' },
        to: { kind: 'port', blockId: 'b2', slotId: 'in' },
        enabled: true,
      role: { kind: 'user', meta: {} },
      },
    };

    // Add edge
    const addResult = applyOp(patch, wireAddOp);
    expect(addResult.ok).toBe(true);
    expect(patch.edges).toHaveLength(1);
    expect(patch.edges[0].id).toBe('e1');

    // Remove edge
    const wireRemoveOp: WireRemove = { op: 'WireRemove', edgeId: 'e1' };
    const removeResult = applyOp(patch, wireRemoveOp);
    expect(removeResult.ok).toBe(true);
    expect(patch.edges).toHaveLength(0);
  });

  it('should remove block without cascading edge removal in kernel ops', () => {
    // Note: Kernel ops are low-level and don't cascade.
    // Cascading is handled by PatchStore at a higher level.

    // Setup: Add blocks and edge
    const b1 = createTestBlock('b1');
    const b2 = createTestBlock('b2');
    const b3 = createTestBlock('b3');
    applyOp(patch, { op: 'BlockAdd', block: b1 });
    applyOp(patch, { op: 'BlockAdd', block: b2 });
    applyOp(patch, { op: 'BlockAdd', block: b3 });

    // Create edges: b1 -> b2, b2 -> b3
    const edge1: WireAdd = {
      op: 'WireAdd',
      edge: {
        id: 'e1',
        from: { kind: 'port', blockId: 'b1', slotId: 'out' },
        to: { kind: 'port', blockId: 'b2', slotId: 'in' },
        enabled: true,
      role: { kind: 'user', meta: {} },
      },
    };
    const edge2: WireAdd = {
      op: 'WireAdd',
      edge: {
        id: 'e2',
        from: { kind: 'port', blockId: 'b2', slotId: 'out' },
        to: { kind: 'port', blockId: 'b3', slotId: 'in' },
        enabled: true,
      role: { kind: 'user', meta: {} },
      },
    };
    applyOp(patch, edge1);
    applyOp(patch, edge2);

    expect(patch.blocks).toHaveLength(3);
    expect(patch.edges).toHaveLength(2);

    // Remove middle block b2 - kernel ops don't cascade
    // (PatchStore.removeBlock() handles cascade at a higher level)
    const removeOp: BlockRemove = { op: 'BlockRemove', blockId: 'b2' };
    const result = applyOp(patch, removeOp);

    expect(result.ok).toBe(true);
    expect(patch.blocks).toHaveLength(2);
    // Edges are NOT removed by kernel ops - that's handled at PatchStore level
    expect(patch.edges).toHaveLength(2);
  });

  it('should generate correct diff summaries', () => {
    const block = createTestBlock('b1');
    const addOp: BlockAdd = { op: 'BlockAdd', block };

    // Generate inverse (which captures what will change)
    const inverse = invertOp(patch, addOp);

    // Apply the op
    applyOp(patch, addOp);

    // The inverse should be a BlockRemove
    expect(inverse?.op).toBe('BlockRemove');
    if (inverse?.op === 'BlockRemove') {
      expect(inverse.blockId).toBe('b1');
    }

    // After applying inverse, block should be removed
    if (inverse !== null) {
      applyOp(patch, inverse);
      expect(patch.blocks).toHaveLength(0);
    }
  });
});
