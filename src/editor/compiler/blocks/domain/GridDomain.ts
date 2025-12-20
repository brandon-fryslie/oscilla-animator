/**
 * GridDomain Block Compiler
 *
 * Creates a grid domain with stable row/col element IDs and base positions.
 * This combines domain creation with grid layout in a single block.
 *
 * Element IDs are stable: "row-R-col-C" format ensures consistent identity.
 * Base positions (pos0) are deterministic based on grid parameters.
 */

import type { BlockCompiler, Vec2, Domain } from '../../types';
import { createDomain } from '../../unified/Domain';

type PositionField = (seed: number, n: number) => readonly Vec2[];

export const GridDomainBlock: BlockCompiler = {
  type: 'GridDomain',

  inputs: [],

  outputs: [
    { name: 'domain', type: { kind: 'Domain' } },
    { name: 'pos0', type: { kind: 'Field:vec2' } },
  ],

  compile({ id, params }) {
    const rows = Math.max(1, Math.floor(Number(params.rows ?? 10)));
    const cols = Math.max(1, Math.floor(Number(params.cols ?? 10)));
    const spacing = Number(params.spacing ?? 20);
    const originX = Number(params.originX ?? 100);
    const originY = Number(params.originY ?? 100);

    const elementCount = rows * cols;

    // Create stable element IDs: "row-R-col-C"
    const elementIds: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        elementIds.push(`row-${r}-col-${c}`);
      }
    }

    // Create domain with stable IDs
    const domainId = `grid-domain-${id}-${rows}x${cols}`;
    const domain: Domain = createDomain(domainId, elementIds);

    // Create position field (base positions)
    const positionField: PositionField = (_seed, n) => {
      const count = Math.min(n, elementCount);
      const out = new Array<Vec2>(count);

      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;

        out[i] = {
          x: originX + col * spacing,
          y: originY + row * spacing,
        };
      }

      return out;
    };

    return {
      domain: { kind: 'Domain', value: domain },
      pos0: { kind: 'Field:vec2', value: positionField },
    };
  },
};
