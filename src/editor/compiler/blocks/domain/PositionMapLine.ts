/**
 * PositionMapLine Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions along a line from point A to point B.
 * Elements are distributed along the line segment.
 */

import type { BlockCompiler, Vec2 } from '../../types';
import { isDefined } from '../../../types/helpers';

type PositionField = (seed: number, n: number) => readonly Vec2[];

export const PositionMapLineBlock: BlockCompiler = {
  type: 'PositionMapLine',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'pos', type: { kind: 'Field:vec2' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!isDefined(domainArtifact) || domainArtifact.kind !== 'Domain') {
      return {
        pos: {
          kind: 'Error',
          message: 'PositionMapLine requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    const ax = Number(params.ax ?? 100);
    const ay = Number(params.ay ?? 200);
    const bx = Number(params.bx ?? 700);
    const by = Number(params.by ?? 200);
    const distribution = typeof params.distribution === 'string' ? params.distribution : 'even';

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
        let t: number;

        if (distribution === 'even') {
          // Even distribution along the line
          t = elementCount > 1 ? i / (elementCount - 1) : 0.5;
        } else {
          // For now, treat anything else as 'even'
          // Could add 'random' distribution later
          t = elementCount > 1 ? i / (elementCount - 1) : 0.5;
        }

        // Linear interpolation from a to b
        out[i] = {
          x: ax + (bx - ax) * t,
          y: ay + (by - ay) * t,
        };
      }

      return out;
    };

    return {
      pos: { kind: 'Field:vec2', value: positionField },
    };
  },
};
