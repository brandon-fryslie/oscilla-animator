/**
 * GroupNode Block Compiler
 *
 * Creates a group node that contains multiple child render nodes.
 * This is for static grouping - for per-element arrays, the array is passed directly.
 */

import type { BlockCompiler } from '../../../types';
import type { DrawNode, GroupNode } from '../../../../runtime/renderTree';
import { group } from '../../../../runtime/renderTree';

export const GroupNodeBlock: BlockCompiler = {
  type: 'groupNode',
  inputs: [
    { name: 'children', type: { kind: 'RenderNodeArray' }, required: true },
  ],
  outputs: [{ name: 'group', type: { kind: 'RenderNode' } }],

  compile({ id, inputs }) {
    if (inputs.children?.kind !== 'RenderNodeArray') {
      return {
        group: { kind: 'Error', message: 'GroupNode: children must be RenderNodeArray' },
      };
    }

    const children = inputs.children.value as DrawNode[];

    const groupNode: GroupNode = group(`${id}-group`, children);

    return { group: { kind: 'RenderNode', value: groupNode } };
  },
};
