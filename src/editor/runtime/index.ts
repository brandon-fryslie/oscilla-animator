/**
 * Runtime Module Exports
 *
 * The execution substrate for animations:
 * - RenderTree types and helpers (SVG)
 * - Canvas RenderTree types (Canvas 2D)
 * - Player (RAF loop, hot swap, scrubbing)
 * - SvgRenderer (keyed reconciliation)
 * - Canvas2DRenderer (command execution)
 */

// SVG RenderTree types and helpers
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
  RenderTree as SvgRenderTree,
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

// Canvas 2D Renderer
export {
  Canvas2DRenderer,
  createCanvasRenderer,
  type RenderStats,
} from './canvasRenderer';

// Canvas Render Commands and Types
export type {
  // Core types
  ColorRGBA,
  BlendMode,
  Transform2D as CanvasTransform2D,
  Style2D,
  Glyph2D,

  // Commands
  RenderCmd,
  ClearCommand,
  GroupCommand,
  Instances2DCommand,
  Path2DCommand,

  // RenderTree for Canvas
  RenderTree,
} from './renderCmd';

export {
  // Transform helpers
  IDENTITY_TRANSFORM,
  transformFromPosScale,
  transformFromPosRotScale,

  // Color helpers
  packRGBA,
  unpackRGBA,
  unpackToColorRGBA,
  colorToCss,
  parseColor,
} from './renderCmd';
