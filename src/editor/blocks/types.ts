import type { BlockForm, BlockSubcategory, Slot, BlockParams, LaneKind, LaneFlavor } from '../types';
import type { CompositeDefinition } from '../composites';

// Re-export types that are used by other modules
export type {
  Slot,
  SlotType,
  LaneKind,
  LaneFlavor,
  BlockSubcategory,
  BlockForm,
  // New types for "Remove Parameters" refactor (Phase 1)
  SlotWorld,
  SlotTier,
  UIControlHint,
  DefaultSource,
} from '../types';

export type BlockTagValue =
  | string
  | boolean
  | number
  | readonly (string | boolean | number)[];

export type BlockTags = Record<string, BlockTagValue>;

export interface BlockDefinition {
  /**
   * Flexible map of string tags for organization and filtering.
   * Example: { role: 'input', domain: 'Scene' }
   */
  tags?: BlockTags;

  /** Unique type identifier */
  readonly type: string;

  /** Human-readable label */
  readonly label: string;

  /**
   * Subcategory within form for organization.
   * e.g., 'Sources', 'Fields', 'Timing', 'Spatial', 'Math', etc.
   */
  readonly subcategory?: BlockSubcategory;

  /** Description shown in inspector */
  readonly description: string;

  /** Input slots */
  readonly inputs: readonly Slot[];

  /** Output slots */
  readonly outputs: readonly Slot[];

  /** Default parameter values */
  readonly defaultParams: BlockParams;

  /** Parameter schema for UI generation */
  readonly paramSchema: ParamSchema[];

  /** Color for visual identification */
  readonly color: string;

  // === Lane affinity tags (for palette filtering) ===

  /** Which lane kind this block naturally belongs to */
  readonly laneKind: LaneKind;

  /** Optional flavor hint (motion, timing, style) */
  readonly laneFlavor?: LaneFlavor;

  /** Priority for palette ordering (lower = higher priority, shown first) */
  readonly priority?: number;

  // === Compound-specific fields ===

  /**
   * For composites: the primitive graph that defines this block.
   * For primitives: undefined.
   */
  readonly primitiveGraph?: CompoundGraph;

  /**
   * For composite blocks: store the original composite definition.
   * This is used for compiler integration and parameter resolution.
   */
  readonly compositeDefinition?: CompositeDefinition;

  /**
   * Auto-bus subscriptions: map of input port IDs to bus names.
   * When this block is added, these inputs automatically subscribe to the named buses.
   * Example: { phase: 'phaseA' } means the 'phase' input auto-subscribes to 'phaseA' bus.
   */
  readonly autoBusSubscriptions?: Record<string, string>;

  /**
   * Auto-bus publications: map of output port IDs to bus names.
   * When this block is added, these outputs automatically publish to the named buses.
   * Example: { out: 'energy' } means the 'out' output auto-publishes to 'energy' bus.
   */
  readonly autoBusPublications?: Record<string, string>;
}

/**
 * Defines the internal primitive graph of a compound block.
 * This is how compounds are expressed in terms of primitives.
 */
export interface CompoundGraph {
  /** Internal nodes (primitives) */
  readonly nodes: Record<string, CompoundNode>;

  /** Connections between internal nodes */
  readonly edges: readonly CompoundEdge[];

  /** Maps external inputs to internal nodes */
  readonly inputMap: Record<string, string>;

  /** Maps internal nodes to external outputs */
  readonly outputMap: Record<string, string>;
}

export interface CompoundNode {
  /** Primitive block type */
  readonly type: string;
  /** Parameter overrides */
  readonly params?: Record<string, unknown>;
}

export interface CompoundEdge {
  readonly from: string;  // "nodeId.outputSlot"
  readonly to: string;    // "nodeId.inputSlot"
}
export type ParamType = 'number' | 'string' | 'boolean' | 'select' | 'color';

export interface ParamSchema {
  readonly key: string;
  readonly label: string;
  readonly type: ParamType;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly { value: string; label: string }[];
  readonly defaultValue: unknown;
}

// =============================================================================
// Block Form Derivation
// =============================================================================

/**
 * Derive the form of a block from its structure.
 *
 * Form is NOT stored as metadata - it's derived from how the block is defined:
 * - Macros: type starts with 'macro:' (expand into visible blocks)
 * - Composites: have compositeDefinition (internal graph, single unit in UI)
 * - Primitives: everything else (atomic operations)
 */
export function getBlockForm(def: BlockDefinition): BlockForm {
  // Macros have a 'macro:' prefix by convention
  if (def.type.startsWith('macro:')) {
    return 'macro';
  }

  // Composites have a compositeDefinition (and typically 'composite:' prefix)
  if (def.compositeDefinition != null) {
    return 'composite';
  }

  // Everything else is a primitive
  return 'primitive';
}
