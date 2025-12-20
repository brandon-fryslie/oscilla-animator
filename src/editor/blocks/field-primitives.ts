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
  form: 'primitive',
  subcategory: 'Math',
  category: 'Fields',
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
 */
export const FieldColorize = createBlock({
  type: 'FieldColorize',
  label: 'Colorize Field',
  form: 'primitive',
  subcategory: 'Style',
  category: 'Fields',
  description: 'Map numeric field to colors',
  inputs: [
    input('values', 'Values', 'Field<number>'),
  ],
  outputs: [
    output('colors', 'Colors', 'Field<color>'),
  ],
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
 */
export const FieldOpacity = createBlock({
  type: 'FieldOpacity',
  label: 'Field Opacity',
  form: 'primitive',
  subcategory: 'Style',
  category: 'Fields',
  description: 'Convert numeric field to opacity',
  inputs: [
    input('values', 'Values', 'Field<number>'),
  ],
  outputs: [
    output('opacity', 'Opacity', 'Field<number>'),
  ],
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
  form: 'primitive',
  subcategory: 'Sources',
  category: 'Scene',
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
