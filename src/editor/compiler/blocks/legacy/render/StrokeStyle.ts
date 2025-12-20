/**
 * StrokeStyle Block Compiler
 *
 * Creates a stroke style configuration for path rendering.
 * Used to configure stroke appearance: width, color, caps, joins.
 *
 * Outputs: StrokeStyle configuration object.
 */

import type { BlockCompiler } from '../../../types';

interface StrokeStyleConfig {
  width: number;
  color: string;
  linecap: 'butt' | 'round' | 'square';
  linejoin: 'miter' | 'round' | 'bevel';
  dasharray?: string;
  dashoffset?: number;
}

export const StrokeStyleBlock: BlockCompiler = {
  type: 'StrokeStyle',
  inputs: [],
  outputs: [{ name: 'style', type: { kind: 'StrokeStyle' } }],

  compile({ params }) {
    const config: StrokeStyleConfig = {
      width: Number(params.width ?? 4),
      color: (params.color as string) ?? '#ffffff',
      linecap: (params.linecap as 'butt' | 'round' | 'square') ?? 'round',
      linejoin: (params.linejoin as 'miter' | 'round' | 'bevel') ?? 'round',
    };

    if (params.dasharray) {
      config.dasharray = params.dasharray as string;
    }
    if (params.dashoffset !== undefined) {
      config.dashoffset = Number(params.dashoffset);
    }

    return {
      style: {
        kind: 'StrokeStyle' as const,
        value: config,
      },
    };
  },
};
