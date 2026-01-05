/**
 * RenderInstances2D Block Compiler
 *
 * Materializes Domain + Fields into a renderable 2D circle output.
 * This is the sink that turns per-element data into visual output.
 *
 * Takes:
 *   - Domain: element identity (required)
 *   - positions: Field<vec2> - per-element positions (required)
 *   - radius: Field<float> OR Signal<float> - per-element radii or broadcast radius (required)
 *   - color: Field<color> - per-element colors (required)
 *
 * Produces:
 *   - render: RenderTree - SVG-compatible render tree with circles
 */

import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

/**
 * Lower RenderInstances2D block to IR.
 *
 * This is a RENDER block that materializes domain + fields into visual output.
 * It takes:
 * - Domain (special handle)
 * - positions: Field<vec2>
 * - radius: Field<float> OR Signal<float>
 * - color: Field<color>
 *
 * And registers a render sink with these inputs.
 */
const lowerRenderInstances2D: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  // Use inputsById pattern with fallback to positional inputs
  const domain = inputsById?.domain ?? inputs[0];
  const positions = inputsById?.positions ?? inputs[1];
  const radius = inputsById?.radius ?? inputs[2];
  const color = inputsById?.color ?? inputs[3];
  const opacity = inputsById?.opacity ?? inputs[4];
  // glow (inputs[5]) is Scalar:boolean - not used directly in IR sink yet
  // (Scalar values would need special handling as constId, not slot)
  const glowIntensity = inputsById?.glowIntensity ?? inputs[6];

  // Validate inputs
  if (!domain || domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error(`RenderInstances2D requires a Domain input, got ${domain?.k ?? 'undefined'}`);
  }

  if (!positions || positions.k !== 'field') {
    throw new Error(`RenderInstances2D requires Field<vec2> positions, got ${positions?.k ?? 'undefined'}`);
  }

  if (!radius || (radius.k !== 'field' && radius.k !== 'sig')) {
    throw new Error(`RenderInstances2D requires Field<float> or Signal<float> radius, got ${radius?.k ?? 'undefined'}`);
  }

  if (!color || color.k !== 'field') {
    throw new Error(`RenderInstances2D requires Field<color> color, got ${color?.k ?? 'undefined'}`);
  }

  if (!opacity || opacity.k !== 'sig') {
    throw new Error(`RenderInstances2D requires Signal<float> opacity, got ${opacity?.k ?? 'undefined'}`);
  }

  // glow is Scalar:boolean - optional, default false
  // glowIntensity is Signal:float - optional, default 0.5

  // Register render sink
  // The runtime will handle materializing these fields at render time
  // Note: renderSink expects Record<string, ValueSlot> (ValueSlot = number)
  // - domain.id IS the ValueSlot (special types use id as slot)
  // - field/signal inputs have separate .slot property
  const sinkInputs: Record<string, number> = {
    domain: domain.id,  // Domain special type: id IS the slot
    positions: positions.slot,  // Field: use .slot
    radius: radius.slot,  // Field/Signal: use .slot
    color: color.slot,  // Field: use .slot
    opacity: opacity.slot,
  };

  // Add glow inputs if present (these are optional)
  // Note: glow is Scalar:boolean which uses constId, not slot
  // For render sinks, we need to allocate slots for scalar values or handle differently
  // For now, glow and glowIntensity are passed as-is if they have slots
  if (glowIntensity && 'slot' in glowIntensity) {
    sinkInputs.glowIntensity = glowIntensity.slot;
  }

  ctx.b.renderSink('instances2d', sinkInputs);

  return {
    outputs: [],
    declares: {
      renderSink: { sinkId: 0 }, // Placeholder - runtime assigns real IDs
    },
  };
};

// Register block type
registerBlockType({
  type: 'RenderInstances2D',
  capability: 'render',
  inputs: [
    {
      portId: 'domain',
      label: 'Domain',
      dir: 'in',
      type: { world: "config", domain: "domain", category: "internal", busEligible: false },
      defaultSource: { value: 100 },
    },
    {
      portId: 'positions',
      label: 'Positions',
      dir: 'in',
      type: { world: "field", domain: "vec2", category: "core", busEligible: true },
      defaultSource: { value: [0, 0] },
    },
    {
      portId: 'radius',
      label: 'Radius',
      dir: 'in',
      type: { world: "field", domain: "float", category: "core", busEligible: true }, // Can also accept signal
      defaultSource: { value: 5 },
    },
    {
      portId: 'color',
      label: 'Color',
      dir: 'in',
      type: { world: "field", domain: "color", category: "core", busEligible: true },
      defaultSource: { value: '#ffffff' },
    },
    {
      portId: 'opacity',
      label: 'Opacity',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 1.0 },
    },
    {
      portId: 'glow',
      label: 'Glow',
      dir: 'in',
      type: { world: "scalar", domain: "boolean", category: "core", busEligible: true },
      defaultSource: { value: false },
    },
    {
      portId: 'glowIntensity',
      label: 'Glow Intensity',
      dir: 'in',
      type: { world: "signal", domain: "float", category: "core", busEligible: true },
      defaultSource: { value: 0.5 },
    },
  ],
  outputs: [
    // In IR mode, render sinks don't produce signal outputs
    // In legacy mode, this has a 'render' output
  ],
  lower: lowerRenderInstances2D,
});
