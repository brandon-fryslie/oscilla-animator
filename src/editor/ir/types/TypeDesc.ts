/**
 * Unified Type Descriptors for IR
 *
 * This module provides the canonical type system for the IR compiler.
 * It bridges the gap between editor types and compiler types.
 *
 * ## Authoring vs Storage Types
 *
 * TypeDesc represents **authoring-time semantics**: what does this value mean
 * in the creative context? Examples: field<color>, signal<vec2>, scalar<number>
 *
 * For physical storage layouts (how values are encoded in buffers), see:
 * @see BufferDesc - Storage-time encodings (u8x4 premul RGBA, f32x2 LE, etc.)
 *
 * This separation prevents semantic types from leaking into physical storage:
 * - TypeDesc = "what does this value mean?" (semantic, authoring)
 * - BufferDesc = "how is this value stored?" (physical, runtime)
 *
 * **Example:**
 * - Authoring: `field<color>` (TypeDesc: world=field, domain=color)
 * - Storage: `linear_premul_rgba8` (ColorBufferDesc: u8x4, premultiplied, linear)
 *
 * The same TypeDesc may materialize to different BufferDescs depending on context
 * (e.g., field<color> → u8x4 for rendering, f32x4 for HDR export).
 *
 * @module ir/types/TypeDesc
 */

// =============================================================================
// Type Worlds
// =============================================================================

/**
 * Type world categories.
 * - signal: Continuous time-indexed values (evaluated once per frame)
 * - event: Discrete impulses/triggers (sparse, edge-triggered)
 * - field: Per-element values (lazy, evaluated at render sinks)
 * - scalar: Compile-time constants
 * - config: Configuration values (not runtime)
 */
export type TypeWorld = 'signal' | 'event' | 'field' | 'scalar' | 'config';

// =============================================================================
// Type Domains
// =============================================================================

/**
 * Core domains - user-facing creative vocabulary.
 * These are bus-eligible and part of the learnable API.
 */
export type CoreDomain =
  | 'number'    // Numeric values
  | 'vec2'      // 2D positions/vectors
  | 'color'     // Color values
  | 'boolean'   // True/false values
  | 'time'      // Time values (with unit: 'ms' or 'seconds')
  | 'phase01'   // Phase values [0,1] (normalized phase)
  | 'phase'     // Phase values [0,1]
  | 'rate'      // Rate/multiplier values
  | 'trigger';  // Pulse/event signals

/**
 * Internal domains - engine plumbing, not bus-eligible.
 */
export type InternalDomain =
  | 'point'        // Point semantics (vec2 with position meaning)
  | 'duration'     // Duration semantics
  | 'hsl'          // HSL color space
  | 'path'         // Path data
  | 'wobble'       // Wobble modulator config
  | 'spiral'       // Spiral modulator config
  | 'wave'         // Wave modulator config
  | 'jitter'       // Jitter modulator config
  | 'program'      // Compiled program
  | 'renderTree'   // Render tree output
  | 'renderNode'   // Single render node
  | 'filterDef'    // SVG filter definition
  | 'strokeStyle'  // Stroke configuration
  | 'elementCount' // Number of elements
  | 'scene'        // Scene data
  | 'sceneTargets' // Scene target points
  | 'sceneStrokes' // Scene stroke paths
  | 'event'        // Generic events
  | 'string'       // String values
  | 'bounds'       // Bounding box
  | 'spec'         // Spec types
  | 'domain'       // Domain type (for Domain blocks)
  | 'render'       // Generic render type
  | 'expression'   // DSL expression values (FieldFromExpression)
  | 'waveform'     // Waveform shape selection for oscillators (sine, cosine, triangle, saw)
  | 'unknown';     // Unknown/fallback type

/**
 * All domains (core + internal).
 */
export type TypeDomain = CoreDomain | InternalDomain;

// =============================================================================
// Type Categories
// =============================================================================

/**
 * Category for type filtering.
 * - core: User-facing types, bus-eligible
 * - internal: Engine plumbing, not bus-eligible
 */
export type TypeCategory = 'core' | 'internal';

// =============================================================================
// Type Descriptor
// =============================================================================

/**
 * Canonical type descriptor for the IR type system.
 * All properties are readonly for immutability.
 */
export interface TypeDesc {
  /** World: signal=continuous time, field=per-element, scalar=constant */
  readonly world: TypeWorld;

  /** Domain: what type of value */
  readonly domain: TypeDomain;

  /** Category: core (user-facing) or internal (engine) */
  readonly category?: TypeCategory;

  /** Whether this type can be used for buses */
  readonly busEligible?: boolean;

  /** Optional semantic information for precise matching (e.g., 'point', 'velocity') */
  readonly semantics?: string;

  /** Optional unit information (e.g., 'ms', 'seconds', 'px') */
  readonly unit?: string;
}

// =============================================================================
// Internal Domain Set
// =============================================================================

