/**
 * PathRenderer Block Compiler
 *
 * Renders SVG paths with stroke styling.
 * Used for line drawing, morphing, and path-based animations.
 *
 * Outputs: RenderTree with path elements.
 */

import type { BlockCompiler, RuntimeCtx } from '../../../types';
import type { DrawNode } from '../../../../runtime/renderTree';
import { group } from '../../../../runtime/renderTree';

export const PathRendererBlock: BlockCompiler = {
  type: 'PathRenderer',
  inputs: [
    { name: 'paths', type: { kind: 'Field:Path' }, required: true },
    { name: 'progress', type: { kind: 'Signal:Unit' }, required: false },
  ],
  outputs: [{ name: 'tree', type: { kind: 'RenderTree' } }],

  compile({ params }) {
    const strokeWidth = Number(params.strokeWidth ?? 4);
    const strokeColor = (params.strokeColor as string) ?? '#ffffff';
    const strokeLinecap = (params.strokeLinecap as string) ?? 'round';
    const strokeLinejoin = (params.strokeLinejoin as string) ?? 'round';
    const fillColor = (params.fillColor as string) ?? 'none';

    // Create a render tree with path nodes
    const signal = (_tMs: number, _rt: RuntimeCtx): DrawNode => {
      // For now, create a static group
      // In full implementation, would use paths field and progress signal
      const pathNode: DrawNode = {
        kind: 'shape',
        id: 'path-0',
        geom: {
          kind: 'svgPath',
          d: 'M 100 100 L 200 100 L 200 200 L 100 200 Z', // Placeholder
        },
        style: {
          stroke: strokeColor,
          strokeWidth,
          strokeLinecap: strokeLinecap as 'butt' | 'round' | 'square',
          strokeLinejoin: strokeLinejoin as 'round' | 'miter' | 'bevel',
          fill: fillColor,
        },
      };

      return group('path-renderer', [pathNode]);
    };

    return {
      tree: {
        kind: 'RenderTree',
        value: signal,
      },
    };
  },
};
