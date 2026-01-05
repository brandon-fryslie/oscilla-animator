/**
 * PositionMapGrid Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a grid.
 * Elements are laid out in rows and columns from the origin point.
 */

import type { BlockCompiler, Vec2, Artifact, RuntimeCtx } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type PositionField = (seed: number, n: number) => readonly Vec2[];

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
    outputsById: { out: { k: 'field', id: posField, slot } },
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

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const PositionMapGridBlock: BlockCompiler = {
  type: 'PositionMapGrid',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'cols', type: { kind: 'Scalar:int' }, required: false },
    { name: 'spacing', type: { kind: 'Signal:float' }, required: false },
    { name: 'originX', type: { kind: 'Signal:float' }, required: false },
    { name: 'originY', type: { kind: 'Signal:float' }, required: false },
    { name: 'order', type: { kind: 'Scalar:string' }, required: false },
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
          message: 'PositionMapGrid requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;

    // Default runtime context for compile-time signal evaluation
    const defaultCtx: RuntimeCtx = { viewport: { w: 1920, h: 1080, dpr: 1 } };

    // Helper to extract numeric value from artifact with default fallback
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:int' || artifact.kind === 'Scalar:float') {
        return Number(artifact.value);
      }
      if (artifact.kind === 'Signal:float') {
        return Number(artifact.value(0, defaultCtx));
      }
      // For other types, try to convert to number (fallback for any other artifact type)
      return typeof artifact.value === 'function' ? Number((artifact.value as (t: number, ctx: RuntimeCtx) => unknown)(0, defaultCtx)) : Number(artifact.value);
    };

    // Helper to extract string value from artifact with default fallback
    const extractString = (artifact: Artifact | undefined, defaultValue: string): string => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:string') return String(artifact.value);
      return typeof artifact.value === 'function' ? String((artifact.value as (t: number, ctx: unknown) => unknown)(0, {})) : String(artifact.value);
    };

    // Support both new (inputs) and old (params) parameter systems
    const cols: int = extractNumber(inputs.cols, (params as Record<string, unknown> | undefined)?.cols as number | undefined ?? 10);
    const spacing: float = extractNumber(inputs.spacing, (params as Record<string, unknown> | undefined)?.spacing as number | undefined ?? 20);
    const originX: float = extractNumber(inputs.originX, (params as Record<string, unknown> | undefined)?.originX as number | undefined ?? 0);
    const originY: float = extractNumber(inputs.originY, (params as Record<string, unknown> | undefined)?.originY as number | undefined ?? 0);
    const order = extractString(inputs.order, (params as Record<string, unknown> | undefined)?.order as string | undefined ?? 'rowMajor');

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount: int = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
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
