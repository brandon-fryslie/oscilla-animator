/**
 * ParticleRenderer Block Compiler
 *
 * Wraps a Program with particle-specific rendering settings.
 * Currently a pass-through. Glow effects are applied via CSS filter style.
 */

import type { BlockCompiler, Program, RuntimeCtx } from '../../../types';
import type { RenderTree } from '../../../../runtime/renderTree';

export const ParticleRendererBlock: BlockCompiler = {
  type: 'ParticleRenderer',
  inputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' }, required: true }],
  outputs: [{ name: 'render', type: { kind: 'RenderTreeProgram' } }],

  compile({ inputs }) {
    if (inputs.program?.kind !== 'RenderTreeProgram') {
      return {
        render: { kind: 'Error', message: 'ParticleRenderer: input must be RenderTreeProgram' },
      };
    }

    const inputProgram = inputs.program.value as Program<RenderTree>;

    // Pass-through - glow effects are applied via CSS filter on individual nodes
    const program: Program<RenderTree> = {
      signal: (tMs: number, rt: RuntimeCtx): RenderTree => {
        return inputProgram.signal(tMs, rt);
      },

      event: inputProgram.event,
    };

    return { render: { kind: 'RenderTreeProgram', value: program } };
  },
};
