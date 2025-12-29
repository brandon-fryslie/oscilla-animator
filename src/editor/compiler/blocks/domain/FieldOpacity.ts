/**
 * FieldOpacity Block Compiler
 *
 * Converts a numeric Field to opacity values with range mapping and curve application.
 * Takes Field<number> and produces Field<number> clamped to [min, max] with optional curve.
 */

import type { BlockCompiler, Field, Artifact } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

/**
 * Apply curve transformation to value in [0,1]
 */
function applyCurve(t: number, curve: string): number {
  const u = Math.max(0, Math.min(1, t));

  switch (curve) {
    case 'smoothstep':
      return u * u * (3 - 2 * u);
    case 'square':
      return u * u;
    case 'sqrt':
      return Math.sqrt(u);
    case 'linear':
    default:
      return u;
  }
}

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldOpacity: BlockLowerFn = ({ inputs, config }) => {
  const values = inputs[0];

  if (values.k !== 'field') {
    throw new Error('FieldOpacity requires field input');
  }

  const cfg = config as { min?: number; max?: number; curve?: string } | undefined;
  const min = cfg?.min ?? 0;
  const max = cfg?.max ?? 1;
  const curve = cfg?.curve ?? 'linear';

  // For linear curve with no clamping (min=0, max=1), we can pass through
  if (curve === 'linear' && min === 0 && max === 1) {
    return { outputs: [values] };
  }

  // For non-linear curves or range mapping, we need fieldMap with curve functions
  // Current supported curves: smoothstep, square, sqrt, linear
  //
  // IR Implementation approach:
  // 1. Clamp input to [0,1] using fieldMap with Clamp opcode
  // 2. Apply curve using fieldMap with appropriate opcode
  // 3. Scale to [min, max] using fieldMap with linear transform
  //
  // Challenges:
  // - Smoothstep: u * u * (3 - 2 * u) requires composition of mul/sub
  // - Square: u * u can use Mul with same input
  // - Sqrt: needs Sqrt opcode (not in current registry)
  //
  // For complex curves, we'd need to compose multiple operations or add curve opcodes

  throw new Error(
    `FieldOpacity IR lowering requires field-level curve transformations (curve: ${curve}, range: [${min}, ${max}]). ` +
    'This needs: (1) fieldMap with curve composition (smoothstep, square, sqrt), ' +
    '(2) potentially new curve opcodes, and ' +
    '(3) field-level clamp and linear transform. ' +
    'Block remains in closure mode until field transformation operations are implemented in IR.'
  );
};

registerBlockType({
  type: 'FieldOpacity',
  capability: 'pure',
  inputs: [
    { portId: 'values', label: 'Values', dir: 'in', type: { world: 'field', domain: 'number' }, defaultSource: { value: 0 } },
  ],
  outputs: [
    { portId: 'opacity', label: 'Opacity', dir: 'out', type: { world: 'field', domain: 'number' } },
  ],
  lower: lowerFieldOpacity,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldOpacityBlock: BlockCompiler = {
  type: 'FieldOpacity',

  inputs: [
    { name: 'values', type: { kind: 'Field:number' }, required: true },
    { name: 'min', type: { kind: 'Scalar:number' }, required: false },
    { name: 'max', type: { kind: 'Scalar:number' }, required: false },
    { name: 'curve', type: { kind: 'Scalar:string' }, required: false },
  ],

  outputs: [
    { name: 'opacity', type: { kind: 'Field:number' } },
  ],

  compile({ inputs }) {
    const valuesArtifact = inputs.values;
    if (!isDefined(valuesArtifact) || valuesArtifact.kind !== 'Field:number') {
      return {
        opacity: {
          kind: 'Error',
          message: 'FieldOpacity requires a Field<number> input',
        },
      };
    }

    const valuesFn = valuesArtifact.value;

    // Helper to extract numeric/string values from artifacts
    const extractNumber = (artifact: Artifact | undefined, defaultValue: number): number => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:number' || artifact.kind === 'Signal:number') {
        return Number(artifact.value);
      }
      if ('value' in artifact && artifact.value !== undefined) {
        return typeof artifact.value === 'function'
          ? Number((artifact.value as (t: number, ctx: object) => number)(0, {}))
          : Number(artifact.value);
      }
      return defaultValue;
    };

    const extractString = (artifact: Artifact | undefined, defaultValue: string): string => {
      if (artifact === undefined) return defaultValue;
      if (artifact.kind === 'Scalar:string') {
        return String(artifact.value);
      }
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

    const min = extractNumber(inputs.min, 0);
    const max = extractNumber(inputs.max, 1);
    const curve = extractString(inputs.curve, 'linear');

    // Create opacity field
    const field: Field<number> = (seed, n, ctx) => {
      const values = valuesFn(seed, n, ctx);
      return values.map((v) => {
        const normalized = Math.max(0, Math.min(1, v));
        const curved = applyCurve(normalized, curve);
        return min + (max - min) * curved;
      });
    };

    return {
      opacity: { kind: 'Field:number', value: field },
    };
  },
};
