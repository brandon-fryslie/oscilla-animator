/**
 * @file Domain blocks - Primitives for element population and identity.
 *
 * These are the foundation blocks that create element populations with stable IDs.
 * Everything that needs per-element behavior (Fields) starts with a Domain.
 */
import { createBlock } from './factory';
import { input, output } from './utils';

/**
 * DomainN - Create a domain with N elements.
 *
 * This is the fundamental primitive that creates elements with stable IDs.
 * Element IDs are stable across frames and recompiles for the same (n, seed) pair.
 *
 * Both n and seed are Scalar world - compile-time constants that trigger rebuild.
 */
export const DomainN = createBlock({
  type: 'DomainN',
  label: 'Domain N',
  description: 'Create a domain with N elements, each with a stable ID',
  inputs: [
    input('n', 'Element Count', 'Scalar:int', {
      tier: 'primary',
      defaultSource: {
        value: 100,
        world: 'scalar',
        uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
      },
    }),
    input('seed', 'Seed', 'Scalar:int', {
      tier: 'secondary',
      defaultSource: {
        value: 0,
        world: 'scalar',
        uiHint: { kind: 'number', min: 0, max: 999999, step: 1 },
      },
    }),
  ],
  outputs: [
    output('domain', 'Domain', 'Domain'),
  ],
  color: '#8B5CF6',
  priority: 0,
});

/**
 * GridDomain - Create a grid domain with stable row/col IDs and base positions.
 *
 * Combines domain creation with grid positioning into a single block.
 * Element IDs are stable (row-R-col-C) and positions are deterministic.
 *
 * Inputs:
 * - rows/cols: Scalar world (grid structure, triggers rebuild)
 * - spacing/originX/Y: Signal world (can be animated for breathing/pan)
 */
export const GridDomain = createBlock({
  type: 'GridDomain',
  label: 'Grid Domain',
  description: 'Create a grid domain with stable element IDs and base positions',
  inputs: [
    input('rows', 'Rows', 'Scalar:int', {
      tier: 'primary',
      defaultSource: {
        value: 10,
        world: 'scalar',
        uiHint: { kind: 'slider', min: 1, max: 100, step: 1 },
      },
    }),
    input('cols', 'Columns', 'Scalar:int', {
      tier: 'primary',
      defaultSource: {
        value: 10,
        world: 'scalar',
        uiHint: { kind: 'slider', min: 1, max: 100, step: 1 },
      },
    }),
    input('spacing', 'Spacing', 'Signal<float>', {
      tier: 'primary',
      defaultSource: {
        value: 20,
        world: 'signal',
        uiHint: { kind: 'slider', min: 1, max: 200, step: 1 },
      },
    }),
    input('originX', 'Origin X', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: {
        value: 100,
        world: 'signal',
        uiHint: { kind: 'slider', min: -1000, max: 2000, step: 10 },
      },
    }),
    input('originY', 'Origin Y', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: {
        value: 100,
        world: 'signal',
        uiHint: { kind: 'slider', min: -1000, max: 2000, step: 10 },
      },
    }),
  ],
  outputs: [
    output('domain', 'Domain', 'Domain'),
    output('pos0', 'Base Positions', 'Field<vec2>'),
  ],
  color: '#8B5CF6',
  priority: 1,
});

/**
 * SVGSampleDomain - Sample points from SVG path(s) with stable IDs.
 *
 * Takes an SVG path asset and samples N points along the path(s), creating
 * a domain with stable element IDs and positions from the path geometry.
 * Similar to GridDomain but positions come from SVG sampling.
 *
 * Inputs:
 * - asset/sampleCount/seed: Scalar world (compile-time)
 * - distribution: Config world (algorithm selection)
 */
export const SVGSampleDomain = createBlock({
  type: 'SVGSampleDomain',
  label: 'SVG Sample Domain',
  description: 'Sample points from SVG path with stable element IDs',
  inputs: [
    input('asset', 'SVG Path Asset', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: '',
        world: 'scalar',
        uiHint: { kind: 'text' },
      },
    }),
    input('sampleCount', 'Sample Count', 'Scalar:int', {
      tier: 'primary',
      defaultSource: {
        value: 100,
        world: 'scalar',
        uiHint: { kind: 'slider', min: 1, max: 5000, step: 1 },
      },
    }),
    input('seed', 'Seed', 'Scalar:int', {
      tier: 'secondary',
      defaultSource: {
        value: 0,
        world: 'scalar',
        uiHint: { kind: 'number', min: 0, max: 999999, step: 1 },
      },
    }),
    input('distribution', 'Distribution', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'even',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'even', label: 'Even (arc length)' },
            { value: 'parametric', label: 'Parametric (t-value)' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('domain', 'Domain', 'Domain'),
    output('pos0', 'Sampled Positions', 'Field<vec2>'),
  ],
  color: '#8B5CF6',
  priority: 2,
});

