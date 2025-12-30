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

// =============================================================================
// Bus Type System (Core/Internal Split)
// =============================================================================

/**
 * World categories for type system.
 * - signal: Continuous time-indexed values
 * - event: Discrete impulses/triggers (sparse, edge-triggered)
 * - field: Per-element values
 * - scalar: Compile-time constants
 * - config: Configuration values
 */
export type TypeWorld = 'signal' | 'event' | 'field' | 'scalar' | 'config';

// =============================================================================
// Kernel Capabilities (Primitive Enforcement)
// =============================================================================

/**
 * Kernel capabilities - the five authorities that define primitives.
 * These represent the different kinds of "special powers" a block can have.
 *
 * Only blocks listed in KERNEL_PRIMITIVES may claim non-pure capabilities.
 */
export type KernelCapability = 'time' | 'identity' | 'state' | 'render' | 'io';

/**
 * Full capability type including pure.
 * - 'pure': Block has no special authority, compiles to pure expressions
 * - KernelCapability: Block has kernel-level authority (time/identity/state/render/io)
 */
export type Capability = KernelCapability | 'pure';

/**
 * The exhaustive list of kernel primitive IDs.
 * This union type provides COMPILE-TIME enforcement.
 */
export type KernelId =
  // Time Authority (2)
  | 'FiniteTimeRoot'
  | 'InfiniteTimeRoot'
  // Identity Authority (3)
  | 'DomainN'
  | 'SVGSampleDomain'
  | 'GridDomain'
  // State Authority (5)
  | 'IntegrateBlock'
  | 'HistoryBlock'
  | 'TriggerOnWrap'
  | 'PulseDivider'
  | 'EnvelopeAD'
  // Render Authority (6)
  | 'RenderInstances'
  | 'RenderStrokes'
  | 'RenderProgramStack'
  | 'RenderInstances2D'
  | 'RenderPaths2D'
  | 'Render2dCanvas'
  // External IO Authority (3)
  | 'TextSource'
  | 'ImageSource'
  | 'DebugDisplay';

/**
 * Compile kind for pure blocks - determines what AST they can produce.
 * - 'operator': Must compile to SignalExpr/FieldExpr AST nodes (not closures)
 * - 'composite': Black-box combination of primitives
 * - 'spec': Declarative specification (config that compiles to programs)
 */
export type PureCompileKind = 'operator' | 'composite' | 'spec';

/**
 * Core domains - what users see in the bus system.
 * These are the learnable creative vocabulary.
 */
export type CoreDomain =
  | 'float'    // Floating-point values
  | 'int'      // Integer values
  | 'vec2'     // 2D positions/vectors
  | 'vec3'     // 3D positions/vectors
  | 'color'    // Color values
  | 'boolean'  // True/false values
  | 'time'     // Time values (always in seconds)
  | 'rate'     // Rate/multiplier values
  | 'trigger'; // Pulse/event signals

/**
 * Internal domains - engine plumbing, not bus-eligible by default.
 */
export type InternalDomain =
  | 'point'        // Point semantics
  | 'duration'     // Duration semantics
  | 'hsl'          // HSL color space
  | 'path'         // Path data
  | 'expression'   // DSL expression source
  | 'waveform'     // Oscillator waveform selector
  | 'phaseSample'  // PhaseMachine sample payload
  | 'phaseMachine' // PhaseMachine instance payload
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
  | 'string'       // String values (labels, etc.)
  | 'bounds'       // Bounding box / bounds
  | 'spec'         // Spec types (config that compiles to programs)
  | 'canvasRender'  // Canvas 2D render commands
  | 'cameraRef';   // Camera resource reference (for 3D rendering)

/**
 * All domains (core + internal).
 */
export type Domain = CoreDomain | InternalDomain;

/**
 * Category for type filtering.
 */
export type TypeCategory = 'core' | 'internal';

/**
 * Type descriptor for bus typing system.
 * Separates user-facing core types from internal resource types.
 *
 * Bundle arity extension (Sprint 2):
 * - bundleArity tracks number of scalar components for multi-component types
 * - Used for connection validation (vec3 cannot connect to scalar, etc.)
 * - Defaults to 1 for scalar/non-bundle types
 */
export interface TypeDesc {
  /** World: signal=continuous time, field=per-element */
  readonly world: TypeWorld;

  /** Domain: what type of value */
  readonly domain: Domain;

  /** Category: core (user-facing) or internal (engine) */
  readonly category: TypeCategory;

  /** Whether this type can be used for buses */
  readonly busEligible: boolean;

