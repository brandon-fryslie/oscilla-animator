/**
 * GooFilter Block Compiler
 *
 * Creates SVG filter for metaball/liquid goo effect.
 * Uses blur + color matrix to create organic blob merging.
 *
 * Outputs: FilterDef for SVG rendering.
 */

import type { BlockCompiler } from '../../../types';

interface GooFilterConfig {
  id: string;
  blur: number;
  threshold: number;
  contrast: number;
  glowColor?: string;
  glowBlur?: number;
}

export const GooFilterBlock: BlockCompiler = {
  type: 'GooFilter',
  inputs: [],
  outputs: [{ name: 'filter', type: { kind: 'FilterDef' } }],

  compile({ params, id }) {
    const config: GooFilterConfig = {
      id: `goo-${id}`,
      blur: Number(params.blur ?? 10),
      threshold: Number(params.threshold ?? 20),
      contrast: Number(params.contrast ?? 35),
    };

    if (params.glowColor) {
      config.glowColor = params.glowColor as string;
      config.glowBlur = Number(params.glowBlur ?? 5);
    }

    // The filter definition that will be used by the renderer
    // SVG filter: blur → color matrix (threshold/contrast) → composite
    return {
      filter: {
        kind: 'FilterDef' as const,
        value: {
          type: 'goo',
          ...config,
        },
      },
    };
  },
};
