/**
 * GridDomain Block Compiler
 *
 * Creates a grid domain with stable row/col element IDs and base positions.
 * This combines domain creation with grid layout in a single block.
 *
 * Element IDs are stable: "row-R-col-C" format ensures consistent identity.
 * Base positions (pos0) are deterministic based on grid parameters.
 */

import type { BlockCompiler, Vec2, Domain } from '../../types';
import { createDomain } from '../../unified/Domain';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

type PositionField = (seed: number, n: number) => readonly Vec2[];

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerGridDomain: BlockLowerFn = ({ ctx, config }) => {
  // GridDomain uses config for grid parameters (compile-time constants)
  const configData = config as {
    rows?: number;
    cols?: number;
    spacing?: number;
    originX?: number;
    originY?: number;
  } | undefined;

  const rows = Math.max(1, Math.floor(Number(configData?.rows ?? 10)));
  const cols = Math.max(1, Math.floor(Number(configData?.cols ?? 10)));
  const spacing = Number(configData?.spacing ?? 20);
  const originX = Number(configData?.originX ?? 100);
  const originY = Number(configData?.originY ?? 100);

  const elementCount = rows * cols;

  // Create domain value slot
  const domainSlot = ctx.b.domainFromN(elementCount);

  // Compute grid positions at compile time
  const positions: Vec2[] = [];
  for (let i = 0; i < elementCount; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
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
  inputs: [],
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
    { name: 'rows', type: { kind: 'Scalar:number' }, required: false },
    { name: 'cols', type: { kind: 'Scalar:number' }, required: false },
    { name: 'spacing', type: { kind: 'Signal:number' }, required: false },
    { name: 'originX', type: { kind: 'Signal:number' }, required: false },
    { name: 'originY', type: { kind: 'Signal:number' }, required: false },
  ],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
    { name: 'pos0', type: { kind: 'Field:vec2' } },
  ],

  compile({ id, inputs }) {
    // Helper to extract numeric value from Scalar or Signal artifacts
    // Signal artifacts have .value as a function, Scalar artifacts have .value as a number
    const extractNumber = (artifact: any): number => {
      if (artifact.kind === 'Scalar:number') return Number(artifact.value);
      if (artifact.kind === 'Signal:number') {
        // Signal artifacts have .value as a function - call with t=0 for compile-time value
        return Number(artifact.value(0, {}));
      }
      // Generic fallback for other artifact types that might have callable or direct values
      return typeof artifact.value === 'function' ? Number(artifact.value(0, {})) : Number(artifact.value);
    };

    // Read from inputs - values come from defaultSource or explicit connections
    const rows = Math.max(1, Math.floor(extractNumber(inputs.rows)));
    const cols = Math.max(1, Math.floor(extractNumber(inputs.cols)));
    const spacing = extractNumber(inputs.spacing);
    const originX = extractNumber(inputs.originX);
    const originY = extractNumber(inputs.originY);

    const elementCount = rows * cols;

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
      const count = Math.min(n, elementCount);
      const out = new Array<Vec2>(count);

      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;

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
