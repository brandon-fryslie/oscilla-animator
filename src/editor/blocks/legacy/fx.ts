import { createBlock } from '../factory';
import { output } from '../utils';

export const StrokeStyle = createBlock({
  type: 'StrokeStyle',
  label: 'Stroke Style',
  form: 'primitive',
  category: 'FX',
  description: 'Configure stroke appearance for paths',
  outputs: [output('style', 'Style', 'StrokeStyle')],
  paramSchema: [
    { key: 'width', label: 'Width', type: 'number', min: 1, max: 20, step: 1, defaultValue: 4 },
    { key: 'color', label: 'Color', type: 'color', defaultValue: '#ffffff' },
    {
      key: 'linecap',
      label: 'Line Cap',
      type: 'select',
      options: [
        { value: 'butt', label: 'Butt' },
        { value: 'round', label: 'Round' },
        { value: 'square', label: 'Square' },
      ],
      defaultValue: 'round',
    },
    { key: 'dasharray', label: 'Dash Array', type: 'string', defaultValue: '' },
  ],
  color: '#ec4899',
  laneKind: 'Program',
  laneFlavor: 'Style',
  priority: 6,
});

export const GooFilter = createBlock({
  type: 'GooFilter',
  label: 'Goo Filter',
  form: 'primitive',
  category: 'FX',
  description: 'Metaball/liquid blob merging effect',
  outputs: [output('filter', 'Filter', 'FilterDef')],
  paramSchema: [
    { key: 'blur', label: 'Blur', type: 'number', min: 1, max: 30, step: 1, defaultValue: 10 },
    { key: 'threshold', label: 'Threshold', type: 'number', min: 1, max: 50, step: 1, defaultValue: 20 },
    { key: 'contrast', label: 'Contrast', type: 'number', min: 10, max: 100, step: 5, defaultValue: 35 },
  ],
  color: '#ec4899',
  laneKind: 'Program',
  laneFlavor: 'Style',
  priority: 7,
});

export const RGBSplitFilter = createBlock({
  type: 'RGBSplitFilter',
  label: 'RGB Split',
  form: 'primitive',
  category: 'FX',
  description: 'Chromatic aberration / RGB channel separation',
  outputs: [output('filter', 'Filter', 'FilterDef')],
  paramSchema: [
    { key: 'redOffsetX', label: 'Red X', type: 'number', min: -20, max: 20, step: 1, defaultValue: 3 },
    { key: 'redOffsetY', label: 'Red Y', type: 'number', min: -20, max: 20, step: 1, defaultValue: 0 },
    { key: 'blueOffsetX', label: 'Blue X', type: 'number', min: -20, max: 20, step: 1, defaultValue: -3 },
    { key: 'blueOffsetY', label: 'Blue Y', type: 'number', min: -20, max: 20, step: 1, defaultValue: 0 },
  ],
  color: '#ec4899',
  laneKind: 'Program',
  laneFlavor: 'Style',
  priority: 8,
});
