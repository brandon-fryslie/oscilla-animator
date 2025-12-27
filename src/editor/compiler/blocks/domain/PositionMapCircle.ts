/**
 * PositionMapCircle Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a circle.
 * Supports even distribution and golden angle spiral patterns.
 */

import type { BlockCompiler, Vec2 } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type PositionField = (seed: number, n: number) => readonly Vec2[];

// Golden angle in radians
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerPositionMapCircle: BlockLowerFn = ({ ctx, inputs, config }) => {
  // Input[0]: domain
  const domainInput = inputs[0];
  if (!domainInput || (domainInput.k !== 'special' || domainInput.tag !== 'domain')) {
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
  const posField = ctx.b.fieldConst(positions, { world: 'field', domain: 'vec2' });

  const slot = ctx.b.allocValueSlot();
  return {
    outputs: [{ k: 'field', id: posField, slot }],
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'PositionMapCircle',
  capability: 'pure',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: 'special', domain: 'domain' } },
  ],
  outputs: [
    { portId: 'pos', label: 'Pos', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerPositionMapCircle,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PositionMapCircleBlock: BlockCompiler = {
  type: 'PositionMapCircle',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'centerX', type: { kind: 'Signal:number' }, required: false },
    { name: 'centerY', type: { kind: 'Signal:number' }, required: false },
    { name: 'radius', type: { kind: 'Signal:number' }, required: false },
    { name: 'startAngle', type: { kind: 'Scalar:number' }, required: false },
    { name: 'winding', type: { kind: 'Scalar:number' }, required: false },
    { name: 'distribution', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'pos', type: { kind: 'Field:vec2' } },
  ],

  compile({ inputs, params }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        pos: {
          kind: 'Error',
          message: 'PositionMapCircle requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Helper to extract numeric value from artifact with default fallback
    const extractNumber = (artifact: any, defaultValue: number): number => {
      if (!artifact) return defaultValue;
      if (artifact.kind === 'Scalar:number' || artifact.kind === 'Signal:number') return Number(artifact.value);
      return typeof artifact.value === 'function' ? Number(artifact.value(0, {})) : Number(artifact.value);
    };

    // Helper to extract string value from artifact with default fallback
    const extractString = (artifact: any, defaultValue: string): string => {
      if (!artifact) return defaultValue;
      if (artifact.kind === 'Scalar:string') return String(artifact.value);
      return typeof artifact.value === 'function' ? String(artifact.value(0, {})) : String(artifact.value);
    };

    // Support both new (inputs) and old (params) parameter systems
    const centerX = extractNumber(inputs.centerX, (params as any)?.centerX ?? 400);
    const centerY = extractNumber(inputs.centerY, (params as any)?.centerY ?? 300);
    const radius = extractNumber(inputs.radius, (params as any)?.radius ?? 150);
    const startAngle = extractNumber(inputs.startAngle, (params as any)?.startAngle ?? 0);
    const winding = extractNumber(inputs.winding, (params as any)?.winding ?? 1);
    const distribution = extractString(inputs.distribution, (params as any)?.distribution ?? 'even');

    // Convert degrees to radians
    const startAngleRad = (startAngle * Math.PI) / 180;

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
        let angle: number;

        if (distribution === 'goldenAngle') {
          // Golden angle spiral - good for filling a disk
          angle = startAngleRad + i * GOLDEN_ANGLE * winding;
        } else {
          // Even distribution around circle
          angle = startAngleRad + (i / elementCount) * 2 * Math.PI * winding;
        }

        out[i] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      }

      return out;
    };

    return {
      pos: { kind: 'Field:vec2', value: positionField },
    };
  },
};
