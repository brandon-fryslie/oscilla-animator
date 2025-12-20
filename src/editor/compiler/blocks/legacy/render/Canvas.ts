/**
 * Canvas Block Compiler
 *
 * Final render output sink. Viewport and background are configured
 * externally on the SVG element. This block is a pass-through.
 */

import type { BlockCompiler, Program, RuntimeCtx } from '../../../types';
import type { RenderTree } from '../../../../runtime/renderTree';

export const CanvasBlock: BlockCompiler = {
  type: 'canvas',
  inputs: [{ name: 'render', type: { kind: 'RenderTreeProgram' }, required: true }],
  outputs: [{ name: 'out', type: { kind: 'RenderTreeProgram' } }],

  compile({ inputs }) {
    if (inputs.render?.kind !== 'RenderTreeProgram') {
      return {
        out: { kind: 'Error', message: 'Canvas: input must be RenderTreeProgram' },
      };
    }

    const inputProgram = inputs.render.value as Program<RenderTree>;

    // Pass-through - viewport and background are set on the SVG element
    const program: Program<RenderTree> = {
      signal: (tMs: number, rt: RuntimeCtx): RenderTree => {
        return inputProgram.signal(tMs, rt);
      },

      event: inputProgram.event,
    };

    return { out: { kind: 'RenderTreeProgram', value: program } };
  },
};
