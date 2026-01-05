/**
 * PositionMapLine Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions along a line from point A to point B.
 * Elements are distributed along the line segment.
 */

import type { Vec2 } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPositionMapLine: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (domainInput === undefined || domainInput.k !== 'special' || domainInput.tag !== 'domain') {
    throw new Error('PositionMapLine requires Domain input');
  }

  const configData = config as {
    ax?: number;
    ay?: number;
    bx?: number;
    by?: number;
    distribution?: string;
    domainSize?: number;
  } | undefined;

  const ax = Number(configData?.ax ?? 100);
  const ay = Number(configData?.ay ?? 200);
  const bx = Number(configData?.bx ?? 700);
  const by = Number(configData?.by ?? 200);
  const domainSize = configData?.domainSize ?? 100;

  // Compute line positions at compile time
  const positions: Vec2[] = [];
  for (let i = 0; i < domainSize; i++) {
    const t = domainSize > 1 ? i / (domainSize - 1) : 0.5;

    // Linear interpolation from a to b
    positions.push({
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
    });
  }

  // Create position field as const
  const posField = ctx.b.fieldConst(positions, { world: "field", domain: "vec2", category: "core", busEligible: true });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'PositionMapLine_out');
  return {
    outputs: [],
    outputsById: { pos: { k: 'field', id: posField, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PositionMapLine',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'pos', label: 'Pos', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerPositionMapLine,
});
