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
 * Only signal and field - scalar is semantics, special is category.
 */
export type TypeWorld = 'signal' | 'field' | 'scalar' | 'config';

/**
 * Core domains - what users see in the bus system.
 * These are the learnable creative vocabulary.
 */
export type CoreDomain =
  | 'number'   // Numeric values
  | 'vec2'     // 2D positions/vectors
  | 'color'    // Color values
  | 'boolean'  // True/false values
  | 'time'     // Time values (always in seconds)
  | 'phase'    // Phase values [0,1]
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
  | 'canvasRender'; // Canvas 2D render commands

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

  /** Origin: built-in (auto-created defaults) or user (user-created) */
  readonly origin?: 'built-in' | 'user';
}

/**
 * Adapter step for type conversions.
 */
export interface AdapterStep {
  /** Identifier for the adapter function */
  readonly adapterId: string;

  /** Parameters for the adapter */
  readonly params: Record<string, unknown>;
}

/**
 * Adapter policy levels.
 */
export type AdapterPolicy = 'AUTO' | 'SUGGEST' | 'EXPLICIT' | 'FORBIDDEN';

/**
 * Adapter cost (lower is better).
 */
export type AdapterCost = number;

/**
 * Lens definition for transforming bus values.
 */
export interface LensDefinition {
  type: string;
  label?: string;
  params: Record<string, unknown>;
}

export type LensParamBinding =
  | { kind: 'default'; defaultSourceId: string }
  | { kind: 'wire'; from: PortRef; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
  | { kind: 'bus'; busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] };

export interface LensInstance {
  lensId: string;
  params: Record<string, LensParamBinding>;
  enabled: boolean;
  sortKey?: number;
}

/**
 * Identifies a specific port on a specific block.
 * Canonical port identity format across UI, compiler, and diagnostics.
 */
export interface PortRef {
  readonly blockId: BlockId;
  readonly slotId: string;
  readonly direction: 'input' | 'output';
}

/**
 * Publisher - connects an output to a bus.
 */
export interface Publisher {
  /** Unique identifier */
  readonly id: string;

  /** Bus ID being published to */
  readonly busId: string;

  /** Source output endpoint */
  readonly from: PortRef;

  /** Optional adapter chain */
  readonly adapterChain?: AdapterStep[];

  /** Optional lens stack applied before bus combine */
  readonly lensStack?: LensInstance[];

  /** Whether this publisher is active */
  enabled: boolean;

  /** Optional weight for weighted combine modes */
  readonly weight?: number;

  /** Sort key for deterministic ordering within bus */
  sortKey: number;
}

/**
 * Listener - connects a bus to an input.
 */
export interface Listener {
  /** Unique identifier */
  readonly id: string;

  /** Bus ID being subscribed to */
  readonly busId: string;

  /** Target input endpoint */
  readonly to: PortRef;

  /** Optional adapter chain */
  readonly adapterChain?: AdapterStep[];

  /** Whether this listener is active */
  enabled: boolean;

  /** Optional lens stack - multiple lenses applied in sequence (replaces single lens) */
  readonly lensStack?: LensInstance[];
}

/**
 * Default Source state for implicit lens params.
 */
export interface DefaultSourceState {
  id: string;
  type: TypeDesc;
  value: unknown;
  uiHint?: UIControlHint;
  rangeHint?: { min?: number; max?: number; step?: number; log?: boolean };
}

// =============================================================================
// Slot Types (what can connect to what)
// =============================================================================

/**
 * Slot types define what can connect to what in the patch bay.
 * Start loose (strings), tighten to branded types in Phase 3.
 */
