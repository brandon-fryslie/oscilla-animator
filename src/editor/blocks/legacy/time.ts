import { createBlock } from '../factory';
import { input, output } from '../utils';

export const PhaseMachine = createBlock({
  type: 'PhaseMachine',
  label: 'Phase Machine',
  form: 'primitive',
  category: 'Time',
  description: 'Three-phase animation: entrance, hold, exit',
  outputs: [output('phase', 'Phase', 'Signal<PhaseSample>')],
  paramSchema: [
    { key: 'entranceDuration', label: 'Entrance (s)', type: 'number', min: 0.1, max: 5.0, step: 0.1, defaultValue: 2.5 },
    { key: 'holdDuration', label: 'Hold (s)', type: 'number', min: 0, max: 10.0, step: 0.1, defaultValue: 2.0 },
    { key: 'exitDuration', label: 'Exit (s)', type: 'number', min: 0.1, max: 5.0, step: 0.1, defaultValue: 0.5 },
  ],
  color: '#22c55e',
  laneKind: 'Phase',
  priority: 1,
});

export const EaseRamp = createBlock({
  type: 'EaseRamp',
  label: 'Ease Ramp',
  form: 'primitive',
  category: 'Time',
  description: 'Apply easing function to a 0-1 progress signal',
  inputs: [input('progress', 'Progress', 'Signal<Unit>')],
  outputs: [output('eased', 'Eased', 'Signal<Unit>')],
  paramSchema: [
    {
      key: 'easing',
      label: 'Easing',
      type: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'easeInQuad', label: 'Ease In Quad' },
        { value: 'easeOutQuad', label: 'Ease Out Quad' },
        { value: 'easeInOutQuad', label: 'Ease In Out Quad' },
        { value: 'easeOutCubic', label: 'Ease Out Cubic' },
        { value: 'easeInOutCubic', label: 'Ease In Out Cubic' },
        { value: 'easeOutElastic', label: 'Ease Out Elastic' },
      ],
      defaultValue: 'easeOutCubic',
    },
  ],
  color: '#22c55e',
  laneKind: 'Phase',
  laneFlavor: 'Timing',
  priority: 2,
});

export const PhaseProgress = createBlock({
  type: 'phaseProgress',
  label: 'Phase Progress',
  form: 'primitive',
  category: 'Time',
  description: 'Extract eased progress signal from PhaseMachine',
  inputs: [input('phase', 'Phase', 'Signal<PhaseSample>')],
  outputs: [output('progress', 'Progress', 'Signal<Unit>')],
  color: '#22c55e',
  laneKind: 'Phase',
  priority: 2,
});

/**
 * PhaseClock - Simple time-based phase progression.
 *
 * Produces a Signal<number> that drives animation timing.
 * Supports loop/once/pingpong modes for different playback styles.
 */
export const PhaseClock = createBlock({
  type: 'PhaseClock',
  label: 'Phase Clock',
  form: 'primitive',
  subcategory: 'Time',
  category: 'Time',
  description: 'Time-based phase progression with loop modes',
  outputs: [
    output('phase', 'Phase', 'Signal<number>'),
  ],
  paramSchema: [
    {
      key: 'duration',
      label: 'Duration (s)',
      type: 'number',
      min: 0.1,
      max: 10.0,
      step: 0.1,
      defaultValue: 3.0,
    },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'loop', label: 'Loop' },
        { value: 'once', label: 'Once' },
        { value: 'pingpong', label: 'Ping-Pong' },
      ],
      defaultValue: 'loop',
    },
    {
      key: 'offset',
      label: 'Offset (s)',
      type: 'number',
      min: -10.0,
      max: 10.0,
      step: 0.1,
      defaultValue: 0.0,
    },
  ],
  color: '#22c55e',
  laneKind: 'Phase',
  priority: 3,
});
