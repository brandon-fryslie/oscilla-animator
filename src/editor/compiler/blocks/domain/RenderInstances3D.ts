/**
 * RenderInstances3D Block Compiler
 *
 * Projects 3D instance positions to 2D screen space via camera perspective.
 * This is the render sink that turns 3D per-element data into 2D visual output.
 *
 * Takes:
 *   - Domain: element identity (required)
 *   - positions3d: Field<vec3> - per-element 3D positions (required)
 *   - color: Field<color> - per-element colors (required)
 *   - radius: Field<float> OR Signal<float> - per-element radii or broadcast radius (required)
 *   - opacity: Signal<float> - opacity multiplier (required)
 *   - camera: Special<camera> - camera reference (optional, default injected by pass8)
 *
 * Produces:
 *   - Instance2DBufferRef via projection step (x, y, r, g, b, a, s, z, alive arrays)
 *
 * References:
 * - design-docs/13-Renderer/07-3d-Canonical.md (§7.2 - Instances3D_ProjectTo2D contract)
 * - design-docs/13-Renderer/06-3d-IR-Deltas.md (§3 - Projection pass)
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

/**
 * Lower RenderInstances3D block to IR.
 *
 * This is a RENDER block that projects 3D domain + fields into 2D visual output.
 * It takes:
 * - Domain (special handle)
 * - positions3d: Field<vec3>
 * - color: Field<color>
 * - radius: Field<float> OR Signal<float>
 * - opacity: Signal<float>
 * - camera: Special<camera> (optional)
 *
 * And registers a render sink with these inputs.
 */
const lowerRenderInstances3D: BlockLowerFn = ({ ctx, inputs }) => {
  const [domain, positions3d, color, radius, opacity, camera] = inputs;

  // Validate domain
  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('RenderInstances3D requires a Domain input');
  }

  // Validate positions3d
  if (positions3d.k !== 'field') {
    throw new Error(`RenderInstances3D requires Field<vec3> positions3d, got ${positions3d.k}`);
  }

  // Validate color
  if (color.k !== 'field') {
    throw new Error(`RenderInstances3D requires Field<color> color, got ${color.k}`);
  }

  // Validate radius (Field or Signal)
  if (radius.k !== 'field' && radius.k !== 'sig') {
    throw new Error(`RenderInstances3D requires Field<float> or Signal<float> radius, got ${radius.k}`);
  }

  // Validate opacity
  if (opacity.k !== 'sig') {
    throw new Error(`RenderInstances3D requires Signal<float> opacity, got ${opacity.k}`);
  }

  // Validate camera (optional)
  if (camera !== undefined && (camera.k !== 'special' || camera.tag !== 'camera')) {
    throw new Error(`RenderInstances3D camera input must be Special<camera>, got ${camera.k}`);
  }

  // Register render sink
  // The runtime will handle projecting 3D positions via camera and materializing fields at render time
  // Note: renderSink expects Record<string, ValueSlot>
  // - domain.id IS the ValueSlot (special types use id as slot)
  // - field/signal inputs have separate .slot property
  // - camera.id IS the ValueSlot (special types use id as slot)
  const sinkInputs = {
    domain: domain.id,  // Domain special type: id IS the slot
    positions3d: positions3d.slot,  // Field: use .slot
    color: color.slot,  // Field: use .slot
    radius: radius.slot,  // Field/Signal: use .slot
    opacity: opacity.slot,  // Signal: use .slot
    camera: camera?.id,  // Camera special type: id IS the slot (undefined if not provided)
  };

  ctx.b.renderSink('instances3d', sinkInputs);

  return {
    outputs: [],
    declares: {
      renderSink: { sinkId: 0 }, // Placeholder - runtime assigns real IDs
    },
  };
};

// Register block type
registerBlockType({
  type: 'RenderInstances3D',
  capability: 'render',
  inputs: [
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: 'special', domain: 'domain' },
      defaultSource: { value: 100 },
    },
    {
      portId: 'positions3d',
      label: 'Positions (3D)',
      dir: 'in',
      type: { world: 'field', domain: 'vec3' },
      defaultSource: { value: [0, 0, 0] },
    },
    {
      portId: 'color',
      label: 'Color',
      dir: 'in',
      type: { world: 'field', domain: 'color' },
      defaultSource: { value: '#ffffff' },
    },
    {
      portId: 'radius',
      label: 'Radius',
      dir: 'in',
      type: { world: 'field', domain: 'float' }, // Can also accept signal
      defaultSource: { value: 5 },
    },
    {
      portId: 'opacity',
      label: 'Opacity',
      dir: 'in',
      type: { world: 'signal', domain: 'float' },
      defaultSource: { value: 1.0 },
    },
    {
      portId: 'camera',
      label: 'Camera',
      dir: 'in',
      type: { world: 'special', domain: 'camera' },
      optional: true,  // Pass8 injects default if missing
      defaultSource: { value: null },
    },
  ],
  outputs: [
    // In IR mode, render sinks don't produce signal outputs
  ],
  lower: lowerRenderInstances3D,
});