  /**
   * Bundle arity - number of scalar components in this type.
   *
   * Examples:
   * - float/int/color: 1 (scalar)
   * - vec2: 2 (x, y)
   * - vec3: 3 (x, y, z)
   * - color (RGBA): 4 (r, g, b, a)
   *
   * Defaults to 1 if not specified (backward compatibility).
   *
   * Sprint 2: Bundle type system for explicit validation.
   */
  readonly bundleArity?: number;

  /** Optional semantic information for precise matching */
  readonly semantics?: string;

  /** Optional unit information (e.g., "seconds", "beats") */
  readonly unit?: string;
}

/**
 * Bus combination modes for multiple publishers.
 */
export type BusCombineMode = 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer';

/**
 * Format a TypeDesc for display.
 */
// MOVED TO SEMANTIC KERNEL

/**
 * Get available combine modes for a given domain.
 */
// MOVED TO SEMANTIC KERNEL

/**
 * Bus interface - central typed signal distributors.
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

  /** Optional color for visual grouping (hex code) */
  color?: string;
}

/**
 * SlotType - UI representation of port types.
 *
 * Format: `World<Domain>` (e.g., `Signal<float>`, `Field<vec2>`)
 *
 * This is the legacy format from V4. The semantic layer normalizes these
 * into TypeDesc for all compatibility and validation checks.
 */
export type SlotType = string;

/**
 * Adapter path - chain of conversions from one type to another.
 * Empty chain means types are directly compatible.
 */
export interface AdapterPath {
  from: TypeDesc;
  to: TypeDesc;
  adapters: readonly string[]; // Adapter block IDs
  isHeavy: boolean; // Expensive conversion (e.g., field materialization)
}

// =============================================================================
// Port and Connection Types
// =============================================================================

/**
 * Port direction.
 */
export type PortDirection = 'input' | 'output';

/**
 * Port definition.
 */
export interface Port {
  /** Port identifier (unique within the block) */
  readonly id: string;

  /** Display label */
  readonly label: string;

  /** Port type (SlotType format) */
  readonly type: SlotType;

  /** Port direction */
  readonly direction: PortDirection;

  /** Whether the port is a bus port (not a regular wire port) */
  readonly isBusPort?: boolean;

  /** Optional default value (for inputs) */
  readonly defaultValue?: unknown;

  /** Optional documentation */
  readonly docs?: string;
}

/**
 * Connection between two ports.
 */
export interface Connection {
  /** Unique identifier for this connection */
  readonly id: string;

  /** Source block ID */
  readonly sourceBlockId: string;

  /** Source port ID */
  readonly sourcePortId: string;

  /** Target block ID */
  readonly targetBlockId: string;

  /** Target port ID */
  readonly targetPortId: string;

  /** Optional adapter chain (empty if types are directly compatible) */
  readonly adapters?: readonly string[];
}

/**
 * Bus publisher - block that publishes to a bus.
 */
export interface Publisher {
  /** Unique identifier for this publisher */
  readonly id: string;

  /** Source block ID */
  readonly blockId: string;

  /** Source port ID */
  readonly portId: string;

  /** Target bus ID */
  readonly busId: string;
}

/**
 * Bus listener - block that listens to a bus.
 */
export interface Listener {
  /** Unique identifier for this listener */
  readonly id: string;

  /** Target block ID */
  readonly blockId: string;

  /** Target port ID */
  readonly portId: string;

  /** Source bus ID */
  readonly busId: string;
}

// =============================================================================
// Block Definition Types
// =============================================================================

/**
 * Block category for organization.
 */
export type BlockCategory =
  | 'Time'
  | 'Domains'
  | 'Signal Sources'
  | 'Field Generators'
  | 'Math'
  | 'Combinators'
  | 'Transforms'
  | 'Render'
  | 'State'
  | 'External IO'
  | 'Composite'
  | 'Util'
  | 'Debug';

/**
 * Block definition - describes a block type and its ports.
 */
export interface BlockDef {
  /** Unique block type identifier */
  readonly id: string;

  /** Display name */
  readonly label: string;

  /** Category for organization */
  readonly category: BlockCategory;

  /** Capability - what authority this block has */
  readonly capability: Capability;

  /** Input ports */
  readonly inputs: readonly Port[];

  /** Output ports */
  readonly outputs: readonly Port[];

  /** Optional icon (emoji or identifier) */
  readonly icon?: string;

  /** Optional documentation */
  readonly docs?: string;

  /** Whether this block is deprecated (hide from palette) */
  readonly deprecated?: boolean;

  /** Pure blocks: what compile kind */
  readonly compileKind?: PureCompileKind;

  /** Optional default sources for inputs (reactive block configuration) */
  readonly defaultSources?: Record<string, unknown>;
}

