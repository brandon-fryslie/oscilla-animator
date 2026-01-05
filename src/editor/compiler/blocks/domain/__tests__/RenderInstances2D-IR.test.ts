/**
 * RenderInstances2D Block IR Lowering Tests
 *
 * Tests that RenderInstances2D block emits correct IR nodes.
 * These tests prove the IR lowering path works correctly.
 */

import { describe, it, expect } from 'vitest';
import { getBlockType } from '../../../ir/lowerTypes';
import { IRBuilderImpl } from '../../../ir/IRBuilderImpl';
import type { LowerCtx } from '../../../ir/lowerTypes';
import type { BlockIndex } from '../../../ir/patches';

// Import to trigger block registration
import '../RenderInstances2D';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockLowerCtx(): LowerCtx {
  const b = new IRBuilderImpl();
  const domainType = { world: 'special' as const, domain: 'domain' as const, category: 'internal' as const, busEligible: false };
  const vec2FieldType = { world: 'field' as const, domain: 'vec2' as const, category: 'core' as const, busEligible: true };
  const floatFieldType = { world: 'field' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };
  const colorFieldType = { world: 'field' as const, domain: 'color' as const, category: 'core' as const, busEligible: true };
  const floatSignalType = { world: 'signal' as const, domain: 'float' as const, category: 'core' as const, busEligible: true };

  return {
    blockIdx: 0 as BlockIndex,
    blockType: 'RenderInstances2D',
    instanceId: 'test-render',
    label: 'Test Render',
    inTypes: [domainType, vec2FieldType, floatFieldType, colorFieldType, floatSignalType],
    outTypes: [],
    b,
    seedConstId: b.allocConstId(12345),
  };
}

// =============================================================================
// RenderInstances2D IR Tests
// =============================================================================

