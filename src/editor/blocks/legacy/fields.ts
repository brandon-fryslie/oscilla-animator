import { createBlock } from '../factory';
import { input, output, COMMON_PARAMS, coordinateParam } from '../utils';

export const RadialOrigin = createBlock({
  type: 'RadialOrigin',
  label: 'Radial Origin',
  form: 'primitive',
  subcategory: 'Spatial',
  category: 'Fields',
  description: 'Generate start positions in a radial pattern around a center point',
  outputs: [output('positions', 'Positions', 'Field<Point>')],
  paramSchema: [
    COMMON_PARAMS.centerX,
    COMMON_PARAMS.centerY,
    COMMON_PARAMS.minRadius,
    COMMON_PARAMS.maxRadius,
    COMMON_PARAMS.spread,
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Motion',
  priority: 1,
});

export const LinearStagger = createBlock({
  type: 'LinearStagger',
  label: 'Linear Stagger',
  form: 'composite',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Generate delays that increase linearly by element index',
  outputs: [output('delays', 'Delays', 'Field<number>')],
  paramSchema: [
    COMMON_PARAMS.baseStagger,
    COMMON_PARAMS.jitter,
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 1,
  primitiveGraph: {
    nodes: {
      idx: { type: 'elementIndexField' },
      base: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'baseStagger' } } },
      product: { type: 'mulFieldNumber' },
      jitter: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'baseStagger' }, jitter: { __fromParam: 'jitter' } } },
      sum: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'idx.out', to: 'product.a' },
      { from: 'base.out', to: 'product.b' },
      { from: 'product.out', to: 'sum.a' },
      { from: 'jitter.out', to: 'sum.b' },
    ],
    inputMap: {},
    outputMap: {
      delays: 'sum.out',
    },
  },
});

export const RegionField = createBlock({
  type: 'regionField',
  label: 'Region Field',
  form: 'composite',
  subcategory: 'Spatial',
  category: 'Fields',
  description: 'Generate random points within a rectangular region',
  outputs: [output('positions', 'Positions', 'Field<Point>')],
  paramSchema: [
    coordinateParam('x', 'X', 0),
    coordinateParam('y', 'Y', 0),
    COMMON_PARAMS.width,
    COMMON_PARAMS.height,
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Motion',
  priority: 2,
  primitiveGraph: {
    nodes: {
      xCenter: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'x' } } },
      yCenter: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'y' } } },
      width: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'width' } } },
      height: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'height' } } },
      jitterX: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'width' }, jitter: 0.5 } },
      jitterY: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'height' }, jitter: 0.5 } },
      addX: { type: 'addFieldNumber' },
      addY: { type: 'addFieldNumber' },
      point: { type: 'makePointField' },
    },
    edges: [
      { from: 'xCenter.out', to: 'addX.a' },
      { from: 'jitterX.out', to: 'addX.b' },
      { from: 'yCenter.out', to: 'addY.a' },
      { from: 'jitterY.out', to: 'addY.b' },
      { from: 'addX.out', to: 'point.x' },
      { from: 'addY.out', to: 'point.y' },
    ],
    inputMap: {},
    outputMap: {
      positions: 'point.out',
    },
  },
});

export const ConstantFieldDuration = createBlock({
  type: 'constantFieldDuration',
  label: 'Constant Duration',
  form: 'composite',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Same duration for all elements',
  outputs: [output('durations', 'Durations', 'Field<number>')],
  paramSchema: [
    { key: 'duration', label: 'Duration (s)', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 1.0 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 2,
  primitiveGraph: {
    nodes: {
      lift: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'duration' } } },
    },
    edges: [],
    inputMap: {},
    outputMap: {
      durations: 'lift.out',
    },
  },
});

