/**
 * DebugOutput Block Compiler
 *
 * Placeholder that outputs a minimal RenderTreeProgram.
 * Used for testing the compiler pipeline.
 */

import type { BlockCompiler, Program } from '../../../types';
import type { RenderTree } from '../../../../runtime/renderTree';
import { group } from '../../../../runtime/renderTree';

export const DebugOutputBlock: BlockCompiler = {
  type: 'debugOutput',
  inputs: [{ name: 'field', type: { kind: 'Field:number' }, required: false }],
  outputs: [{ name: 'program', type: { kind: 'RenderTreeProgram' } }],

  compile({ id }) {
    // Create a minimal program that renders an empty group
    const program: Program<RenderTree> = {
      signal: (): RenderTree => group(`debug-${id}`, []),

      event: () => [],
    };

    return { program: { kind: 'RenderTreeProgram', value: program } };
  },
};
