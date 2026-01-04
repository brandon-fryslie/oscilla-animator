// =============================================================================
// Core Animation Types
// =============================================================================

import type { Observable } from './core/Observable';
import type { CoreDomain } from '../core/types';

/**
 * Unique identifier for a patch.
 * Phase 1: Simple UUIDs. Phase 3+: Content-addressed hashes for immutability.
 */
export type PatchId = string;

// =============================================================================
// Time and Timing
// =============================================================================

/**
 * Unbounded time in seconds.
 * Player time is monotonically increasing, never wraps.
 * Looping is topological (in the graph), not temporal (in the time value).
 */
export type Time = number;

/**
 * Duration in seconds.
 */
export type Duration = number;

/**
 * Frequency in Hz (cycles per second).
 */
export type Frequency = number;

/**
 * Phase offset in radians [0, 2π).
 */
export type Phase = number;

// =============================================================================
// Type System (Slot Types)
// =============================================================================

/**
 * TypeDesc - describes the domain/world of a value.
 *
 * This is a placeholder for the eventual type system.
 * Phase 1: String-based, loose.
 * Phase 3: Branded types, static verification.
 */
export type TypeDesc = string; // e.g., 'Number', 'Vec2', 'Field<Number>', 'Signal<Vec2>'

/**
 * TypeWorld - world classification for values (signal, field, scalar, config).
 * Re-exported from ir/types/TypeDesc.ts for convenience.
 */
export type { TypeWorld } from './ir/types/TypeDesc';

/**
 * Domain - type domain classification.
 * Re-exported from compiler types for convenience.
 */
export type { Domain } from './compiler/unified/Domain';

// =============================================================================
// UI Hints (for block configuration)
// =============================================================================

/**
 * UI control hints for the editor.
 * These are editor-only metadata, not used by runtime.
 *
 * This is a discriminated union matching the IR definition.
 */
export type UIControlHint =
  | UIControlHintSlider
  | UIControlHintNumber
  | UIControlHintSelect
  | UIControlHintColor
  | UIControlHintBoolean
  | UIControlHintText
  | UIControlHintXY;

/** Slider control */
export interface UIControlHintSlider {
  kind: "slider";
  min: number;
  max: number;
  step: number;
}

/** Number input control */
export interface UIControlHintNumber {
  kind: "number";
  min?: number;
  max?: number;
  step?: number;
}

/** Select/dropdown control */
export interface UIControlHintSelect {
  kind: "select";
  options: { value: string; label: string }[];
}

/** Color picker control */
export interface UIControlHintColor {
  kind: "color";
}

/** Boolean toggle control */
export interface UIControlHintBoolean {
  kind: "boolean";
}

/** Text input control */
export interface UIControlHintText {
  kind: "text";
}

/** XY pad control */
export interface UIControlHintXY {
  kind: "xy";
}

// =============================================================================
// Lens System Types
// =============================================================================

/**
 * LensDefinition - simple lens representation for UI/serialization.
 * Contains just the lens type and its parameter values.
 */
export interface LensDefinition {
  readonly type: string;
  readonly params: Record<string, unknown>;
}

/**
 * LensParamBinding - how a lens parameter gets its value.
 * - literal: Direct value embedded in the lens
 * - default: Reference to a default source (deprecated, for backward compat)
 */
export type LensParamBinding =
  | { readonly kind: 'literal'; readonly value: unknown }
  | { readonly kind: 'default'; readonly defaultSourceId: string };

/**
 * LensInstance - a transformation function with metadata and parameter bindings.
 * Used in transform chains to modify values flowing through edges.
 *
 * This is the compiled form of a LensDefinition with resolved parameter bindings.
 */
export interface LensInstance {
  /** Lens type identifier (references transform registry) */
  readonly lensId: string;
  /** Parameter bindings (how each parameter gets its value) */
  readonly params: Record<string, LensParamBinding>;
  /** Whether this lens is enabled */
  readonly enabled?: boolean;
  /** Sort key for ordering in lens chains */
  readonly sortKey?: number;
}

