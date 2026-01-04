/**
 * @file Field Primitives - Additional field manipulation blocks
 *
 * These blocks extend the basic field operations with more specialized
 * transformations for signal-field mixing, vector operations, and styling.
 */
import { createBlock } from './factory';
import { input, output } from './utils';
import { parseTypeDesc } from '../ir/types/TypeDesc';

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
    input('a', 'A', parseTypeDesc('Field<vec2>'), {
      tier: 'primary',
      defaultSource: { value: [0, 0], world: 'field' },
    }),
    input('b', 'B', parseTypeDesc('Field<vec2>'), {
      tier: 'primary',
      defaultSource: { value: [0, 0], world: 'field' },
    }),
  ],
  outputs: [
    output('out', 'Result', parseTypeDesc('Field<vec2>')),
  ],
  color: '#A855F7',
  priority: 31,});

// =============================================================================
// Slice 7: Visual Styling
// =============================================================================

/**
 * FieldColorize - Apply color to field elements
 *
 * Takes a Field<float> in [0,1] and maps it to colors using a gradient.
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
    input('values', 'Values', parseTypeDesc('Field<float>'), {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('colorA', 'Color A', parseTypeDesc('Signal<color>'), {
      tier: 'primary',
      defaultSource: {
        value: '#3B82F6',
        world: 'signal', // Colors can be animated
        uiHint: { kind: 'color' },
      },
    }),
    input('colorB', 'Color B', parseTypeDesc('Signal<color>'), {
      tier: 'primary',
      defaultSource: {
        value: '#EF4444',
        world: 'signal',
        uiHint: { kind: 'color' },
      },
    }),
    input('mode', 'Mode', parseTypeDesc('Signal<string>'), {
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
    output('colors', 'Colors', parseTypeDesc('Field<color>')),
  ],
  color: '#F59E0B',
  priority: 40,});

/**
 * FieldOpacity - Set per-element opacity from Field<float>
 *
 * Takes a Field<float> and converts it to opacity values,
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
    input('values', 'Values', parseTypeDesc('Field<float>'), {
      tier: 'primary',
      defaultSource: { value: 0, world: 'field' },
    }),
    input('min', 'Min Opacity', parseTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal', // Opacity range can be animated
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 },
      },
    }),
    input('max', 'Max Opacity', parseTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 },
      },
    }),
    input('curve', 'Curve', parseTypeDesc('Signal<string>'), {
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
    output('opacity', 'Opacity', parseTypeDesc('Field<float>')),
  ],
  color: '#F59E0B',
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
    input('domain', 'Domain', parseTypeDesc('Domain'), {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('hueOffset', 'Hue Offset', parseTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 360, step: 1 },
      },
    }),
    input('hueSpread', 'Hue Spread', parseTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: {
        value: 1,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.1 },
      },
    }),
    input('saturation', 'Saturation', parseTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: {
        value: 80,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 100, step: 1 },
      },
    }),
    input('lightness', 'Lightness', parseTypeDesc('Signal<float>'), {
      tier: 'primary',
      defaultSource: {
        value: 60,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 100, step: 1 },
      },
    }),
    input('phase', 'Phase', parseTypeDesc('Signal<phase>'), {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
  ],
  outputs: [
    output('colors', 'Colors', parseTypeDesc('Field<color>')),
  ],
  color: '#F472B6', // Pink for color blocks
  priority: 42,});

// =============================================================================
// Field Expression Adapter
// =============================================================================

/**
 * FieldFromExpression - Transform signals to fields using custom expressions
 *
 * Takes a Signal<float> and generates a Field<float> by evaluating a custom
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
    input('domain', 'Domain', parseTypeDesc('Domain'), {
      tier: 'primary',
      defaultSource: { value: 100, world: 'field' },
    }),
    input('signal', 'Signal', parseTypeDesc('Signal<phase>'), {
      tier: 'primary',
      defaultSource: {
        value: 0,
        world: 'signal',
        uiHint: { kind: 'slider', min: 0, max: 1, step: 0.01 },
      },
    }),
    input('expression', 'Expression', parseTypeDesc('Signal<string>'), {
      tier: 'primary',
      defaultSource: {
        value: 'hsl(i / n * 360 + signal * 360, 80, 60)',
        world: 'config',
        uiHint: { kind: 'text' },
      },
    }),
  ],
  outputs: [
    output('field', 'Field', parseTypeDesc('Field<string>')),
  ],
  color: '#10B981', // Emerald for adapter blocks
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
    input('strings', 'Strings', parseTypeDesc('Field<string>'), {
      tier: 'primary',
      defaultSource: { value: '', world: 'field' },
    }),
  ],
  outputs: [
    output('colors', 'Colors', parseTypeDesc('Field<color>')),
  ],
  color: '#F472B6',
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
    output('size', 'Size', parseTypeDesc('Scalar:vec2')),
    output('center', 'Center', parseTypeDesc('Scalar:vec2')),
  ],
  color: '#8B5CF6',
  priority: 10,});
