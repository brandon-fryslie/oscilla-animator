/**
 * Tests for Block Operations
 */

import { describe, it, expect } from 'vitest';
import { applyOp } from '../applyOp';
import { invertOp } from '../invertOp';
import type { Patch, Block } from '../../types';
import type { BlockAdd, BlockRemove, BlockRetype, BlockSetLabel, BlockPatchParams } from '../ops';

function createTestPatch(): Patch {
  return {
    id: 'patch-test',
    blocks: [],
    edges: [],
    buses: [],
    defaultSources: {},
  };
}

function createTestBlock(id: string = 'block1'): Block {
  return {
    id,
    type: 'TestBlock',
    label: 'Test Block',
    position: { x: 0, y: 0 },
    params: { value: 10 },
    form: 'primitive',
    role: { kind: 'user' },
  };
}

describe('BlockAdd', () => {
  it('should add a block successfully', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    const op: BlockAdd = { op: 'BlockAdd', block };

    const result = applyOp(patch, op);

    expect(result.ok).toBe(true);
    expect(patch.blocks).toHaveLength(1);
    expect(patch.blocks[0]).toEqual(block);
  });

  it('should fail if block ID already exists', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockAdd = { op: 'BlockAdd', block: createTestBlock() };
    const result = applyOp(patch, op);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('already exists');
    }
    expect(patch.blocks).toHaveLength(1); // No change
  });

  it('should generate correct inverse op', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    const op: BlockAdd = { op: 'BlockAdd', block };

    const inverse = invertOp(patch, op);

    expect(inverse).not.toBeNull();
    expect(inverse?.op).toBe('BlockRemove');
    if (inverse?.op === 'BlockRemove') {
      expect(inverse.blockId).toBe(block.id);
    }
  });
});

describe('BlockRemove', () => {
  it('should remove a block successfully', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockRemove = { op: 'BlockRemove', blockId: block.id };
    const result = applyOp(patch, op);

    expect(result.ok).toBe(true);
    expect(patch.blocks).toHaveLength(0);
  });

  it('should fail if block does not exist', () => {
    const patch = createTestPatch();
    const op: BlockRemove = { op: 'BlockRemove', blockId: 'nonexistent' };

    const result = applyOp(patch, op);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found');
    }
  });

  it('should generate correct inverse op', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockRemove = { op: 'BlockRemove', blockId: block.id };
    const inverse = invertOp(patch, op);

    expect(inverse).not.toBeNull();
    expect(inverse?.op).toBe('BlockAdd');
    if (inverse?.op === 'BlockAdd') {
      expect(inverse.block.id).toBe(block.id);
      expect(inverse.block.type).toBe(block.type);
    }
  });

  it('should roundtrip with inverse', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockRemove = { op: 'BlockRemove', blockId: block.id };
    const inverse = invertOp(patch, op);

    applyOp(patch, op);
    expect(patch.blocks).toHaveLength(0);

    if (inverse !== null) {
      applyOp(patch, inverse);
      expect(patch.blocks).toHaveLength(1);
      expect(patch.blocks[0].id).toBe(block.id);
    }
  });
});

describe('BlockRetype', () => {
  it('should change block type successfully', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockRetype = {
      op: 'BlockRetype',
      blockId: block.id,
      nextType: 'NewType',
    };
    const result = applyOp(patch, op);

    expect(result.ok).toBe(true);
    expect(patch.blocks[0].type).toBe('NewType');
  });

  it('should clear params when no remap specified', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockRetype = {
      op: 'BlockRetype',
      blockId: block.id,
      nextType: 'NewType',
    };
    applyOp(patch, op);

    expect(patch.blocks[0].params).toEqual({});
  });

  it('should fail if block does not exist', () => {
    const patch = createTestPatch();
    const op: BlockRetype = {
      op: 'BlockRetype',
      blockId: 'nonexistent',
      nextType: 'NewType',
    };

    const result = applyOp(patch, op);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found');
    }
  });

  it('should generate correct inverse op', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockRetype = {
      op: 'BlockRetype',
      blockId: block.id,
      nextType: 'NewType',
    };
    const inverse = invertOp(patch, op);

    expect(inverse).not.toBeNull();
    expect(inverse?.op).toBe('BlockRetype');
    if (inverse?.op === 'BlockRetype') {
      expect(inverse.nextType).toBe(block.type);
    }
  });
});