/**
 * StableIdHash - Hash stable element IDs to [0,1) with salt.
 *
 * Similar to FieldHash01ById but emphasizes the stable ID hashing contract.
 * Uses element.id + salt for deterministic per-element variation.
 */
export const StableIdHash = createBlock({
  type: 'StableIdHash',
  label: 'Stable ID Hash',
  description: 'Hash stable element IDs to deterministic [0,1) values with salt',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('salt', 'Salt', 'Scalar:int', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'scalar',
        uiHint: { kind: 'number', min: 0, max: 999999, step: 1 },
      },
    }),
  ],
  outputs: [
    output('u01', 'Hash [0,1)', 'Field<float>'),
  ],
  color: '#EC4899',
  priority: 7,
});

/**
 * PositionMapGrid - Map domain elements to grid positions.
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a grid.
 */
export const PositionMapGrid = createBlock({
  type: 'PositionMapGrid',
  label: 'Grid Layout',
  description: 'Arrange domain elements in a grid pattern',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('rows', 'Rows', 'Scalar:float', {
      tier: 'primary',
      defaultSource: { value: 10, world: 'scalar', uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
    }),
    input('cols', 'Columns', 'Scalar:float', {
      tier: 'primary',
      defaultSource: { value: 10, world: 'scalar', uiHint: { kind: 'slider', min: 1, max: 100, step: 1 } },
    }),
    input('spacing', 'Spacing', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 20, world: 'signal', uiHint: { kind: 'slider', min: 1, max: 200, step: 1 } },
    }),
    input('originX', 'Origin X', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 100, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('originY', 'Origin Y', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 100, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('order', 'Order', 'Signal<string>', {
      tier: 'secondary',
      defaultSource: {
        value: 'rowMajor',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'rowMajor', label: 'Row Major' },
            { value: 'serpentine', label: 'Serpentine' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('pos', 'Positions', 'Field<vec2>'),
  ],
  color: '#22C55E',
  priority: 1,
});

/**
 * PositionMapCircle - Map domain elements to circular positions.
 *
 * Takes a Domain and produces Field<vec2> of positions arranged in a circle/ring.
 */
export const PositionMapCircle = createBlock({
  type: 'PositionMapCircle',
  label: 'Circle Layout',
  description: 'Arrange domain elements in a circle',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('centerX', 'Center X', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 400, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('centerY', 'Center Y', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 300, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('radius', 'Radius', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 150, world: 'signal', uiHint: { kind: 'slider', min: 10, max: 500, step: 10 } },
    }),
    input('startAngle', 'Start Angle (deg)', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 360, step: 15 } },
    }),
    input('winding', 'Winding', 'Signal<string>', {
      tier: 'secondary',
      defaultSource: {
        value: '1',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: '1', label: 'Clockwise' },
            { value: '-1', label: 'Counter-Clockwise' },
          ],
        },
      },
    }),
    input('distribution', 'Distribution', 'Signal<string>', {
      tier: 'secondary',
      defaultSource: {
        value: 'even',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'even', label: 'Even' },
            { value: 'goldenAngle', label: 'Golden Angle' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('pos', 'Positions', 'Field<vec2>'),
  ],
  color: '#22C55E',
  priority: 2,
});

/**
 * PositionMapLine - Map domain elements to linear positions.
 *
 * Takes a Domain and produces Field<vec2> of positions along a line.
 */