export type SlotType =
  | 'Scene'
  | 'SceneTargets'      // Sampled points from scene
  | 'SceneStrokes'      // Path segments for line drawing
  | 'Domain'            // Per-element identity (Phase 3)
  | 'Scalar:number'     // Compile-time constant number
  | 'Scalar:vec2'       // Compile-time constant vec2
  | 'Field<Point>'      // Per-element positions
  | 'Field<vec2>'       // Per-element positions (alias)
  | 'Field<number>'     // Per-element scalars (radius, opacity)
  | 'Field<color>'      // Per-element colors
  | 'Field<string>'     // Per-element strings (colors, easing names)
  | 'Signal<Point>'     // Time-varying position
  | 'Signal<number>'    // Time-varying scalar
  | 'Signal<Unit>'      // Time-varying progress [0,1]
  | 'Signal<Time>'      // Time-varying time value (for local time)
  | 'Signal<time>'      // Monotonic system time (TimeRoot output)
  | 'Signal<phase>'     // Phase value 0..1 (TimeRoot output)
  | 'Signal<color>'     // Time-varying color
  | 'Signal<string>'    // Time-varying string (config enums, etc.)
  | 'Signal<PhaseSample>' // Phase machine output
  | 'Event<string>'     // Discrete text events (typewriter)
  | 'Event<any>'        // Generic events
  | 'Program'           // Compiled animation program
  | 'Render'            // Final render output (user-facing unified type)
  | 'RenderTree'        // Final render output (internal)
  | 'CanvasRender'      // Canvas 2D render output
  | 'RenderNode'        // Single render node
  | 'RenderNode[]'      // Array of render nodes
  | 'FilterDef'         // SVG filter definition
  | 'StrokeStyle'       // Stroke styling configuration
  | 'ElementCount';     // Number of elements (from scene)

// =============================================================================
// Slot World System (Default Source Support)
// =============================================================================

/**
 * World classification for slots.
 * Determines evaluation timing and hot-swap behavior.
 *
 * This extends TypeWorld with additional categories for the
 * "Remove Parameters" refactor where all params become inputs.
 *
 * @see design-docs/10-Refactor-for-UI-prep/14-RemoveParams.md
 */
export type SlotWorld =
  | 'signal'    // Time-indexed, continuous, per-frame evaluation
  | 'field'     // Per-element, lazy, bulk evaluation
  | 'scalar'    // Compile-time constant (for domain size, seed, etc.)
  | 'config';   // Compile-time selection (enum/bool), stepwise changes only

/**
 * UI presentation tier for inputs.
 * Controls visibility and layout in Inspector.
 *
 * - 'primary': Always visible on block face (main creative parameters)
 * - 'secondary': Tucked under "More" / "Advanced" (refinement parameters)
 */
export type SlotTier =
  | 'primary'    // Always visible on block face
  | 'secondary'; // Tucked under "More" / "Advanced"

/**
 * UI control hint for rendering inline input controls.
 * Determines widget type when slot is in Default Source mode.
 *
 * These hints are used by the Inspector to generate appropriate
 * inline controls for editing default values.
 */
export type UIControlHint =
  | { readonly kind: 'slider'; readonly min: number; readonly max: number; readonly step: number }
  | { readonly kind: 'number'; readonly min?: number; readonly max?: number; readonly step?: number }
  | { readonly kind: 'select'; readonly options: readonly { readonly value: string; readonly label: string }[] }
  | { readonly kind: 'color' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'text' }
  | { readonly kind: 'xy' };

/**
 * Default Source definition for an input slot.
 * Represents the implicit constant value when nothing is connected.
 *
 * This is the core of the "Remove Parameters" refactor:
 * - Former params become inputs with defaultSource metadata
 * - UI generates controls from uiHint instead of ParamSchema
 * - Compiler uses value when no wire/bus is connected
 *
 * @see design-docs/10-Refactor-for-UI-prep/14-RemoveParams.md
 */
export interface DefaultSource {
  /** The constant value (typed per SlotType) */
  readonly value: unknown;

  /** UI control metadata for inline editing */
  readonly uiHint?: UIControlHint;

  /**
   * World classification - determines:
   * - Evaluation timing (compile vs runtime)
   * - Hot-swap behavior (topology change vs parameter change)
   *
   * | World   | Trigger         | Hot-Swap Strategy                    |
   * |---------|-----------------|--------------------------------------|
   * | signal  | Parameter edit  | Smooth transition, no recompile      |
   * | field   | Parameter edit  | Smooth transition, no recompile      |
   * | scalar  | Parameter edit  | Recompile (domain size changed)      |
   * | config  | Parameter edit  | Topology change (crossfade/freeze)   |
   */
  readonly world: SlotWorld;

  /**
   * Optional bus name to auto-connect when block is created.
   * If specified, a bus listener will be added automatically.
   * The value field is still used as fallback if the bus doesn't exist.
   */
  readonly defaultBus?: string;
}

// =============================================================================
// Block Definitions
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

// =============================================================================
// Block Form System (Primitives, Compounds, Macros)
// =============================================================================

/**
 * Block form defines the fundamental nature of a block.
 *
 * - 'primitive': Irreducible atomic operations (implemented in TypeScript)
 * - 'composite': Built from primitives, behaves as single block in UI
 * - 'macro': Expands into visible blocks when added to patch
 */
