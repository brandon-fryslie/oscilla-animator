/**
 * PositionMapGrid Block Compiler
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a grid.
 * Elements are laid out in rows and columns from the origin point.
 */

import type { BlockCompiler, Vec2, Domain } from '../../types';

type PositionField = (seed: number, n: number) => readonly Vec2[];

export const PositionMapGridBlock: BlockCompiler = {
  type: 'PositionMapGrid',

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
          message: 'PositionMapGrid requires a Domain input',
        },
      };
    }

    const domain = domainArtifact.value as Domain;
    const cols = Number(params.cols ?? 10);
    const spacing = Number(params.spacing ?? 20);
    const originX = Number(params.originX ?? 100);
    const originY = Number(params.originY ?? 100);
    const order = String(params.order ?? 'rowMajor');

    // Create the position field based on domain element count
    const positionField: PositionField = (_seed, n) => {
      const elementCount = Math.min(n, domain.elements.length);
      const out = new Array<Vec2>(elementCount);

      for (let i = 0; i < elementCount; i++) {
        let col: number;
        let row: number;

        if (order === 'serpentine') {
          row = Math.floor(i / cols);
          const rawCol = i % cols;
          col = row % 2 === 0 ? rawCol : cols - 1 - rawCol;
        } else {
          // rowMajor
          col = i % cols;
          row = Math.floor(i / cols);
        }

        out[i] = {
          x: originX + col * spacing,
          y: originY + row * spacing,
        };
      }

      return out;
    };

    return {
      pos: { kind: 'Field:vec2', value: positionField },
    };
  },
};