export const PositionMapLine = createBlock({
  type: 'PositionMapLine',
  label: 'Line Layout',
  description: 'Arrange domain elements along a line',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('ax', 'Start X', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('ay', 'Start Y', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 200, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('bx', 'End X', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 700, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('by', 'End Y', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 200, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('distribution', 'Distribution', 'Signal<string>', {
      tier: 'secondary',
      defaultSource: {
        value: 'even',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'even', label: 'Even' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('pos', 'Positions', 'Field<vec2>'),
  ],
  color: '#22C55E',
  priority: 3,
});

/**
 * FieldConstNumber - Constant numeric field across all elements.
 */
export const FieldConstNumber = createBlock({
  type: 'FieldConstNumber',
  label: 'Constant Number',
  description: 'Uniform numeric value for all elements',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('value', 'Value', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 1, world: 'signal', uiHint: { kind: 'slider', min: -10000, max: 10000, step: 0.1 } },
    }),
  ],
  outputs: [
    output('out', 'Value', 'Field<float>'),
  ],
  color: '#F59E0B',
  priority: 4,
});

/**
 * FieldConstColor - Constant color field across all elements.
 */
export const FieldConstColor = createBlock({
  type: 'FieldConstColor',
  label: 'Constant Color',
  description: 'Uniform color for all elements',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('color', 'Color', 'Signal<color>', {
      tier: 'primary',
      defaultSource: { value: '#3B82F6', world: 'signal', uiHint: { kind: 'color' } },
    }),
  ],
  outputs: [
    output('out', 'Color', 'Field<color>'),
  ],
  color: '#F59E0B',
  priority: 5,
});

/**
 * FieldHash01ById - Per-element deterministic random in [0,1).
 *
 * Produces stable per-element variation based on element ID and seed.
 */
export const FieldHash01ById = createBlock({
  type: 'FieldHash01ById',
  label: 'Random Per Element',
  description: 'Deterministic random value per element (0 to 1)',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('seed', 'Seed', 'Scalar:float', {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'scalar', uiHint: { kind: 'number', min: 0, max: 999999, step: 1 } },
    }),
  ],
  outputs: [
    output('u', 'Random', 'Field<float>'),
  ],
  color: '#EC4899',
  priority: 6,
});

/**
 * FieldMapNumber - Map a numeric field with a unary function.
 */
export const FieldMapNumber = createBlock({
  type: 'FieldMapNumber',
  label: 'Map Number',
  description: 'Apply a function to each element of a numeric field',
  inputs: [
    input('x', 'Input', 'Field<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('fn', 'Function', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'sin',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'neg', label: 'Negate' },
            { value: 'abs', label: 'Absolute' },
            { value: 'sin', label: 'Sine' },
            { value: 'cos', label: 'Cosine' },
            { value: 'tanh', label: 'Tanh' },
            { value: 'smoothstep', label: 'Smoothstep' },
            { value: 'scale', label: 'Scale' },
            { value: 'offset', label: 'Offset' },
            { value: 'clamp', label: 'Clamp' },
          ],
        },
      },
    }),
    input('k', 'Parameter', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 1, world: 'signal', uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 } },
    }),
    input('a', 'Range Min', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 } },
    }),
    input('b', 'Range Max', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 1, world: 'signal', uiHint: { kind: 'slider', min: -100, max: 100, step: 0.1 } },
    }),
  ],
  outputs: [
    output('y', 'Output', 'Field<float>'),
  ],
  color: '#A855F7',
  priority: 10,
});

/**
 * FieldMapVec2 - Map a vec2 field with a spatial transformation.
 */
export const FieldMapVec2 = createBlock({
  type: 'FieldMapVec2',
  label: 'Transform Positions',
  description: 'Apply spatial transformations to position fields',
  inputs: [
    input('vec', 'Input', 'Field<vec2>', {
      tier: 'primary',
      defaultSource: { value: [0, 0], world: 'field' },
    }),
    input('fn', 'Function', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'rotate',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'rotate', label: 'Rotate' },
            { value: 'scale', label: 'Scale' },
            { value: 'translate', label: 'Translate' },
            { value: 'reflect', label: 'Reflect' },
          ],
        },
      },
    }),
    input('angle', 'Angle (deg)', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: -360, max: 360, step: 15 } },
    }),
    input('scaleX', 'Scale X', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 1, world: 'signal', uiHint: { kind: 'slider', min: 0.1, max: 10, step: 0.1 } },
    }),
    input('scaleY', 'Scale Y', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 1, world: 'signal', uiHint: { kind: 'slider', min: 0.1, max: 10, step: 0.1 } },
    }),
    input('offsetX', 'Offset X', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: -500, max: 500, step: 10 } },
    }),
    input('offsetY', 'Offset Y', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: -500, max: 500, step: 10 } },
    }),
    input('centerX', 'Center X', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 400, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
    input('centerY', 'Center Y', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 300, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1000, step: 10 } },
    }),
  ],
  outputs: [
    output('out', 'Output', 'Field<vec2>'),
  ],
  color: '#A855F7',
  priority: 11,
});