export type BlockForm = 'primitive' | 'composite' | 'macro';

/**
 * Top-level block categories (form groupings).
 */
export const BLOCK_FORMS = ['Macros', 'Composites', 'Primitives'] as const;
export type BlockFormCategory = (typeof BLOCK_FORMS)[number];

/**
 * Subcategories within each form.
 * These organize blocks by domain/function.
 */
export const ALL_SUBCATEGORIES = [
  // Macro subcategories
  'Quick Start',    // Simple, beginner-friendly starter macros
  'Animation Styles',
  'Effects',
  'Slice Demos',    // Demonstrates individual slice capabilities

  // Compound/Primitive subcategories (shared)
  'Sources',        // Data entry points (SVG, Text)
  'Fields',         // Per-element values
  'Timing',         // Delays, durations, staggers
  'Spatial',        // Positions, transforms
  'Style',          // Colors, sizes, opacity
  'Behavior',       // Motion parameters (wobble, spiral)
  'Math',           // Arithmetic operations
  'Vector',         // Point/Vec2 operations
  'Time',           // Clock, phase, easing
  'TimeRoot',       // Time topology blocks (Phase 3: TimeRoot)
  'Compose',        // Combining operations
  'Render',         // Drawing primitives
  'FX',             // Filters and effects
  'Adapters',       // Type conversions
  'Output',         // Final sinks
  'Other',          // Fallback for blocks without subcategory
] as const;

export type BlockSubcategory = (typeof ALL_SUBCATEGORIES)[number];

/**
 * Block category for library organization.
 */
export type BlockCategory = BlockSubcategory;

/**
 * A Slot is a typed connection point on a block.
 *
 * Extended for the "Remove Parameters" refactor to support Default Sources.
 * Input slots can optionally carry default value and UI metadata.
 *
 * @see design-docs/10-Refactor-for-UI-prep/14-RemoveParams.md
 */
export interface Slot {
  /** Unique identifier for this slot (unique within block) */
  readonly id: string;

  /** Human-readable label */
  readonly label: string;

  /** Type of value this slot accepts/produces */
  readonly type: SlotType;

  /** Input or output? */
  readonly direction: 'input' | 'output';

  // === NEW FIELDS (Phase 1: optional, Phase 3+: required for inputs) ===

  /**
   * Default Source for input slots.
   * Provides the constant value when nothing is connected.
   *
   * Input resolution priority: Wire > Bus Listener > Default Source
   *
   * MUST be undefined for output slots.
   * SHOULD be defined for input slots (required in future phases).
   *
   * @example
   * ```ts
   * defaultSource: {
   *   value: 1.0,
   *   world: 'signal',
   *   uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 }
   * }
   * ```
   */
  readonly defaultSource?: DefaultSource;

  /**
   * UI presentation tier (primary vs secondary).
   * Controls visibility in Inspector UI.
   *
   * - 'primary': Always visible on block face
   * - 'secondary': Tucked under "More" / "Advanced"
   *
   * Only meaningful for input slots.
   * Defaults to 'primary' if not specified.
   */
  readonly tier?: SlotTier;
}

/**
 * Block parameters (user-editable values).
 * Phase 1: Any object. Phase 3+: Validated schemas.
 */
export type BlockParams = Record<string, unknown>;

/**
 * A Block is a functional unit in the patch bay.
 * This is the data representation (serializable to JSON).
 */
export interface Block {
  /** Unique ID for this block instance */
  readonly id: BlockId;

  /** Type of block (maps to behavior in registry) */
  readonly type: BlockType;

  /** Human-readable label (defaults to type, user can override) */
  label: string;

  /** Input slots */
  readonly inputs: readonly Slot[];

  /** Output slots */
  readonly outputs: readonly Slot[];

  /** User-editable parameters */
  params: BlockParams;

  /** Category for library organization */
  readonly category: BlockCategory;

  /** Optional description for inspector */
  readonly description?: string;
}

// =============================================================================
// Connections
// =============================================================================

/**
 * A Connection links an output slot to an input slot.
 * Supports optional lens transformations and adapter chains for type conversion.
 */
export interface Connection {
  /** Unique ID for this connection */
  readonly id: string;

  /** Source block + slot */
  readonly from: PortRef;

  /** Destination block + slot */
  readonly to: PortRef;

  /** Optional lens stack for value transformation (applied after adapters) */
  readonly lensStack?: LensInstance[];

  /** Optional adapter chain for type conversion (applied before lenses) */
  readonly adapterChain?: AdapterStep[];

