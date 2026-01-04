import type {
  BlockForm,
  BlockSubcategory,
  Slot,
  BlockParams,
  KernelCapability,
  PureCompileKind,
  SlotType,
  SlotDef,
  UIControlHint,
  SlotWorld,
  SlotTier,
  DefaultSource,
  Capability,
} from '../types';
import type { KERNEL_PRIMITIVES } from './kernel-primitives';

// =============================================================================
// Block-Specific Type Overrides
// =============================================================================

/**
 * KernelId - derived from KERNEL_PRIMITIVES keys.
 * This overrides the generic string type from ../types to provide
 * compile-time safety for kernel primitive names.
 */
export type KernelId = keyof typeof KERNEL_PRIMITIVES;

// Re-export types that are used by other modules
export type {
  BlockForm,
  Slot,
  SlotType,
  BlockSubcategory,
  SlotDef,
  UIControlHint,
  // New types for "Remove Parameters" refactor (Phase 1)
  SlotWorld,
  SlotTier,
  DefaultSource,
  // New types for Capability Enforcement
  Capability,
  KernelCapability,
  PureCompileKind,
};

export type BlockTagValue =
  | string
  | boolean
  | number
  | readonly (string | boolean | number)[];

export type BlockTags = Record<string, BlockTagValue>;

// =============================================================================
// Parameter Schema Types (for exposed params)
// =============================================================================

/**
 * Parameter types for UI generation.
 */
export type ParamType = 'number' | 'string' | 'boolean' | 'select' | 'color';

/**
 * Parameter schema for exposed parameters.
 * Defines the type and constraints for a user-editable parameter.
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
   * Parameter schema for exposed params.
   * For primitive blocks, params are typically derived from input slots with defaultSource.
   */
  readonly paramSchema?: readonly ParamSchema[];

  /** Color for visual identification */
  readonly color: string;

  /** Priority for palette ordering (lower = higher priority, shown first) */
  readonly priority?: number;

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
  readonly autoBusPublications?: Record<string, string | string[]>;
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

// =============================================================================
// Block Form Derivation
// =============================================================================

/**
 * Derive the form of a block from its structure.
 *
 * Form is NOT stored as metadata - it's derived from how the block is defined:
 * - Macros: type starts with 'macro:' (expand into visible blocks)
 * - Primitives: everything else (atomic operations)
 */
export function getBlockForm(def: BlockDefinition): BlockForm {
  // Macros have a 'macro:' prefix by convention
  if (def.type.startsWith('macro:')) {
    return 'macro';
  }

  // Everything else is a primitive
  return 'primitive';
}
