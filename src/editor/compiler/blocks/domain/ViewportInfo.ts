/**
 * ViewportInfo Block Compiler
 *
 * Provides viewport dimensions as Scalar values.
 * These are compile-time constants based on default viewport size.
 *
 * Note: In a full implementation, these would be responsive to actual viewport,
 * but for now we use hardcoded defaults matching typical canvas size.
 */

import type { BlockCompiler, Vec2 } from '../../types';

// Default viewport size (matches typical canvas dimensions)
const DEFAULT_VIEWPORT_WIDTH = 800;
const DEFAULT_VIEWPORT_HEIGHT = 600;

export const ViewportInfoBlock: BlockCompiler = {
  type: 'ViewportInfo',

  inputs: [],

  outputs: [
    { name: 'size', type: { kind: 'Scalar:vec2' } },
    { name: 'center', type: { kind: 'Scalar:vec2' } },
  ],

  compile() {
    const size: Vec2 = {
      x: DEFAULT_VIEWPORT_WIDTH,
      y: DEFAULT_VIEWPORT_HEIGHT,
    };

    const center: Vec2 = {
      x: DEFAULT_VIEWPORT_WIDTH / 2,
      y: DEFAULT_VIEWPORT_HEIGHT / 2,
    };

    return {
      size: { kind: 'Scalar:vec2', value: size },
      center: { kind: 'Scalar:vec2', value: center },
    };
  },
};