  /** Whether this connection is enabled (default: true) */
  readonly enabled?: boolean;
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
  connections: CompositeConnection[];
}

/**
 * Connection within a composite.
 */
export interface CompositeConnection {
  /** Connection identifier */
  readonly id: string;

  /** Source endpoint */
  readonly from: {
    readonly blockId: BlockId;
    readonly slotId: string;
    readonly direction: 'output';
  };

  /** Destination endpoint */
  readonly to: {
    readonly blockId: BlockId;
    readonly slotId: string;
    readonly direction: 'input';
  };
}

// =============================================================================
// Lanes
// =============================================================================

/**
 * Canonical lane kinds (structural types).
 * These define what kind of values live in a lane.
 * Per lanes-overview.md: lanes represent value domains.
 */
export type LaneKind =
  | 'Scene'      // Scene / Targets / selections
  | 'Phase'      // PhaseMachine
  | 'Fields'     // Field<T> (bulk per-element values)
  | 'Scalars'    // Scalar<T> (constants, params)
  | 'Spec'       // Spec:* (intent declarations)
  | 'Program'    // Program<RenderTree>
  | 'Output';    // Export / render output

/**
 * Lane flavor - optional UI hints for organization.
 * Does NOT affect type validity, only palette suggestions.
 */
export type LaneFlavor =
  | 'Timing'     // Delays, durations, easing
  | 'Style'      // Colors, sizes, opacity
  | 'Motion'     // Positions, trajectories
  | 'General';   // Default, no specific flavor

/**
 * Lane flow style - how blocks relate within the lane.
 * Per lanes-overview.md: chain vs patch-bay.
 */
export type LaneFlowStyle =
  | 'chain'      // Pipeline: blocks flow left-to-right
  | 'patchbay';  // Fan-out: blocks are sources for other lanes

/**
 * Lane identifier - unique string for each lane instance.
 * Allows multiple lanes of the same kind.
 */
export type LaneId = string;

/**
 * A Lane is a horizontal track in the patch bay.
 * Blocks are assigned to lanes for organization.
 *
 * Key principles (from lanes-overview.md):
 * - Lanes are UI affordances, not semantic truth
 * - Port types determine connection validity
 * - Multiple lanes of same kind allowed
 * - Lanes guide users into sane structure
 */
export interface Lane {
  /** Unique identifier for this lane */
  readonly id: LaneId;

  /** Structural kind (what type of values live here) */
  readonly kind: LaneKind;

  /** Human-readable label (user can rename) */
  label: string;

  /** Description shown in UI */
  description: string;

  /** Optional flavor hint for palette filtering */
  flavor?: LaneFlavor;

  /** Flow style: chain (pipeline) or patchbay (fan-out sources) */
  flowStyle: LaneFlowStyle;

  /** Blocks in this lane (by ID) */
  blockIds: BlockId[];

  /** UI state: is lane collapsed? */
  collapsed: boolean;

  /** UI state: is lane pinned (always visible)? */
  pinned: boolean;
}

/**
 * Lane template for defining layouts (without runtime state like blockIds).
 */
export interface LaneTemplate {
  readonly id: LaneId;
  readonly kind: LaneKind;
  readonly label: string;
  readonly description: string;
  readonly flavor?: LaneFlavor;
  readonly flowStyle: LaneFlowStyle;
}

/**
 * A lane layout defines a preset arrangement of lanes.
 * Users can switch between layouts; blocks are migrated based on lane kind.
 */
export interface LaneLayout {
  /** Unique identifier */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Description of when to use this layout */
  readonly description: string;

  /** Lane templates in order */
  readonly lanes: readonly LaneTemplate[];

  /** Is this a built-in preset or user-created? */
  readonly isPreset: boolean;
}

// =============================================================================
// Patch (Complete Editor State)
// =============================================================================

/**
 * A Patch is the complete editor state (serializable to JSON).
 * This is what gets saved/loaded.
 */
export interface Patch {
  /** Format version for serialization */
  readonly version: number;

  /** All blocks in the patch */
  blocks: Block[];

  /** All connections between blocks */
  connections: Connection[];

  /** Lane assignments (which blocks are in which lanes) */
  lanes: Lane[];

  /** Bus definitions */
  buses: Bus[];

  /** Bus routing - publishers from blocks to buses */
  publishers: Publisher[];

  /** Bus routing - listeners from buses to blocks */
  listeners: Listener[];

  /** Default sources for lens params and other implicit bindings */
  defaultSources: DefaultSourceState[];

