/**
 * OutputProgram Block Compiler
 *
 * Pass-through block that marks the patch output explicitly.
 * Makes patch.output inference unnecessary and UI clearer.
 */

import type { BlockCompiler } from '../../../types';

export const OutputProgramBlock: BlockCompiler = {
  type: 'outputProgram',
  inputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' }, required: true }],
  outputs: [{ name: 'out', type: { kind: 'RenderTreeProgram' } }],

  compile({ inputs }) {
    const input = inputs.program;

    if (input.kind !== 'RenderTreeProgram') {
      return {
        out: { kind: 'Error', message: 'outputProgram: input must be RenderTreeProgram' },
      };
    }

    // Pass through unchanged
    return { out: input };
  },
};