// Re-export CoreDomain for convenience
export type { CoreDomain };

// =============================================================================
// Adapter System Types
// =============================================================================

/**
 * AdapterStep - type conversion in a transform chain.
 */
export interface AdapterStep {
  readonly kind: 'adapter';
  readonly from: TypeDesc;
  readonly to: TypeDesc;
  readonly adapter: string; // adapter function name (legacy)
  readonly adapterId?: string; // new unified field
  readonly params?: Record<string, unknown>; // adapter parameters
}
/**
 * Adapter policy levels.
 * Determines when an adapter can be automatically inserted.
 */
export type AdapterPolicy = 'AUTO' | 'SUGGEST' | 'EXPLICIT' | 'FORBIDDEN';

/**
 * Adapter cost (lower is better).
 * Used for pathfinding when multiple adapter chains are possible.
 */
export type AdapterCost = number;


// =============================================================================
// Bus System Types
// =============================================================================

/**
 * BusId - unique identifier for a global bus.
 */
export type BusId = string;

/**
 * Combine mode for bus subscribers.
 */
export type CombineMode =
  | 'last'      // Last value wins
  | 'first'     // First value wins
  | 'sum'       // Numeric sum
  | 'average'   // Numeric average
  | 'max'       // Numeric maximum
  | 'min';      // Numeric minimum

/**
 * CombinePolicy - legacy type for bus combination policy.
 * @deprecated Use CombineMode instead
 */
export type CombinePolicy = CombineMode;

/**
 * Bus - global signal distribution point.
 * Publishers send values, subscribers receive combined value.
 */
export interface Bus {
  readonly id: BusId;
  name: string;
  type: TypeDesc;
  combineMode: CombineMode;
  defaultValue?: unknown;
}

// =============================================================================
// Macro System Types
// =============================================================================

/**
 * Macro binding - connects macro parameter to internal block port.
 */
export interface MacroBinding {
  /** Parameter name in macro signature */
  paramName: string;
  /** Target block ID within the macro */
  targetBlockId: string;
  /** Target slot ID on that block */
  targetSlotId: string;
}

/**
 * Macro output binding - connects internal block port to macro output.
 */
export interface MacroOutputBinding {
  /** Output name in macro signature */
  outputName: string;
  /** Source block ID within the macro */
  sourceBlockId: string;
  /** Source slot ID on that block */
  sourceSlotId: string;
}

// =============================================================================
// Slot Definitions (Block I/O)
// =============================================================================

/**
 * Direction of a slot (input or output).
 */
export type SlotDirection = 'input' | 'output';

/**
 * World classification for slots.
 * Determines evaluation timing and hot-swap behavior.
 */
export type SlotWorld =
  | 'signal'    // Time-indexed, continuous, per-frame evaluation
  | 'field'     // Per-element, lazy, bulk evaluation
  | 'scalar'    // Compile-time constant (for domain size, seed, etc.)
  | 'config';   // Compile-time selection (enum/bool), stepwise changes only

/**
 * UI presentation tier for inputs.
 * Controls visibility and layout in Inspector.
 */
export type SlotTier =
  | 'primary'    // Always visible on block face
  | 'secondary'; // Tucked under "More" / "Advanced"

/**
 * DefaultSource - default value definition for an input slot.
 * Represents the implicit constant value when nothing is connected.
 */
export interface DefaultSource {
  /** The constant value (typed per SlotType) */
  readonly value: unknown;
  /** UI control metadata for inline editing */
  readonly uiHint?: UIControlHint;
  /** World classification */
  readonly world?: SlotWorld;
  /** Range hint for numeric controls */
  readonly rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
}

/**
 * Slot - defines a block's input or output port.
 * This is the interface expected by blocks/types.ts and other parts of the codebase.
 *
 * Note: This is aliased to SlotDef for backward compatibility.
 */
export interface Slot {
  readonly id: string;
  readonly label: string;
  readonly type: TypeDesc;
  readonly direction: SlotDirection;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
  readonly uiHint?: UIControlHint;
  readonly rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
  readonly defaultSource?: DefaultSource;
  readonly tier?: SlotTier;
}

