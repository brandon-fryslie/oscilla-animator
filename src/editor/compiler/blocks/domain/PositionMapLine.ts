/**
 * PositionMapLine Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions along a line from point A to point B.
 * Elements are distributed along the line segment.
 */

import type { BlockCompiler, Vec2 } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type PositionField = (seed: number, n: number) => readonly Vec2[];

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPositionMapLine: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (!domainInput || (domainInput.k !== 'special' || domainInput.tag !== 'domain')) {
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
  const posField = ctx.b.fieldConst(positions, { world: 'field', domain: 'vec2' });

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [{ k: 'field', id: posField, slot }],
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PositionMapLine',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' }, defaultSource: { value: 100 } },
  ],
  outputs: [
    { portId: 'pos', label: 'Pos', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerPositionMapLine,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PositionMapLineBlock: BlockCompiler = {
  type: 'PositionMapLine',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'ax', type: { kind: 'Signal:number' }, required: false },
    { name: 'ay', type: { kind: 'Signal:number' }, required: false },
    { name: 'bx', type: { kind: 'Signal:number' }, required: false },
    { name: 'by', type: { kind: 'Signal:number' }, required: false },
    { name: 'distribution', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'pos', type: { kind: 'Field:vec2' } },
  ],

  compile({ inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        pos: {
          kind: 'Error',
          message: 'PositionMapLine requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Read from inputs - values come from defaultSource or explicit connections
    const ax = Number((inputs.ax as any)?.value);
    const ay = Number((inputs.ay as any)?.value);
    const bx = Number((inputs.bx as any)?.value);
    const by = Number((inputs.by as any)?.value);
    const distribution = String((inputs.distribution as any)?.value);

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
        let t: number;

        if (distribution === 'even') {
          // Even distribution along the line
          t = elementCount > 1 ? i / (elementCount - 1) : 0.5;
        } else {
          // For now, treat anything else as 'even'
          // Could add 'random' distribution later
          t = elementCount > 1 ? i / (elementCount - 1) : 0.5;
        }

        // Linear interpolation from a to b
        out[i] = {
          x: ax + (bx - ax) * t,
          y: ay + (by - ay) * t,
        };
      }

      return out;
    };

    return {
      pos: { kind: 'Field:vec2', value: positionField },
    };
  },
};