/**
 * Block instance - an instance of a block type in the patch.
 */
export interface Block {
  /** Unique instance identifier */
  readonly id: string;

  /** Block type (references BlockDef.id) */
  readonly type: string;

  /** Position in the editor canvas */
  readonly x?: number;
  readonly y?: number;

  /** Configuration values (input defaults, parameters) */
  readonly config?: Record<string, unknown>;

  /** Optional label override */
  readonly label?: string;

  /** Optional color for visual grouping (hex code) */
  readonly color?: string;

  /** Whether this block is collapsed */
  readonly collapsed?: boolean;
}

// =============================================================================
// Patch Document
// =============================================================================

/**
 * Patch document - the complete state of a patch.
 */
export interface Patch {
  /** Patch metadata */
  readonly id: string;
  readonly name: string;
  readonly version: number;

  /** Blocks in the patch */
  readonly blocks: readonly Block[];

  /** Connections between blocks */
  readonly connections: readonly Connection[];

  /** Buses */
  readonly buses: readonly Bus[];

  /** Bus publishers */
  readonly publishers: readonly Publisher[];

  /** Bus listeners */
  readonly listeners: readonly Listener[];

  /** Optional patch-level metadata */
  readonly metadata?: Record<string, unknown>;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Diagnostic severity.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Diagnostic - validation error/warning.
 */
export interface Diagnostic {
  /** Diagnostic code (e.g., 'E_TIME_ROOT_MISSING') */
  readonly code: string;

  /** Severity level */
  readonly severity: DiagnosticSeverity;

  /** Human-readable message */
  readonly message: string;

  /** Optional location (block ID, port ID, etc.) */
  readonly location?: {
    readonly blockId?: string;
    readonly portId?: string;
    readonly busId?: string;
  };

  /** Optional suggested fix */
  readonly fix?: string;
}

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether the patch is valid */
  readonly ok: boolean;

  /** Errors (ok = false if any errors) */
  readonly errors: readonly Diagnostic[];

  /** Warnings (don't prevent compilation) */
  readonly warnings: readonly Diagnostic[];
}

// =============================================================================
// SLOT_TYPE_TO_TYPE_DESC Mapping
// =============================================================================


/**
 * Mapping from SlotType to TypeDesc.
 *
 * This is the canonical source of truth for SlotType -> TypeDesc conversion.
 * All type compatibility checks MUST go through the semantic layer.
 *
 * Sprint 2: Added bundleArity to all entries for explicit validation.
 */
