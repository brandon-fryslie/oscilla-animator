/**
 * Compositor Middleware
 *
 * Pure, composable effect system for RenderTree transformations.
 *
 * Architecture:
 * - Selection API: Target nodes by id, tag, kind, predicate
 * - TreeRewrite: Pure tree transformations (wrap, replace, insert)
 * - Compositor: Tree→Tree transforms with context
 * - Stack: Compose multiple compositors
 * - Resources: Defs channel for filters, masks, gradients
 *
 * Usage:
 * ```typescript
 * import {
 *   createStack,
 *   applyStack,
 *   scoped,
 *   hasTag,
 *   opacityCompositor,
 * } from './compositor';
 *
 * // Create a compositor that fades tagged nodes
 * const fadeIn = opacityCompositor(
 *   'fade-in',
 *   { selector: hasTag('animated') },
 *   (node, ctx) => Math.min(1, ctx.timeMs / 1000)
 * );
 *
 * // Apply to a tree
 * const result = applyStack(tree, [fadeIn], { timeMs: 500, seed: 42 });
 * ```
 */

// =============================================================================
// Selection API
// =============================================================================

export {
  // Types
  type NodeId,
  type NodePath,
  type NodeRef,
  type SelectionCtx,
  type Selector,
  type SelectionSpec,
  type SelectionQuery,

  // Functions
  find,
  first,
  and,
  or,
  not,
  all,
  none,
  createSelectionQuery,
} from './selection';

// =============================================================================
// Common Selectors
// =============================================================================

export {
  // Basic
  byId,
  byKind,
  hasTag,
  hasAnyTag,
  hasAllTags,
  meta,
  metaEquals,

  // Structural
  atDepth,
  minDepth,
  maxDepth,
  isRoot,
  isLeaf,

  // Kind-specific
  isGroup,
  isShape,
  isEffect,
  geomKind,
  effectKind,

  // Path-based
  underPath,
  childrenOfPath,

  // Context-aware
  whenCtx,
  duringTime,

  // ID collections
  inIdSet,
  inIdList,
} from './selectors';

// =============================================================================
// Tree Adapter
// =============================================================================

export {
  type TreeAdapter,
  drawNodeAdapter,
  isGroupNode,
  isShapeNode,
  isEffectNode,
  childCount,
} from './tree-adapter';

// =============================================================================
// Tree Rewrite
// =============================================================================

export {
  type RewriteCtx,
  type TreeRewrite,
  createTreeRewrite,
  drawNodeRewrite,
} from './rewrite';

// =============================================================================
// Compositor Interface
// =============================================================================

export {
  type CompositorCtx,
  type Compositor,
  type CompositorCapabilities,
  createCompositor,
  scopedCompositor,
  identityCompositor,
} from './compositor';

// =============================================================================
// Stack Runner
// =============================================================================

export {
  type CompositorStack,
  type TreeProgram,
  applyStack,
  runStack,
  createStack,
  concatStacks,
  isStackCssSvgSafe,
  composeProgram,
  composeProgramWithStack,
  withCompositors,
} from './stack';

// =============================================================================
// Scoped Helpers
// =============================================================================

export {
  scoped,
  scopedStyle,
  scopedWrap,
  opacityCompositor,
  transform2DCompositor,
  transform3DCompositor,
} from './scoped';

// =============================================================================
// Resources / Defs Channel
// =============================================================================

export {
  type FilterResource,
  type FilterEffect,
  type MaskResource,
  type GradientResource,
  type GradientStop,
  type Resource,
  type ResourceRegistry,
  type ResourceCtx,
  emptyRegistry,
  addResource,
  mergeRegistries,
  glowFilter,
  dropShadowFilter,
  colorMatrixFilter,
  withResources,
} from './resources';
