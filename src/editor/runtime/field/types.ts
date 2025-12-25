/**
 * @file Field Runtime Types
 * @description Core type definitions for the field materialization system.
 *
 * Key Concepts:
 * - Fields are lazy recipes (FieldHandle), NOT arrays
 * - Arrays only exist after materialize() is called
 * - FieldExprIR is the IR node representation
 * - FieldHandle is the evaluated recipe representation
 */

// =============================================================================
// Type Descriptors
// =============================================================================

/**
 * TypeDesc describes the element type of a field or signal.
 */
export type TypeDesc =
  | { kind: 'number' }
  | { kind: 'vec2' }
  | { kind: 'vec3' }
  | { kind: 'vec4' }
  | { kind: 'color' }
  | { kind: 'boolean' }
  | { kind: 'string' };

/** Number type descriptor singleton */
export const numberType: TypeDesc = { kind: 'number' };

/** Vec2 type descriptor singleton */
export const vec2Type: TypeDesc = { kind: 'vec2' };

/** Vec3 type descriptor singleton */
export const vec3Type: TypeDesc = { kind: 'vec3' };

/** Vec4 type descriptor singleton */
export const vec4Type: TypeDesc = { kind: 'vec4' };

/** Color type descriptor singleton */
export const colorType: TypeDesc = { kind: 'color' };

// =============================================================================
// Field Operations
// =============================================================================

/**
 * FieldOp: Unary operations on fields (map operations)
 */
export const FieldOp = {
  Identity: 'identity',
  Negate: 'negate',
  Abs: 'abs',
  Floor: 'floor',
  Ceil: 'ceil',
  Round: 'round',
  Sin: 'sin',
  Cos: 'cos',
  Sqrt: 'sqrt',
  Exp: 'exp',
  Log: 'log',
} as const;

export type FieldOp = typeof FieldOp[keyof typeof FieldOp];

/**
 * FieldZipOp: Binary operations on fields (zip operations)
 */
export const FieldZipOp = {
  Add: 'Add',
  Sub: 'Sub',
  Mul: 'Mul',
  Div: 'Div',
  Min: 'Min',
  Max: 'Max',
  Pow: 'Pow',
  Mod: 'Mod',
} as const;

export type FieldZipOp = typeof FieldZipOp[keyof typeof FieldZipOp];

/**
 * CombineMode: How to combine multiple field terms
 */
export type CombineMode = 'sum' | 'average' | 'min' | 'max' | 'last';

// =============================================================================
// ID Types
// =============================================================================

/**
 * FieldExprId: Unique identifier for a field expression node
 */
export type FieldExprId = number;

/**
 * SigExprId: Unique identifier for a signal expression node
 */
export type SigExprId = number;

// =============================================================================
// FieldHandle: Evaluated Recipe
// =============================================================================

/**
 * FieldHandle is the evaluated form of a field expression.
 * It's a recipe for producing an array, NOT the array itself.
 *
 * Handles are cheap to create and cache. Arrays are expensive and
 * only produced via materialize().
 */
export type FieldHandle =
  // Constant value broadcast to all elements
  | { kind: 'Const'; constId: number; type: TypeDesc }

  // Result of a unary operation
  | { kind: 'Op'; op: FieldOp; args: readonly FieldExprId[]; type: TypeDesc }

  // Zip two fields element-wise
  | { kind: 'Zip'; op: FieldZipOp; a: FieldExprId; b: FieldExprId; type: TypeDesc }

  // Broadcast a signal to all elements
  | { kind: 'Broadcast'; sigId: SigExprId; domainId: number; type: TypeDesc }

  // Combine multiple fields (from bus)
  | { kind: 'Combine'; mode: CombineMode; terms: readonly FieldExprId[]; type: TypeDesc }

  // Source field from domain
  | { kind: 'Source'; sourceTag: string; domainId: number; type: TypeDesc };

// =============================================================================
// FieldExprIR: IR Node Representation
// =============================================================================

/**
 * Function reference for operation opcodes
 */
export interface FnRef {
  opcode: string;
}

/**
 * Bus combine configuration
 */
export interface BusCombine {
  mode: CombineMode;
}

/**
 * Input slot reference
 */
export interface InputSlot {
  slot: number;
}

/**
 * FieldExprIR: IR node kinds for field expressions
 */
export type FieldExprIR =
  | { kind: 'const'; constId: number; type: TypeDesc }
  | { kind: 'map'; fn: FnRef; src: FieldExprId; type: TypeDesc }
  | { kind: 'zip'; fn: FnRef; a: FieldExprId; b: FieldExprId; type: TypeDesc }
  | { kind: 'sampleSignal'; signalSlot: SigExprId; domainId: number; type: TypeDesc }
  | { kind: 'busCombine'; combine: BusCombine; terms: readonly FieldExprId[]; type: TypeDesc }
  | { kind: 'inputSlot'; slot: InputSlot; type: TypeDesc }
  | { kind: 'source'; sourceTag: string; domainId: number; type: TypeDesc };

// =============================================================================
// Field Environment
// =============================================================================

/**
 * Slot handles for input slots
 */
export interface SlotHandles {
  read(slot: InputSlot): FieldHandle;
}

/**
 * Per-frame handle cache
 */
export interface FieldHandleCache {
  handles: FieldHandle[];
  stamp: number[];
  frameId: number;
}

/**
 * Environment for field handle evaluation
 */
export interface FieldEnv {
  /** Input slot handles */
  slotHandles: SlotHandles;

  /** Per-frame cache */
  cache: FieldHandleCache;

  /** Current domain ID */
  domainId: number;
}

// =============================================================================
// Buffer Formats
// =============================================================================

/**
 * BufferFormat: Typed array format for materialized buffers
 */
export type BufferFormat =
  | 'f32'
  | 'f64'
  | 'i32'
  | 'u32'
  | 'u8'
  | 'vec2f32'
  | 'vec3f32'
  | 'vec4f32'
  | 'rgba8';

/**
 * BufferLayout: Semantic layout of buffer data
 */
export type BufferLayout =
  | 'scalar'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'color';

// =============================================================================
// Materialization Types
// =============================================================================

/**
 * MaterializationRequest: Request to materialize a field to a typed array
 */
export interface MaterializationRequest {
  /** Field expression to materialize */
  fieldId: FieldExprId;

  /** Domain to materialize over */
  domainId: number;

  /** Buffer format for output */
  format: BufferFormat;

  /** Semantic layout */
  layout: BufferLayout;

  /** Debug tag for tracing */
  usageTag: string;
}

/**
 * Materialization debug trace
 */
export interface MaterializationTrace {
  fieldId: FieldExprId;
  domainId: number;
  count: number;
  format: BufferFormat;
  usage: string;
}

/**
 * Debug tracer interface
 */
export interface MaterializationDebug {
  traceMaterialization(trace: MaterializationTrace): void;
}
