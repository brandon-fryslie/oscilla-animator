/**
 * TransformChain IR
 *
 * Transform chains for type conversions and value transformations.
 * Unifies adapters (type conversion) and lenses (value transformation).
 *
 * References:
 * - design-docs/12-Compiler-Final/05-Lenses-Adapters.md
 * - HANDOFF.md Topic 3: TransformChain IR
 */

import type { TypeDesc } from "./types";
import type { OpCode } from "./opcodes";

// Re-export TransformChainId for convenience
export type { TransformChainId } from "./types";

// =============================================================================
// Transform Chain Table
// =============================================================================

/**
 * Transform chain table - holds all transform chains.
 */
export interface TransformTable {
  chains: TransformChainIR[];
}

/**
 * Transform chain IR - ordered sequence of transformation steps.
 *
 * Philosophy:
 * - Adapters = type conversion (e.g., number -> vec2)
 * - Lenses = value transformation (e.g., scale, ease, quantize)
 * Both are represented uniformly as TransformStep entries.
 */
export interface TransformChainIR {
  /** Ordered sequence of steps (left-to-right application) */
  steps: TransformStepIR[];

  /** Input type */
  fromType: TypeDesc;

  /** Output type */
  toType: TypeDesc;

  /** Cost annotation for optimizer */
  cost: "cheap" | "normal" | "heavy";
}

// =============================================================================
// Transform Steps
// =============================================================================

/**
 * Transform step IR - individual transformation operation.
 */
export type TransformStepIR =
  // Type casts (no allocation, pure reinterpretation)
  | TransformStepCast

  // Pure function application
  | TransformStepMap

  // Common fast paths (specialized for performance)
  | TransformStepScaleBias
  | TransformStepNormalize
  | TransformStepQuantize
  | TransformStepEase

  // Stateful transform (explicit state, no closure memory)
  | TransformStepSlew;

/** Type cast step - reinterpret type without computation */
export interface TransformStepCast {
  kind: "cast";
  op: CastOp;
}

/** Map step - apply pure function */
export interface TransformStepMap {
  kind: "map";
  fn: PureFnRef;
  /** Optional const pool reference for params */
  paramsId?: number;
}

/** Scale and bias step - fast linear transform */
export interface TransformStepScaleBias {
  kind: "scaleBias";
  scale: number;
  bias: number;
}

/** Normalize step - map to range */
export interface TransformStepNormalize {
  kind: "normalize";
  mode: "0..1" | "-1..1";
}

/** Quantize step - snap to step values */
export interface TransformStepQuantize {
  kind: "quantize";
  step: number;
}

/** Ease step - apply easing curve */
export interface TransformStepEase {
  kind: "ease";
  /** Const pool reference for curve data */
  curveId: number;
}

/** Slew step - rate-limited smoothing (stateful) */
export interface TransformStepSlew {
  kind: "slew";
  /** Offset into state buffer */
  stateOffset: number;
  /** Slew rate */
  rate: number;
}

// =============================================================================
// Cast Operations
// =============================================================================

/**
 * Cast operations - type conversions.
 */
export type CastOp =
  | "numberToVec2"
  | "vec2ToNumber"
  | "colorToVec3"
  | "vec3ToColor"
  | "hslToRGB"
  | "rgbToHSL"
  | "numberToBool"
  | "boolToNumber";

// =============================================================================
// Pure Function Reference
// =============================================================================

/**
 * Pure function reference - either OpCode or WASM kernel.
 */
export type PureFnRef = PureFnRefOpcode | PureFnRefKernel;

/** Reference to a VM opcode */
export interface PureFnRefOpcode {
  kind: "opcode";
  opcode: OpCode;
}

/** Reference to a WASM kernel */
export interface PureFnRefKernel {
  kind: "kernel";
  kernelId: string;
}