/**
 * SlotDef defines a block's input or output port.
 * This is an alias for Slot to maintain backward compatibility.
 */
export type SlotDef = Slot;

// =============================================================================
// Block Categories and Subcategories
// =============================================================================

/**
 * BlockCategory - high-level block categorization.
 */
export type BlockCategory = string;

/**
 * BlockSubcategory - subcategory within a block form for organization.
 * Examples: 'Sources', 'Fields', 'Timing', 'Spatial', 'Math', etc.
 */
export type BlockSubcategory = string;

/**
 * ALL_SUBCATEGORIES - complete list of all block subcategories.
 * Used for UI organization and filtering.
 */
export const ALL_SUBCATEGORIES: readonly BlockSubcategory[] = [
  'Sources',
  'Fields',
  'Timing',
  'Spatial',
  'Math',
  'Combinators',
  'Filters',
  'Effects',
  'Render',
  'Utility',
] as const;

// =============================================================================
// Kernel Primitives and Capabilities
// =============================================================================

/**
 * KernelCapability - the five fundamental authorities.
 * Kernel blocks have special privileges based on their capability.
 */
export type KernelCapability = 'time' | 'identity' | 'state' | 'render' | 'io';

/**
 * Capability - either a kernel capability or pure (no special authority).
 */
export type Capability = KernelCapability | 'pure';

/**
 * KernelId - unique identifier for kernel primitive blocks.
 * Must match the block type for kernel blocks.
 */
export type KernelId = string;

/**
 * PureCompileKind - how a pure block compiles.
 */
export type PureCompileKind = 'operator' | 'composite' | 'spec';

// =============================================================================
// Block Definition (from Registry)
// =============================================================================

/**
 * BlockDef - static definition of a block type from the registry.
 * Specifies what a block does, its inputs/outputs, and metadata.
 */
export interface BlockDef {
  readonly type: string;
  readonly label: string;
  readonly category: string;
  readonly description?: string;
  readonly slots: SlotDef[];
  readonly params?: Record<string, unknown>;
  readonly form: BlockForm;
  readonly macroConfig?: {
    bindings: MacroBinding[];
    outputBindings?: MacroOutputBinding[];
  };
}

// =============================================================================
// Port References
// =============================================================================

/**
 * PortRef - canonical reference to a block port.
 * Used across UI, compiler, diagnostics, and metadata.
 *
 * Canonical port identity format across UI, compiler, and diagnostics.
 */
export interface PortRef {
  readonly blockId: BlockId;
  readonly slotId: string;
  readonly direction: 'input' | 'output';
}

// =============================================================================
// Unified Edge System (Sprint 1: Phase 0 Architecture Refactoring)
// =============================================================================

/**
 * Endpoint - represents a block port.
 *
 * The legacy `kind: 'bus'` discriminant has been removed.
 *
 * Sprint: Connections → Edges Migration (2026-01-02)
 * Changed: Simplified from discriminated union to simple port reference
 */
export type Endpoint = {
  readonly kind: 'port';
  readonly blockId: string;
  readonly slotId: string;
};

/**
 * Edge - unified connection type that replaces Connection, Publisher, and Listener
 *
 * An Edge connects two block ports with optional transformations:
 * - All edges are port→port (block-to-block connections)
 * - BusBlocks are treated as regular blocks with input/output ports
 *
 * Sprint: Phase 0 - Sprint 1: Unify Connections → Edge Type
 */
export interface Edge {
  /** Unique identifier */
  readonly id: string;

  /** Source endpoint (always a port) */
  readonly from: Endpoint;

  /** Destination endpoint (always a port) */
  readonly to: Endpoint;

  /**
   * Unified transform chain (adapters + lenses in execution order).
   * This replaces the separate lensStack and adapterChain fields.
   *
   * Transform execution order:
   * 1. Adapters (type conversions)
   * 2. Lenses (value transformations)
   *
   * @since Phase 0.5 Track A
   */
  readonly transforms?: TransformStep[];

  /** Whether this edge is enabled */
  readonly enabled: boolean;

