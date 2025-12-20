import { createBlock } from '../factory';
import { input, output } from '../utils';

export const ParticleRenderer = createBlock({
  type: 'ParticleRenderer',
  label: 'Particle Renderer',
  form: 'primitive',
  category: 'Render',
  description: 'Render particles as glowing circles',
  inputs: [input('program', 'Program', 'Program')],
  outputs: [output('render', 'Render', 'Render')],
  paramSchema: [
    { key: 'radius', label: 'Radius', type: 'number', min: 0.5, max: 10, step: 0.5, defaultValue: 2.5 },
    { key: 'glow', label: 'Glow', type: 'boolean', defaultValue: true },
    { key: 'glowRadius', label: 'Glow Radius', type: 'number', min: 0, max: 30, step: 1, defaultValue: 10 },
  ],
  color: '#ef4444',
  laneKind: 'Program',
  laneFlavor: 'Style',
  priority: 1,
});

export const GlowFilter = createBlock({
  type: 'glowFilter',
  label: 'Glow Filter',
  form: 'primitive',
  category: 'FX',
  description: 'Create an SVG glow filter definition',
  outputs: [output('filter', 'Filter', 'FilterDef')],
  paramSchema: [
    { key: 'color', label: 'Color', type: 'color', defaultValue: '#ffffff' },
    { key: 'blur', label: 'Blur', type: 'number', min: 1, max: 50, step: 1, defaultValue: 10 },
    { key: 'intensity', label: 'Intensity', type: 'number', min: 0.5, max: 5, step: 0.1, defaultValue: 2 },
  ],
  color: '#ec4899',
  laneKind: 'Program',
  laneFlavor: 'Style',
  priority: 5,
});

export const CircleNode = createBlock({
  type: 'circleNode',
  label: 'Circle Node',
  form: 'primitive',
  category: 'Render',
  description: 'Create a circle render node',
  inputs: [
    input('position', 'Position', 'Signal<Point>'),
    input('filter', 'Filter', 'FilterDef'),
  ],
  outputs: [output('node', 'Node', 'RenderNode')],
  paramSchema: [
    { key: 'radius', label: 'Radius', type: 'number', min: 0.5, max: 50, step: 0.5, defaultValue: 5 },
    { key: 'fill', label: 'Fill', type: 'color', defaultValue: '#ffffff' },
    { key: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 1 },
  ],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 3,
});

export const GroupNode = createBlock({
  type: 'groupNode',
  label: 'Group Node',
  form: 'primitive',
  category: 'Render',
  description: 'Group multiple render nodes',
  inputs: [input('nodes', 'Nodes', 'RenderNode[]')],
  outputs: [output('group', 'Group', 'RenderNode')],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 4,
});

export const RenderTreeAssemble = createBlock({
  type: 'renderTreeAssemble',
  label: 'Assemble Tree',
  form: 'primitive',
  category: 'Render',
  description: 'Assemble RenderNode(s) with filters into a RenderTree',
  inputs: [
    input('root', 'Root', 'RenderNode'),
    input('filter', 'Filter', 'FilterDef'),
  ],
  outputs: [output('tree', 'Render', 'Render')],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 5,
});

export const PerElementCircles = createBlock({
  type: 'perElementCircles',
  label: 'Per-Element Circles',
  form: 'primitive',
  category: 'Render',
  description: 'Render animated circles for each element position',
  inputs: [
    input('positions', 'Positions', 'Signal<Point>'),
    input('count', 'Count', 'ElementCount'),
    input('filter', 'Filter', 'FilterDef'),
  ],
  outputs: [output('tree', 'Render', 'Render')],
  paramSchema: [
    { key: 'radius', label: 'Radius', type: 'number', min: 0.5, max: 50, step: 0.5, defaultValue: 5 },
    { key: 'fill', label: 'Fill', type: 'color', defaultValue: '#ffffff' },
    { key: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 1 },
  ],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 2,
});

