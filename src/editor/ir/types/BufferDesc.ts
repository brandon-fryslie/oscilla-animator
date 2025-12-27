/**
 * Buffer Descriptors for Physical Storage Layout
 *
 * This module defines the physical storage contracts for materialized render data.
 * It complements TypeDesc (authoring-time semantics) with storage-time encodings.
 *
 * **Authoring vs Storage Split:**
 * - TypeDesc (authoring): What does this value mean? (field<color>, signal<vec2>)
 * - BufferDesc (storage): How is this value stored? (u8x4 premul RGBA, f32x2 LE)
 *
 * This separation prevents semantic types from leaking into physical storage,
 * ensures deterministic caching, and enables Rust/WASM portability.
 *
 * @module ir/types/BufferDesc
 * @see TypeDesc for authoring-time type semantics
 * @see design-docs/13-Renderer/04-Decision-to-IR.md for full specification
 */

// =============================================================================
// Color Buffer Descriptors
// =============================================================================

/**
 * Canonical color encoding for all render outputs.
 *
 * **This is the ONLY accepted color encoding for renderer consumption.**
 *
 * Properties:
 * - **Premultiplied**: Alpha already applied to RGB channels (required for correct blending)
 * - **Linear**: Not sRGB gamma (allows correct color math, Canvas2D handles conversion)
 * - **u8x4**: 4 bytes per color (RGBA order), compact and cache-friendly
 * - **Deterministic**: Quantization produces identical output for identical input
 *
 * LED/hardware outputs use OutputAdapter to map RGBA → device-specific formats.
 */
export type ColorEncoding = 'linear_premul_rgba8';

/**
 * Color buffer descriptor: u8x4 premultiplied linear RGBA.
 *
 * This is the authoritative contract for materialized color buffers.
 * All instance caches, render passes, and export pipelines must use this encoding.
 *
 * @example
 * ```typescript
 * const colorBuffer: ColorBufferDesc = {
 *   kind: 'u8x4',
 *   encoding: 'linear_premul_rgba8',
 *   channelOrder: 'RGBA',
 *   strideBytes: 4,
 * };
 * ```
 */
export interface ColorBufferDesc {
  /** Numeric type: u8x4 (4 unsigned bytes) - FIXED */
  readonly kind: 'u8x4';

  /** Color encoding: linear premultiplied RGBA - FIXED */
  readonly encoding: ColorEncoding;

  /** Channel order: RGBA - FIXED */
  readonly channelOrder: 'RGBA';

  /** Stride in bytes: 4 - FIXED */
  readonly strideBytes: 4;
}

/**
 * Canonical color buffer descriptor singleton.
 * Use this constant instead of constructing ColorBufferDesc instances.
 */
export const CANONICAL_COLOR_BUFFER_DESC: Readonly<ColorBufferDesc> = Object.freeze({
  kind: 'u8x4',
  encoding: 'linear_premul_rgba8',
  channelOrder: 'RGBA',
  strideBytes: 4,
} as const);

/**
 * Type guard: check if a value is a valid ColorBufferDesc.
 *
 * @param value - Value to check
 * @returns true if value conforms to ColorBufferDesc contract
 */
export function isColorBufferDesc(value: unknown): value is ColorBufferDesc {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === 'u8x4' &&
    v.encoding === 'linear_premul_rgba8' &&
    v.channelOrder === 'RGBA' &&
    v.strideBytes === 4
  );
}

// =============================================================================
// Path Buffer Descriptors
// =============================================================================

/**
 * Path command stream descriptor: u16 opcodes with little-endian byte order.
 *
 * This encoding provides:
 * - **u16 opcodes**: 65,536 opcode space (sufficient for 2D + 3D + extensions)
 * - **LE byte order**: Matches JS typed arrays, Rust default on x86/ARM, WASM standard
 * - **Deterministic**: Same commands produce identical byte sequences
 *
 * Command stream is separate from points stream (commands reference point indices).
 *
 * @example
 * ```typescript
 * const pathCmds: PathCommandStreamDesc = {
 *   opcodeWidth: 16,
 *   endianness: 'LE',
 * };
 * ```
 */
