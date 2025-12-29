import { createBlock } from './factory';
import { input, output } from './utils';
import type { BlockDefinition } from './types';
import { OSCILLATOR_PORTS, type PortSpec } from './portCatalog';

const OSCILLATOR_INPUT_SPECS = OSCILLATOR_PORTS.inputOrder.map(
  (id) => OSCILLATOR_PORTS.inputs[id]
);
const OSCILLATOR_OUTPUT_SPECS = OSCILLATOR_PORTS.outputOrder.map(
  (id) => OSCILLATOR_PORTS.outputs[id]
);

export const Oscillator: BlockDefinition = createBlock({
  type: 'Oscillator',
  label: 'Oscillator',
  description: 'Generate waveforms (sine, cosine, triangle, saw) from phase',
  tags: { irPortContract: 'strict' },
  capability: 'pure',
  compileKind: 'operator',
  inputs: OSCILLATOR_INPUT_SPECS.map((spec) => input(spec.id, spec.label, spec.slotType, {
    tier: spec.tier,
    defaultSource: spec.defaultSource,
  })),
  outputs: OSCILLATOR_OUTPUT_SPECS.map((spec) => output(spec.id, spec.label, spec.slotType)),
  color: '#3B82F6',
  priority: 10,
  autoBusSubscriptions: {
    phase: 'phaseA',
  },
});

export const OSCILLATOR_IR_INPUTS = OSCILLATOR_INPUT_SPECS.map((spec: PortSpec) => ({
  portId: spec.id,
  label: spec.label,
  dir: 'in' as const,
  type: spec.irType,
  ...(spec.optional === true ? { optional: true } : {}),
  ...(spec.defaultSource ? { defaultSource: spec.defaultSource } : {}),
}));

export const OSCILLATOR_IR_OUTPUTS = OSCILLATOR_OUTPUT_SPECS.map((spec: PortSpec) => ({
  portId: spec.id,
  label: spec.label,
  dir: 'out' as const,
  type: spec.irType,
}));
