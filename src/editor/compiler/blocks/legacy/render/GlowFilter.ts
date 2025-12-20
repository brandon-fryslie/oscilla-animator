/**
 * GlowFilter Block Compiler
 *
 * Creates a CSS blur filter string that can be applied to render nodes via style.
 * In the Editor format, filters are CSS filter strings, not SVG filter definitions.
 */

import type { BlockCompiler } from '../../../types';

export const GlowFilterBlock: BlockCompiler = {
  type: 'glowFilter',
  inputs: [],
  outputs: [{ name: 'filter', type: { kind: 'FilterDef' } }],

  compile({ params }) {
    const radius = Number(params.radius ?? 8);

    // CSS blur filter string
    const filter = `blur(${radius}px)`;

    return { filter: { kind: 'FilterDef', value: filter } };
  },
};
