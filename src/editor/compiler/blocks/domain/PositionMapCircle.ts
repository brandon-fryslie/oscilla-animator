/**
 * PositionMapCircle Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a circle.
 * Supports even distribution and golden angle spiral patterns.
 */

import type { Vec2 } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// Golden angle in radians
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPositionMapCircle: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (domainInput === undefined || (domainInput.k !== 'special' || domainInput.tag !== 'domain')) {
    throw new Error('PositionMapCircle requires Domain input');
  }

  const configData = config as {
    centerX?: number;
    centerY?: number;
    radius?: number;
    startAngle?: number;
    winding?: number;
    distribution?: string;
    domainSize?: number;
  } | undefined;

  const centerX = Number(configData?.centerX ?? 400);
  const centerY = Number(configData?.centerY ?? 300);
  const radius = Number(configData?.radius ?? 150);
  const startAngle = Number(configData?.startAngle ?? 0);
  const winding = Number(configData?.winding ?? 1);
  const distribution = configData?.distribution ?? 'even';
  const domainSize = configData?.domainSize ?? 100;

  // Convert degrees to radians
  const startAngleRad = (startAngle * Math.PI) / 180;

  // Compute circle positions at compile time
  const positions: Vec2[] = [];
  for (let i = 0; i < domainSize; i++) {
    let angle: number;

    if (distribution === 'goldenAngle') {
      // Golden angle spiral - good for filling a disk
      angle = startAngleRad + i * GOLDEN_ANGLE * winding;
    } else {
      // Even distribution around circle
      angle = startAngleRad + (i / domainSize) * 2 * Math.PI * winding;
    }

    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  // Create position field as const
  const posField = ctx.b.fieldConst(positions, { world: "field", domain: "vec2", category: "core", busEligible: true });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'PositionMapCircle_out');
  return {
    outputs: [],
    outputsById: { pos: { k: 'field', id: posField, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PositionMapCircle',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
    {
      portId: 'centerX',
      label: 'Center X',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 250 },
    },
    {
      portId: 'centerY',
      label: 'Center Y',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 250 },
    },
    {
      portId: 'radius',
      label: 'Radius',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 150 },
    },
    {
      portId: 'startAngle',
      label: 'Start Angle',
      dir: 'in',
      type: { world: "scalar", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
    {
      portId: 'winding',
      label: 'Winding',
      dir: 'in',
      type: { world: "scalar", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 1 },
    },
    {
      portId: 'distribution',
      label: 'Distribution',
      dir: 'in',
      type: { world: "scalar", domain: "string", category: "internal", busEligible: false },
      defaultSource: { value: 'even' },
    },
  ],
  outputs: [
    { portId: 'pos', label: 'Pos', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerPositionMapCircle,
});
