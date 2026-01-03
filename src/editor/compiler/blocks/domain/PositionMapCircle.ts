/**
 * PositionMapCircle Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a circle.
 * Supports even distribution and golden angle spiral patterns.
 */

import type { BlockCompiler, Vec2, Artifact } from '../../types';
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
    outputs: [{ k: 'field', id: posField, slot }],
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

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PositionMapCircleBlock: BlockCompiler = {
  type: 'PositionMapCircle',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'centerX', type: { kind: 'Signal:float' }, required: false },
    { name: 'centerY', type: { kind: 'Signal:float' }, required: false },
    { name: 'radius', type: { kind: 'Signal:float' }, required: false },
    { name: 'startAngle', type: { kind: 'Scalar:float' }, required: false },
    { name: 'winding', type: { kind: 'Scalar:float' }, required: false },
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
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:float' || artifact.kind === 'Signal:float') return Number(artifact.value);
      if ('value' in artifact && artifact.value !== undefined) {
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: object) => number)(0, {}))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    // Helper to extract string value from artifact with default fallback
    const extractString = (artifact: Artifact | undefined, defaultValue: string): string => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:string') return String(artifact.value);
      if ('value' in artifact && artifact.value !== undefined) {
        const val = artifact.value;
        if (typeof val === 'string') {
          return val;
        }
        if (typeof val === 'function') {
          return String((val as (t: number, ctx: object) => string)(0, {}));
        }
        if (typeof val === 'number' || typeof val === 'boolean') {
          return String(val);
        }
      }
      return defaultValue;
    };

    // Support both new (inputs) and old (params) parameter systems
    const paramsObj = params as {
      centerX?: number;
      centerY?: number;
      radius?: number;
      startAngle?: number;
      winding?: number;
      distribution?: string;
    } | undefined;
    const centerX = extractNumber(inputs.centerX, paramsObj?.centerX ?? 400);
    const centerY = extractNumber(inputs.centerY, paramsObj?.centerY ?? 300);
    const radius = extractNumber(inputs.radius, paramsObj?.radius ?? 150);
    const startAngle = extractNumber(inputs.startAngle, paramsObj?.startAngle ?? 0);
    const winding = extractNumber(inputs.winding, paramsObj?.winding ?? 1);
    const distribution = extractString(inputs.distribution, paramsObj?.distribution ?? 'even');

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
