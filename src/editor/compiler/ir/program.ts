/**
 * Compiled Program IR - Top-Level Container
 *
 * This module defines the complete CompiledProgramIR structure,
 * which is the single canonical output of the compiler.
 *
 * The runtime/player consumes only this structure - no closures,
 * no hidden JavaScript behavior.
 *
 * References:
 * - design-docs/12-Compiler-Final/02-IR-Schema.md §3
 * - design-docs/12-Compiler-Final/14-Compiled-IR-Program-Contract.md §1-9
 */

import type { NodeId, BusId, TypeTable } from "./types";
import type { TimeModelIR, ScheduleIR } from "./schedule";
import type { StateLayout } from "./stores";

// ============================================================================
// Top-Level Compiled Program (02-IR-Schema.md §3)
// ============================================================================

/**
 * CompiledProgramIR - The Complete Compiled Program
 *
 * This is the authoritative output of the compiler.
 * It contains everything needed to execute the program:
 * - Identity and provenance
 * - Time topology
 * - All execution tables (nodes, buses, fields, etc.)
 * - Execution schedule
 * - Output specifications
 * - Debug metadata
 *
 * Hard invariants:
 * - No closures - runtime evaluation is dispatch over dense IR arrays
 * - Deterministic - every ordering is fixed by IR, not object iteration
 * - Stable identities - every observable thing has a stable ID
 * - Portable - representable 1:1 in Rust (enums + vectors + typed buffers)
 * - Debuggable - every value traceable to (block, port, bus, transform, state)
 */
export interface CompiledProgramIR {
  // ============================================================================
  // Identity and Provenance
  // ============================================================================

  /** IR format version (bump only with intentional migrations) */
  irVersion: number;

  /** Stable patch identifier */
  patchId: string;

  /** Patch revision number (increments with each edit) */
  patchRevision: number;

  /** Unique compile identifier (UUIDv4 or similar) */
  compileId: string;

  /** Random seed for deterministic randomness */
  seed: number;

  // ============================================================================
  // Time Topology (Authoritative)
  // ============================================================================

  /**
   * Time model - authoritative time topology
   *
   * No "player looping" hacks - this is the single source of truth.
   */
  timeModel: TimeModelIR;

  // ============================================================================
  // Execution Tables
  // ============================================================================

  /** Type interning table */
  types: TypeTable;

  /** Node table (blocks and internal nodes) */
  nodes: NodeTable;

  /** Bus table */
  buses: BusTable;

  /** Lens (field transform) table */
  lenses: LensTable;

  /** Adapter (signal/scalar transform) table */
  adapters: AdapterTable;

  /** Field expression table (may be empty until runtime builds exprs) */
  fields: FieldExprTable;

  /** Constant pool (JSON + packed numeric values) */
  constants: ConstPool;

  /** State layout (for stateful nodes) */
  stateLayout: StateLayout;

  // ============================================================================
  // Execution Schedule
  // ============================================================================

  /**
   * Schedule - ordered execution plan
   *
   * The schedule defines exactly what steps to execute and in what order.
   */
  schedule: ScheduleIR;

  // ============================================================================
  // Outputs
  // ============================================================================

  /**
   * Output specifications (render roots, etc.)
   *
   * Defines what the program produces.
   */
  outputs: OutputSpec[];

  // ============================================================================
  // Debug and Metadata
  // ============================================================================

  /**
   * Program metadata
   *
   * Source mapping, labels, and debug information.
   * Always included (compact) for debuggability.
   */
  meta: ProgramMeta;
}

// ============================================================================
// Node Table (14-Compiled-IR-Program-Contract.md §3)
// ============================================================================

/**
 * Node Table
 *
 * Contains all nodes (user blocks + compiler-generated internal nodes).
 */
export interface NodeTable {
  /** Array of all nodes in the program */
  nodes: NodeIR[];
}

/**
 * Node IR
 *
 * Represents a single node (block instance or internal compiler node).
 */
export interface NodeIR {
  /** Stable node identifier */
  id: NodeId;

  /** Node type (interned string ID) */
  typeId: number;

  /** Input port count */
  inputCount: number;

  /** Output port count */
  outputCount: number;

  /** Optional compiler tag (for feature gating/versioning) */
  compilerTag?: number;

  /** Optional opcode reference (for primitive nodes) */
  opcodeId?: number;
}

// ============================================================================
// Bus Table (14-Compiled-IR-Program-Contract.md §3)
// ============================================================================

/**
 * Bus Table
 *
 * Contains all buses in the program.
 */
export interface BusTable {
  /** Array of all buses */
  buses: BusIR[];
}

/**
 * Bus IR
 *
 * Represents a single bus (modulation routing).
 */
export interface BusIR {
  /** Stable bus identifier */
  id: BusId;

  /** Bus type descriptor */
  type: import("./types").TypeDesc;

