/**
 * RenderTreeAssemble Block Compiler
 *
 * Assembles a complete RenderTree from a root node.
 * In the Editor format, RenderTree is simply a DrawNode.
 */

import type { BlockCompiler, RuntimeCtx, Program } from '../../../types';
import type { RenderTree, DrawNode } from '../../../../runtime/renderTree';

export const RenderTreeAssembleBlock: BlockCompiler = {
  type: 'renderTreeAssemble',
  inputs: [
    { name: 'root', type: { kind: 'RenderNode' }, required: true },
  ],
  outputs: [{ name: 'tree', type: { kind: 'RenderTreeProgram' } }],

  compile({ inputs }) {
    if (inputs.root?.kind !== 'RenderNode') {
      return {
        tree: { kind: 'Error', message: 'RenderTreeAssemble: root must be RenderNode' },
      };
    }

    const rootNode = inputs.root.value as DrawNode;

    // Create a static program that returns the root node
    const program: Program<RenderTree> = {
      signal: (_tMs: number, _rt: RuntimeCtx): RenderTree => {
        return rootNode;
      },
      event: () => [],
    };

    return { tree: { kind: 'RenderTreeProgram', value: program } };
  },
};
