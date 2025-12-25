/**
 * Render2dCanvas Block Compiler
 *
 * A render sink that outputs a Canvas RenderTree for the Canvas2DRenderer.
 *
 * Currently outputs an empty RenderTree with a clear command.
 * When Instances2D block is implemented, this will take a RenderTree input
 * and pass it through.
 *
 * Outputs:
 *   - render: CanvasRender - function that returns the RenderTree
 */

import type { BlockCompiler, RuntimeCtx } from '../../types';
import type { RenderTree } from '../../../runtime/renderCmd';

export const Render2dCanvasBlock: BlockCompiler = {
  type: 'Render2dCanvas',

  inputs: [
    // No inputs for now - will take RenderTree input when Instances2D is implemented
  ],

  compile() {
    // Create a render function that returns a minimal RenderTree
    const canvasRenderFn = (_tMs: number, _ctx: RuntimeCtx): RenderTree => {
      // For now, just clear with black background
      return {
        cmds: [
          {
            kind: 'clear',
            color: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      };
    };

    return {
      render: { kind: 'CanvasRender', value: canvasRenderFn },
    };
  },

  outputs: [
    { name: 'render', type: { kind: 'CanvasRender' } },
  ],
};