  /** Combine specification */
  combine: import("./schedule").CombineSpec;

  /** Default value (constant ID) */
  defaultValueConstId: number;

  /** Optional reserved role (e.g., "phaseA", "energy", "palette") */
  reservedRole?: string;
}

// ============================================================================
// Transform Tables (14-Compiled-IR-Program-Contract.md §4-5)
// ============================================================================

/**
 * Lens Table
 *
 * Field transforms (map, filter, reduce).
 * Placeholder for Phase 5 implementation.
 */
export interface LensTable {
  /** Array of lens transform chains */
  lenses: LensIR[];
}

/**
 * Lens IR (placeholder)
 */
export interface LensIR {
  id: number;
  // Full definition deferred to Phase 5
}

/**
 * Adapter Table
 *
 * Signal/scalar transforms.
 * Placeholder for Phase 4 implementation.
 */
export interface AdapterTable {
  /** Array of adapter transform chains */
  adapters: AdapterIR[];
}

/**
 * Adapter IR (placeholder)
 */
export interface AdapterIR {
  id: number;
  // Full definition deferred to Phase 4
}

// ============================================================================
// Field Expression Table (14-Compiled-IR-Program-Contract.md §5)
// ============================================================================

/**
 * Field Expression Table
 *
 * FieldExpr pool + materialization plan.
 * May be empty initially - runtime can build expressions lazily.
 *
 * Placeholder for Phase 5 implementation.
 */
export interface FieldExprTable {
  /** Array of field expression nodes */
  nodes: FieldExprNodeIR[];

  /** Materialization plan */
  materialization?: FieldMaterializationPlan;
}

/**
 * Field Expression Node IR (placeholder)
 */
export interface FieldExprNodeIR {
  id: string;
  // Full definition deferred to Phase 5
}

/**
 * Field Materialization Plan (placeholder)
 */
export interface FieldMaterializationPlan {
  /** Materialization requests */
  requests: unknown[];

  /** Coalesce groups (optional optimization) */
  coalesceGroups?: unknown[];
}

// ============================================================================
// Constant Pool (14-Compiled-IR-Program-Contract.md §7)
// ============================================================================

/**
 * Constant Pool
 *
 * Single place for JSON and packed numeric constants.
 * Used for default values, initial state, and parameter values.
 */
export interface ConstPool {
  /** JSON constants (stable indices) */
  json: unknown[];

  /** 64-bit float constants */
  f64: Float64Array;

  /** 32-bit float constants */
  f32: Float32Array;

  /** 32-bit integer constants */
  i32: Int32Array;

  /** Constant index (maps constId to storage location) */
  constIndex: ConstIndexEntry[];
}

/**
 * Constant Index Entry
 *
 * Maps a constant ID to its storage location.
 */
export type ConstIndexEntry =
  | { k: "json"; idx: number }
  | { k: "f64"; idx: number }
  | { k: "f32"; idx: number }
  | { k: "i32"; idx: number };

// ============================================================================
// Output Specification (02-IR-Schema.md §8)
// ============================================================================

/**
 * Output Specification
 *
 * Defines what the program produces (render trees, exports, etc.).
 */
export interface OutputSpec {
  /** Output identifier */
  id: string;

  /** Output kind */
  kind: "renderTree" | "export" | "debug";

  /** Slot containing the output value */
  slot: import("./types").ValueSlot;

  /** Optional label for UI */
  label?: string;
}

// ============================================================================
// Program Metadata (02-IR-Schema.md §17)
// ============================================================================

/**
 * Program Metadata
 *
 * Source mapping, labels, and compile warnings.
 * Used for debugging, UI selection, and error reporting.
 */
export interface ProgramMeta {
  /** Source map (IR -> editor blocks/ports) */
  sourceMap: SourceMapIR;

  /** User-friendly labels for debugger */
  names: {
    /** Node ID -> label */
    nodes: Record<NodeId, string>;

    /** Bus ID -> label */
    buses: Record<BusId, string>;

    /** Step ID -> label */
    steps: Record<import("./types").StepId, string>;
  };

  /** Optional compile warnings */
  warnings?: CompileWarningIR[];
}

/**
 * Source Map IR
 *
 * Maps IR elements back to editor blocks/ports.
 */
export interface SourceMapIR {
  /** Node ID -> editor block */
  nodeToEditorBlock?: Record<NodeId, { blockId: string; kind: "primitive" | "compositeInternal" }>;

  /** Port -> editor slot */
  portToEditorSlot?: Record<string, { blockId: string; slotId: string }>;
}

/**
 * Compile Warning IR
 */
export interface CompileWarningIR {
  /** Warning code */
  code: string;

  /** Warning message */
  message: string;

  /** Optional location */
  where?: {
    nodeId?: NodeId;
    busId?: BusId;
    stepId?: import("./types").StepId;
  };
}