export const WaveStagger = createBlock({
  type: 'WaveStagger',
  label: 'Wave Stagger',
  form: 'composite',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Generate wave-based delays for organic staggering effects',
  outputs: [output('delays', 'Delays', 'Field<number>')],
  paramSchema: [
    { key: 'frequency', label: 'Frequency', type: 'number', min: 0.1, max: 5.0, step: 0.1, defaultValue: 1.0 },
    { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0, max: 1.0, step: 0.05, defaultValue: 0.3 },
    { key: 'baseDelay', label: 'Base Delay (s)', type: 'number', min: 0, max: 2.0, step: 0.1, defaultValue: 0.5 },
    { key: 'phase', label: 'Phase', type: 'number', min: 0, max: 6.28, step: 0.1, defaultValue: 0 },
    { key: 'jitter', label: 'Jitter', type: 'number', min: 0, max: 0.5, step: 0.05, defaultValue: 0.1 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 3,
  primitiveGraph: {
    nodes: {
      idx: { type: 'elementIndexField' },
      freq: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'frequency' } } },
      phaseConst: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'phase' } } },
      baseConst: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'baseDelay' } } },
      ampConst: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'amplitude' } } },
      mulIdx: { type: 'mulFieldNumber' },
      addPhase: { type: 'addFieldNumber' },
      sine: { type: 'sinFieldNumber' },
      mulAmp: { type: 'mulFieldNumber' },
      jitter: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'baseDelay' }, jitter: { __fromParam: 'jitter' } } },
      basePlusWave: { type: 'addFieldNumber' },
      sum: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'idx.out', to: 'mulIdx.a' },
      { from: 'freq.out', to: 'mulIdx.b' },
      { from: 'mulIdx.out', to: 'addPhase.a' },
      { from: 'phaseConst.out', to: 'addPhase.b' },
      { from: 'addPhase.out', to: 'sine.in' },
      { from: 'sine.out', to: 'mulAmp.a' },
      { from: 'ampConst.out', to: 'mulAmp.b' },
      { from: 'baseConst.out', to: 'basePlusWave.a' },
      { from: 'mulAmp.out', to: 'basePlusWave.b' },
      { from: 'basePlusWave.out', to: 'sum.a' },
      { from: 'jitter.out', to: 'sum.b' },
    ],
    inputMap: {},
    outputMap: {
      delays: 'sum.out',
    },
  },
});

export const ElementIndexField = createBlock({
  type: 'elementIndexField',
  label: 'Element Index',
  form: 'primitive',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Per-element index (0..n-1) as Field<number>',
  outputs: [output('out', 'Index', 'Field<number>')],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 1,
});

export const RandomJitterField = createBlock({
  type: 'randomJitterField',
  label: 'Random Jitter',
  form: 'primitive',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Random per-element jitter in range [-amp, amp]',
  outputs: [output('out', 'Jitter', 'Field<number>')],
  paramSchema: [
    { key: 'amplitude', label: 'Amplitude (s)', type: 'number', min: 0, max: 1, step: 0.005, defaultValue: 0.01 },
    { key: 'jitter', label: 'Jitter Factor', type: 'number', min: 0, max: 1, step: 0.05, defaultValue: 0 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 2,
});

export const AddFieldNumber = createBlock({
  type: 'addFieldNumber',
  label: 'Add Field',
  form: 'primitive',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Element-wise add two number fields',
  inputs: [
    input('a', 'A', 'Field<number>'),
    input('b', 'B', 'Field<number>'),
  ],
  outputs: [output('out', 'Out', 'Field<number>')],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 3,
});

export const MulFieldNumber = createBlock({
  type: 'mulFieldNumber',
  label: 'Multiply Field',
  form: 'primitive',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Element-wise multiply two number fields',
  inputs: [
    input('a', 'A', 'Field<number>'),
    input('b', 'B', 'Field<number>'),
  ],
  outputs: [output('out', 'Out', 'Field<number>')],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 3,
});

export const SinFieldNumber = createBlock({
  type: 'sinFieldNumber',
  label: 'Sin Field',
  form: 'primitive',
  subcategory: 'Timing',
  category: 'Fields',
  description: 'Element-wise Math.sin on Field<number>',
  inputs: [input('in', 'In', 'Field<number>')],
  outputs: [output('out', 'Out', 'Field<number>')],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 3,
});

export const SizeVariation = createBlock({
  type: 'SizeVariation',
  label: 'Size Variation',
  form: 'composite',
  subcategory: 'Style',
  category: 'Fields',
  description: 'Generate per-element size multipliers for varied effects',
  outputs: [output('sizes', 'Sizes', 'Field<number>')],
  paramSchema: [
    { key: 'baseSize', label: 'Base Size', type: 'number', min: 0.1, max: 5.0, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 2.0, step: 0.1, defaultValue: 0.5 },
    { key: 'minSize', label: 'Min Size', type: 'number', min: 0.1, max: 1.0, step: 0.1, defaultValue: 0.3 },
    { key: 'maxSize', label: 'Max Size', type: 'number', min: 1.0, max: 5.0, step: 0.1, defaultValue: 2.0 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Style',
  priority: 4,
  primitiveGraph: {
    nodes: {
      base: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'baseSize' } } },
      jitter: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'variation' }, jitter: 1 } },
      add: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'base.out', to: 'add.a' },
      { from: 'jitter.out', to: 'add.b' },
    ],
    inputMap: {},
    outputMap: {
      sizes: 'add.out',
    },
  },
});

