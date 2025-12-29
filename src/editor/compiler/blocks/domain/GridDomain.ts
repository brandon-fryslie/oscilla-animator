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

const lowerGridDomain: BlockLowerFn = ({ ctx, config }) => {
  // GridDomain uses config for grid parameters (compile-time constants)
  const configData = config as {
    rows?: int;
    cols?: int;
    spacing?: float;
    originX?: float;
    originY?: float;
  } | undefined;

  const rows: int = Math.max(1, Math.floor(Number(configData?.rows ?? 10)));
  const cols: int = Math.max(1, Math.floor(Number(configData?.cols ?? 10)));
  const spacing: float = Number(configData?.spacing ?? 20);
  const originX: float = Number(configData?.originX ?? 100);
  const originY: float = Number(configData?.originY ?? 100);

  const elementCount: int = rows * cols;

  // Create domain value slot
  const domainSlot = ctx.b.domainFromN(elementCount);

  // Compute grid positions at compile time
  const positions: Vec2[] = [];
  for (let i = 0; i < elementCount; i++) {
    const row: int = Math.floor(i / cols);
    const col: int = i % cols;
    positions.push({
      x: originX + col * spacing,
      y: originY + row * spacing,
    });
  }

  // Create position field as const
  const posField = ctx.b.fieldConst(positions, { world: 'field', domain: 'vec2' });

  const slot = ctx.b.allocValueSlot();
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
      type: { world: 'scalar', domain: 'int' },
      defaultSource: { value: 10 },
    },
    {
      portId: 'cols',
      label: 'Cols',
      dir: 'in',
      type: { world: 'scalar', domain: 'int' },
      defaultSource: { value: 10 },
    },
    {
      portId: 'spacing',
      label: 'Spacing',
      dir: 'in',
      type: { world: 'signal', domain: 'float' },
      defaultSource: { value: 20 },
    },
    {
      portId: 'originX',
      label: 'Origin X',
      dir: 'in',
      type: { world: 'signal', domain: 'float' },
      defaultSource: { value: 100 },
    },
    {
      portId: 'originY',
      label: 'Origin Y',
      dir: 'in',
      type: { world: 'signal', domain: 'float' },
      defaultSource: { value: 100 },
    },
  ],
  outputs: [
    { portId: 'domain', label: 'Domain', dir: 'out', type: { world: 'special', domain: 'domain' } },
    { portId: 'pos0', label: 'Pos0', dir: 'out', type: { world: 'field', domain: 'vec2' } },
  ],
  lower: lowerGridDomain,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const GridDomainBlock: BlockCompiler = {
  type: 'GridDomain',

  inputs: [
    { name: 'rows', type: { kind: 'Scalar:int' }, required: false },
    { name: 'cols', type: { kind: 'Scalar:int' }, required: false },
    { name: 'spacing', type: { kind: 'Signal:float' }, required: false },
    { name: 'originX', type: { kind: 'Signal:float' }, required: false },
    { name: 'originY', type: { kind: 'Signal:float' }, required: false },
  ],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
    { name: 'pos0', type: { kind: 'Field:vec2' } },
  ],

  compile({ id, inputs, params }) {
    // Helper to extract numeric value from Scalar or Signal artifacts, with default fallback
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
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
    const paramsObj = params as { rows?: int; cols?: int; spacing?: float; originX?: float; originY?: float } | undefined;
    const rows: int = Math.max(1, Math.floor(extractNumber(inputs.rows, paramsObj?.rows ?? 10)));
    const cols: int = Math.max(1, Math.floor(extractNumber(inputs.cols, paramsObj?.cols ?? 10)));
    const spacing: float = extractNumber(inputs.spacing, paramsObj?.spacing ?? 20);
    const originX: float = extractNumber(inputs.originX, paramsObj?.originX ?? 100);
    const originY: float = extractNumber(inputs.originY, paramsObj?.originY ?? 100);

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
