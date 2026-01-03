/**
 * Editor Public Exports
 *
 * This is the entry point for the editor module.
 */

export { Editor } from './Editor';
export type { RootStore } from './stores';
export { LogStore } from './logStore';
export { LogWindow } from './LogWindow';
export { StatusBadge } from './StatusBadge';
export {
  getBlockDefinitions,
  getBlockDefinition,
  type BlockDefinition,
} from './blocks';
export type {
  Block,
  BlockId,
  BlockType,
  BlockCategory,
  Slot,
  SlotType,
  Patch,
  EditorUIState,
  Template,
} from './types';
export type {
  LogEntry,
  LogLevel,
  LogComponent,
  SystemStatus,
} from './logTypes';
export {
  LOG_LEVELS,
  LOG_LEVEL_CONFIG,
  LOG_COMPONENTS,
  LOG_COMPONENT_CONFIG,
  STATUS_CONFIG,
} from './logTypes';

// Compiler
export * from './compiler';

// Runtime (excluding DrawNode and RenderTree which are re-exported from compiler)
export {
  // Re-export everything except DrawNode and RenderTree to avoid ambiguity
  createPlayer,
  type Player,
  createSvgRenderer,
  type SvgRenderer,
} from './runtime';
export type {
  SvgPathGeom,
  CircleGeom,
  RectGeom,
  Geometry,
  Style,
  Transform2D,
  Transform3D,
  OpacityMulEffect,
  Transform2DEffect,
  Transform3DEffect,
  FilterEffect,
  ClipEffect,
  Effect,
  ShapeNode,
  GroupNode,
  EffectNode,
} from './runtime';

// Components
export { PreviewPanel } from './PreviewPanel';