export interface PathCommandStreamDesc {
  /** Opcode width in bits: 16 (u16) - FIXED */
  readonly opcodeWidth: 16;

  /** Byte order: little-endian - FIXED */
  readonly endianness: 'LE';
}

/**
 * Canonical path command stream descriptor singleton.
 * Use this constant instead of constructing PathCommandStreamDesc instances.
 */
export const CANONICAL_PATH_COMMAND_DESC: Readonly<PathCommandStreamDesc> = Object.freeze({
  opcodeWidth: 16,
  endianness: 'LE',
} as const);

/**
 * Type guard: check if a value is a valid PathCommandStreamDesc.
 *
 * @param value - Value to check
 * @returns true if value conforms to PathCommandStreamDesc contract
 */
export function isPathCommandStreamDesc(value: unknown): value is PathCommandStreamDesc {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.opcodeWidth === 16 && v.endianness === 'LE';
}

// =============================================================================
// Path Flattening Policy
// =============================================================================

/**
 * Canonical flattening tolerance in screen pixels.
 *
 * This is the ONLY permitted tolerance value when flattening is enabled.
 * Chosen as perceptually invisible at typical DPR (device pixel ratio).
 *
 * **Why one canonical value:**
 * - Prevents cache fragmentation (fewer unique cache keys)
 * - Simplifies debugging (known, consistent behavior)
 * - Reduces decision fatigue (no arbitrary tolerance tuning)
 */
export const CANONICAL_FLATTEN_TOL_PX = 0.75;

/**
 * Path flattening policy: controls curve-to-polyline conversion.
 *
 * - **off**: Preserve curves (default) - best for quality, morphing, and GPU pipelines
 * - **on**: Flatten to polylines with canonical tolerance - best for Canvas2D performance
 *
 * Tolerance is in screen pixels (view-dependent), so cache keys must include
 * viewport/DPR when flattening is enabled.
 *
 * @example
 * ```typescript
 * // Default: keep curves
 * const keepCurves: FlattenPolicy = { kind: 'off' };
 *
 * // Performance mode: flatten with canonical tolerance
 * const flatten: FlattenPolicy = {
 *   kind: 'on',
 *   tolerancePx: CANONICAL_FLATTEN_TOL_PX,
 * };
 * ```
 */
export type FlattenPolicy =
  | { kind: 'off' }
  | { kind: 'on'; tolerancePx: typeof CANONICAL_FLATTEN_TOL_PX };

/**
 * Type guard: check if policy is "off" (keep curves).
 */
export function isFlattenOff(policy: FlattenPolicy): policy is { kind: 'off' } {
  return policy.kind === 'off';
}

/**
 * Type guard: check if policy is "on" (flatten curves).
 * Note: Doesn't narrow the tolerancePx type due to TypeScript limitations.
 */
export function isFlattenOn(policy: FlattenPolicy): policy is Extract<FlattenPolicy, { kind: 'on' }> {
  return policy.kind === 'on';
}

/**
 * Validate that a flatten policy uses the canonical tolerance (if enabled).
 *
 * @param policy - Policy to validate
 * @throws Error if policy uses non-canonical tolerance
 */
export function validateFlattenPolicy(policy: FlattenPolicy): void {
  if (policy.kind === 'on' && policy.tolerancePx !== CANONICAL_FLATTEN_TOL_PX) {
    throw new Error(
      `FlattenPolicy must use canonical tolerance (${CANONICAL_FLATTEN_TOL_PX}px), ` +
        `got ${policy.tolerancePx}px. Arbitrary tolerances are not permitted.`
    );
  }
}

// =============================================================================
// Buffer Descriptor Union
// =============================================================================

/**
 * Union of all buffer descriptor types.
 * Extend this union when adding new buffer types (e.g., f32x2 for positions).
 */
export type BufferDesc = ColorBufferDesc | PathCommandStreamDesc;

/**
 * Type guard: check if a value is any valid BufferDesc.
 */
export function isBufferDesc(value: unknown): value is BufferDesc {
  return isColorBufferDesc(value) || isPathCommandStreamDesc(value);
}
