/**
 * PositionMapGrid Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a grid.
 * Elements are laid out in rows and columns from the origin point.
 */

import type { BlockCompiler, Vec2 } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type PositionField = (seed: number, n: number) => readonly Vec2[];

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPositionMapGrid: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (!domainInput || (domainInput.k !== 'special' || domainInput.tag !== 'domain')) {
    throw new Error('PositionMapGrid requires Domain input');
  }

  // For now, we need to know the domain size at compile time to generate positions
  // This is a limitation of the current IR - procedural field generation not yet supported
  // TODO: Add procedural field IR nodes or runtime domain size query

  const configData = config as {
    cols?: number;
    spacing?: number;
    originX?: number;
    originY?: number;
    order?: string;
    domainSize?: number; // Temporary: pass domain size via config
  } | undefined;

  const cols = Number(configData?.cols ?? 10);
  const spacing = Number(configData?.spacing ?? 20);
  const originX = Number(configData?.originX ?? 100);
  const originY = Number(configData?.originY ?? 100);
  const order = configData?.order ?? 'rowMajor';
  const domainSize = configData?.domainSize ?? 100; // Fallback size

  // Compute grid positions at compile time
  const positions: Vec2[] = [];
  for (let i = 0; i < domainSize; i++) {
    let col: number;
    let row: number;

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
  const posField = ctx.b.fieldConst(positions, { world: 'field', domain: 'vec2' });

  return {
    outputs: [{ k: 'field', id: posField }],
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PositionMapGrid',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' } },
  ],
  outputs: [
    { portId: 'pos', label: 'Pos', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerPositionMapGrid,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PositionMapGridBlock: BlockCompiler = {
  type: 'PositionMapGrid',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'pos', type: { kind: 'Field:vec2' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        pos: {
          kind: 'Error',
          message: 'PositionMapGrid requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    const cols = Number(params.cols ?? 10);
    const spacing = Number(params.spacing ?? 20);
    const originX = Number(params.originX ?? 100);
    const originY = Number(params.originY ?? 100);
    const order = typeof params.order === 'string' ? params.order : 'rowMajor';

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
        let col: number;
        let row: number;

        if (order === 'serpentine') {
          row = Math.floor(i / cols);
          const rawCol = i % cols;
          col = row % 2 === 0 ? rawCol : cols - 1 - rawCol;
        } else {
          // rowMajor
          col = i % cols;
          row = Math.floor(i / cols);
        }

        out[i] = {
          x: originX + col * spacing,
          y: originY + row * spacing,
        };
      }

      return out;
    };

    return {
      pos: { kind: 'Field:vec2', value: positionField },
    };
  },
};
