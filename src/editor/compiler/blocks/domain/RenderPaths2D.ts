/**
 * RenderPaths2D Block Compiler
 *
 * Materializes Domain + Fields into a renderable 2D path output.
 * This is the sink that turns per-element Path data into visual output.
 *
 * Takes:
 *   - Domain: element identity (required)
 *   - paths: Field<path> (required)
 *   - fillColor: Field<color> (required)
 *   - strokeColor: Field<color> (required)
 *   - strokeWidth: Field<float> (required)
 *   - opacity: Signal<float> (required)
 */

import type { BlockCompiler } from '../../types';
import { registerBlockType, type BlockLowerFn } from '../../ir/lowerTypes';

// =============================================================================
// IR Lowering (Phase 3 Migration)
// =============================================================================

const lowerRenderPaths2D: BlockLowerFn = ({ ctx, inputs }) => {
  const [domain, paths, fillColor, strokeColor, strokeWidth, opacity] = inputs;

  if (domain.k !== 'special' || domain.tag !== 'domain') {
    throw new Error('RenderPaths2D requires a Domain input');
  }

  if (paths.k !== 'field') {
    throw new Error(`RenderPaths2D requires Field<path> paths, got ${paths.k}`);
  }

  if (fillColor.k !== 'field') {
    throw new Error(`RenderPaths2D requires Field<color> fillColor, got ${fillColor.k}`);
  }

  if (strokeColor.k !== 'field') {
    throw new Error(`RenderPaths2D requires Field<color> strokeColor, got ${strokeColor.k}`);
  }

  if (strokeWidth.k !== 'field') {
    throw new Error(`RenderPaths2D requires Field<float> strokeWidth, got ${strokeWidth.k}`);
  }

  if (opacity.k !== 'sig') {
    throw new Error(`RenderPaths2D requires Signal<float> opacity, got ${opacity.k}`);
  }

  const sinkInputs = {
    domain: domain.id,
    paths: paths.slot,
    fillColor: fillColor.slot,
    strokeColor: strokeColor.slot,
    strokeWidth: strokeWidth.slot,
    opacity: opacity.slot,
  };

  ctx.b.renderSink('paths2d', sinkInputs);

  return {
    outputs: [],
    declares: {
      renderSink: { sinkId: 0 },
    },
  };
};

registerBlockType({
  type: 'RenderPaths2D',
  capability: 'render',
  inputs: [
    { portId: 'domain', label: 'Domain', dir: 'in', type: { world: "config", domain: "domain", category: "internal", busEligible: false }, defaultSource: { value: 1 } },
    {
      portId: 'paths',
      label: 'Paths',
      dir: 'in',
      type: { world: "field", domain: "path", category: "internal", busEligible: false },
      defaultSource: {
        value: {
          commands: [
            { kind: 'M', x: 100, y: 100 },
            { kind: 'L', x: 200, y: 100 },
            { kind: 'L', x: 200, y: 200 },
            { kind: 'L', x: 100, y: 200 },
            { kind: 'Z' },
          ],
        },
      },
    },
    { portId: 'fillColor', label: 'Fill Color', dir: 'in', type: { world: "field", domain: "color", category: "core", busEligible: true }, defaultSource: { value: '#ffffff' } },
    { portId: 'strokeColor', label: 'Stroke Color', dir: 'in', type: { world: "field", domain: "color", category: "core", busEligible: true }, defaultSource: { value: '#000000' } },
    { portId: 'strokeWidth', label: 'Stroke Width', dir: 'in', type: { world: "field", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 1 } },
    { portId: 'opacity', label: 'Opacity', dir: 'in', type: { world: "signal", domain: "float", category: "core", busEligible: true }, defaultSource: { value: 1.0 } },
  ],
  outputs: [],
  lower: lowerRenderPaths2D,
});

// =============================================================================
// Legacy Closure Compiler (Dual-Emit Mode)
// =============================================================================

export const RenderPaths2DBlock: BlockCompiler = {
  type: 'RenderPaths2D',

  inputs: [
    { name: 'domain', type: { kind: 'Domain' }, required: true },
    { name: 'paths', type: { kind: 'Field:Path' }, required: true },
    { name: 'fillColor', type: { kind: 'Field:color' }, required: true },
    { name: 'strokeColor', type: { kind: 'Field:color' }, required: true },
    { name: 'strokeWidth', type: { kind: 'Field:float' }, required: true },
    { name: 'opacity', type: { kind: 'Signal:float' }, required: true },
  ],

  outputs: [],

  compile() {
    throw new Error('RenderPaths2D is only supported by the IR compiler.');
  },
};
