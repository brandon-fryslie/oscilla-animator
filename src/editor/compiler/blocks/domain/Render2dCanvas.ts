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
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Lower Render2dCanvas block to IR.
 *
 * This is a RENDER block that creates a canvas render sink.
 * For now, it just registers a minimal render sink that clears to black.
 *
 * In the full implementation, this would take RenderTree inputs and
 * compose them into the final canvas output.
 */
const lowerRender2dCanvas: BlockLowerFn = ({ ctx }) => {
  // For now, we just register a minimal render sink
  // The actual rendering is handled by the runtime layer

  // Register a render sink with the canvas type
  // The runtime will know how to handle this based on the sinkType
  const sinkInputs = {
    // No inputs for minimal clear-only version
    // In full version, would have renderTree input
  };

  ctx.b.renderSink('canvas2d', sinkInputs);

  // Render blocks don't produce signal outputs in the IR
  // They register side effects (render sinks) instead
  // Return empty outputs array
  return {
    outputs: [],
    declares: {
      renderSink: { sinkId: 0 }, // Placeholder - runtime will assign real IDs
    },
  };
};

// Register block type
registerBlockType({
  type: 'Render2dCanvas',
  capability: 'render',
  inputs: [
    // No inputs for now - will take RenderTree input when Instances2D is implemented
  ],
  outputs: [
    // In legacy mode, this has a 'render' output
    // In IR mode, render sinks don't produce signal outputs
  ],
  lower: lowerRender2dCanvas,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

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