  /** Optional weight for weighted combine modes (bus subscribers only) */
  readonly weight?: number;

  /** Sort key for deterministic ordering */
  readonly sortKey?: number;

  /**
   * Edge role - identifies the purpose of this edge.
   * Required field tracking whether edge is user-created or system-generated.
   *
   * Sprint: Block & Edge Roles Type System (2026-01-03)
   */
  readonly role: EdgeRole;
}

/**
 * Transform step - union of adapter and lens for unified transform chains.
 * Phase 0.5 Track A unifies lensStack + adapterChain into this representation.
 *
 * References:
 * - .agent_planning/phase0.5-compat-cleanup/PLAN-2026-01-01-000000.md (Track A)
 * - .agent_planning/phase0.5-compat-cleanup/DOD-2026-01-01-000000.md (Track A)
 */
export type TransformStep = AdapterStep | { readonly kind: 'lens'; readonly lens: LensInstance };


// =============================================================================
// Slot Types (what can connect to what)
// =============================================================================

/**
 * Slot types define what can connect to what in the patch bay.
 * Start loose (strings), tighten to branded types in Phase 3.
 *
 * Examples: 'Number', 'Vec2', 'Color', 'Field<Number>', 'Signal<Vec2>'
 *
 * Phase 1: String-based, runtime checks.
 * Phase 3: Branded types, compile-time verification.
 */
export type SlotType = TypeDesc;

/**
 * SLOT_TYPE_TO_TYPE_DESC - mapping from SlotType to TypeDesc.
 * @deprecated This is a stub for backward compatibility. Use TypeDesc directly.
 */
export const SLOT_TYPE_TO_TYPE_DESC: Record<SlotType, TypeDesc | undefined> = {} as any;

// =============================================================================
// Type Compatibility Functions
// =============================================================================

/**
 * createTypeDesc - create a TypeDesc from partial information.
 * Re-exported from ir/types/TypeDesc.ts for convenience.
 */
export { createTypeDesc } from './ir/types/TypeDesc';

/**
 * isDirectlyCompatible - check if two TypeDescs are directly compatible.
 * Re-exported from semantic/index.ts for convenience.
 */
export { isDirectlyCompatible } from './semantic/index';

// =============================================================================
// Diagnostics (Compile-time Errors/Warnings)
// =============================================================================

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Diagnostic - represents a compile-time error, warning, or info message.
 */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  blockId?: string;
  slotId?: string;
  source?: string; // which compiler pass generated this
}

// =============================================================================
// Block IDs and Identifiers
// =============================================================================

/**
 * Unique identifier for a block instance.
 * Phase 1: Simple incrementing IDs. Phase 3+: UUIDs for stability.
 */
export type BlockId = string;

/**
 * Block type identifies the block's behavior (used to look up factory in registry).
 */
export type BlockType = string; // e.g., 'RadialOrigin', 'PhaseMachine', 'ParticleRenderer'

/**
 * 2D position type for block canvas placement.
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

// =============================================================================
// Block Form System (Primitives, Compounds, Macros)
// =============================================================================

/**
 * Block form defines the fundamental nature of a block.
 *
 * - 'primitive': Irreducible atomic operations (implemented in TypeScript)
 * - 'composite': Built from primitives, behaves as single block in UI
 * - 'macro': Template-based metaprogramming (expands at compile time)
 *
 * Sprint: Phase 0 - Sprint 1: Block Form Cleanup
 */
export type BlockForm = 'primitive' | 'composite' | 'macro';

// =============================================================================
// Block and Edge Roles (Structural Entity Tracking)
// =============================================================================

/**
 * WireId - unique identifier for a wire in the patch graph.
 * Used in wireState structural blocks to track intermediate values.
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 */
export type WireId = string;

/**
 * NodeRef - reference to a node in the IR or patch graph.
 * Used in lens structural blocks to reference transformation nodes.
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 */
export interface NodeRef {
  readonly nodeId: string;
  readonly kind?: string; // optional node type discriminator
}