export const SLOT_TYPE_TO_TYPE_DESC: Record<SlotType, TypeDesc> = {
  // ========== SIGNAL TYPES ==========

  // Numeric signals
  'Signal<float>': {
    world: 'signal',
    domain: 'float',
    category: 'core',
    busEligible: true,
    bundleArity: 1,
  },
  'Signal<int>': {
    world: 'signal',
    domain: 'int',
    category: 'core',
    busEligible: true,
    bundleArity: 1,
  },

  // Vector signals
  'Signal<vec2>': {
    world: 'signal',
    domain: 'vec2',
    category: 'core',
    busEligible: true,
    bundleArity: 2,
  },
  'Signal<vec3>': {
    world: 'signal',
    domain: 'vec3',
    category: 'core',
    busEligible: true,
    bundleArity: 3,
  },

  // Color signals
  'Signal<color>': {
    world: 'signal',
    domain: 'color',
    category: 'core',
    busEligible: true,
    bundleArity: 4, // RGBA
  },

  // Time signals
  'Signal<time>': {
    world: 'signal',
    domain: 'time',
    category: 'core',
    busEligible: true,
    semantics: 'time',
    unit: 'seconds',
    bundleArity: 1,
  },
  'Signal<phase>': {
    world: 'signal',
    domain: 'float',
    category: 'core',
    busEligible: true,
    semantics: 'phase(0..1)',
    bundleArity: 1,
  },
  'Signal<phase01>': {
    world: 'signal',
    domain: 'float',
    category: 'core',
    busEligible: true,
    semantics: 'phase(0..1)',
    bundleArity: 1,
  },
  'Signal<Unit>': {
    world: 'signal',
    domain: 'float',
    category: 'core',
    busEligible: true,
    semantics: 'unit(0..1)',
    bundleArity: 1,
  },

  // Boolean signals
  'Signal<boolean>': {
    world: 'signal',
    domain: 'boolean',
    category: 'core',
    busEligible: false,
    bundleArity: 1,
  },

  // Trigger signals
  'Signal<trigger>': {
    world: 'signal',
    domain: 'trigger',
    category: 'core',
    busEligible: true,
    bundleArity: 1,
  },

  // ========== FIELD TYPES ==========

  // Numeric fields
  'Field<float>': {
    world: 'field',
    domain: 'float',
    category: 'core',
    busEligible: true,
    bundleArity: 1,
  },
  'Field<int>': {
    world: 'field',
    domain: 'int',
    category: 'core',
    busEligible: true,
    bundleArity: 1,
  },

  // Vector fields
  'Field<vec2>': {
    world: 'field',
    domain: 'vec2',
    category: 'core',
    busEligible: true,
    bundleArity: 2,
  },
  'Field<vec3>': {
    world: 'field',
    domain: 'vec3',
    category: 'core',
    busEligible: true,
    bundleArity: 3,
  },
  'Field<Point>': {
    world: 'field',
    domain: 'point',
    category: 'internal',
    busEligible: false,
    semantics: 'position',
    bundleArity: 2, // Point is 2D
  },

  // Color fields
  'Field<color>': {
    world: 'field',
    domain: 'color',
    category: 'core',
    busEligible: true,
    bundleArity: 4, // RGBA
  },

  // ========== SCALAR TYPES ==========

  'Scalar<float>': {
    world: 'scalar',
    domain: 'float',
    category: 'core',
    busEligible: false,
    bundleArity: 1,
  },
  'Scalar<int>': {
    world: 'scalar',
    domain: 'int',
    category: 'core',
    busEligible: false,
    bundleArity: 1,
  },
  'Scalar<string>': {
    world: 'scalar',
    domain: 'string',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  'Scalar<boolean>': {
    world: 'scalar',
    domain: 'boolean',
    category: 'core',
    busEligible: false,
    bundleArity: 1,
  },
  'Scalar<vec2>': {
    world: 'scalar',
    domain: 'vec2',
    category: 'core',
    busEligible: false,
    bundleArity: 2,
  },
  'Scalar<color>': {
    world: 'scalar',
    domain: 'color',
    category: 'core',
    busEligible: false,
    bundleArity: 4,
  },
  'Scalar<bounds>': {
    world: 'scalar',
    domain: 'bounds',
    category: 'internal',
    busEligible: false,
    bundleArity: 1, // Bounds is opaque
  },

  // ========== INTERNAL TYPES ==========

  Domain: {
    world: 'field',
    domain: 'elementCount',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  ElementCount: {
    world: 'signal',
    domain: 'int',
    category: 'core',
    busEligible: true,
    semantics: 'count',
    bundleArity: 1,
  },
  PhaseMachine: {
    world: 'signal',
    domain: 'phaseMachine',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  TargetScene: {
    world: 'field',
    domain: 'sceneTargets',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  Scene: {
    world: 'field',
    domain: 'scene',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  Render: {
    world: 'field',
    domain: 'renderTree',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  RenderTree: {
    world: 'field',
    domain: 'renderTree',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  RenderNode: {
    world: 'field',
    domain: 'renderNode',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  RenderNodeArray: {
    world: 'field',
    domain: 'renderNode',
    category: 'internal',
    busEligible: false,
    semantics: 'array',
    bundleArity: 1,
  },
  FilterDef: {
    world: 'field',
    domain: 'filterDef',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  StrokeStyle: {
    world: 'field',
    domain: 'strokeStyle',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },
  CanvasRender: {
    world: 'field',
    domain: 'canvasRender',
    category: 'internal',
    busEligible: false,
    bundleArity: 1,
  },

  // Spec types
  'Spec:LineMorph': {
    world: 'field',
    domain: 'spec',
    category: 'internal',
    busEligible: false,
    semantics: 'lineMorph',
    bundleArity: 1,
  },
  'Spec:Particles': {
    world: 'field',
    domain: 'spec',
    category: 'internal',
    busEligible: false,
    semantics: 'particles',
    bundleArity: 1,
  },
  'Spec:RevealMask': {
    world: 'field',
    domain: 'spec',
    category: 'internal',
    busEligible: false,
    semantics: 'revealMask',
    bundleArity: 1,
  },
  'Spec:Transform3DCompositor': {
    world: 'field',
    domain: 'spec',
    category: 'internal',
    busEligible: false,
    semantics: 'transform3d',
    bundleArity: 1,
  },
  'Spec:DeformCompositor': {
    world: 'field',
    domain: 'spec',
    category: 'internal',
    busEligible: false,
    semantics: 'deform',
    bundleArity: 1,
  },
  'Spec:ProgramStack': {
    world: 'field',
    domain: 'spec',
    category: 'internal',
    busEligible: false,
    semantics: 'programStack',
    bundleArity: 1,
  },
};
