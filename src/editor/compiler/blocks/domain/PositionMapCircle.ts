/**
 * PositionMapCircle Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a circle.
 * Supports even distribution and golden angle spiral patterns.
 */

import type { BlockCompiler, Vec2, Domain } from '../../types';

type PositionField = (seed: number, n: number) => readonly Vec2[];

// Golden angle in radians
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const PositionMapCircleBlock: BlockCompiler = {
  type: 'PositionMapCircle',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
  ],

  outputs: [
    { name: 'pos', type: { kind: 'Field:vec2' } },
  ],

  compile({ params, inputs }) {
    const domainArtifact = inputs.domain;
    if (!domainArtifact || domainArtifact.kind !== 'Domain') {
      return {
        pos: {
          kind: 'Error',
          message: 'PositionMapCircle requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value;
    const centerX = Number(params.centerX ?? 400);
    const centerY = Number(params.centerY ?? 300);
    const radius = Number(params.radius ?? 150);
    const startAngle = Number(params.startAngle ?? 0);
    const winding = Number(params.winding ?? 1); // 1 = CW, -1 = CCW
    const distribution = String(params.distribution ?? 'even');

    // Convert degrees to radians
    const startAngleRad = (startAngle * Math.PI) / 180;

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
        let angle: number;

        if (distribution === 'goldenAngle') {
          // Golden angle spiral - good for filling a disk
          angle = startAngleRad + i * GOLDEN_ANGLE * winding;
        } else {
          // Even distribution around circle
          angle = startAngleRad + (i / elementCount) * 2 * Math.PI * winding;
        }

        out[i] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      }

      return out;
    };

    return {
      pos: { kind: 'Field:vec2', value: positionField },
    };
  },
};