  /** Global settings (seed, speed, etc.) */
  settings: {
    seed: number;
    speed: number;
    currentLayoutId?: string;
    advancedLaneMode?: boolean;
    autoConnect?: boolean;
    showTypeHints?: boolean;
    highlightCompatible?: boolean;
    warnBeforeDisconnect?: boolean;
    filterByLane?: boolean;
    filterByConnection?: boolean;
  };

  /** Composite definitions for this patch */
  composites?: import('./composites').CompositeDefinition[];
}

// =============================================================================
// Editor UI State (Non-Serializable)
// =============================================================================

/**
 * Editor UI state (selection, drag, etc.).
 * Not part of Patch (UI-only state).
 */
/**
 * Context menu state for right-click actions.
 */
export interface ContextMenuState {
  /** Is the context menu open? */
  isOpen: boolean;
  /** Screen position */
  x: number;
  y: number;
  /** The port this context menu is for */
  portRef: PortRef | null;
}

export interface EditorUIState {
  /** Currently selected block (for inspector) */
  selectedBlockId: BlockId | null;

  /** Currently dragging block type (from library) */
  draggingBlockType: BlockType | null;

  /** Lane kind of the block being dragged (for highlighting suggested lanes) */
  draggingLaneKind: LaneKind | null;

  /** Active lane for palette filtering (lane user is working in) */
  activeLaneId: LaneId | null;

  /** Currently hovered port (for compatible highlighting) */
  hoveredPort: PortRef | null;

  /** Currently selected port (for wiring via inspector) */
  selectedPort: PortRef | null;

  /** Context menu state */
  contextMenu: ContextMenuState;

  /** Playback state */
  isPlaying: boolean;
}

// =============================================================================
// Template Definitions
// =============================================================================

/**
 * A Template is a pre-wired patch (archetype).
 */
export interface Template {
  readonly name: string;
  readonly description: string;
  readonly archetype: 'Particles' | 'LineDrawing' | 'Typewriter';

  /** Generate a patch for this template */
  createPatch: () => Patch;
}

// =============================================================================
// Bus Type Utilities
// =============================================================================

/**
 * Adapter path information for type conversions.
 */
export interface AdapterPath {
  /** Source type */
  readonly from: TypeDesc;
  /** Target type */
  readonly to: TypeDesc;
  /** Required adapter steps */
  readonly adapters: AdapterStep[];
  /** Whether this is a "heavy" conversion (e.g., reduce) */
  readonly isHeavy?: boolean;
}

/**
 * Mapping from SlotType to TypeDesc with proper categorization.
 */
export const SLOT_TYPE_TO_TYPE_DESC: Record<SlotType, TypeDesc> = {
  // Core types (bus-eligible)
  'Scalar:number': { world: 'signal', domain: 'number', category: 'core', busEligible: true, semantics: 'scalar' },
  'Scalar:vec2': { world: 'signal', domain: 'vec2', category: 'core', busEligible: true, semantics: 'scalar' },
  'Field<number>': { world: 'field', domain: 'number', category: 'core', busEligible: true },
  'Field<vec2>': { world: 'field', domain: 'vec2', category: 'core', busEligible: true, semantics: 'position' },
  'Field<color>': { world: 'field', domain: 'color', category: 'core', busEligible: true },
  'Field<string>': { world: 'field', domain: 'color', category: 'core', busEligible: true, semantics: 'hex-color' },
  'Signal<number>': { world: 'signal', domain: 'number', category: 'core', busEligible: true },
  'Signal<Point>': { world: 'signal', domain: 'vec2', category: 'core', busEligible: true, semantics: 'point' },
  'Signal<Unit>': { world: 'signal', domain: 'number', category: 'core', busEligible: true, semantics: 'unit(0..1)' },
  'Signal<Time>': { world: 'signal', domain: 'time', category: 'core', busEligible: true, unit: 'seconds' },
  'Signal<time>': { world: 'signal', domain: 'time', category: 'core', busEligible: true, unit: 'ms', semantics: 'system-time' },
  'Signal<phase>': { world: 'signal', domain: 'phase', category: 'core', busEligible: true, semantics: 'unit(0..1)' },
  'Signal<color>': { world: 'signal', domain: 'color', category: 'core', busEligible: true },
  'Signal<string>': { world: 'signal', domain: 'string', category: 'core', busEligible: false, semantics: 'config-enum' },
  'Signal<PhaseSample>': { world: 'signal', domain: 'phase', category: 'core', busEligible: true, semantics: 'sample' },
  'Event<string>': { world: 'signal', domain: 'trigger', category: 'core', busEligible: true, semantics: 'string' },
  'Event<any>': { world: 'signal', domain: 'trigger', category: 'core', busEligible: true },
  'ElementCount': { world: 'signal', domain: 'number', category: 'core', busEligible: true, semantics: 'count' },

  // Special types (Phase 3)
  'Domain': { world: 'field', domain: 'elementCount', category: 'internal', busEligible: false, semantics: 'domain' },

  // Internal types (not bus-eligible - structural/container types)
  'Field<Point>': { world: 'field', domain: 'point', category: 'internal', busEligible: false, semantics: 'position' },
  'Program': { world: 'signal', domain: 'program', category: 'internal', busEligible: false },
  'Render': { world: 'field', domain: 'renderTree', category: 'internal', busEligible: false },
  'RenderTree': { world: 'field', domain: 'renderTree', category: 'internal', busEligible: false },
  'RenderNode': { world: 'field', domain: 'renderNode', category: 'internal', busEligible: false },
  'RenderNode[]': { world: 'field', domain: 'renderNode', category: 'internal', busEligible: false, semantics: 'array' },
  'FilterDef': { world: 'field', domain: 'filterDef', category: 'internal', busEligible: false },
  'StrokeStyle': { world: 'field', domain: 'strokeStyle', category: 'internal', busEligible: false },
  'Scene': { world: 'field', domain: 'scene', category: 'internal', busEligible: false },
  'SceneTargets': { world: 'field', domain: 'sceneTargets', category: 'internal', busEligible: false },
  'SceneStrokes': { world: 'field', domain: 'sceneStrokes', category: 'internal', busEligible: false },
  'CanvasRender': { world: 'field', domain: 'canvasRender', category: 'internal', busEligible: false },
};

