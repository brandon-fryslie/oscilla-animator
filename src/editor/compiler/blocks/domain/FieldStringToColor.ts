/**
 * FieldStringToColor Block Compiler
 *
 * Simple adapter that reinterprets Field<string> as Field<color>.
 * The strings should be valid CSS color values (hex, rgb, hsl, etc.)
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering
// =============================================================================

const lowerFieldStringToColor: BlockLowerFn = ({ inputs }) => {
  const strings = inputs[0];

  if (strings.k !== 'field') {
    throw new Error('FieldStringToColor requires field input');
  }

  // This is a pure type reinterpretation - Field<string> -> Field<color>
  // In the IR, both are represented the same way (field of values)
  // The type annotation changes but the actual data structure is identical
  //
  // This is a no-op in IR - just pass through the field reference
  return { outputs: [strings] };
};

registerBlockType({
  type: 'FieldStringToColor',
  capability: 'pure',
  inputs: [
    { portId: 'strings', label: 'Strings', dir: 'in', type: { world: 'field', domain: 'string' }, defaultSource: { value: '' } },
  ],
  outputs: [
    { portId: 'colors', label: 'Colors', dir: 'out', type: { world: 'field', domain: 'color' } },
  ],
  lower: lowerFieldStringToColor,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const FieldStringToColorBlock: BlockCompiler = {
  type: 'FieldStringToColor',

  inputs: [
    { name: 'strings', type: { kind: 'Field:string' }, required: true },
  ],

  outputs: [
    { name: 'colors', type: { kind: 'Field:color' } },
  ],

  compile({ inputs }) {
    const stringsArtifact = inputs.strings;

    if (!isDefined(stringsArtifact) || stringsArtifact.kind !== 'Field:string') {
      return {
        colors: {
          kind: 'Error',
          message: 'FieldStringToColor requires a Field<string> input',
        },
      };
    }

    // Simple passthrough - just reinterpret the type
    const stringField = stringsArtifact.value;
    const colorField: Field<string> = (seed, n, ctx) => stringField(seed, n, ctx);

    return {
      colors: { kind: 'Field:color', value: colorField },
    };
  },
};