describe('BlockSetLabel', () => {
  it('should set label successfully', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockSetLabel = {
      op: 'BlockSetLabel',
      blockId: block.id,
      label: 'New Label',
    };
    const result = applyOp(patch, op);

    expect(result.ok).toBe(true);
    expect(patch.blocks[0].label).toBe('New Label');
  });

  it('should fail if block does not exist', () => {
    const patch = createTestPatch();
    const op: BlockSetLabel = {
      op: 'BlockSetLabel',
      blockId: 'nonexistent',
      label: 'New Label',
    };

    const result = applyOp(patch, op);

    expect(result.ok).toBe(false);
  });

  it('should generate correct inverse op', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockSetLabel = {
      op: 'BlockSetLabel',
      blockId: block.id,
      label: 'New Label',
    };
    const inverse = invertOp(patch, op);

    expect(inverse).not.toBeNull();
    expect(inverse?.op).toBe('BlockSetLabel');
    if (inverse?.op === 'BlockSetLabel') {
      expect(inverse.label).toBe(block.label);
    }
  });
});

describe('BlockPatchParams', () => {
  it('should patch params successfully', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    patch.blocks.push(block);

    const op: BlockPatchParams = {
      op: 'BlockPatchParams',
      blockId: block.id,
      patch: { value: 20, newParam: 'test' },
    };
    const result = applyOp(patch, op);

    expect(result.ok).toBe(true);
    expect(patch.blocks[0].params.value).toBe(20);
    expect(patch.blocks[0].params.newParam).toBe('test');
  });

  it('should merge params, not replace', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    block.params = { value: 10, other: 'keep' };
    patch.blocks.push(block);

    const op: BlockPatchParams = {
      op: 'BlockPatchParams',
      blockId: block.id,
      patch: { value: 20 },
    };
    applyOp(patch, op);

    expect(patch.blocks[0].params.value).toBe(20);
    expect(patch.blocks[0].params.other).toBe('keep');
  });

  it('should fail if block does not exist', () => {
    const patch = createTestPatch();
    const op: BlockPatchParams = {
      op: 'BlockPatchParams',
      blockId: 'nonexistent',
      patch: { value: 20 },
    };

    const result = applyOp(patch, op);

    expect(result.ok).toBe(false);
  });

  it('should generate correct inverse op', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    block.params = { value: 10, other: 'keep' };
    patch.blocks.push(block);

    const op: BlockPatchParams = {
      op: 'BlockPatchParams',
      blockId: block.id,
      patch: { value: 20 },
    };
    const inverse = invertOp(patch, op);

    expect(inverse).not.toBeNull();
    expect(inverse?.op).toBe('BlockPatchParams');
    if (inverse?.op === 'BlockPatchParams') {
      expect(inverse.patch.value).toBe(10);
      expect(inverse.patch.other).toBeUndefined(); // Only patched keys
    }
  });

  it('should roundtrip with inverse', () => {
    const patch = createTestPatch();
    const block = createTestBlock();
    block.params = { value: 10, other: 'keep' };
    patch.blocks.push(block);

    const op: BlockPatchParams = {
      op: 'BlockPatchParams',
      blockId: block.id,
      patch: { value: 20 },
    };
    const inverse = invertOp(patch, op);

    applyOp(patch, op);
    expect(patch.blocks[0].params.value).toBe(20);

    if (inverse !== null) {
      applyOp(patch, inverse);
      expect(patch.blocks[0].params.value).toBe(10);
      expect(patch.blocks[0].params.other).toBe('keep');
    }
  });
});