export const PathRenderer = createBlock({
  type: 'PathRenderer',
  label: 'Path Renderer',
  form: 'primitive',
  category: 'Render',
  description: 'Render SVG paths with stroke styling',
  inputs: [
    input('paths', 'Paths', 'Field<Path>'),
    input('progress', 'Progress', 'Signal<Unit>'),
  ],
  outputs: [output('tree', 'Render', 'Render')],
  paramSchema: [
    { key: 'strokeWidth', label: 'Stroke Width', type: 'number', min: 1, max: 20, step: 1, defaultValue: 4 },
    { key: 'strokeColor', label: 'Stroke Color', type: 'color', defaultValue: '#ffffff' },
    {
      key: 'strokeLinecap',
      label: 'Line Cap',
      type: 'select',
      options: [
        { value: 'butt', label: 'Butt' },
        { value: 'round', label: 'Round' },
        { value: 'square', label: 'Square' },
      ],
      defaultValue: 'round',
    },
    { key: 'fillColor', label: 'Fill Color', type: 'color', defaultValue: 'none' },
  ],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 6,
});

export const MaskReveal = createBlock({
  type: 'MaskReveal',
  label: 'Mask Reveal',
  form: 'primitive',
  category: 'Render',
  description: 'Wipe/reveal mask transition - clips content with animated mask',
  inputs: [
    input('content', 'Content', 'Render'),
    input('progress', 'Progress', 'Signal<Unit>'),
  ],
  outputs: [output('tree', 'Render', 'Render')],
  paramSchema: [
    {
      key: 'direction',
      label: 'Direction',
      type: 'select',
      options: [
        { value: 'left-to-right', label: 'Left → Right' },
        { value: 'right-to-left', label: 'Right → Left' },
        { value: 'top-to-bottom', label: 'Top → Bottom' },
        { value: 'bottom-to-top', label: 'Bottom → Top' },
        { value: 'radial', label: 'Radial' },
      ],
      defaultValue: 'left-to-right',
    },
    { key: 'softEdge', label: 'Soft Edge', type: 'number', min: 0, max: 100, step: 5, defaultValue: 20 },
    { key: 'sceneWidth', label: 'Width', type: 'number', min: 100, max: 1920, step: 10, defaultValue: 400 },
    { key: 'sceneHeight', label: 'Height', type: 'number', min: 100, max: 1080, step: 10, defaultValue: 300 },
  ],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 9,
});

/**
 * RenderInstances2D - Materialize Field data into renderable output.
 *
 * This is the sink that turns Domain + Fields into visual circles.
 * Takes per-element positions, radius, and color, and produces a RenderTreeProgram.
 */
export const RenderInstances2D = createBlock({
  type: 'RenderInstances2D',
  label: 'Render 2D Instances',
  form: 'primitive',
  subcategory: 'Render',
  category: 'Render',
  description: 'Materialize Domain + Fields into circles',
  inputs: [
    input('domain', 'Domain', 'Domain'),
    input('positions', 'Positions', 'Field<vec2>'),
    input('radius', 'Radius', 'Field<number>'),
    input('color', 'Color', 'Field<color>'),
  ],
  outputs: [
    output('render', 'Render', 'RenderTree'),
  ],
  paramSchema: [
    {
      key: 'opacity',
      label: 'Opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 1.0,
    },
    {
      key: 'glow',
      label: 'Glow',
      type: 'boolean',
      defaultValue: false,
    },
    {
      key: 'glowIntensity',
      label: 'Glow Intensity',
      type: 'number',
      min: 0.5,
      max: 5,
      step: 0.1,
      defaultValue: 2.0,
    },
  ],
  color: '#ef4444',
  laneKind: 'Program',
  priority: 7,
});

export const Canvas = createBlock({
  type: 'canvas',
  label: 'Canvas',
  form: 'primitive',
  category: 'Render',
  description: 'Final render output - displays the animation',
  inputs: [input('render', 'Render', 'Render')],
  paramSchema: [
    { key: 'width', label: 'Width', type: 'number', min: 100, max: 1920, step: 10, defaultValue: 400 },
    { key: 'height', label: 'Height', type: 'number', min: 100, max: 1080, step: 10, defaultValue: 300 },
    { key: 'background', label: 'Background', type: 'string', defaultValue: '#1a1a1a' },
  ],
  color: '#6366f1',
  laneKind: 'Output',
  priority: 1,
});
