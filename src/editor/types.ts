/**
 * Editor Type Definitions
 *
 * Core types for the unified animation editor.
 * These types are loosely coupled to V4 kernel types - editor has its own
 * type system that compiles to V4 primitives.
 */

// Re-export type helpers for convenience
export * from './types/helpers';
export * from './types/dnd';

// Import default source attachment types
import type { DefaultSourceAttachment } from './defaultSources/types';

// Import types used locally in this file
import type {
  TypeDesc,
  CoreDomain,
  Domain,
} from '../core/types';


// =============================================================================
// Unified Type System (Re-exported from Core)
// =============================================================================

/**
 * The editor uses the unified type system defined in src/core/types.ts.
 * This ensures consistent TypeDesc contracts across editor and compiler.
 *
 * Sprint: Type Contracts + IR Plumbing (2025-12-31)
 * References:
 * - .agent_planning/type-contracts-ir-plumbing/DOD-2025-12-31-045033.md
 * - .agent_planning/type-contracts-ir-plumbing/PLAN-2025-12-31-045033.md
 */

// Re-export unified type system from core
export type {
  TypeWorld,
  CoreDomain,
  InternalDomain,
  Domain,
  TypeCategory,
  TypeDesc,
} from '../core/types';

export { getTypeArity, inferBundleLanes, createTypeDesc } from '../core/types';

/**
 * Kernel capabilities - the five authorities that define primitives.
 * These represent the different kinds of "special powers" a block can have.
 *
 * Only blocks listed in KERNEL_PRIMITIVES may claim non-pure capabilities.
 */
export type KernelCapability = 'time' | 'identity' | 'state' | 'render' | 'io';

/**
 * Block compiler interface.
 * Each block must implement a compiler to generate IR.
 */
export type BlockCompiler = {
  /**
   * Compile this block to IR.
   * @param block - The block to compile
   * @param builder - The IR builder to use
   */
  compile(
    block: Block,
    builder: unknown, // Will be typed as IRBuilder when available
    ctx: unknown,     // Will be typed as CompileContext when available
  ): void;
};

// =============================================================================
// Patch State
// =============================================================================

/**
 * A Patch is the root container for an animation.
 * It contains blocks, buses, and a time model.
 */
export interface Patch {
  /** Unique identifier */
  readonly id: string;

  /** Human-readable name */
  name: string;

  /** All blocks in this patch */
  blocks: Map<string, Block>;

  /** All buses in this patch */
  buses: Map<string, Bus>;

  /** Time model (infinite or bounded) */
  timeModel: TimeModel;
}

// =============================================================================
// Bus System
// =============================================================================

/**
 * A Bus is a shared communication channel between blocks.
 * Multiple blocks can publish to a bus, and subscribers receive the combined value.
 */
export interface Bus {
  /** Unique identifier for this bus */
  readonly id: string;

  /** Human-readable name */
  name: string;

  /** Type descriptor for this bus */
  readonly type: TypeDesc;

  /** How to combine multiple publishers */
  combineMode: BusCombineMode;

  /** Default value when no publishers (typed by domain) */
  defaultValue: unknown;

  /** Sort key for deterministic publisher ordering */
  sortKey: number;
}

/**
 * How to combine multiple publishers on a bus.
 */
export type BusCombineMode =
  | 'sum'      // Add all publisher values
  | 'mult'     // Multiply all publisher values
  | 'min'      // Take minimum
  | 'max'      // Take maximum
  | 'last';    // Last publisher wins (deterministic by sortKey)

// =============================================================================
// Time Model
// =============================================================================

/**
 * Time model for a patch.
 */
export type TimeModel =
  | { kind: 'infinite' }  // No wrapping, infinite timeline
  | { kind: 'loop'; durationMs: number };  // Loop after durationMs

// =============================================================================
// Block System
// =============================================================================

/**
 * A Block is a node in the signal flow graph.
 * Blocks have inputs (slots) and outputs (slots).
 */
export interface Block {
  /** Unique identifier */
  readonly id: string;

  /** Block type (determines behavior) */
  readonly kind: string;

  /** Human-readable name */
  name: string;

  /** Input slots */
  readonly inputs: Map<string, Slot>;

  /** Output slots */
  readonly outputs: Map<string, Slot>;

  /** Configuration parameters (block-specific) */
  params: Map<string, ParamValue>;

  /** Kernel capabilities this block requires */
  readonly capabilities?: readonly KernelCapability[];

  /** Position in editor UI */
  position: { x: number; y: number };

  /** Default source attachment (if any) */
  defaultSourceAttachment?: DefaultSourceAttachment;
}

/**
 * A Slot is an input or output on a block.
 * Slots have a type and may be connected to other slots via links.
 */
export interface Slot {
  /** Unique identifier (within the block) */
  readonly id: string;

  /** Human-readable name */
  name: string;

  /** Direction: input or output */
  readonly direction: 'input' | 'output';

  /** Type descriptor for this slot */
  readonly type: TypeDesc;

  /** Whether this slot must be connected */
  required: boolean;

  /** Default value (for optional inputs) */
  defaultValue?: unknown;
}

/**
 * A Link connects two slots (an output to an input).
 */
export interface Link {
  /** Unique identifier */
  readonly id: string;

