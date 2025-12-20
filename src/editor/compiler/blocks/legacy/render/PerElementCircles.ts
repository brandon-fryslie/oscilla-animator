/**
 * PerElementCircles Block Compiler
 *
 * Takes per-element positions and progress, renders animated circles.
 * This is a high-level render block that handles the per-element iteration.
 */

import type { BlockCompiler, RuntimeCtx, Vec2, Program } from '../../../types';
import type { RenderTree, DrawNode } from '../../../../runtime/renderTree';
import { circle, group, withOpacity } from '../../../../runtime/renderTree';

export const PerElementCirclesBlock: BlockCompiler = {
  type: 'perElementCircles',
  inputs: [
    { name: 'positions', type: { kind: 'Signal:vec2' }, required: true }, // Actually Signal<Vec2[]>
    { name: 'count', type: { kind: 'Scalar:number' }, required: false }, // Element count (optional)
    { name: 'filter', type: { kind: 'FilterDef' }, required: false }, // Filter definition (optional)
  ],
  outputs: [{ name: 'tree', type: { kind: 'RenderTreeProgram' } }],

  compile({ id, inputs, params }) {
    if (inputs.positions?.kind !== 'Signal:vec2') {
      return {
        tree: { kind: 'Error', message: 'PerElementCircles: positions must be Signal:vec2' },
      };
    }

    const positionsSignal = inputs.positions.value as unknown as (tMs: number, ctx: RuntimeCtx) => readonly Vec2[];

    // Get element count if provided (accepts Scalar:number or ElementCount)

    // Get filter if provided (CSS filter string like "blur(8px)")
    const filterString = inputs.filter?.kind === 'FilterDef' ? (inputs.filter.value as string) : null;

    const radius = Number(params.radius ?? 2.5);
    const fill = (params.fill as string) ?? '#ffffff';
    const baseOpacity = Number(params.opacity ?? 1);

    const program: Program<RenderTree> = {
      signal: (tMs: number, rt: RuntimeCtx): RenderTree => {
        const positions = positionsSignal(tMs, rt);

        const circles: DrawNode[] = positions.map((pos, i) => {
          const circleNode = circle(`${id}-p-${i}`, pos.x, pos.y, radius, {
            fill: fill,
            filter: filterString ?? undefined,
          });

          // Apply opacity via effect wrapper
          return withOpacity(`${id}-op-${i}`, baseOpacity, circleNode);
        });

        return group(`${id}-root`, circles);
      },
      event: () => [],
    };

    return { tree: { kind: 'RenderTreeProgram', value: program } };
  },
};