export const NoiseField = createBlock({
  type: 'noiseField',
  label: 'Noise Field',
  form: 'composite',
  category: 'Fields',
  description: 'Generate noise-based values for procedural effects',
  outputs: [output('out', 'Out', 'Field<number>')],
  paramSchema: [
    { key: 'amplitude', label: 'Amplitude', type: 'number', min: 0.1, max: 10, step: 0.1, defaultValue: 1.0 },
    { key: 'offset', label: 'Offset', type: 'number', min: -10, max: 10, step: 0.1, defaultValue: 0 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 5,
  primitiveGraph: {
    nodes: {
      seed: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'offset' } } },
      rand: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'amplitude' }, jitter: 1 } },
      add: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'seed.out', to: 'add.a' },
      { from: 'rand.out', to: 'add.b' },
    ],
    inputMap: {},
    outputMap: {
      out: 'add.out',
    },
  },
});

export const ColorField = createBlock({
  type: 'ColorField',
  label: 'Color Field',
  form: 'primitive',
  category: 'Fields',
  description: 'Generate per-element colors for varied effects',
  outputs: [output('colors', 'Colors', 'Field<string>')],
  paramSchema: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'gradient', label: 'Gradient' },
        { value: 'randomHue', label: 'Random Hue' },
        { value: 'rainbow', label: 'Rainbow' },
      ],
      defaultValue: 'solid',
    },
    { key: 'baseColor', label: 'Base Color', type: 'color', defaultValue: '#ffffff' },
    { key: 'endColor', label: 'End Color', type: 'color', defaultValue: '#ff0000' },
    { key: 'hueRange', label: 'Hue Range', type: 'number', min: 0, max: 180, step: 5, defaultValue: 30 },
    { key: 'saturation', label: 'Saturation', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 0.8 },
    { key: 'lightness', label: 'Lightness', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 0.6 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Style',
  priority: 6,
});

// --- Timing/Stagger Fields ---

