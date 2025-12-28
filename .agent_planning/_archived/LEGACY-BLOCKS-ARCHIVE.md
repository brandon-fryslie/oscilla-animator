# Legacy Block Definitions Archive

**Archived:** 2025-12-20
**Reason:** Legacy block system removed - replaced by new primitive/composite system

This file contains archived code from `src/editor/blocks/legacy/` that was removed from the codebase.

---

## Table of Contents

1. [Index (legacy/index.ts)](#index)
2. [Fields (legacy/fields.ts)](#fields)
3. [Time (legacy/time.ts)](#time)
4. [Scene (legacy/scene.ts)](#scene)
5. [Compose (legacy/compose.ts)](#compose)
6. [Render (legacy/render.ts)](#render)
7. [Adapters (legacy/adapters.ts)](#adapters)
8. [Math (legacy/math.ts)](#math)
9. [Program (legacy/program.ts)](#program)
10. [FX (legacy/fx.ts)](#fx)
11. [Macros (legacy/macros.ts)](#macros)

---

## Index

**File:** `legacy/index.ts`

```typescript
/**
 * Legacy block definitions - kept for reference only.
 * These blocks are NOT registered in the main registry and will not appear in the UI.
 */

// Re-export all legacy blocks
export * from './macros';
export * from './scene';
export * from './fields';
export * from './time';
export * from './compose';
export * from './render';
export * from './math';
export * from './program';
export * from './adapters';
export * from './fx';
```

---

## Fields

**File:** `legacy/fields.ts`

```typescript
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
    { key: 'minDuration', label: 'Min (s)', type: 'number', min: 0.1, max: 1, step: 0.1, defaultValue: 0.1 },
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
  primitiveGraph: { /* ... */ },
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
  primitiveGraph: { /* ... */ },
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
  primitiveGraph: { /* ... */ },
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
    { key: 'mode', label: 'Mode', type: 'select', options: [
      { value: 'constant', label: 'Constant' },
      { value: 'random', label: 'Random' },
      { value: 'sequential', label: 'Sequential' },
      { value: 'radial', label: 'Radial' },
    ], defaultValue: 'random' },
    { key: 'baseRotation', label: 'Base (deg)', type: 'number', min: -360, max: 360, step: 15, defaultValue: 0 },
    { key: 'range', label: 'Range (deg)', type: 'number', min: 0, max: 720, step: 15, defaultValue: 360 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 15,
  primitiveGraph: { /* ... */ },
});

export const ScaleField = createBlock({
  type: 'ScaleField',
  label: 'Scale Field',
  form: 'composite',
  category: 'Fields',
  description: 'Per-element scale values',
  outputs: [output('scales', 'Scales', 'Field<number>')],
  paramSchema: [
    { key: 'mode', label: 'Mode', type: 'select', options: [
      { value: 'constant', label: 'Constant' },
      { value: 'random', label: 'Random' },
      { value: 'progressive', label: 'Progressive' },
      { value: 'alternating', label: 'Alternating' },
    ], defaultValue: 'constant' },
    { key: 'baseScale', label: 'Base Scale', type: 'number', min: 0.1, max: 3, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 0.3 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 16,
  primitiveGraph: { /* ... */ },
});

export const OpacityField = createBlock({
  type: 'OpacityField',
  label: 'Opacity Field',
  form: 'composite',
  category: 'Fields',
  description: 'Per-element opacity values',
  outputs: [output('opacities', 'Opacities', 'Field<number>')],
  paramSchema: [
    { key: 'mode', label: 'Mode', type: 'select', options: [
      { value: 'constant', label: 'Constant' },
      { value: 'random', label: 'Random' },
      { value: 'fadeByIndex', label: 'Fade by Index' },
      { value: 'pulse', label: 'Pulse' },
    ], defaultValue: 'constant' },
    { key: 'baseOpacity', label: 'Base', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 1.0 },
    { key: 'variation', label: 'Variation', type: 'number', min: 0, max: 1, step: 0.1, defaultValue: 0.3 },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 17,
  primitiveGraph: { /* ... */ },
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
    { key: 'mode', label: 'Mode', type: 'select', options: [
      { value: 'constant', label: 'Constant' },
      { value: 'random', label: 'Random' },
      { value: 'alternating', label: 'Alternating' },
    ], defaultValue: 'constant' },
    { key: 'baseEasing', label: 'Base Easing', type: 'select', options: [
      { value: 'linear', label: 'Linear' },
      { value: 'easeOutCubic', label: 'Ease Out Cubic' },
      { value: 'easeInCubic', label: 'Ease In Cubic' },
      { value: 'easeInOutCubic', label: 'Ease In Out Cubic' },
      { value: 'easeOutBack', label: 'Ease Out Back' },
    ], defaultValue: 'easeOutCubic' },
  ],
  color: '#a855f7',
  laneKind: 'Fields',
  priority: 22,
});
```

---

## Time

**File:** `legacy/time.ts`

```typescript
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

export const PhaseClock = createBlock({
  type: 'PhaseClock',
  label: 'Phase Clock',
  form: 'primitive',
  subcategory: 'Time',
  category: 'Time',
  description: 'Time-based phase progression with loop modes',
  outputs: [output('phase', 'Phase', 'Signal<number>')],
  paramSchema: [
    { key: 'duration', label: 'Duration (s)', type: 'number', min: 0.1, max: 10.0, step: 0.1, defaultValue: 3.0 },
    { key: 'mode', label: 'Mode', type: 'select', options: [
      { value: 'loop', label: 'Loop' },
      { value: 'once', label: 'Once' },
      { value: 'pingpong', label: 'Ping-Pong' },
    ], defaultValue: 'loop' },
    { key: 'offset', label: 'Offset (s)', type: 'number', min: -10.0, max: 10.0, step: 0.1, defaultValue: 0.0 },
  ],
  color: '#22c55e',
  laneKind: 'Phase',
  priority: 3,
});
```

---

## Scene

**File:** `legacy/scene.ts`

```typescript
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
    { key: 'target', label: 'Target', type: 'select', get options() { return getPathOptions(); }, defaultValue: 'builtin:logo' },
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
    { key: 'density', label: 'Density', type: 'number', min: 0.1, max: 3.0, step: 0.1, defaultValue: 1.0 },
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
```

---

## Compose

**File:** `legacy/compose.ts`

```typescript
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
    { key: 'easing', label: 'Easing', type: 'select', options: [
      { value: 'linear', label: 'Linear' },
      { value: 'easeInQuad', label: 'Ease In Quad' },
      { value: 'easeOutQuad', label: 'Ease Out Quad' },
      { value: 'easeOutCubic', label: 'Ease Out Cubic' },
      { value: 'easeInOutCubic', label: 'Ease In Out Cubic' },
    ], defaultValue: 'easeOutCubic' },
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
  color: '#ef4444',
  laneKind: 'Output',
  priority: 2,
});
```

---

## Render

**File:** `legacy/render.ts`

```typescript
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

// ... (CircleNode, GroupNode, RenderTreeAssemble, PerElementCircles, PathRenderer, MaskReveal, RenderInstances2D, Canvas)
```

---

## Adapters

**File:** `legacy/adapters.ts`

```typescript
import { createBlock } from '../factory';
import { input, output } from '../utils';

export const SceneToTargets = createBlock({
  type: 'SceneToTargets',
  label: 'Scene → Targets',
  form: 'primitive',
  category: 'Adapters',
  description: 'Convert Scene to SceneTargets (sample points from paths)',
  inputs: [input('scene', 'Scene', 'Scene')],
  outputs: [output('targets', 'Targets', 'SceneTargets')],
  color: '#71717a',
  laneKind: 'Scene',
  priority: 10,
});

export const FieldToSignal = createBlock({
  type: 'FieldToSignal',
  label: 'Field → Signal',
  form: 'primitive',
  category: 'Adapters',
  description: 'Convert Field<A> to Signal<A> by freezing at compilation time',
  inputs: [input('field', 'Field', 'Field<number>')],
  outputs: [output('signal', 'Signal', 'Signal<number>')],
  color: '#71717a',
  laneKind: 'Fields',
  priority: 10,
});

// ... (ScalarToSignalNumber, SignalToScalarNumber, TimeToPhase, PhaseToTime, WrapPhase, ElementCount, LiftScalarToField)
```

---

## Math

**File:** `legacy/math.ts`

```typescript
import { createBlock } from '../factory';
import { input, output } from '../utils';

export const MathConstNumber = createBlock({
  type: 'math.constNumber',
  label: 'Const Number',
  form: 'primitive',
  category: 'Math',
  description: 'Constant scalar number',
  outputs: [output('out', 'Out', 'Scalar:number')],
  paramSchema: [
    { key: 'value', label: 'Value', type: 'number', min: -1000, max: 1000, step: 0.1, defaultValue: 0 },
  ],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 1,
});

export const MathAddScalar = createBlock({
  type: 'math.addScalar',
  label: 'Add',
  form: 'primitive',
  category: 'Math',
  description: 'Add two scalar numbers',
  inputs: [input('a', 'A', 'Scalar:number'), input('b', 'B', 'Scalar:number')],
  outputs: [output('out', 'Out', 'Scalar:number')],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 2,
});

export const MathMulScalar = createBlock({
  type: 'math.mulScalar',
  label: 'Multiply',
  form: 'primitive',
  category: 'Math',
  description: 'Multiply two scalar numbers',
  inputs: [input('a', 'A', 'Scalar:number'), input('b', 'B', 'Scalar:number')],
  outputs: [output('out', 'Out', 'Scalar:number')],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 2,
});

export const MathSinScalar = createBlock({
  type: 'math.sinScalar',
  label: 'Sin',
  form: 'primitive',
  category: 'Math',
  description: 'Sine of a scalar number',
  inputs: [input('x', 'X', 'Scalar:number')],
  outputs: [output('out', 'Out', 'Scalar:number')],
  color: '#8b5cf6',
  laneKind: 'Scalars',
  priority: 3,
});
```

---

## Program

**File:** `legacy/program.ts`

```typescript
import { createBlock } from '../factory';
import { input, output } from '../utils';

export const DemoProgram = createBlock({
  type: 'demoProgram',
  label: 'Demo Program',
  form: 'primitive',
  category: 'Compose',
  description: 'Generate a visual proof program',
  inputs: [input('speed', 'Speed', 'Scalar:number'), input('amp', 'Amplitude', 'Scalar:number')],
  outputs: [output('program', 'Program', 'Program')],
  paramSchema: [
    { key: 'variant', label: 'Variant', type: 'select', options: [
      { value: 'lineDrawing', label: 'Line Drawing' },
      { value: 'pulsingLine', label: 'Pulsing Line' },
      { value: 'bouncingCircle', label: 'Bouncing Circle' },
      { value: 'particles', label: 'Particles' },
      { value: 'oscillator', label: 'Oscillator' },
    ], defaultValue: 'lineDrawing' },
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
```

---

## FX

**File:** `legacy/fx.ts`

```typescript
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
    { key: 'linecap', label: 'Line Cap', type: 'select', options: [
      { value: 'butt', label: 'Butt' },
      { value: 'round', label: 'Round' },
      { value: 'square', label: 'Square' },
    ], defaultValue: 'round' },
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
```

---

## Macros

**File:** `legacy/macros.ts`

```typescript
import type { BlockDefinition, BlockSubcategory } from '../types';

function createMacro(config: {
  type: string;
  label: string;
  description: string;
  priority: number;
  color?: string;
  subcategory?: BlockSubcategory;
}): BlockDefinition {
  return {
    type: config.type,
    label: config.label,
    form: 'macro',
    subcategory: config.subcategory || 'Animation Styles',
    category: 'Macros',
    description: config.description,
    inputs: [],
    outputs: [],
    defaultParams: {},
    paramSchema: [],
    color: config.color || '#fbbf24',
    laneKind: 'Program',
    priority: config.priority,
  };
}

// Animation Style Macros
export const MacroLineDrawing = createMacro({ type: 'macro:lineDrawing', label: '✨ Line Drawing', description: '...', priority: -100 });
export const MacroParticles = createMacro({ type: 'macro:particles', label: '✨ Particles', description: '...', priority: -99 });
export const MacroBouncingCircle = createMacro({ type: 'macro:bouncingCircle', label: '✨ Bouncing Circle', description: '...', priority: -98 });
export const MacroOscillator = createMacro({ type: 'macro:oscillator', label: '✨ Oscillator', description: '...', priority: -97 });
export const MacroRadialBurst = createMacro({ type: 'macro:radialBurst', label: '✨ Radial Burst', description: '...', priority: -96 });
export const MacroCascade = createMacro({ type: 'macro:cascade', label: '✨ Cascade', description: '...', priority: -95 });
export const MacroScatter = createMacro({ type: 'macro:scatter', label: '✨ Scatter', description: '...', priority: -94 });
export const MacroImplosion = createMacro({ type: 'macro:implosion', label: '✨ Implosion', description: '...', priority: -93 });
export const MacroSwarm = createMacro({ type: 'macro:swarm', label: '✨ Swarm', description: '...', priority: -92 });
export const MacroLoveYouBaby = createMacro({ type: 'macro:loveYouBaby', label: '💖 Love You Baby', description: '...', priority: -91, color: '#ff2d75' });
export const MacroNebula = createMacro({ type: 'macro:nebula', label: '🌌 Nebula', description: '...', priority: -90, color: '#a855f7' });

// Effect Macros
export const MacroGlitchStorm = createMacro({ type: 'macro:glitchStorm', label: '⚡ Glitch Storm', description: '...', priority: -89, color: '#22c55e', subcategory: 'Effects' });
export const MacroAurora = createMacro({ type: 'macro:aurora', label: '🌊 Aurora', description: '...', priority: -88, color: '#06b6d4', subcategory: 'Effects' });
export const MacroRevealMask = createMacro({ type: 'macro:revealMask', label: '🎭 Reveal Mask', description: '...', priority: -87, color: '#14b8a6', subcategory: 'Effects' });
export const MacroLiquid = createMacro({ type: 'macro:liquid', label: '💧 Liquid', description: '...', priority: -86, color: '#10b981', subcategory: 'Effects' });
```

---

## End of Archive

This code has been archived and removed from the active codebase. See the new block system in:
- `src/editor/blocks/` - New primitive/composite block definitions
- `src/editor/composites.ts` - Composite system
- `src/editor/compiler/unified/` - New unified compiler
