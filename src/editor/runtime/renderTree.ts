/**
 * RenderTree Types
 *
 * The semantic intermediate representation for all animations.
 * This is what archetypes + compositors compile to.
 *
 * Key invariants:
 * - node.id must be stable across frames (no time in IDs)
 * - Effects compose: opacity multiplies, transforms concatenate
 * - Renderer never needs to understand animation intent
 */

// =============================================================================
// Geometry Types
// =============================================================================

export interface SvgPathGeom {
  kind: 'svgPath';
  d: string;
}

export interface CircleGeom {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface RectGeom {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
  ry?: number;
}

export type Geometry = SvgPathGeom | CircleGeom | RectGeom;

// =============================================================================
// Style Types
// =============================================================================

export interface Style {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  strokeDasharray?: string;
  strokeDashoffset?: number;
  opacity?: number;
  filter?: string;
}

// =============================================================================
// Transform Types
// =============================================================================

export interface Transform2D {
  translate?: { x: number; y: number };
  rotate?: number; // degrees
  scale?: number | { x: number; y: number };
  origin?: { x: number; y: number };
}

export interface Transform3D {
  translate?: { x: number; y: number; z: number };
  rotate?: { x: number; y: number; z: number }; // degrees per axis
  scale?: number | { x: number; y: number; z: number };
  perspective?: number;
  origin?: { x: number; y: number };
}

// =============================================================================
// Effect Types
// =============================================================================

export interface OpacityMulEffect {
  kind: 'opacityMul';
  mul: number;
}

export interface Transform2DEffect {
  kind: 'transform2d';
  transform: Transform2D;
}

export interface Transform3DEffect {
  kind: 'transform3d';
  transform: Transform3D;
}

export interface FilterEffect {
  kind: 'filter';
  filter: string; // CSS filter string
}

export interface ClipEffect {
  kind: 'clip';
  clipPath: string; // SVG clip-path
}

/**
 * Deform effect - semantic node for wave ripple, etc.
 * Renderer may approximate or lower to different representation.
 */
export interface DeformEffect {
  kind: 'deform';
  deformType: 'wave' | 'ripple' | 'custom';
  params: Record<string, number>;
}

export type Effect =
  | OpacityMulEffect
  | Transform2DEffect
  | Transform3DEffect
  | FilterEffect
  | ClipEffect
  | DeformEffect;

// =============================================================================
// DrawNode Types
// =============================================================================

export interface GroupNode {
  kind: 'group';
  id: string;
  children: readonly DrawNode[];
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}

export interface ShapeNode {
  kind: 'shape';
  id: string;
  geom: Geometry;
  style?: Style;
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}

export interface EffectNode {
  kind: 'effect';
  id: string;
  effect: Effect;
  child: DrawNode;
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}

export type DrawNode = GroupNode | ShapeNode | EffectNode;

/**
 * RenderTree is the root of the render hierarchy.
 * Typically a group node at the top level.
 */
export type RenderTree = DrawNode;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a group node.
 */
export function group(
  id: string,
  children: DrawNode[],
  opts?: { tags?: string[]; meta?: Record<string, unknown> }
): GroupNode {
  return {
    kind: 'group',
    id,
    children,
    tags: opts?.tags,
    meta: opts?.meta,
  };
}

/**
 * Create a shape node with SVG path.
 */
export function path(
  id: string,
  d: string,
  style?: Style,
  opts?: { tags?: string[]; meta?: Record<string, unknown> }
): ShapeNode {
  return {
    kind: 'shape',
    id,
    geom: { kind: 'svgPath', d },
    style,
    tags: opts?.tags,
    meta: opts?.meta,
  };
}

/**
 * Create a shape node with circle.
 */
export function circle(
  id: string,
  cx: number,
  cy: number,
  r: number,
  style?: Style,
  opts?: { tags?: string[]; meta?: Record<string, unknown> }
): ShapeNode {
  return {
    kind: 'shape',
    id,
    geom: { kind: 'circle', cx, cy, r },
    style,
    tags: opts?.tags,
    meta: opts?.meta,
  };
}

/**
 * Wrap a node with an opacity effect.
 */
export function withOpacity(id: string, mul: number, child: DrawNode): EffectNode {
  return {
    kind: 'effect',
    id,
    effect: { kind: 'opacityMul', mul },
    child,
  };
}

/**
 * Wrap a node with a transform2d effect.
 */
export function withTransform2D(
  id: string,
  transform: Transform2D,
  child: DrawNode
): EffectNode {
  return {
    kind: 'effect',
    id,
    effect: { kind: 'transform2d', transform },
    child,
  };
}

/**
 * Wrap a node with a transform3d effect.
 */
export function withTransform3D(
  id: string,
  transform: Transform3D,
  child: DrawNode
): EffectNode {
  return {
    kind: 'effect',
    id,
    effect: { kind: 'transform3d', transform },
    child,
  };
}
