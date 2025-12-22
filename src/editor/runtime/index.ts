/**
 * Runtime Module Exports
 *
 * The execution substrate for animations:
 * - RenderTree types and helpers
 * - Player (RAF loop, hot swap, scrubbing)
 * - SvgRenderer (keyed reconciliation)
 */

// RenderTree types and helpers
export type {
  // Geometry
  SvgPathGeom,
  CircleGeom,
  RectGeom,
  Geometry,

  // Style
  Style,

  // Transform
  Transform2D,
  Transform3D,

  // Effects
  OpacityMulEffect,
  Transform2DEffect,
  Transform3DEffect,
  FilterEffect,
  ClipEffect,
  DeformEffect,
  Effect,

  // Nodes
  GroupNode,
  ShapeNode,
  EffectNode,
  DrawNode,
  RenderTree,
} from './renderTree';

export {
  group,
  path,
  circle,
  withOpacity,
  withTransform2D,
  withTransform3D,
} from './renderTree';

// Player
export {
  Player,
  createPlayer,
  type PlayState,
  type PlayerOptions,
  type ProgramFactory,
  type Scene,
} from './player';

// Re-export time model types from compiler for convenience
export type { CuePoint, TimeModel, FiniteTimeModel, CyclicTimeModel, InfiniteTimeModel } from '../compiler/types';

// SVG Renderer
export {
  SvgRenderer,
  createSvgRenderer,
  createSvgRendererWithElement,
  transform2dToSvg,
  transform3dToCss,
} from './svgRenderer';
