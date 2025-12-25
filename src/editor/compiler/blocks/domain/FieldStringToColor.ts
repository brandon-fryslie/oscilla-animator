/**
 * FieldStringToColor Block Compiler
 *
 * Simple adapter that reinterprets Field<string> as Field<color>.
 * The strings should be valid CSS color values (hex, rgb, hsl, etc.)
 */

import type { BlockCompiler, Field } from '../../types';
import { isDefined } from '../../../types/helpers';

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