const INTERNAL_DOMAINS: ReadonlySet<TypeDomain> = new Set<TypeDomain>([
  'point', 'duration', 'hsl', 'path', 'wobble', 'spiral', 'wave', 'jitter',
  'program', 'renderTree', 'renderNode', 'filterDef', 'strokeStyle',
  'elementCount', 'scene', 'sceneTargets', 'sceneStrokes', 'event',
  'string', 'bounds', 'spec', 'domain', 'render', 'expression', 'waveform', 'unknown'
]);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the category of a type based on its domain.
 * Core domains are user-facing, internal domains are engine plumbing.
 *
 * @param type - The type descriptor
 * @returns 'core' or 'internal'
 */
export function getTypeCategory(type: TypeDesc): TypeCategory {
  if (type.category !== undefined) {
    return type.category;
  }
  return INTERNAL_DOMAINS.has(type.domain) ? 'internal' : 'core';
}

/**
 * Determine if a type is eligible for bus publication.
 * Only core types with signal or field world are bus-eligible.
 *
 * @param type - The type descriptor
 * @returns true if the type can be published to buses
 */
export function isBusEligible(type: TypeDesc): boolean {
  if (type.busEligible !== undefined) {
    return type.busEligible;
  }
  // Config and unknown worlds are never bus-eligible
  if (type.world === 'config') return false;
  // Only core types are bus-eligible
  return getTypeCategory(type) === 'core';
}

/**
 * Check structural equality of two type descriptors.
 * Compares world, domain, and semantics. Ignores category and busEligible
 * (which are derived) and unit (which is metadata).
 *
 * @param a - First type descriptor
 * @param b - Second type descriptor
 * @returns true if types are structurally equal
 */
export function typeEquals(a: TypeDesc, b: TypeDesc): boolean {
  if (a.world !== b.world) return false;
  if (a.domain !== b.domain) return false;
  // Treat undefined and null semantics as equal
  const aSem = a.semantics ?? null;
  const bSem = b.semantics ?? null;
  return aSem === bSem;
}

/**
 * Check if a type can be connected from source to target.
 * Handles promotions (scalar→signal, signal→field) and special cases.
 *
 * @param from - Source type descriptor
 * @param to - Target type descriptor
 * @returns true if connection is compatible
 */
export function isCompatible(from: TypeDesc, to: TypeDesc): boolean {
  // Exact match (world + domain)
  if (from.world === to.world && from.domain === to.domain) {
    return true;
  }

  // Scalar can promote to Signal (same domain)
  if (from.world === 'scalar' && to.world === 'signal' && from.domain === to.domain) {
    return true;
  }

  // Signal can broadcast to Field (same domain)
  if (from.world === 'signal' && to.world === 'field' && from.domain === to.domain) {
    return true;
  }

  // Scalar can also broadcast to Field via signal promotion
  if (from.world === 'scalar' && to.world === 'field' && from.domain === to.domain) {
    return true;
  }

  // Special case: point and vec2 are compatible
  if ((from.domain === 'point' && to.domain === 'vec2') ||
      (from.domain === 'vec2' && to.domain === 'point')) {
    // Must still match world or follow promotion rules
    if (from.world === to.world) return true;
    if (from.world === 'scalar' && to.world === 'signal') return true;
    if (from.world === 'signal' && to.world === 'field') return true;
    if (from.world === 'scalar' && to.world === 'field') return true;
  }

  // Special case: phase and phase01 are compatible (aliases)
  if ((from.domain === 'phase' && to.domain === 'phase01') ||
      (from.domain === 'phase01' && to.domain === 'phase')) {
    // Must still match world or follow promotion rules
    if (from.world === to.world) return true;
    if (from.world === 'scalar' && to.world === 'signal') return true;
    if (from.world === 'signal' && to.world === 'field') return true;
    if (from.world === 'scalar' && to.world === 'field') return true;
  }

  // Special case: renderTree, renderNode, render are compatible
  const renderTypes: TypeDomain[] = ['renderTree', 'renderNode', 'render'];
  if (renderTypes.includes(from.domain) && renderTypes.includes(to.domain)) {
    if (from.world === to.world) return true;
  }

  // Special case: sceneTargets can flow to vec2/point
  if (from.domain === 'sceneTargets' && (to.domain === 'vec2' || to.domain === 'point')) {
    if (from.world === to.world) return true;
  }

  return false;
}

/**
 * Create a TypeDesc with defaults filled in.
 *
 * @param partial - Partial type descriptor (world and domain required)
 * @returns Complete type descriptor with derived fields
 */
export function createTypeDesc(partial: {
  world: TypeWorld;
  domain: TypeDomain;
  semantics?: string;
  unit?: string;
}): TypeDesc {
  const category = INTERNAL_DOMAINS.has(partial.domain) ? 'internal' : 'core';
  const busEligible = partial.world !== 'config' && category === 'core';

  return {
    world: partial.world,
    domain: partial.domain,
    category,
    busEligible,
    semantics: partial.semantics,
    unit: partial.unit,
  };
}
