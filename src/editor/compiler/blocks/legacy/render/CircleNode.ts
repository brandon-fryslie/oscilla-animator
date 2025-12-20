/**
 * CircleNode Block Compiler
 *
 * Creates a single SVG circle render node.
 * For per-element rendering, use PerElementCircles instead.
 */

import type { BlockCompiler } from '../../../types';
import type { ShapeNode } from '../../../../runtime/renderTree';
import { circle } from '../../../../runtime/renderTree';

export const CircleNodeBlock: BlockCompiler = {
  type: 'circleNode',
  inputs: [],
  outputs: [{ name: 'node', type: { kind: 'RenderNode' } }],

  compile({ id, params }) {
    const cx = Number(params.cx ?? 0);
    const cy = Number(params.cy ?? 0);
    const r = Number(params.r ?? 5);
    const fill = (params.fill as string) ?? '#00d4ff';
    const opacity = Number(params.opacity ?? 1);
    const filter = params.filter as string | undefined;

    const node: ShapeNode = circle(`${id}-circle`, cx, cy, r, {
      fill,
      opacity,
      filter,
    });

    return { node: { kind: 'RenderNode', value: node } };
  },
};
