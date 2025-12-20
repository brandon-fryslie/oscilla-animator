import { createBlock } from '../factory';
import { input, output, getPathOptions } from '../utils';

export const SVGPathSource = createBlock({
  type: 'SVGPathSource',
  label: 'SVG Paths',
  form: 'primitive',
  subcategory: 'Sources',
  category: 'Scene',
  description: 'Load SVG path data from the path library',
  outputs: [output('scene', 'Scene', 'Scene')],
  paramSchema: [
    {
      key: 'target',
      label: 'Target',
      type: 'select',
      get options() {
        return getPathOptions();
      },
      defaultValue: 'builtin:logo',
    },
  ],
  color: '#4a9eff',
  laneKind: 'Scene',
  priority: 1,
});

export const SamplePoints = createBlock({
  type: 'SamplePoints',
  label: 'Sample Points',
  form: 'primitive',
  subcategory: 'Sources',
  category: 'Derivers',
  description: 'Extract point targets from scene paths',
  inputs: [input('scene', 'Scene', 'Scene')],
  outputs: [output('targets', 'Targets', 'SceneTargets')],
  paramSchema: [
    {
      key: 'density',
      label: 'Density',
      type: 'number',
      min: 0.1,
      max: 3.0,
      step: 0.1,
      defaultValue: 1.0,
    },
  ],
  color: '#6b5ce7',
  laneKind: 'Scene',
  priority: 2,
});

export const TextSource = createBlock({
  type: 'TextSource',
  label: 'Text Source',
  form: 'primitive',
  subcategory: 'Sources',
  category: 'Scene',
  description: 'Create scene from text (per-character elements)',
  outputs: [output('scene', 'Scene', 'Scene')],
  paramSchema: [
    { key: 'text', label: 'Text', type: 'string', defaultValue: 'LOOM99' },
    { key: 'fontSize', label: 'Font Size', type: 'number', min: 12, max: 200, step: 4, defaultValue: 48 },
    { key: 'letterSpacing', label: 'Letter Spacing', type: 'number', min: 0, max: 20, step: 1, defaultValue: 4 },
    { key: 'startX', label: 'Start X', type: 'number', min: 0, max: 500, step: 10, defaultValue: 100 },
    { key: 'startY', label: 'Start Y', type: 'number', min: 0, max: 500, step: 10, defaultValue: 200 },
  ],
  color: '#4a9eff',
  laneKind: 'Scene',
  priority: 2,
});