describe('RenderInstances2D IR Lowering', () => {
  it('should be registered in block type registry', () => {
    const blockType = getBlockType('RenderInstances2D');
    expect(blockType).toBeDefined();
    expect(blockType?.type).toBe('RenderInstances2D');
    expect(blockType?.capability).toBe('render');
    expect(blockType?.lower).toBeDefined();
  });

  it('should register render sink with correct inputs', () => {
    const blockType = getBlockType('RenderInstances2D');
    if (!blockType) throw new Error('RenderInstances2D not registered');

    const ctx = createMockLowerCtx();

    // Create input values
    const domainSlot = ctx.b.domainFromN(10, []);
    const positions = ctx.b.fieldConst([{ x: 0, y: 0 }], ctx.inTypes[1]);
    const radius = ctx.b.fieldConst(10, ctx.inTypes[2]);
    const color = ctx.b.fieldConst('#FF0000', ctx.inTypes[3]);
    const opacity = ctx.b.sigConst(1.0, ctx.inTypes[4]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'special', tag: 'domain', id: domainSlot },
        { k: 'field', id: positions, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'positions') },
        { k: 'field', id: radius, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'radius') },
        { k: 'field', id: color, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'color') },
        { k: 'sig', id: opacity, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'opacity') },
      ],
    });

    // Render blocks return no outputs
    expect(result.outputs).toHaveLength(0);

    // Should declare renderSink
    expect(result.declares).toBeDefined();
    expect(result.declares?.renderSink).toBeDefined();
  });

  it('should create render sink in IR', () => {
    const blockType = getBlockType('RenderInstances2D');
    if (!blockType) throw new Error('RenderInstances2D not registered');

    const ctx = createMockLowerCtx();

    const domainSlot = ctx.b.domainFromN(10, []);
    const positions = ctx.b.fieldConst([{ x: 0, y: 0 }], ctx.inTypes[1]);
    const radius = ctx.b.fieldConst(10, ctx.inTypes[2]);
    const color = ctx.b.fieldConst('#FF0000', ctx.inTypes[3]);
    const opacity = ctx.b.sigConst(1.0, ctx.inTypes[4]);

    blockType.lower({
      ctx,
      inputs: [
        { k: 'special', tag: 'domain', id: domainSlot },
        { k: 'field', id: positions, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'positions') },
        { k: 'field', id: radius, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'radius') },
        { k: 'field', id: color, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'color') },
        { k: 'sig', id: opacity, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'opacity') },
      ],
    });

    const program = ctx.b.build();
    const renderSinks = program.renderSinks;

    expect(renderSinks.length).toBeGreaterThan(0);
    expect(renderSinks[0].sinkType).toBe('instances2d');
  });

  it('should validate domain input', () => {
    const blockType = getBlockType('RenderInstances2D');
    if (!blockType) throw new Error('RenderInstances2D not registered');

    const ctx = createMockLowerCtx();

    const positions = ctx.b.fieldConst([{ x: 0, y: 0 }], ctx.inTypes[1]);
    const radius = ctx.b.fieldConst(10, ctx.inTypes[2]);
    const color = ctx.b.fieldConst('#FF0000', ctx.inTypes[3]);
    const opacity = ctx.b.sigConst(1.0, ctx.inTypes[4]);

    expect(() => {
      blockType.lower({
        ctx,
        inputs: [
          // Missing domain - use field instead to trigger error
          { k: 'field', id: positions, slot: 0 } as any,
          { k: 'field', id: positions, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'positions') },
          { k: 'field', id: radius, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'radius') },
          { k: 'field', id: color, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'color') },
          { k: 'sig', id: opacity, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'opacity') },
        ],
      });
    }).toThrow(/requires a Domain input/);
  });

  it('should validate positions field input', () => {
    const blockType = getBlockType('RenderInstances2D');
    if (!blockType) throw new Error('RenderInstances2D not registered');

    const ctx = createMockLowerCtx();

    const domainSlot = ctx.b.domainFromN(10, []);
    const radius = ctx.b.fieldConst(10, ctx.inTypes[2]);
    const color = ctx.b.fieldConst('#FF0000', ctx.inTypes[3]);
    const opacity = ctx.b.sigConst(1.0, ctx.inTypes[4]);

    expect(() => {
      blockType.lower({
        ctx,
        inputs: [
          { k: 'special', tag: 'domain', id: domainSlot },
          // Missing positions - use signal instead to trigger error
          { k: 'sig', id: opacity, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'bad') } as any,
          { k: 'field', id: radius, slot: ctx.b.allocValueSlot(ctx.inTypes[2], 'radius') },
          { k: 'field', id: color, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'color') },
          { k: 'sig', id: opacity, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'opacity') },
        ],
      });
    }).toThrow(/requires Field<vec2> positions/);
  });

  it('should accept signal radius', () => {
    const blockType = getBlockType('RenderInstances2D');
    if (!blockType) throw new Error('RenderInstances2D not registered');

    const ctx = createMockLowerCtx();

    const domainSlot = ctx.b.domainFromN(10, []);
    const positions = ctx.b.fieldConst([{ x: 0, y: 0 }], ctx.inTypes[1]);
    const radiusSignal = ctx.b.sigConst(10, ctx.inTypes[4]); // Signal instead of field
    const color = ctx.b.fieldConst('#FF0000', ctx.inTypes[3]);
    const opacity = ctx.b.sigConst(1.0, ctx.inTypes[4]);

    const result = blockType.lower({
      ctx,
      inputs: [
        { k: 'special', tag: 'domain', id: domainSlot },
        { k: 'field', id: positions, slot: ctx.b.allocValueSlot(ctx.inTypes[1], 'positions') },
        { k: 'sig', id: radiusSignal, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'radius') }, // Signal radius
        { k: 'field', id: color, slot: ctx.b.allocValueSlot(ctx.inTypes[3], 'color') },
        { k: 'sig', id: opacity, slot: ctx.b.allocValueSlot(ctx.inTypes[4], 'opacity') },
      ],
    });

    expect(result.outputs).toHaveLength(0);
    expect(result.declares?.renderSink).toBeDefined();
  });
});