/**
 * FieldZipNumber - Combine two numeric fields with a binary operation.
 */
export const FieldZipNumber = createBlock({
  type: 'FieldZipNumber',
  label: 'Combine Numbers',
  description: 'Combine two numeric fields element-wise',
  inputs: [
    input('a', 'A', 'Field<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('b', 'B', 'Field<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('op', 'Operation', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'add',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'add', label: 'Add' },
            { value: 'sub', label: 'Subtract' },
            { value: 'mul', label: 'Multiply' },
            { value: 'min', label: 'Min' },
            { value: 'max', label: 'Max' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('out', 'Result', 'Field<float>'),
  ],
  color: '#A855F7',
  priority: 12,
});

/**
 * JitterFieldVec2 - Animated per-element position drift.
 *
 * Creates smooth, deterministic jitter based on per-element random and phase.
 * Each element gets a unique drift direction and animated magnitude.
 */
export const JitterFieldVec2 = createBlock({
  type: 'JitterFieldVec2',
  label: 'Jitter Field',
  description: 'Animated per-element position drift',
  inputs: [
    input('idRand', 'Random', 'Field<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('phase', 'Phase', 'Signal<phase>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'signal', defaultBus: 'phaseA', uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 } },
    }),
    input('amount', 'Amount', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 5, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 100, step: 1 } },
    }),
    input('frequency', 'Frequency', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 1, world: 'signal', uiHint: { kind: 'slider', min: 0.1, max: 10, step: 0.1 } },
    }),
  ],
  outputs: [
    output('drift', 'Drift', 'Field<vec2>'),
  ],
  color: '#A855F7',
  priority: 15,
});

/**
 * FieldFromSignalBroadcast - Broadcast Signal value to all Field elements.
 *
 * Takes a Signal<float> and broadcasts its value to every element in the domain,
 * creating a Field<float> where all elements have the same value at each time.
 */
export const FieldFromSignalBroadcast = createBlock({
  type: 'FieldFromSignalBroadcast',
  label: 'Signal to Field',
  description: 'Broadcast signal value to all field elements',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('signal', 'Signal', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 } },
    }),
  ],
  outputs: [
    output('field', 'Field', 'Field<float>'),
  ],
  color: '#A855F7',
  priority: 13,
});

/**
 * FieldZipSignal - Combine Field<float> with Signal<float>.
 *
 * Evaluates the signal once per frame and applies the operation to every
 * element in the field. Useful for applying time-varying modulation to fields.
 */
export const FieldZipSignal = createBlock({
  type: 'FieldZipSignal',
  label: 'Field + Signal',
  description: 'Combine field with signal value',
  inputs: [
    input('field', 'Field', 'Field<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('signal', 'Signal', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'signal', uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 } },
    }),
    input('fn', 'Operation', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'add',
        world: 'config',
        uiHint: {
          kind: 'select',
          options: [
            { value: 'add', label: 'Add' },
            { value: 'sub', label: 'Subtract' },
            { value: 'mul', label: 'Multiply' },
            { value: 'min', label: 'Min' },
            { value: 'max', label: 'Max' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('out', 'Result', 'Field<float>'),
  ],
  color: '#A855F7',
  priority: 14,
});

/**
 * BroadcastSignalColor - Broadcast Signal<color> to Field<color>.
 *
 * This is an adapter block for bridging a signal-world color to the field-world.
 */
export const BroadcastSignalColor = createBlock({
  type: 'BroadcastSignalColor',
  label: 'Signal to Field (Color)',
  description: 'Broadcast a single color signal to all elements in a domain.',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('signal', 'Signal', 'Signal<color>', {
      tier: 'primary',
      defaultSource: { value: '#3B82F6', world: 'signal', uiHint: { kind: 'color' } },
    }),
  ],
  outputs: [
    output('field', 'Field', 'Field<color>'),
  ],
  color: '#4ade80', // Green, for adapters/conversion
  priority: 100, // Adapters should be easy to find
});

/**
 * PathConst - Constant path field across all elements.
 *
 * Creates a Field<path> where all elements share the same path expression.
 * The path shape is defined via params/config and broadcasted to all elements.
 * Useful for rendering identical shapes at different positions.
 */
export const PathConst = createBlock({
  type: 'PathConst',
  label: 'Constant Path',
  description: 'Uniform path for all elements',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 1, world: 'field' },
    }),
  ],
  outputs: [
    output('out', 'Path', 'Field<path>'),
  ],
  paramSchema: [],
  color: '#F59E0B',
  priority: 8,
});

