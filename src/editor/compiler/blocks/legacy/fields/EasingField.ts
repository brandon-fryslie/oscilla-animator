/**
 * EasingField Block Compiler
 *
 * Generates per-element easing function selections.
 * Allows different elements to use different easing curves.
 *
 * Outputs: Field<string> of easing function names.
 */

import type { BlockCompiler } from '../../../types';

type EasingMode = 'constant' | 'random' | 'alternating' | 'progressive';

const EASING_OPTIONS = [
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeOutBack',
  'easeOutElastic',
];

type EasingField = (seed: number, n: number) => readonly string[];

export const EasingFieldBlock: BlockCompiler = {
  type: 'EasingField',
  inputs: [],
  outputs: [{ name: 'easings', type: { kind: 'Field:string' } }],

  compile({ params }) {
    const mode = (params.mode as EasingMode) ?? 'constant';
    const baseEasing = (params.baseEasing as string) ?? 'easeOutCubic';
    const altEasing = (params.altEasing as string) ?? 'easeInCubic';

    const easings: EasingField = (seed, n) => {
      const out = new Array<string>(n);

      for (let i = 0; i < n; i++) {
        let easing: string;

        switch (mode) {
          case 'constant':
            easing = baseEasing;
            break;

          case 'random': {
            const t = (seed * 12.9898 + i * 78.233) * 43758.5453;
            const rand = t - Math.floor(t);
            const idx = Math.floor(rand * EASING_OPTIONS.length);
            easing = EASING_OPTIONS[idx] ?? baseEasing;
            break;
          }

          case 'alternating':
            easing = i % 2 === 0 ? baseEasing : altEasing;
            break;

          case 'progressive': {
            // Progress through easing options
            const idx = Math.floor((i / Math.max(1, n - 1)) * (EASING_OPTIONS.length - 1));
            easing = EASING_OPTIONS[idx] ?? baseEasing;
            break;
          }

          default:
            easing = baseEasing;
        }

        out[i] = easing;
      }

      return out;
    };

    return { easings: { kind: 'Field:string' as const, value: easings } };
  },
};