  /** Source block ID */
  readonly sourceBlockId: string;

  /** Source slot ID (within source block) */
  readonly sourceSlotId: string;

  /** Target block ID */
  readonly targetBlockId: string;

  /** Target slot ID (within target block) */
  readonly targetSlotId: string;
}

/**
 * Parameter value types.
 */
export type ParamValue =
  | number
  | string
  | boolean
  | { kind: 'dropdown'; value: string }
  | { kind: 'curve'; points: Array<{ x: number; y: number }> }
  | { kind: 'json'; value: unknown };

// =============================================================================
// Block Definitions
// =============================================================================

/**
 * A BlockDefinition describes a block type (what it does, what slots it has).
 */
export interface BlockDefinition {
  /** Block type identifier */
  readonly kind: string;

  /** Category for UI grouping */
  readonly category: string;

  /** Human-readable name */
  readonly name: string;

  /** Description for documentation */
  readonly description: string;

  /** Kernel capabilities required */
  readonly capabilities?: readonly KernelCapability[];

  /** Input slot definitions */
  readonly inputs: readonly SlotDefinition[];

  /** Output slot definitions */
  readonly outputs: readonly SlotDefinition[];

  /** Parameter definitions */
  readonly params: readonly ParamDefinition[];

  /** Compiler for this block type */
  readonly compiler: BlockCompiler;
}

/**
 * Definition of a slot (input or output).
 */
export interface SlotDefinition {
  /** Slot identifier (unique within block) */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Type descriptor */
  readonly type: TypeDesc;

  /** Whether this slot must be connected */
  readonly required: boolean;

  /** Default value (for optional inputs) */
  readonly defaultValue?: unknown;
}

/**
 * Definition of a parameter.
 */
export interface ParamDefinition {
  /** Parameter identifier (unique within block) */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Parameter type */
  readonly type: 'number' | 'string' | 'boolean' | 'dropdown' | 'curve' | 'json';

  /** Default value */
  readonly defaultValue: ParamValue;

  /** Options (for dropdown type) */
  readonly options?: readonly string[];

  /** Validation constraints */
  readonly constraints?: {
    min?: number;
    max?: number;
    step?: number;
    pattern?: string;
  };
}

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Context passed to signal functions during execution.
 */
export interface ExecutionContext {
  /** Current time in milliseconds */
  readonly t: number;

  /** Time model (for phase calculation) */
  readonly timeModel: TimeModel;

  /** Element index (for field evaluation) */
  readonly elementIndex?: number;

  /** Total element count (for field evaluation) */
  readonly elementCount?: number;
}

// =============================================================================
// Kernel Registry
// =============================================================================

/**
 * Primitive blocks with special kernel powers.
 * Only these blocks may claim non-pure capabilities.
 */
export const KERNEL_PRIMITIVES = new Set([
  'TimeRoot',
  'Identity',
  'StateBlock',
  'RenderSink',
  'IOBlock',
]);

// =============================================================================
// Validation
// =============================================================================

/**
 * Validation error.
 */
export interface ValidationError {
  /** Error severity */
  severity: 'error' | 'warning';

  /** Error message */
  message: string;

  /** Block ID (if error is block-specific) */
  blockId?: string;

  /** Slot ID (if error is slot-specific) */
  slotId?: string;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Errors and warnings */
  errors: ValidationError[];
}

// =============================================================================
// Editor State
// =============================================================================

/**
 * Editor selection state.
 */
export interface SelectionState {
  /** Selected block IDs */
  selectedBlocks: Set<string>;

  /** Selected link IDs */
  selectedLinks: Set<string>;
}

/**
 * Editor viewport state.
 */
export interface ViewportState {
  /** Pan offset */
  offset: { x: number; y: number };

  /** Zoom level (1.0 = 100%) */
  zoom: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a domain is a core domain (user-facing).
 */
export function isCoreDomain(domain: Domain): domain is CoreDomain {
  const coreDomains: readonly CoreDomain[] = [
    'float',
    'int',
    'vec2',
    'vec3',
    'color',
    'boolean',
    'time',
    'rate',
    'trigger',
  ];
  return coreDomains.includes(domain as CoreDomain);
}

/**
 * Check if two type descriptors are compatible for assignment.
 */
export function areTypesCompatible(source: TypeDesc, target: TypeDesc): boolean {
  // Exact match
  if (source.world === target.world && source.domain === target.domain) {
    return true;
  }

  // Auto-promotion rules
  // Signal can be broadcast to Field (via broadcastSig)
  if (source.world === 'signal' && target.world === 'field' && source.domain === target.domain) {
    return true;
  }

  // Scalar can be lifted to Signal (via const)
  if (source.world === 'scalar' && target.world === 'signal' && source.domain === target.domain) {
    return true;
  }

  // No other auto-conversions
  return false;
}

/**
 * Check if a type is bus-eligible (can be published/subscribed).
 */
export function isBusEligible(type: TypeDesc): boolean {
  return type.busEligible;
}

/**
 * Get the runtime arity (number of scalar lanes) for a type.
 */
export function getRuntimeArity(type: TypeDesc): number {
  if (type.lanes) {
    return type.lanes.reduce((sum, count) => sum + count, 0);
  }
  // Default to 1 for scalar types
  return 1;
}
