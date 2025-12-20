import { createBlock } from '../factory';
import { input, output } from '../utils';

export const PerElementTransport = createBlock({
  type: 'PerElementTransport',
  label: 'Per-Element Transport',
  form: 'primitive',
  category: 'Compose',
  description: 'Apply animation to each element with individual delays',
  inputs: [
    input('targets', 'Targets', 'SceneTargets'),
    input('positions', 'Start Positions', 'Field<Point>'),
    input('delays', 'Delays', 'Field<Duration>'),
    input('phase', 'Phase', 'Signal<PhaseSample>'),
  ],
  outputs: [output('program', 'Program', 'Program')],
  color: '#f97316',
  laneKind: 'Spec',
  priority: 1,
});

export const PerElementProgress = createBlock({
  type: 'perElementProgress',
  label: 'Per-Element Progress',
  form: 'primitive',
  category: 'Compose',
  description: 'Per-element staggered animation progress (0-1)',
  inputs: [
    input('phase', 'Phase', 'Signal<PhaseSample>'),
    input('delays', 'Delays', 'Field<Duration>'),
    input('durations', 'Durations', 'Field<Duration>'),
  ],
  outputs: [output('progress', 'Progress', 'Signal<Unit>')],
  paramSchema: [
    {
      key: 'easing',
      label: 'Easing',
      type: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'easeInQuad', label: 'Ease In Quad' },
        { value: 'easeOutQuad', label: 'Ease Out Quad' },
        { value: 'easeOutCubic', label: 'Ease Out Cubic' },
        { value: 'easeInOutCubic', label: 'Ease In Out Cubic' },
      ],
      defaultValue: 'easeOutCubic',
    },
  ],
  color: '#f97316',
  laneKind: 'Spec',
  priority: 2,
});

export const LerpPoints = createBlock({
  type: 'lerpPoints',
  label: 'Lerp Points',
  form: 'primitive',
  category: 'Compose',
  description: 'Interpolate per-element from start to end positions based on progress',
  inputs: [
    input('starts', 'Starts', 'Field<Point>'),
    input('ends', 'Ends', 'Field<Point>'),
    input('progress', 'Progress', 'Signal<Unit>'),
  ],
  outputs: [output('positions', 'Positions', 'Signal<Point>')],
  color: '#f97316',
  laneKind: 'Spec',
  laneFlavor: 'Motion',
  priority: 3,
});

export const OutputProgram = createBlock({
  type: 'outputProgram',
  label: 'Program Output',
  form: 'primitive',
  category: 'Compose',
  description: 'Mark a Program as the patch output (before rendering)',
  inputs: [input('program', 'Program', 'Program')],
  // True sink - no outputs
  color: '#ef4444',
  laneKind: 'Output',
  priority: 2,
});
