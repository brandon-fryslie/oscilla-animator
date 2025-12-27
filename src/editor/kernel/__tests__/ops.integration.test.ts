/**
 * Integration Tests for Op System
 *
 * Tests complete workflows: Create block → Wire → Publish → Undo chain
 */

import { describe, it, expect } from 'vitest';
import { applyOp } from '../applyOp';
import { invertOp } from '../invertOp';
import type { Patch, Block, Connection, Bus, Publisher } from '../../types';
import type { Op } from '../ops';

function createTestPatch(): Patch {
  return {
    version: 1,
    blocks: [],
    connections: [],
    lanes: [],
    buses: [],
    publishers: [],
    listeners: [],
    defaultSources: [],
    settings: {
      seed: 42,
      speed: 1,
    },
  };
}

describe('Integration: Block → Wire → Bus → Publisher → Undo Chain', () => {
  it('should execute complete workflow and undo successfully', () => {
    const patch = createTestPatch();
    const inverseOps: Op[] = [];

    // Step 1: Add source block
    const sourceBlock: Block = {
      id: 'source1',
      type: 'TestSource',
      label: 'Test Source',
      params: {},
      inputs: [],
      outputs: [{ id: 'out', label: 'Output', type: 'Signal<number>', direction: 'output' }],
      category: 'Other',
    };

    const addSourceOp: Op = { op: 'BlockAdd', block: sourceBlock };
    inverseOps.push(invertOp(patch, addSourceOp)!);
    const result1 = applyOp(patch, addSourceOp);
    expect(result1.ok).toBe(true);
    expect(patch.blocks).toHaveLength(1);

    // Step 2: Add target block
    const targetBlock: Block = {
      id: 'target1',
      type: 'TestTarget',
      label: 'Test Target',
      params: {},
      inputs: [{ id: 'in', label: 'Input', type: 'Signal<number>', direction: 'input' }],
      outputs: [],
      category: 'Other',
    };

    const addTargetOp: Op = { op: 'BlockAdd', block: targetBlock };
    inverseOps.push(invertOp(patch, addTargetOp)!);
    const result2 = applyOp(patch, addTargetOp);
    expect(result2.ok).toBe(true);
    expect(patch.blocks).toHaveLength(2);

    // Step 3: Wire them together
    const connection: Connection = {
      id: 'wire1',
      from: { blockId: 'source1', slotId: 'out', direction: 'output' },
      to: { blockId: 'target1', slotId: 'in', direction: 'input' },
    };

    const addWireOp: Op = { op: 'WireAdd', connection };
    inverseOps.push(invertOp(patch, addWireOp)!);
    const result3 = applyOp(patch, addWireOp);
    expect(result3.ok).toBe(true);
    expect(patch.connections).toHaveLength(1);

    // Step 4: Add a bus
    const bus: Bus = {
      id: 'bus1',
      name: 'Test Bus',
      type: { world: 'signal', domain: 'number', category: 'core', busEligible: true },
      combineMode: 'sum',
      defaultValue: 0,
      sortKey: 0,
    };

    const addBusOp: Op = { op: 'BusAdd', bus };
    inverseOps.push(invertOp(patch, addBusOp)!);
    const result4 = applyOp(patch, addBusOp);
    expect(result4.ok).toBe(true);
    expect(patch.buses).toHaveLength(1);

    // Step 5: Add a publisher
    const publisher: Publisher = {
      id: 'pub1',
      busId: 'bus1',
      from: { blockId: 'source1', slotId: 'out', direction: 'output' },
      enabled: true,
      sortKey: 0,
    };

    const addPublisherOp: Op = { op: 'PublisherAdd', publisher };
    inverseOps.push(invertOp(patch, addPublisherOp)!);
    const result5 = applyOp(patch, addPublisherOp);
    expect(result5.ok).toBe(true);
    expect(patch.publishers).toHaveLength(1);

    // Verify final state
    expect(patch.blocks).toHaveLength(2);
    expect(patch.connections).toHaveLength(1);
    expect(patch.buses).toHaveLength(1);
    expect(patch.publishers).toHaveLength(1);

    // Now undo everything in reverse order
    while (inverseOps.length > 0) {
      const inverseOp = inverseOps.pop()!;
      const undoResult = applyOp(patch, inverseOp);
      expect(undoResult.ok).toBe(true);
    }

    // Verify patch is back to empty state
    expect(patch.blocks).toHaveLength(0);
    expect(patch.connections).toHaveLength(0);
    expect(patch.buses).toHaveLength(0);
    expect(patch.publishers).toHaveLength(0);
  });

  it('should handle parameter updates with undo', () => {
    const patch = createTestPatch();
    const inverseOps: Op[] = [];

    // Add a block
    const block: Block = {
      id: 'block1',
      type: 'TestBlock',
      label: 'Test',
      params: { value: 10, other: 'keep' },
      inputs: [],
      outputs: [],
      category: 'Other',
    };

    const addOp: Op = { op: 'BlockAdd', block };
    inverseOps.push(invertOp(patch, addOp)!);
    applyOp(patch, addOp);

    // Update params
    const patchOp: Op = {
      op: 'BlockPatchParams',
      blockId: 'block1',
      patch: { value: 20, newParam: 'test' },
    };
    inverseOps.push(invertOp(patch, patchOp)!);
    applyOp(patch, patchOp);

    expect(patch.blocks[0].params.value).toBe(20);
    expect(patch.blocks[0].params.newParam).toBe('test');
    expect(patch.blocks[0].params.other).toBe('keep');

    // Update label
    const labelOp: Op = {
      op: 'BlockSetLabel',
      blockId: 'block1',
      label: 'Updated Label',
    };
    inverseOps.push(invertOp(patch, labelOp)!);
    applyOp(patch, labelOp);

    expect(patch.blocks[0].label).toBe('Updated Label');

    // Undo label change
    applyOp(patch, inverseOps.pop()!);
    expect(patch.blocks[0].label).toBe('Test');

    // Undo param change
    applyOp(patch, inverseOps.pop()!);
    expect(patch.blocks[0].params.value).toBe(10);
    expect(patch.blocks[0].params.newParam).toBeUndefined();
    expect(patch.blocks[0].params.other).toBe('keep');

    // Undo block creation
    applyOp(patch, inverseOps.pop()!);
    expect(patch.blocks).toHaveLength(0);
  });

  it('should fail gracefully on invalid operations', () => {
    const patch = createTestPatch();

    // Try to remove non-existent block
    const removeOp: Op = { op: 'BlockRemove', blockId: 'nonexistent' };
    const result1 = applyOp(patch, removeOp);
    expect(result1.ok).toBe(false);
    if (!result1.ok) {
      expect(result1.error).toContain('not found');
    }

    // Try to wire non-existent blocks
    const wireOp: Op = {
      op: 'WireAdd',
      connection: {
        id: 'wire1',
        from: { blockId: 'missing1', slotId: 'out', direction: 'output' },
        to: { blockId: 'missing2', slotId: 'in', direction: 'input' },
      },
    };
    const result2 = applyOp(patch, wireOp);
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error).toContain('not found');
    }

    // Try to add publisher to non-existent bus
    const pubOp: Op = {
      op: 'PublisherAdd',
      publisher: {
        id: 'pub1',
        busId: 'nonexistent',
        from: { blockId: 'source1', slotId: 'out', direction: 'output' },
        enabled: true,
        sortKey: 0,
      },
    };
    const result3 = applyOp(patch, pubOp);
    expect(result3.ok).toBe(false);
    if (!result3.ok) {
      expect(result3.error).toContain('not found');
    }

    // Patch should remain unchanged after all failures
    expect(patch.blocks).toHaveLength(0);
    expect(patch.connections).toHaveLength(0);
    expect(patch.publishers).toHaveLength(0);
  });
});
