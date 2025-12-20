/**
 * Editor Type Definitions
 *
 * Core types for the unified animation editor.
 * These types are loosely coupled to V4 kernel types - editor has its own
 * type system that compiles to V4 primitives.
 */

// =============================================================================
// Bus Type System (Core/Internal Split)
// =============================================================================

/**
 * World categories for type system.
 * Only signal and field - scalar is semantics, special is category.
 */
export type TypeWorld = 'signal' | 'field';

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
  | 'event';       // Generic events

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
 * Legacy alias for TypeDesc.
 * @deprecated Use TypeDesc instead
 */
export type TypeDescriptor = TypeDesc;

// =============================================================================
// Block System
// =============================================================================

/**
 * Unique identifier for a block instance.
 * Using string rather than branded type for now.
 */
export type BlockId = string;

/**
 * Reference to a specific port on a block.
 */
export interface PortRef {
  readonly blockId: BlockId;
  readonly port: string;
}

/**
 * Connection between two blocks.
 */
export interface Connection {
  readonly id: string;
  readonly from: PortRef;
  readonly to: PortRef;
}

// =============================================================================
// Bus System (Publisher/Listener Pattern)
// =============================================================================

/**
 * Bus identifier.
 */
export type BusId = string;

/**
 * Bus definition.
 */
export interface Bus {
  /** Unique identifier */
  readonly id: BusId;

  /** Human-readable name */
  name: string;

  /** Type constraint for this bus */
  typeConstraint: TypeDesc | null;

  /** Combination mode when multiple publishers write */
  combineMode: BusCombineMode;

  /** Display color for UI */
  color: string;
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
  readonly from: BindingEndpoint;

  /** Publisher priority (for deterministic ordering in combine) */
  sortKey: number;
}

/**
 * Lens types for transforming bus values at the listener side.
 * Lenses enable "binding phase/energy produces pleasing motion immediately".
 */
export type LensType =
  | 'ease'              // Apply easing curve (0-1 input)
  | 'slew'              // Rate-limited smoothing
  | 'quantize'          // Snap to discrete steps
  | 'scale'             // Linear scale + offset
  | 'warp'              // Phase warping (speed up/slow down parts of cycle)
  | 'broadcast'         // Lift scalar signal to constant field
  | 'perElementOffset'  // Add per-element phase offset to signal
  | 'clamp'             // Clamp value to range [min, max]
  | 'offset'            // Add constant offset to value
  | 'deadzone'          // Zero values below threshold
  | 'mapRange';         // Map input range to output range

/**
 * Lens definition - transformation applied between bus value and target parameter.
 */
export interface LensDefinition {
  /** Type of lens to apply */
  readonly type: LensType;

  /** Lens-specific parameters */
  readonly params: Record<string, unknown>;
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
  readonly to: BindingEndpoint;

  /** Optional adapter chain */
  readonly adapterChain?: AdapterStep[];

  /** Whether this listener is active */
  enabled: boolean;

  /** Optional lens to transform the bus value before applying (legacy, use lensStack) */
  readonly lens?: LensDefinition;

