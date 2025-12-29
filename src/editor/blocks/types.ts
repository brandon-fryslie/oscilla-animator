import type { BlockForm, BlockSubcategory, Slot, BlockParams, KernelCapability, KernelId, PureCompileKind } from '../types';
import type { CompositeDefinition } from '../composites';

// Re-export types that are used by other modules
export type {
  BlockForm,
  Slot,
  SlotType,
  BlockSubcategory,
  // New types for "Remove Parameters" refactor (Phase 1)
  SlotWorld,
  SlotTier,
  UIControlHint,
  DefaultSource,
  // New types for Capability Enforcement
  Capability,
  KernelCapability,
  KernelId,
  PureCompileKind,
} from '../types';

export type BlockTagValue =
  | string
  | boolean
  | number
  | readonly (string | boolean | number)[];

export type BlockTags = Record<string, BlockTagValue>;

// =============================================================================
// Legacy Parameter Schema Types (DEPRECATED - use defaultSource on inputs instead)
// =============================================================================

/**
 * @deprecated Legacy parameter schema type. Use defaultSource on input slots instead.
 * Kept for backward compatibility with tests only.
 */
export type ParamType = 'number' | 'string' | 'boolean' | 'select' | 'color';

/**
 * @deprecated Legacy parameter schema interface. Use defaultSource on input slots instead.
 * Kept for backward compatibility with tests only.
 */
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

/**
 * Base fields shared by all block definitions.
 */
interface BlockDefinitionBase {
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

  /**
   * @deprecated Legacy parameter schema. Use defaultSource on input slots instead.
   * Kept for backward compatibility with existing code.
   */
  readonly paramSchema?: readonly ParamSchema[];

  /** Color for visual identification */
  readonly color: string;

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
 * Kernel block definition - has kernel capability and kernelId.
 * These blocks have special authority (time/identity/state/render/io).
 */
export interface KernelBlockDefinition extends BlockDefinitionBase {
  /** Kernel capability - one of the five authorities */
  readonly capability: KernelCapability;

  /** Kernel ID - must match type and be in KERNEL_PRIMITIVES */
  readonly kernelId: KernelId;
}

/**
 * Pure block definition - no kernelId allowed.
 * These blocks compile to pure expressions with no special authority.
 */
export interface PureBlockDefinition extends BlockDefinitionBase {
  /** Pure capability marker */
  readonly capability: 'pure';

  /** How this pure block compiles */
  readonly compileKind: PureCompileKind;

  // kernelId is NOT present - enforced by type system
}

/**
 * BlockDefinition discriminated union.
 * Enforces compile-time safety: kernel blocks MUST have kernelId, pure blocks MUST NOT.
 */
export type BlockDefinition = KernelBlockDefinition | PureBlockDefinition;

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

  // Composites have a compositeDefinition
  if (def.compositeDefinition) {
    return 'composite';
  }

  // Everything else is a primitive
  return 'primitive';
}
