/**
 * @file Field Primitives - Additional field manipulation blocks
 *
 * These blocks extend the basic field operations with more specialized
 * transformations for signal-field mixing, vector operations, and styling.
 */
import { createBlock } from './factory';
import { input, output } from './utils';

// =============================================================================
// Slice 6: Position Animation
// =============================================================================

/**
 * FieldAddVec2 - Add two vec2 fields element-wise
 *
 * Combines two position/vector fields by adding them together.
 * Useful for composing base positions with offsets/drift.
 */
export const FieldAddVec2 = createBlock({

  type: 'FieldAddVec2',
  label: 'Add Vectors',
  description: 'Add two vec2 fields element-wise',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('a', 'A', 'Field<vec2>', {
      tier: 'primary',
      defaultSource: { value: [0, 0], world: 'field' },
    }),
    input('b', 'B', 'Field<vec2>', {
      tier: 'primary',
      defaultSource: { value: [0, 0], world: 'field' },
    }),
  ],
  outputs: [
    output('out', 'Result', 'Field<vec2>'),
  ],
  paramSchema: [],
  color: '#A855F7',
  laneKind: 'Fields',
  priority: 31,});

// =============================================================================
// Slice 7: Visual Styling
// =============================================================================

/**
 * FieldColorize - Apply color to field elements
 *
 * Takes a Field<number> in [0,1] and maps it to colors using a gradient.
 * The mapping can be direct or use different color spaces.
 *
 * Inputs with defaultSource:
 * - colorA/colorB: Signal world (can be animated for breathing palettes)
 * - mode: Config world (triggers hot-swap for different interpolation)
 */
export const FieldColorize = createBlock({

  type: 'FieldColorize',
  label: 'Colorize Field',
  description: 'Map numeric field to colors',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('values', 'Values', 'Field<number>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('colorA', 'Color A', 'Signal<color>', {
      tier: 'primary',
      defaultSource: {
        value: '#3B82F6',
        world: 'signal', // Colors can be animated
        uiHint: { kind: 'color' },
      },
    }),
    input('colorB', 'Color B', 'Signal<color>', {
      tier: 'primary',
      defaultSource: {
        value: '#EF4444',
        world: 'signal',
        uiHint: { kind: 'color' },
      },
    }),
    input('mode', 'Mode', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'lerp',
        world: 'config', // Interpolation mode triggers hot-swap
        uiHint: {
          kind: 'select',
          options: [
            { value: 'lerp', label: 'Linear' },
            { value: 'hue', label: 'Hue Rotate' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('colors', 'Colors', 'Field<color>'),
  ],
  // TODO: Remove paramSchema after compiler updated to use defaultSource (Phase 4)
  paramSchema: [
    {
      key: 'colorA',
      label: 'Color A',
      type: 'color',
      defaultValue: '#3B82F6',
    },
    {
      key: 'colorB',
      label: 'Color B',
      type: 'color',
      defaultValue: '#EF4444',
    },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'lerp', label: 'Linear' },
        { value: 'hue', label: 'Hue Rotate' },
      ],
      defaultValue: 'lerp',
    },
  ],
  color: '#F59E0B',
  laneKind: 'Fields',
  priority: 40,});

/**
 * FieldOpacity - Set per-element opacity from Field<number>
 *
 * Takes a Field<number> and converts it to opacity values,
 * with optional clamping and curve application.
 *
 * Inputs with defaultSource:
 * - min/max: Signal world (can be animated for breathing/pulsing opacity)
 * - curve: Config world (triggers hot-swap for different curve shapes)
 */
export const FieldOpacity = createBlock({

  type: 'FieldOpacity',
  label: 'Field Opacity',
  description: 'Convert numeric field to opacity',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('values', 'Values', 'Field<number>', {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('min', 'Min Opacity', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal', // Opacity range can be animated
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 },
      },
    }),
    input('max', 'Max Opacity', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 },
      },
    }),
    input('curve', 'Curve', 'Signal<string>', {
      tier: 'secondary',
      defaultSource: {
        value: 'linear',
        world: 'config', // Curve function triggers hot-swap
        uiHint: {
          kind: 'select',
          options: [
            { value: 'linear', label: 'Linear' },
            { value: 'smoothstep', label: 'Smooth' },
            { value: 'square', label: 'Square' },
            { value: 'sqrt', label: 'Square Root' },
          ],
        },
      },
    }),
  ],
  outputs: [
    output('opacity', 'Opacity', 'Field<number>'),
  ],
  // TODO: Remove paramSchema after compiler updated to use defaultSource (Phase 4)
  paramSchema: [
    {
      key: 'min',
      label: 'Min Opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0,
    },
    {
      key: 'max',
      label: 'Max Opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 1,
    },
    {
      key: 'curve',
      label: 'Curve',
      type: 'select',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'smoothstep', label: 'Smooth' },
        { value: 'square', label: 'Square' },
        { value: 'sqrt', label: 'Square Root' },
      ],
      defaultValue: 'linear',
    },
  ],
  color: '#F59E0B',
  laneKind: 'Fields',
  priority: 41,});