  /** Lens stack - applied in order from first to last */
  readonly lensStack?: LensDefinition[];
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
  | 'Field<Point>'
  | 'Field<Color>'
  | 'Field<Stroke>'
  | 'Signal<number>'
  | 'Signal<Unit>'
  | 'Signal<Phase>'
  | 'Signal<Color>'
  | 'Signal<Duration>'
  | 'Signal<Vec2>'
  | 'Signal<WobbleConfig>'
  | 'Signal<SpiralConfig>'
  | 'Signal<WaveConfig>'
  | 'Signal<JitterConfig>'
  | 'Event'
  | 'Program'
  | 'RenderTree'
  | 'FilterDef';

/**
 * Binding endpoint - represents a block's port.
 */
export interface BindingEndpoint {
  readonly blockId: BlockId;
  readonly port: string;
}

// =============================================================================
// Adapter Steps (for cross-domain conversions)
// =============================================================================

/**
 * Adapter step types.
 */
export type AdapterType =
  | 'phaseToNumber'
  | 'unitToNumber'
  | 'numberToPhase'
  | 'constSignal'
  | 'fieldSum'
  | 'fieldMean'
  | 'fieldMax';

/**
 * Adapter step definition.
 */
export interface AdapterStep {
  readonly type: AdapterType;
  readonly params?: Record<string, unknown>;
}

// =============================================================================
// Block Metadata
// =============================================================================

/**
 * Block categories for organization.
 */
export type BlockCategory =
  | 'Time'
  | 'Signal'
  | 'Field'
  | 'Domain'
  | 'Render'
  | 'Macros'
  | 'Audio'
  | 'Utility';

/**
 * Block subcategories for finer-grained organization.
 */
export type BlockSubcategory =
  | 'Time Sources'
  | 'Signal Processing'
  | 'Field Generation'
  | 'Domain Creation'
  | 'Render Output'
  | 'Animation Styles'
  | 'Audio Analysis'
  | 'Math'
  | 'Logic'
  | 'Utility';

/**
 * Block form - how the block is implemented.
 */
export type BlockForm = 'primitive' | 'composite' | 'macro';

/**
 * Lane kind - which lane this block belongs to.
 */
export type LaneKind = 'Time' | 'Phase' | 'Signal' | 'Field' | 'Program';

// =============================================================================
// Block Port Definitions
// =============================================================================

/**
 * Port direction.
 */
export type PortDirection = 'input' | 'output';

/**
 * Port definition on a block.
 */
export interface PortDefinition {
  readonly name: string;
  readonly direction: PortDirection;
  readonly slotType: SlotType;
  readonly label?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly defaultValue?: unknown;
}

// =============================================================================
// Block Parameter Schema
// =============================================================================

/**
 * Parameter types supported by blocks.
 */
export type ParamType =
  | 'number'
  | 'integer'
  | 'boolean'
  | 'string'
  | 'select'
  | 'color'
  | 'range';

/**
 * Parameter schema for block configuration.
 */
export interface ParamSchema {
  readonly key: string;
  readonly label: string;
  readonly type: ParamType;
  readonly defaultValue: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly { value: unknown; label: string }[];
  readonly description?: string;
}

// =============================================================================
// Block Definition
// =============================================================================

/**
 * Block definition - template for creating block instances.
 */
export interface BlockDefinition {
  /** Unique type identifier */
  readonly type: string;

  /** Human-readable label */
  readonly label: string;

  /** Block form */
  readonly form: BlockForm;

  /** Block category */
  readonly category: BlockCategory;

  /** Block subcategory */
  readonly subcategory?: BlockSubcategory;

  /** Description */
  readonly description: string;

  /** Input ports */
  readonly inputs: readonly PortDefinition[];

  /** Output ports */
  readonly outputs: readonly PortDefinition[];

  /** Default parameter values */
  readonly defaultParams: Record<string, unknown>;

  /** Parameter schema */
  readonly paramSchema: readonly ParamSchema[];

  /** Display color */
  readonly color?: string;

  /** Lane kind */
  readonly laneKind?: LaneKind;

  /** Priority for ordering (lower = earlier) */
  readonly priority?: number;

  /** Tags for filtering and metadata */
  readonly tags?: Record<string, unknown>;
}

// =============================================================================
// Block Instance
// =============================================================================

/**
 * Block instance in a patch.
 */
export interface BlockInstance {
  /** Unique instance ID */
  readonly id: BlockId;

  /** Block type (references BlockDefinition) */
  readonly type: string;

  /** Instance label (user can customize) */
  label: string;

  /** Parameter values */
  params: Record<string, unknown>;

  /** Position in UI */
  position?: { x: number; y: number };

  /** Lane assignment */
  laneKind?: LaneKind;

  /** UI metadata */
  ui?: {
    collapsed?: boolean;
    color?: string;
  };
}
