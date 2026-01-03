/**
 * GridDomain Block Compiler
 *
 * Creates a grid domain with stable row/col element IDs and base positions.
 * This combines domain creation with grid layout in a single block.
 *
 * Element IDs are stable: "row-R-col-C" format ensures consistent identity.
 * Base positions (pos0) are deterministic based on grid parameters.
 */

import type { BlockCompiler, Vec2, Domain, Artifact, RuntimeCtx } from '../../types';
import { createDomain } from '../../unified/Domain';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type PositionField = (seed: number, n: number) => readonly Vec2[];

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Generate a short random ID from a seed.
 * Uses a simple hash to produce deterministic 8-character alphanumeric IDs.
 */
function seededId(seed: number): string {
  // Simple mulberry32 PRNG
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const hash = ((t ^ (t >>> 14)) >>> 0);

  // Convert to base36 and take 8 chars
  return hash.toString(36).padStart(8, '0').slice(-8);
}

const lowerGridDomain: BlockLowerFn = ({ ctx, config }) => {
  // GridDomain uses config for grid parameters (compile-time constants)
  const configData = config as {
    rows?: int;
    cols?: int;
    spacing?: float;
    originX?: float;
    originY?: float;
  } | undefined;

  const rows: int = Math.max(1, Math.floor(Number(configData?.rows)));
  const cols: int = Math.max(1, Math.floor(Number(configData?.cols)));
  const spacing: float = Number(configData?.spacing);
  const originX: float = Number(configData?.originX);
  const originY: float = Number(configData?.originY);

  const elementCount: int = rows * cols;

  // Create stable element IDs using seeded random strings
  // Seed is based on grid config to ensure stability across recompiles
  const baseSeed = rows * 10000 + cols;
  const elementIds: string[] = [];
  const positions: Vec2[] = [];
  for (let i = 0; i < elementCount; i++) {
    const row: int = Math.floor(i / cols);
    const col: int = i % cols;
    elementIds.push(seededId(baseSeed + i));
    positions.push({
      x: originX + col * spacing,
      y: originY + row * spacing,
    });
  }

  // Create domain value slot with stable element IDs
  const domainSlot = ctx.b.domainFromN(elementCount, elementIds);

  // Create position field as const
  const posField = ctx.b.fieldConst(positions, { world: "field", domain: "vec2", category: "core", busEligible: true });

  const slot = ctx.b.allocValueSlot(ctx.outTypes[0], 'GridDomain_out');
  return {
    outputs: [
      { k: 'special', tag: 'domain', id: domainSlot },
      { k: 'field', id: posField, slot },
    ],
    declares: {
      domainOut: { outPortIndex: 0, domainKind: 'domain' },
    },
  };
};

// Register block type for IR lowering
registerBlockType({
  type: 'GridDomain',
  capability: 'identity',
  inputs: [
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
      defaultSource: { value: 100 },
    },
    {
      portId: 'originY',
      label: 'Origin Y',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 100 },
    },
  ],
  outputs: [
    { portId: 'domain', label: 'Domain', dir: 'out', type: { world: "config", domain: "domain", category: "internal", busEligible: false } },
    { portId: 'pos0', label: 'Pos0', dir: 'out', type: { world: "field", domain: "vec2", category: "core", busEligible: true } },
  ],
  lower: lowerGridDomain,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const GridDomainBlock: BlockCompiler = {
  type: 'GridDomain',

  inputs: [
    { name: 'rows', type: { kind: 'Scalar:int' }, required: true },
    { name: 'cols', type: { kind: 'Scalar:int' }, required: true },
    { name: 'spacing', type: { kind: 'Signal:float' }, required: true },
    { name: 'originX', type: { kind: 'Signal:float' }, required: true },
    { name: 'originY', type: { kind: 'Signal:float' }, required: true },
  ],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
    { name: 'pos0', type: { kind: 'Field:vec2' } },
  ],

  compile({ id, inputs, params }) {
    // Helper to extract numeric value from Scalar or Signal artifacts, with default fallback
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      console.log("#$####### etract ahndler")
      console.log(artifact)
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:int' || artifact.kind === 'Scalar:float') {
        return Number(artifact.value);
      }
      if (artifact.kind === 'Signal:float') {
        // Signal artifacts have .value as a function - call with t=0 for compile-time value
        const runtimeCtx: RuntimeCtx = { viewport: { w: 1920, h: 1080, dpr: 1 } };
        return Number(artifact.value(0, runtimeCtx));
      }
      // Generic fallback for other artifact types that might have callable or direct values
      if ('value' in artifact && artifact.value !== undefined) {
        const runtimeCtx: RuntimeCtx = { viewport: { w: 1920, h: 1080, dpr: 1 } };
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: RuntimeCtx) => number)(0, runtimeCtx))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    // Read from inputs with defaults matching IR lowering
    // Support both new (inputs) and old (params) parameter systems
    const paramsObj = params as { rows: int; cols?: int; spacing: float; originX: float; originY: float };
    const rows: int = Math.max(1, Math.floor(extractNumber(inputs.rows, paramsObj.rows)));
    // cols is optional in params, default to rows to make grid square if not specified
    const cols: int = Math.max(1, Math.floor(extractNumber(inputs.cols, paramsObj.cols ?? rows)));
    const spacing: float = extractNumber(inputs.spacing, paramsObj.spacing);
    const originX: float = extractNumber(inputs.originX, paramsObj.originX);
    const originY: float = extractNumber(inputs.originY, paramsObj.originY);

    const elementCount: int = rows * cols;

    // Create stable element IDs: "row-R-col-C"
    const elementIds: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        elementIds.push(`row-${r}-col-${c}`);
      }
    }

    // Create domain with stable IDs
    const domainId = `grid-domain-${id}-${rows}x${cols}`;
    const domain: Domain = createDomain(domainId, elementIds);

    // Create position field (base positions)
    const positionField: PositionField = (_seed, n) => {
      const count: int = Math.min(n, elementCount);
      const out = new Array<Vec2>(count);

      for (let i = 0; i < count; i++) {
        const row: int = Math.floor(i / cols);
        const col: int = i % cols;

        out[i] = {
          x: originX + col * spacing,
          y: originY + row * spacing,
        };
      }

      return out;
    };

    return {
      domain: { kind: 'Domain', value: domain },
      pos0: { kind: 'Field:vec2', value: positionField },
    };
  },
};
