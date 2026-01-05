/**
 * GridDomain Block Compiler
 *
 * Creates a grid domain with stable row/col element IDs and base positions.
 * This combines domain creation with grid layout in a single block.
 *
 * Element IDs are stable: "row-R-col-C" format ensures consistent identity.
 * Base positions (pos0) are deterministic based on grid parameters.
 */

import type { Vec2 } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

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

const lowerGridDomain: BlockLowerFn = ({ ctx, inputs, inputsById, config }) => {
  // GridDomain uses inputs for grid parameters
  // Inputs are: rows (Scalar:int), cols (Scalar:int), spacing (Signal:float), originX (Signal:float), originY (Signal:float)

  // Get const pool for looking up scalar values
  const constPool = ctx.b.getConstPool();

  // Helper to extract scalar constant value from ValueRefPacked
  const extractScalarInt = (ref: typeof inputs[0] | undefined, defaultValue: int): int => {
    if (!ref) return defaultValue;
    if (ref.k === 'scalarConst') {
      // Scalar constant - look up value in const pool
      const value = constPool[ref.constId];
      return Math.max(1, Math.floor(Number(value)));
    }
    // Fallback for config
    return defaultValue;
  };

  // Helper to extract numeric value from signal or scalar
  const extractFloat = (ref: typeof inputs[0] | undefined, defaultValue: float): float => {
    if (!ref) return defaultValue;
    if (ref.k === 'scalarConst') {
      const value = constPool[ref.constId];
      return Number(value);
    }
    // For signals, use default - grid layout is computed at compile time
    // A more advanced impl could evaluate signal at t=0
    return defaultValue;
  };

  // Get input values using inputsById with fallback to positional inputs
  const rowsInput = inputsById?.rows ?? inputs[0];
  const colsInput = inputsById?.cols ?? inputs[1];
  const spacingInput = inputsById?.spacing ?? inputs[2];
  const originXInput = inputsById?.originX ?? inputs[3];
  const originYInput = inputsById?.originY ?? inputs[4];

  // Fallback to config if inputs are not available
  const configData = config as {
    rows?: int;
    cols?: int;
    spacing?: float;
    originX?: float;
    originY?: float;
  } | undefined;

  const rows: int = extractScalarInt(rowsInput, configData?.rows ?? 10);
  const cols: int = extractScalarInt(colsInput, configData?.cols ?? 10);
  const spacing: float = extractFloat(spacingInput, configData?.spacing ?? 20);
  const originX: float = extractFloat(originXInput, configData?.originX ?? 100);
  const originY: float = extractFloat(originYInput, configData?.originY ?? 100);

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

  const posSlot = ctx.b.allocValueSlot({ world: "field", domain: "vec2", category: "core", busEligible: true }, 'GridDomain_pos0');

  return {
    outputs: [],  // Legacy array - empty for migrated blocks
    outputsById: {
      domain: { k: 'special', tag: 'domain', id: domainSlot },
      pos0: { k: 'field', id: posField, slot: posSlot },
    },
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