export const RandomStagger = createBlock({
  type: 'RandomStagger',
  label: 'Random Stagger',
  form: 'primitive',
  category: 'Fields',
  description: 'Random delays within a range (for particles, liquid)',
  outputs: [output('delays', 'Delays', 'Field<Duration>')],
  paramSchema: [
    { key: 'minDelay', label: 'Min Delay (s)', type: 'number', min: 0, max: 2, step: 0.05, defaultValue: 0 },
    { key: 'maxDelay', label: 'Max Delay (s)', type: 'number', min: 0, max: 2, step: 0.05, defaultValue: 0.5 },
    { key: 'distribution', label: 'Distribution', type: 'select', options: [
      { value: 'uniform', label: 'Uniform' },
      { value: 'easeIn', label: 'Ease In' },
      { value: 'easeOut', label: 'Ease Out' },
      { value: 'gaussian', label: 'Gaussian' },
    ], defaultValue: 'uniform' },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 7,
});

export const IndexStagger = createBlock({
  type: 'IndexStagger',
  label: 'Index Stagger',
  form: 'primitive',
  category: 'Fields',
  description: 'Sequential delays by element index (typewriter, line drawing)',
  outputs: [output('delays', 'Delays', 'Field<Duration>')],
  paramSchema: [
    { key: 'delayPerElement', label: 'Delay/Element (s)', type: 'number', min: 0.01, max: 0.5, step: 0.01, defaultValue: 0.1 },
    { key: 'startDelay', label: 'Start Delay (s)', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 0 },
    { key: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 8,
});

export const DurationVariation = createBlock({
  type: 'DurationVariation',
  label: 'Duration Variation',
  form: 'primitive',
  category: 'Fields',
  description: 'Per-element duration with random variation',
  outputs: [output('durations', 'Durations', 'Field<Duration>')],
  paramSchema: [
    { key: 'baseDuration', label: 'Base (s)', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 1, step: 0.05, defaultValue: 0.2 },
    { key: 'minDuration',
      label: 'Min (s)',
      type: 'number',
      min: 0.1,
      max: 1,
      step: 0.1,
      defaultValue: 0.1,
    },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Timing',
  priority: 9,
});

export const DecayEnvelope = createBlock({
  type: 'DecayEnvelope',
  label: 'Decay Envelope',
  form: 'primitive',
  category: 'Fields',
  description: 'Amplitude decay rates for damping effects',
  outputs: [output('decay', 'Decay', 'Field<number>')],
  paramSchema: [
    {
      key: 'curve',
      label: 'Curve',
      type: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'exponential', label: 'Exponential' },
        { value: 'easeOut', label: 'Ease Out' },
        { value: 'sudden', label: 'Sudden' },
      ],
      defaultValue: 'exponential',
    },
    { key: 'rate', label: 'Rate', type: 'number', min: 0.1, max: 5, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 0.5, step: 0.05, defaultValue: 0.1 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 10,
});

// --- Position/Spatial Fields ---

export const ExplosionOrigin = createBlock({
  type: 'ExplosionOrigin',
  label: 'Explosion Origin',
  form: 'primitive',
  category: 'Fields',
  description: 'Random positions radiating from center (particle explosion)',
  outputs: [output('positions', 'Positions', 'Field<Point>')],
  paramSchema: [
    { key: 'centerX', label: 'Center X', type: 'number', min: 0, max: 800, step: 10, defaultValue: 400 },
    { key: 'centerY', label: 'Center Y', type: 'number', min: 0, max: 600, step: 10, defaultValue: 300 },
    { key: 'minDistance', label: 'Min Dist', type: 'number', min: 0, max: 500, step: 10, defaultValue: 200 },
    { key: 'maxDistance', label: 'Max Dist', type: 'number', min: 100, max: 1000, step: 10, defaultValue: 600 },
    { key: 'angleSpread', label: 'Angle Spread', type: 'number', min: 0, max: 360, step: 10, defaultValue: 360 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Motion',
  priority: 11,
});

export const TopDropOrigin = createBlock({
  type: 'TopDropOrigin',
  label: 'Top Drop Origin',
  form: 'composite',
  category: 'Fields',
  description: 'Positions above scene for drop/fall effects (liquid)',
  outputs: [output('positions', 'Positions', 'Field<Point>')],
  paramSchema: [
    { key: 'sceneWidth', label: 'Scene Width', type: 'number', min: 100, max: 1920, step: 10, defaultValue: 800 },
    { key: 'dropHeight', label: 'Drop Height', type: 'number', min: -500, max: 0, step: 10, defaultValue: -100 },
    { key: 'xSpread', label: 'X Spread', type: 'number', min: 0.1, max: 2, step: 0.1, defaultValue: 1.0 },
    { key: 'heightVariation', label: 'Height Var', type: 'number', min: 0, max: 200, step: 10, defaultValue: 50 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Motion',
  priority: 12,
  primitiveGraph: {
    nodes: {
      centerX: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'sceneWidth' } } },
      halfWidth: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'sceneWidth' } } },
      dropY: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'dropHeight' } } },
      spread: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'xSpread' } } },
      jitterX: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'sceneWidth' }, jitter: { __fromParam: 'xSpread' } } },
      jitterY: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'heightVariation' }, jitter: 1 } },
      baseX: { type: 'mulFieldNumber' },
      posX: { type: 'addFieldNumber' },
      posY: { type: 'addFieldNumber' },
      point: { type: 'makePointField' },
    },
    edges: [
      { from: 'centerX.out', to: 'baseX.a' },
      { from: 'spread.out', to: 'baseX.b' },
      { from: 'baseX.out', to: 'posX.a' },
      { from: 'jitterX.out', to: 'posX.b' },
      { from: 'dropY.out', to: 'posY.a' },
      { from: 'jitterY.out', to: 'posY.b' },
      { from: 'posX.out', to: 'point.x' },
      { from: 'posY.out', to: 'point.y' },
    ],
    inputMap: {},
    outputMap: {
      positions: 'point.out',
    },
  },
});

