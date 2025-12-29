import type { LaneViewTemplate } from './types';

export const DEFAULT_LANE_TEMPLATES: readonly LaneViewTemplate[] = [
  {
    id: 'lane-scene',
    kind: 'Scene',
    label: 'Scene',
    description: 'Scene inputs and targets',
    flowStyle: 'patchbay',
  },
  {
    id: 'lane-phase',
    kind: 'Phase',
    label: 'Phase',
    description: 'Time and signal sources',
    flowStyle: 'patchbay',
  },
  {
    id: 'lane-fields',
    kind: 'Fields',
    label: 'Fields',
    description: 'Per-element field operations',
    flowStyle: 'chain',
  },
  {
    id: 'lane-scalars',
    kind: 'Scalars',
    label: 'Scalars',
    description: 'Scalar constants and params',
    flowStyle: 'patchbay',
  },
  {
    id: 'lane-spec',
    kind: 'Spec',
    label: 'Spec',
    description: 'Specification and intent blocks',
    flowStyle: 'chain',
  },
  {
    id: 'lane-program',
    kind: 'Program',
    label: 'Program',
    description: 'Program-level composition',
    flowStyle: 'chain',
  },
  {
    id: 'lane-output',
    kind: 'Output',
    label: 'Output',
    description: 'Render/export sinks',
    flowStyle: 'patchbay',
  },
];
