/**
 * PositionMapGrid Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a grid.
 * Elements are laid out in rows and columns from the origin point.
 */

import type { Vec2 } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPositionMapGrid: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (domainInput === undefined || domainInput.k !== 'special' || domainInput.tag !== 'domain') {
    throw new Error('PositionMapGrid requires Domain input');
  }

  // For now, we need to know the domain size at compile time to generate positions
  // This is a limitation of the current IR - procedural field generation not yet supported
  // TODO: Add procedural field IR nodes or runtime domain size query

  const configData = config as {
    cols?: int;
    spacing?: float;
    originX?: float;
    originY?: float;
    order?: string;
    domainSize?: int; // Temporary: pass domain size via config
  } | undefined;

  const cols: int = Number(configData?.cols ?? 10);
  const spacing: float = Number(configData?.spacing ?? 20);
  const originX: float = Number(configData?.originX ?? 100);
  const originY: float = Number(configData?.originY ?? 100);
  const order = configData?.order ?? 'rowMajor';
  const domainSize: int = configData?.domainSize ?? 100; // Fallback size

  // Compute grid positions at compile time
  const positions: Vec2[] = [];
  for (let i = 0; i < domainSize; i++) {
    let col: int;
    let row: int;

    if (order === 'serpentine') {
      row = Math.floor(i / cols);
      const rawCol = i % cols;
      col = row % 2 === 0 ? rawCol : cols - 1 - rawCol;
    } else {
      // rowMajor
      col = i % cols;
      row = Math.floor(i / cols);
    }

    positions.push({
      x: originX + col * spacing,
      y: originY + row * spacing,
    });
  }

  // Create position field as const
  const posField = ctx.b.fieldConst(positions, { world: "field", domain: "vec2", category: "core", busEligible: true });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'PositionMapGrid_out');
  return {
    outputs: [],
    outputsById: { pos: { k: 'field', id: posField, slot } },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PositionMapGrid',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 100 } },
    {
      portId: 'rows',
      label: 'Rows',
      dir: 'in',
      type: { world: "scalar", domain: "int", category: "core", busEligible: true },
      defaultSource: { value: 10 },
    },
    {
      portId: 'cols',
      label: 'Cols',
      dir: 'in',
      type: { world: "scalar", domain: "int", category: "core", busEligible: true },
      defaultSource: { value: 10 },
    },
    {
      portId: 'spacing',
      label: 'Spacing',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 20 },
    },
    {
      portId: 'originX',
      label: 'Origin X',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
    {
      portId: 'originY',
      label: 'Origin Y',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0 },
    },
    {
      portId: 'order',
      label: 'Order',
      dir: 'in',
      type: { world: "scalar", domain: "string", category: "internal", busEligible: false },
      defaultSource: { value: 'rowMajor' },
    },
  ],
  outputs: [
    { portId: 'pos', label: 'Pos', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerPositionMapGrid,
});
