/**
 * Core types for unified transform abstraction.
 *
 * Transforms (adapters + lenses) are applied to artifacts flowing through
 * the compilation graph. This module provides a normalized "stack" view
 * over the fragmented storage layer ({ adapterChain?, lensStack? }).
 */

import type { AdapterStep, LensInstance } from '../types';

/**
 * Scope where a transform is being applied.
 *
 * - 'wire': Connection between block outputs and inputs
 * - 'publisher': Block output flowing into a bus (pre-combine)
 * - 'listener': Bus value flowing into a block input (post-combine)
 * - 'lensParam': Lens parameter bindings (recursive context)
 */
export type TransformScope = 'wire' | 'publisher' | 'listener' | 'lensParam';

/**
 * Normalized transform step in a stack.
 *
 * Adapters and lenses are unified into a single sequence with explicit
 * enabled state (defaults to true if missing in storage).
 */
export type TransformStep =
  | { kind: 'adapter'; enabled: boolean; step: AdapterStep }
  | { kind: 'lens'; enabled: boolean; lens: LensInstance };

/**
 * Normalized transform stack - always an array, never optional.
 *
 * The storage layer (Connection, Publisher, Listener) may have:
 *   { adapterChain?: AdapterStep[], lensStack?: LensInstance[] }
 *
 * This type represents the normalized view where:
 *   - undefined → []
 *   - missing 'enabled' → true
 *   - adapters and lenses are interleaved in application order
 */
export type TransformStack = ReadonlyArray<TransformStep>;

/**
 * Storage representation of transforms (as stored in patch).
 * This is what Connection, Publisher, and Listener objects contain.
 */
export interface TransformStorage {
  adapterChain?: AdapterStep[];
  lensStack?: LensInstance[];
}