export const GridPositions = createBlock({
  type: 'GridPositions',
  label: 'Grid Positions',
  form: 'composite',
  category: 'Fields',
  description: 'Positions arranged in a grid pattern',
  outputs: [output('positions', 'Positions', 'Field<Point>')],
  paramSchema: [
    { key: 'startX', label: 'Start X', type: 'number', min: 0, max: 500, step: 10, defaultValue: 100 },
    { key: 'startY', label: 'Start Y', type: 'number', min: 0, max: 500, step: 10, defaultValue: 100 },
    { key: 'cellWidth', label: 'Cell Width', type: 'number', min: 10, max: 200, step: 5, defaultValue: 50 },
    { key: 'cellHeight', label: 'Cell Height', type: 'number', min: 10, max: 200, step: 5, defaultValue: 50 },
    { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 20, step: 1, defaultValue: 10 },
    { key: 'jitter', label: 'Jitter', type: 'number', min: 0, max: 50, step: 1, defaultValue: 0 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Motion',
  priority: 13,
  primitiveGraph: {
    nodes: {
      idx: { type: 'elementIndexField' },
      colCount: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'columns' } } },
      cellW: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'cellWidth' } } },
      cellH: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'cellHeight' } } },
      startX: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'startX' } } },
      startY: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'startY' } } },
      jitterAmt: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'jitter' } } },
      jitterX: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'cellWidth' }, jitter: { __fromParam: 'jitter' } } },
      jitterY: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'cellHeight' }, jitter: { __fromParam: 'jitter' } } },
      div: { type: 'divFieldNumber' },
      rowField: { type: 'floorFieldNumber' },
      mulCols: { type: 'mulFieldNumber' },
      colField: { type: 'subFieldNumber' },
      colOffset: { type: 'mulFieldNumber' },
      rowOffset: { type: 'mulFieldNumber' },
      addX1: { type: 'addFieldNumber' },
      addX2: { type: 'addFieldNumber' },
      addY1: { type: 'addFieldNumber' },
      addY2: { type: 'addFieldNumber' },
      point: { type: 'makePointField' },
    },
    edges: [
      { from: 'idx.out', to: 'div.a' },
      { from: 'colCount.out', to: 'div.b' },
      { from: 'div.out', to: 'rowField.in' },
      { from: 'rowField.out', to: 'mulCols.a' },
      { from: 'colCount.out', to: 'mulCols.b' },
      { from: 'idx.out', to: 'colField.a' },
      { from: 'mulCols.out', to: 'colField.b' },
      { from: 'colField.out', to: 'colOffset.a' },
      { from: 'cellW.out', to: 'colOffset.b' },
      { from: 'rowField.out', to: 'rowOffset.a' },
      { from: 'cellH.out', to: 'rowOffset.b' },
      { from: 'startX.out', to: 'addX1.a' },
      { from: 'colOffset.out', to: 'addX1.b' },
      { from: 'addX1.out', to: 'addX2.a' },
      { from: 'jitterX.out', to: 'addX2.b' },
      { from: 'startY.out', to: 'addY1.a' },
      { from: 'rowOffset.out', to: 'addY1.b' },
      { from: 'addY1.out', to: 'addY2.a' },
      { from: 'jitterY.out', to: 'addY2.b' },
      { from: 'addX2.out', to: 'point.x' },
      { from: 'addY2.out', to: 'point.y' },
    ],
    inputMap: {},
    outputMap: {
      positions: 'point.out',
    },
  },
});