/**
 * StructuralMeta - metadata for structural (system-generated) blocks.
 * Each variant targets a different structural purpose with specific metadata.
 *
 * - defaultSource: Provides default value for unconnected input port
 * - wireState: Holds intermediate state for a wire in the graph
 * - globalBus: Represents a global signal distribution point
 * - lens: Represents a transformation node in the graph
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 * Spec: design-docs/final-System-Invariants/15-Block-Edge-Roles.md (Invariant 2)
 */
export type StructuralMeta =
  | { kind: "defaultSource"; target: { kind: "port"; port: PortRef } }
  | { kind: "wireState";     target: { kind: "wire"; wire: WireId } }
  | { kind: "globalBus";     target: { kind: "bus"; busId: BusId } }
  | { kind: "lens";          target: { kind: "node"; node: NodeRef; port?: string } };

/**
 * BlockRole - discriminated union identifying block purpose.
 *
 * - user: Created by user in the editor (default for all user actions)
 * - structural: System-generated block with metadata about what it targets
 *
 * This replaces the old string-based role system ('defaultSourceProvider' | 'internal').
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 * Spec: design-docs/final-System-Invariants/15-Block-Edge-Roles.md (Invariant 2)
 */
export type BlockRole =
  | { kind: "user" }
  | { kind: "structural"; meta: StructuralMeta };

/**
 * Legacy block role - deprecated string-based role system.
 * Used only for migration from old patches.
 *
 * @deprecated Use discriminated BlockRole instead
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 */
export type LegacyBlockRole = 'defaultSourceProvider' | 'internal';

/**
 * EdgeRole - discriminated union identifying edge purpose.
 *
 * - user: Created by user in the editor (default for all user actions)
 * - default: Edge from default source block to target port
 * - busTap: Edge connecting to/from a bus block
 * - auto: Automatically created edge (port moved, rehydration, migration)
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 * Spec: design-docs/final-System-Invariants/15-Block-Edge-Roles.md (Invariant 2)
 */
export type EdgeRole =
  | { kind: "user" }
  | { kind: "default"; meta: { defaultSourceBlockId: BlockId } }
  | { kind: "busTap";  meta: { busId: BusId } }
  | { kind: "auto";    meta: { reason: "portMoved" | "rehydrate" | "migrate" } };

/**
 * Migrates legacy string-based block role to discriminated union.
 *
 * Migration rules:
 * - 'defaultSourceProvider' → { kind: 'structural', meta: { kind: 'defaultSource', ... } }
 * - 'internal' → { kind: 'structural', meta: { kind: 'wireState', ... } }
 * - undefined → { kind: 'user' }
 *
 * Note: This migration creates incomplete metadata (target is placeholder).
 * Proper metadata should be populated by the creation site or normalization pass.
 *
 * @param legacyRole - Old string-based role or undefined
 * @returns Discriminated union BlockRole
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 */
export function migrateLegacyBlockRole(
  legacyRole: LegacyBlockRole | string | undefined
): BlockRole {
  if (!legacyRole) {
    return { kind: "user" };
  }

  switch (legacyRole) {
    case 'defaultSourceProvider':
      // Placeholder metadata - should be filled by creation site
      return {
        kind: "structural",
        meta: {
          kind: "defaultSource",
          target: {
            kind: "port",
            port: { blockId: '', slotId: '', direction: 'input' }
          }
        }
      };
    case 'internal':
      // Placeholder metadata - should be filled by creation site
      return {
        kind: "structural",
        meta: {
          kind: "wireState",
          target: {
            kind: "wire",
            wire: ''
          }
        }
      };
    default:
      // Unknown legacy role defaults to user
      console.warn(`Unknown legacy block role: ${legacyRole}, defaulting to 'user'`);
      return { kind: "user" };
  }
}

/**
 * Migrates legacy edge (without role) to discriminated union.
 *
 * Migration rule: undefined → { kind: 'user' }
 *
 * @returns Default user edge role
 *
 * Sprint: Block & Edge Roles Type System (2026-01-03)
 */
export function migrateLegacyEdgeRole(): EdgeRole {
  return { kind: "user" };
}