/**
 * RenderInstances2D - Render domain elements as 2D circles.
 *
 * This is the render sink that materializes Domain + Fields into visual output.
 * All per-element data flows through this block to produce the final render tree.
 *
 * The radius input accepts BOTH Field<float> (per-element radii) and Signal<float>
 * (broadcast same animated value to all elements).
 */
export const RenderInstances2D = createBlock({
  type: 'RenderInstances2D',
  label: 'Render Instances 2D',
  description: 'Render domain elements as 2D circles',
  subcategory: 'Render',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('positions', 'Positions', 'Field<vec2>', {
      tier: 'primary',
      defaultSource: { value: [0, 0], world: 'field' },
    }),
    input('radius', 'Radius', 'Field<float>', {
      tier: 'primary',
      defaultSource: { value: 5, world: 'field', uiHint: { kind: 'slider', min: 1, max: 50, step: 1 } },
    }),
    input('color', 'Color', 'Field<color>', {
      tier: 'primary',
      defaultSource: { value: '#ffffff', world: 'field', uiHint: { kind: 'color' } },
    }),
    input('opacity', 'Opacity', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 1.0, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 } },
    }),
    input('glow', 'Glow', 'Signal<string>', {
      tier: 'secondary',
      defaultSource: {
        value: 'false',
        world: 'config',
        uiHint: { kind: 'boolean' },
      },
    }),
    input('glowIntensity', 'Glow Intensity', 'Signal<float>', {
      tier: 'secondary',
      defaultSource: { value: 2.0, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 5, step: 0.5 } },
    }),
  ],
  // No outputs shown in UI - this is a terminal sink block
  // The compiler still defines the 'render' output for patch output inference
  outputs: [],
  color: '#EF4444',
  priority: 100,
});

const DEFAULT_PATH_EXPR = {
  commands: [
    { kind: 'M', x: 100, y: 100 },
    { kind: 'L', x: 200, y: 100 },
    { kind: 'L', x: 200, y: 200 },
    { kind: 'L', x: 100, y: 200 },
    { kind: 'Z' },
  ],
};

/**
 * RenderPaths2D - Render domain elements as vector paths.
 *
 * Consumes per-element Path expressions and style fields and emits a Paths2D pass.
 */
export const RenderPaths2D = createBlock({
  type: 'RenderPaths2D',
  label: 'Render Paths 2D',
  description: 'Render domain elements as vector paths',
  subcategory: 'Render',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 1, world: 'field' },
    }),
    input('paths', 'Paths', 'Field<path>', {
      tier: 'primary',
      defaultSource: { value: DEFAULT_PATH_EXPR, world: 'field' },
    }),
    input('fillColor', 'Fill Color', 'Field<color>', {
      tier: 'primary',
      defaultSource: { value: '#ffffff', world: 'field', uiHint: { kind: 'color' } },
    }),
    input('strokeColor', 'Stroke Color', 'Field<color>', {
      tier: 'secondary',
      defaultSource: { value: '#000000', world: 'field', uiHint: { kind: 'color' } },
    }),
    input('strokeWidth', 'Stroke Width', 'Field<float>', {
      tier: 'secondary',
      defaultSource: { value: 1, world: 'field', uiHint: { kind: 'slider', min: 0, max: 20, step: 0.5 } },
    }),
    input('opacity', 'Opacity', 'Signal<float>', {
      tier: 'primary',
      defaultSource: { value: 1.0, world: 'signal', uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 } },
    }),
  ],
  outputs: [],
  paramSchema: [],
  color: '#EF4444',
  priority: 101,
});

/**
 * Render2dCanvas - Render sink for Canvas 2D.
 *
 * Currently outputs a minimal Canvas RenderTree (just clears the canvas).
 * When Instances2D block is implemented, this will take a RenderTree input.
 */
export const Render2dCanvas = createBlock({
  type: 'Render2dCanvas',
  label: 'Render Canvas 2D',
  description: 'Canvas 2D render sink',
  subcategory: 'Render',
  inputs: [
    // No inputs yet - will take RenderTree input when Instances2D is implemented
  ],
  outputs: [
    output('render', 'Render', 'CanvasRender'),
  ],
  color: '#F97316', // Orange, distinct from SVG red
  priority: 101,
});
