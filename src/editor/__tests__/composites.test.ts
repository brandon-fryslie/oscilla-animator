import { describe, expect, it } from 'vitest';
import { registerComposite, listCompositeDefinitions } from '../composites';
import { getBlockDefinitions } from '../blocks';

describe('composite registry', () => {
  it('registers and exposes composite definitions as block definitions', () => {
    const def = registerComposite({
      id: 'comp-1',
      label: 'Test Composite',
      description: 'Example composite',
      color: '#00bcd4',
      subcategory: 'Compose',
      laneKind: 'Spec',
      tags: { origin: 'test' },
      graph: {
        nodes: {
          n1: { type: 'NumberSource', params: {} },
        },
        edges: [],
        inputMap: { in: 'n1.in' },
        outputMap: { out: 'n1.out' },
      },
      exposedInputs: [
        { id: 'in', label: 'In', direction: 'input', slotType: 'Scalar:number', nodeId: 'n1', nodePort: 'in' },
      ],
      exposedOutputs: [
        { id: 'out', label: 'Out', direction: 'output', slotType: 'Scalar:number', nodeId: 'n1', nodePort: 'out' },
      ],
    });

    expect(listCompositeDefinitions().some((c) => c.id === def.id)).toBe(true);

    // Include composites in block definitions lookup
    const allBlocks = getBlockDefinitions(true); // includeComposites: true
    expect(allBlocks.some((b) => b.type === `composite:${def.id}`)).toBe(true);
  });
});