export const CenterPoint = createBlock({
  type: 'CenterPoint',
  label: 'Center Point',
  form: 'composite',
  category: 'Fields',
  description: 'Same center position for all elements',
  outputs: [output('position', 'Position', 'Field<Point>')],
  paramSchema: [
    { key: 'x', label: 'X', type: 'number', min: 0, max: 800, step: 10, defaultValue: 400 },
    { key: 'y', label: 'Y', type: 'number', min: 0, max: 600, step: 10, defaultValue: 300 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  laneFlavor: 'Motion',
  priority: 14,
  primitiveGraph: {
    nodes: {
      xField: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'x' } } },
      yField: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'y' } } },
      point: { type: 'makePointField' },
    },
    edges: [
      { from: 'xField.out', to: 'point.x' },
      { from: 'yField.out', to: 'point.y' },
    ],
    inputMap: {},
    outputMap: {
      position: 'point.out',
    },
  },
});

// --- Transform Fields ---

export const RotationField = createBlock({
  type: 'RotationField',
  label: 'Rotation Field',
  form: 'composite',
  category: 'Fields',
  description: 'Per-element rotation angles',
  outputs: [output('rotations', 'Rotations', 'Field<number>')],
  paramSchema: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'constant', label: 'Constant' },
        { value: 'random', label: 'Random' },
        { value: 'sequential', label: 'Sequential' },
        { value: 'radial', label: 'Radial' },
      ],
      defaultValue: 'random',
    },
    { key: 'baseRotation', label: 'Base (deg)', type: 'number', min: -360, max: 360, step: 15, defaultValue: 0 },
    { key: 'range', label: 'Range (deg)', type: 'number', min: 0, max: 720, step: 15, defaultValue: 360 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 15,
  primitiveGraph: {
    nodes: {
      base: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'baseRotation' } } },
      jitter: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'range' }, jitter: 1 } },
      sum: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'base.out', to: 'sum.a' },
      { from: 'jitter.out', to: 'sum.b' },
    ],
    inputMap: {},
    outputMap: {
      rotations: 'sum.out',
    },
  },
});

export const ScaleField = createBlock({
  type: 'ScaleField',
  label: 'Scale Field',
  form: 'composite',
  category: 'Fields',
  description: 'Per-element scale values',
  outputs: [output('scales', 'Scales', 'Field<number>')],
  paramSchema: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'constant', label: 'Constant' },
        { value: 'random', label: 'Random' },
        { value: 'progressive', label: 'Progressive' },
        { value: 'alternating', label: 'Alternating' },
      ],
      defaultValue: 'constant',
    },
    { key: 'baseScale', label: 'Base Scale', type: 'number', min: 0.1, max: 3, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 0.3 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 16,
  primitiveGraph: {
    nodes: {
      base: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'baseScale' } } },
      jitter: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'variation' }, jitter: 1 } },
      sum: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'base.out', to: 'sum.a' },
      { from: 'jitter.out', to: 'sum.b' },
    ],
    inputMap: {},
    outputMap: {
      scales: 'sum.out',
    },
  },
});

export const OpacityField = createBlock({
  type: 'OpacityField',
  label: 'Opacity Field',
  form: 'composite',
  category: 'Fields',
  description: 'Per-element opacity values',
  outputs: [output('opacities', 'Opacities', 'Field<number>')],
  paramSchema: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'constant', label: 'Constant' },
        { value: 'random', label: 'Random' },
        { value: 'fadeByIndex', label: 'Fade by Index' },
        { value: 'pulse', label: 'Pulse' },
      ],
      defaultValue: 'constant',
    },
    { key: 'baseOpacity', label: 'Base', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 0.3 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 17,
  primitiveGraph: {
    nodes: {
      base: { type: 'lift.scalarToFieldNumber', params: { value: { __fromParam: 'baseOpacity' } } },
      jitter: { type: 'randomJitterField', params: { amplitude: { __fromParam: 'variation' }, jitter: 1 } },
      sum: { type: 'addFieldNumber' },
    },
    edges: [
      { from: 'base.out', to: 'sum.a' },
      { from: 'jitter.out', to: 'sum.b' },
    ],
    inputMap: {},
    outputMap: {
      opacities: 'sum.out',
    },
  },
});

// --- Behavior/Motion Parameter Fields ---

