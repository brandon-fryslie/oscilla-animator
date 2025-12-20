/**
 * RGBSplitFilter Block Compiler
 *
 * Creates RGB channel separation effect for glitch animations.
 * Uses CSS drop-shadow to simulate chromatic aberration.
 *
 * Note: True RGB split requires SVG filters or canvas. This is a CSS approximation.
 */

import type { BlockCompiler } from '../../../types';

export const RGBSplitFilterBlock: BlockCompiler = {
  type: 'RGBSplitFilter',
  inputs: [],
  outputs: [{ name: 'filter', type: { kind: 'FilterDef' } }],

  compile({ params }) {
    const redX = Number(params.redOffsetX ?? 3);
    const blueX = Number(params.blueOffsetX ?? -3);

    // CSS drop-shadow approximation of RGB split effect
    // Creates colored shadows offset in different directions
    const filter = `drop-shadow(${redX}px 0 0 rgba(255,0,0,0.5)) drop-shadow(${blueX}px 0 0 rgba(0,0,255,0.5))`;

    return { filter: { kind: 'FilterDef', value: filter } };
  },
};