// =============================================================================
// Block Parameters
// =============================================================================

/**
 * Block parameters - runtime configuration values.
 * Phase 1: Loose Record. Phase 3+: Branded per block type.
 */
export type BlockParams = Record<string, unknown>;

/**
 * Block - a functional unit in the patch bay.
 *
 * Each block:
 * - Has a unique ID and type (looked up in registry)
 * - Owns internal state (params)
 * - Exposes inputs/outputs (slots) for connections
 * - Is positioned on the 2D canvas
 *
 * Sprint: Phase 0 - Sprint 2: Unify Default Sources with Blocks
 */
export interface Block {
  /** Unique identifier */
  readonly id: string;

  /** Type (used to look up factory in registry) */
  readonly type: string;

  /** Human-readable label */
  label: string;

  /** Position on canvas */
  position: Vec2;

  /** Internal state/configuration */
  params: BlockParams;

  /**
   * Block form: primitive, composite, or macro.
   * Determines how the block is compiled.
   */
  form: BlockForm;

  /**
   * Hidden blocks are not rendered on the canvas.
   * Used for system-generated blocks like default source providers.
   *
   * Sprint: Phase 0 - Sprint 2: Unify Default Sources with Blocks
   */
  hidden?: boolean;

  /**
   * Block role identifies the purpose of this block.
   * Required field tracking whether block is user-created or system-generated.
   *
   * Sprint: Block & Edge Roles Type System (2026-01-03)
   */
  role: BlockRole;
}

// =============================================================================
// Default Source State (Deprecated)
// =============================================================================

/**
 * Default Source state for implicit lens params.
 * @deprecated Migration type - will be removed once lens param bindings are unified
 */
export interface DefaultSourceState {
  id: string;
  type: TypeDesc;
  value: unknown;
  uiHint?: UIControlHint;
  rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
}

// =============================================================================
// Composite Types
// =============================================================================

/**
 * ExposedParam - exposed parameter definition for composites.
 * Maps a composite's external parameter to an internal block parameter.
 */
export interface ExposedParam {
  /** External parameter name */
  readonly name: string;
  /** Internal block ID */
  readonly blockId: string;
  /** Internal parameter name */
  readonly paramName: string;
  /** UI label */
  readonly label?: string;
  /** UI control hint */
  readonly uiHint?: UIControlHint;
  /** Default value */
  readonly defaultValue?: unknown;
}

/**
 * Composite - a saved group of blocks and connections that can be instantiated.
 * Similar to a "macro" or "subgraph" in other node editors.
 */
export interface Composite {
  /** Unique identifier */
  readonly id: string;

  /** Human-readable name */
  name: string;

  /** Blocks within this composite */
  blocks: Block[];

  /** Internal connections between blocks */
  edges: Edge[];

  /** Exposed parameters (map to internal block params) */
  exposedParams?: Record<string, { blockId: string; paramName: string }>;
}

/**
 * Patch - the complete animation program.
 *
 * A Patch is a directed graph of blocks connected by edges.
 * It represents the entire animation state at the editor level.
 *
 * Sprint: Phase 0 - Sprint 1: Unify Connections → Edge Type
 */
export interface Patch {
  /** Unique identifier */
  readonly id: PatchId;

  /** Blocks in the patch */
  blocks: Block[];

  /**
   * Unified edges (replaces connections, publishers, listeners).
   * All connections are now port→port edges with metadata.
   */
  edges: Edge[];

  /** Global buses (signal distribution) */
  buses: Bus[];

  /** Available composites (saved subgraphs) */
  composites?: Composite[];

  /** Default source state (deprecated, for backward compat) */
  defaultSources?: Record<string, DefaultSourceState>;
}

// =============================================================================
// Observable Patch (for MobX integration)
// =============================================================================

/**
 * ObservablePatch - MobX-observable version of Patch.
 * Used in editor stores for reactive UI updates.
 */
export interface ObservablePatch extends Patch {
  blocks: Observable<Block[]>;
  edges: Observable<Edge[]>;
  buses: Observable<Bus[]>;
}
