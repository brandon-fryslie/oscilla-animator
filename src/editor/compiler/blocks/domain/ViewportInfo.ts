/**
 * ViewportInfo Block Compiler
 *
 * Provides viewport dimensions as Scalar values.
 * These are compile-time constants based on default viewport size.
 *
 * Note: In a full implementation, these would be responsive to actual viewport,
 * but for now we use hardcoded defaults matching typical canvas size.
 */

import type { Vec2 } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// Default viewport size (matches typical canvas dimensions)
const DEFAULT_VIEWPORT_WIDTH = 800;
const DEFAULT_VIEWPORT_HEIGHT = 600;

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerViewportInfo: BlockLowerFn = ({ ctx }) => {
  const size: Vec2 = {
    x: DEFAULT_VIEWPORT_WIDTH,
    y: DEFAULT_VIEWPORT_HEIGHT,
  };

  const center: Vec2 = {
    x: DEFAULT_VIEWPORT_WIDTH / 2,
    y: DEFAULT_VIEWPORT_HEIGHT / 2,
  };

  // Create scalar const values
  const sizeConstId = ctx.b.allocConstId(size);
  const centerConstId = ctx.b.allocConstId(center);

  return {
    outputs: [
      { k: 'scalarConst', constId: sizeConstId },
      { k: 'scalarConst', constId: centerConstId },
    ],
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'ViewportInfo',
  capability: 'pure',
  inputs: [],
  outputs: [
    { portId: 'size', label: 'Size', dir: 'out', type: { world: "scalar", domain: "vec2", category: "core", busEligible: true } },
    { portId: 'center', label: 'Center', dir: 'out', type: { world: "scalar", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerViewportInfo,
});