export const WobbleParams = createBlock({
  type: 'WobbleParams',
  label: 'Wobble Params',
  form: 'primitive',
  category: 'Fields',
  description: 'Per-element wobble behavior (liquid animations)',
  outputs: [output('wobble', 'Wobble', 'Field<Wobble>')],
  paramSchema: [
    { key: 'baseAmplitude', label: 'Amplitude', type: 'number', min: 0, max: 20, step: 1, defaultValue: 5 },
    { key: 'amplitudeVariation', label: 'Amp Var', type: 'number', min: 0, max: 10, step: 1, defaultValue: 2 },
    { key: 'baseFrequency', label: 'Frequency', type: 'number', min: 0.5, max: 10, step: 0.5, defaultValue: 3 },
    { key: 'decayRate', label: 'Decay Rate', type: 'number', min: 0, max: 5, step: 0.5, defaultValue: 2 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 18,
});

export const SpiralParams = createBlock({
  type: 'SpiralParams',
  label: 'Spiral Params',
  form: 'primitive',
  category: 'Fields',
  description: 'Per-element spiral motion (particle effects)',
  outputs: [output('spiral', 'Spiral', 'Field<Spiral>')],
  paramSchema: [
    { key: 'baseRadius', label: 'Radius', type: 'number', min: 1, max: 50, step: 1, defaultValue: 10 },
    { key: 'radiusVariation', label: 'Radius Var', type: 'number', min: 0, max: 25, step: 1, defaultValue: 5 },
    { key: 'baseFrequency', label: 'Frequency', type: 'number', min: 0.5, max: 5, step: 0.5, defaultValue: 2 },
    { key: 'decayRate', label: 'Decay Rate', type: 'number', min: 0, max: 5, step: 0.5, defaultValue: 1.5 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 19,
});

export const WaveParams = createBlock({
  type: 'WaveParams',
  label: 'Wave Params',
  form: 'primitive',
  category: 'Fields',
  description: 'Per-element wave motion (wave ripple effects)',
  outputs: [output('wave', 'Wave', 'Field<Wave>')],
  paramSchema: [
    { key: 'amplitudeY', label: 'Y Amplitude', type: 'number', min: 0, max: 100, step: 5, defaultValue: 35 },
    { key: 'amplitudeScale', label: 'Scale Amp', type: 'number', min: 0, max: 1, step: 0.05, defaultValue: 0.25 },
    { key: 'amplitudeRotation', label: 'Rotation Amp', type: 'number', min: 0, max: 45, step: 5, defaultValue: 15 },
    { key: 'waveCycles', label: 'Wave Cycles', type: 'number', min: 1, max: 10, step: 1, defaultValue: 3 },
    { key: 'decayRate', label: 'Decay Rate', type: 'number', min: 0, max: 5, step: 0.5, defaultValue: 1 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 20,
});

export const JitterParams = createBlock({
  type: 'JitterParams',
  label: 'Jitter Params',
  form: 'primitive',
  category: 'Fields',
  description: 'Per-element jitter/shake (glitch effects)',
  outputs: [output('jitter', 'Jitter', 'Field<Jitter>')],
  paramSchema: [
    { key: 'baseAmplitudeX', label: 'X Amplitude', type: 'number', min: 0, max: 50, step: 1, defaultValue: 5 },
    { key: 'baseAmplitudeY', label: 'Y Amplitude', type: 'number', min: 0, max: 50, step: 1, defaultValue: 5 },
    { key: 'frequency', label: 'Frequency', type: 'number', min: 1, max: 30, step: 1, defaultValue: 10 },
    { key: 'bounded', label: 'Bounded', type: 'boolean', defaultValue: true },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 21,
});

export const EasingField = createBlock({
  type: 'EasingField',
  label: 'Easing Field',
  form: 'primitive',
  category: 'Fields',
  description: 'Per-element easing function selection',
  outputs: [output('easings', 'Easings', 'Field<string>')],
  paramSchema: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'constant', label: 'Constant' },
        { value: 'random', label: 'Random' },
        { value: 'alternating', label: 'Alternating' },
      ],
      defaultValue: 'constant',
    },
    {
      key: 'baseEasing',
      label: 'Base Easing',
      type: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'easeOutCubic', label: 'Ease Out Cubic' },
        { value: 'easeInCubic', label: 'Ease In Cubic' },
        { value: 'easeInOutCubic', label: 'Ease In Out Cubic' },
        { value: 'easeOutBack', label: 'Ease Out Back' },
      ],
      defaultValue: 'easeOutCubic',
    },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 22,
});