// =============================================================================
// Field Color Generation
// =============================================================================

/**
 * FieldHueGradient - Generate rainbow/gradient colors per element
 *
 * Creates a Field<color> by spreading hue across all elements in a domain.
 * The hue spread and phase can be controlled for animated rainbow effects.
 *
 * Inputs with defaultSource:
 * - hueOffset: Signal world - base hue to start from (0-360)
 * - hueSpread: Signal world - how much of the spectrum to use (0-1 = full rainbow)
 * - saturation: Signal world - color saturation (0-100)
 * - lightness: Signal world - color lightness (0-100)
 * - phase: Signal world - animate the hue rotation
 */
export const FieldHueGradient = createBlock({

  type: 'FieldHueGradient',
  label: 'Hue Gradient',
  description: 'Generate per-element rainbow colors from domain',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('hueOffset', 'Hue Offset', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 360, step: 1 },
      },
    }),
    input('hueSpread', 'Hue Spread', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 },
      },
    }),
    input('saturation', 'Saturation', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 80,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 100, step: 1 },
      },
    }),
    input('lightness', 'Lightness', 'Signal<number>', {
      tier: 'primary',
      defaultSource: {
        value: 60,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 100, step: 1 },
      },
    }),
    input('phase', 'Phase', 'Signal<phase>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
  ],
  outputs: [
    output('colors', 'Colors', 'Field<color>'),
  ],
  paramSchema: [
    {
      key: 'hueOffset',
      label: 'Hue Offset',
      type: 'number',
      min: 0,
      max: 360,
      step: 1,
      defaultValue: 0,
    },
    {
      key: 'hueSpread',
      label: 'Hue Spread',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 1,
    },
    {
      key: 'saturation',
      label: 'Saturation',
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 80,
    },
    {
      key: 'lightness',
      label: 'Lightness',
      type: 'number',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 60,
    },
  ],
  color: '#F472B6', // Pink for color blocks
  laneKind: 'Fields',
  priority: 42,});

// =============================================================================
// Field Expression Adapter
// =============================================================================

/**
 * FieldFromExpression - Transform signals to fields using custom expressions
 *
 * Takes a Signal<number> and generates a Field<number> by evaluating a custom
 * JavaScript expression for each element. The expression can use:
 * - i: element index (0 to n-1)
 * - n: total number of elements
 * - signal: the current signal value
 * - Math functions (sin, cos, abs, floor, etc.)
 *
 * Examples:
 * - "signal * (i / n)" - linear gradient from 0 to signal value
 * - "signal * Math.sin(i / n * Math.PI * 2)" - wave pattern
 * - "i % 2 === 0 ? signal : 0" - alternating pattern
 */
export const FieldFromExpression = createBlock({

  type: 'FieldFromExpression',
  label: 'Expression Field',
  description: 'Generate field from expression (i, n, signal). Returns strings.',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('domain', 'Domain', 'Domain', {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('signal', 'Signal', 'Signal<phase>', {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        defaultBus: 'phaseA',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
    input('expression', 'Expression', 'Signal<string>', {
      tier: 'primary',
      defaultSource: {
        value: 'hsl(i / n * 360 + signal * 360, 80, 60)',
        world: 'config',
        uiHint: { kind: 'text' },
      },
    }),
  ],
  outputs: [
    output('field', 'Field', 'Field<string>'),
  ],
  paramSchema: [
    {
      key: 'expression',
      label: 'Expression',
      type: 'string',
      defaultValue: 'hsl(i / n * 360 + signal * 360, 80, 60)',
    },
  ],
  color: '#10B981', // Emerald for adapter blocks
  laneKind: 'Fields',
  priority: 43,});

/**
 * FieldStringToColor - Adapter from Field<string> to Field<color>
 *
 * Simple passthrough that reinterprets string values as colors.
 * Use with FieldFromExpression when your expression returns color strings.
 */
export const FieldStringToColor = createBlock({

  type: 'FieldStringToColor',
  label: 'String → Color',
  description: 'Convert Field<string> to Field<color>',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [
    input('strings', 'Strings', 'Field<string>', {
      tier: 'primary',
      defaultSource: { value: '', world: 'field' },
    }),
  ],
  outputs: [
    output('colors', 'Colors', 'Field<color>'),
  ],
  paramSchema: [],
  color: '#F472B6',
  laneKind: 'Fields',
  priority: 44,});

// =============================================================================
// Slice 8: Viewport
// =============================================================================

/**
 * ViewportInfo - Source block outputting viewport dimensions
 *
 * Provides viewport size and center as Scalar values.
 * These values come from runtime context.
 */
export const ViewportInfo = createBlock({

  type: 'ViewportInfo',
  label: 'Viewport Info',
  description: 'Viewport dimensions and center point',
  capability: 'pure',
  compileKind: 'operator',
  inputs: [],
  outputs: [
    output('size', 'Size', 'Scalar:vec2'),
    output('center', 'Center', 'Scalar:vec2'),
  ],
  paramSchema: [],
  color: '#8B5CF6',
  laneKind: 'Scene',
  priority: 10,});
