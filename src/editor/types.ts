// =============================================================================
// Core Animation Types
// =============================================================================

import type { CoreDomain, Domain, TypeDesc as CoreTypeDesc } from '../core/types';

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
 * Re-exported from core/types.ts for unified type system across editor and runtime.
 */
export type TypeDesc = CoreTypeDesc;

/**
 * TypeWorld - world classification for values (signal, field, scalar, config).
 * Re-exported from ir/types/TypeDesc.ts for convenience.
 */
export type { TypeWorld } from './ir/types/TypeDesc';

/**
 * Domain - type domain classification (float, vec2, color, etc.).
 * Re-exported from core/types.ts for convenience.
 */
export type { Domain };

// Re-export CoreDomain for convenience
export type { CoreDomain };

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
  | UIControlHintXY
  | UIControlHintVec3;

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

/** XY coordinate control */
export interface UIControlHintXY {
  kind: "xy";
  min?: number;
  max?: number;
}

/** Vec3 (3D vector) control */
export interface UIControlHintVec3 {
  kind: "vec3";
  min?: number;
  max?: number;
}

// =============================================================================
// Block System
// =============================================================================

/**
 * Unique identifier for a block instance.
 */
export type BlockId = string;

/**
 * ID for a block type (e.g., 'Math.Add', 'Render.Circle').
 */
export type BlockTypeId = string;

/**
 * Port ID (e.g., 'value', 'frequency', 'phase').
 */
export type PortId = string;

/**
 * Block instance in the graph.
 */
export interface Block {
  readonly id: BlockId;
  readonly type: BlockTypeId;
  label?: string; // Optional user label
  params: Record<string, unknown>; // Block-specific parameters
  meta?: Record<string, unknown>; // Optional metadata for editor
}

// =============================================================================
// Edge System
// =============================================================================

/**
 * Unique identifier for an edge.
 */
export type EdgeId = string;

/**
 * Edge connecting two blocks.
 *
 * Edges are now uniform connections with optional metadata:
 * - Direction (push/pull) is now optional metadata
 * - sortKey handles ordering for buses
 * - Adapters/lenses are stored in lensChain
 */
export interface Edge {
  readonly id: EdgeId;
  readonly source: {
    readonly blockId: BlockId;
    readonly portId: PortId;
  };
  readonly target: {
    readonly blockId: BlockId;
    readonly portId: PortId;
  };

  /**
   * Optional semantic direction hint.
   * Most edges don't need this - the compiler determines dataflow.
   */
  readonly direction?: 'push' | 'pull';

  /**
   * Optional sort key for ordering (e.g., for bus publishers).
   * Lower values are evaluated first.
   */
  readonly sortKey?: number;

  /**
   * Optional lens chain for type adaptation.
   */
  readonly lensChain?: LensDefinition[];
}

// =============================================================================
// Bus System
// =============================================================================

/**
 * Unique identifier for a bus.
 */
export type BusId = string;

/**
 * How multiple publishers combine into a single bus value.
 */
export type CombineMode = 'sum' | 'average' | 'last' | 'max' | 'min' | 'layer';

/**
 * Alias for CombineMode (for backwards compatibility).
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

// =============================================================================
// Patch Types
// =============================================================================

/**
 * Complete patch - the top-level composition unit.
 */
export interface Patch {
  readonly id: PatchId;
  blocks: Block[];
  edges: Edge[];
}

// =============================================================================
// Lens System (Type Adapters)
// =============================================================================

/**
 * Lens definition - describes a type transformation step.
 */
export interface LensDefinition {
  /** Lens kind (e.g., 'multiply', 'offset', 'clamp') */
  kind: string;
  /** Lens parameters (e.g., { factor: 2.0 }) */
  params?: Record<string, unknown>;
}

/**
 * Adapter step - describes a type conversion.
 */
export interface AdapterStep {
  /** Adapter kind (e.g., 'scalarToField', 'fieldToSignal') */
  kind: string;
  /** Source type */
  from: TypeDesc;
  /** Target type */
  to: TypeDesc;
  /** Cost for adapter selection */
  cost: number;
}
