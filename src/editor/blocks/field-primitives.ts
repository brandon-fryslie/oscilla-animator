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
  inputs: [
    input('a', 'A', 'Field<vec2>'),
    input('b', 'B', 'Field<vec2>'),
  ],
  outputs: [
    output('out', 'Result', 'Field<vec2>'),
  ],
  paramSchema: [],
  color: '#A855F7',
  laneKind: 'Fields',
  priority: 31,
});

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
  inputs: [
    input('values', 'Values', 'Field<number>'),
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
  priority: 40,
});

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
  inputs: [
    input('values', 'Values', 'Field<number>'),
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
  priority: 41,
});

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
  inputs: [],
  outputs: [
    output('size', 'Size', 'Scalar:vec2'),
    output('center', 'Center', 'Scalar:vec2'),
  ],
  paramSchema: [],
  color: '#8B5CF6',
  laneKind: 'Scene',
  priority: 10,
});
