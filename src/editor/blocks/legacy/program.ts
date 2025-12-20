import { createBlock } from '../factory';
import { input, output } from '../utils';

export const DemoProgram = createBlock({
  type: 'demoProgram',
  label: 'Demo Program',
  form: 'primitive',
  category: 'Compose',
  description: 'Generate a visual proof program',
  inputs: [
    input('speed', 'Speed', 'Scalar:number'),
    input('amp', 'Amplitude', 'Scalar:number'),
  ],
  outputs: [output('program', 'Program', 'Program')],
  paramSchema: [
    {
      key: 'variant',
      label: 'Variant',
      type: 'select',
      options: [
        { value: 'lineDrawing', label: 'Line Drawing' },
        { value: 'pulsingLine', label: 'Pulsing Line' },
        { value: 'bouncingCircle', label: 'Bouncing Circle' },
        { value: 'particles', label: 'Particles' },
        { value: 'oscillator', label: 'Oscillator' },
      ],
      defaultValue: 'lineDrawing',
    },
    { key: 'speed', label: 'Speed', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 1 },
    { key: 'amp', label: 'Amplitude', type: 'number', min: 1, max: 200, step: 1, defaultValue: 30 },
    { key: 'stroke', label: 'Stroke Color', type: 'color', defaultValue: '#ffffff' },
    { key: 'cx', label: 'Center X', type: 'number', min: 0, max: 800, step: 10, defaultValue: 200 },
    { key: 'cy', label: 'Center Y', type: 'number', min: 0, max: 600, step: 10, defaultValue: 120 },
    { key: 'r', label: 'Radius', type: 'number', min: 1, max: 50, step: 1, defaultValue: 8 },
  ],
  color: '#f97316',
  laneKind: 'Program',
  priority: 1,
});