/**
 * Default values for core domains (JSON-serializable).
 */
export const CORE_DOMAIN_DEFAULTS: Record<CoreDomain, unknown> = {
  number: 0,
  vec2: { x: 0, y: 0 },
  color: '#000000',
  boolean: false,
  time: 0.0, // Always seconds!
  phase: 0.0,
  rate: 1.0,
  trigger: false, // Pulse state
};

/**
 * Check if two types are directly compatible (no adapters needed).
 */
export function isDirectlyCompatible(a: TypeDesc, b: TypeDesc): boolean {
  return a.world === b.world && a.domain === b.domain;
}

/**
 * Check if a type is eligible for bus routing.
 */
export function isBusEligible(typeDesc: TypeDesc): boolean {
  return typeDesc.busEligible && typeDesc.category === 'core';
}

/**
 * Get adapter paths for type conversion.
 * For now, returns empty if directly compatible.
 * Phase 2 will populate with actual adapter logic.
 */
export function getConvertiblePaths(from: TypeDesc, to: TypeDesc): AdapterPath[] {
  if (isDirectlyCompatible(from, to)) {
    return [{
      from,
      to,
      adapters: [],
      isHeavy: false
    }];
  }

  // Phase 2: Implement adapter registry lookup
  // For now, return empty to indicate no conversion path
  return [];
}

/**
 * Validate a default value against a TypeDesc.
 */
export function validateDefaultValue(typeDesc: TypeDesc, value: unknown): boolean {
  if (!isBusEligible(typeDesc)) {
    return false; // Internal types shouldn't have user-visible defaults
  }

  const domainDefault = CORE_DOMAIN_DEFAULTS[typeDesc.domain as CoreDomain];
  if (domainDefault === undefined) {
    return false;
  }

  // Basic type checking - could be enhanced
  switch (typeDesc.domain) {
    case 'number':
    case 'time':
    case 'phase':
    case 'rate':
      return typeof value === 'number';
    case 'boolean':
    case 'trigger':
      return typeof value === 'boolean';
    case 'vec2':
      return typeof value === 'object' && value !== null && 'x' in value && 'y' in value;
    case 'color':
      return typeof value === 'string';
    default:
      return false;
  }
}

/**
 * Normalize time units to seconds.
 * Phase 2: Handle more complex unit conversions.
 */
export function normalizeTimeUnit(value: number, fromUnit: 'ms' | 'seconds' | 'beats'): number {
  switch (fromUnit) {
    case 'ms':
      return value / 1000;
    case 'seconds':
      return value;
    case 'beats':
      // Assuming 120 BPM by default
      return value * 0.5;
    default:
      return value;
  }
}
