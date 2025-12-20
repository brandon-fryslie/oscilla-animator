/**
 * @file StateBlock - Explicit state management
 * @description State blocks are the ONLY places where state exists in the system.
 *
 * Architecture principle:
 * State only exists in explicit state blocks:
 * - Delay
 * - Integrate
 * - History
 * - User-defined state blocks
 *
 * Each state block:
 * - Declares its memory shape
 * - Declares its scrub policy
 * - Is visible in the UI
 * - Participates in cycle validation
 */

import type { TimeCtx } from './TimeCtx';

/**
 * Scrub policy determines how state blocks behave during scrubbing.
 *
 * - hold: Freeze at current value (default for most state)
 * - reset: Reset to initial value
 * - interpolate: Attempt to interpolate between states
 * - recompute: Recompute from t=0 to current time (expensive!)
 */
export type ScrubPolicy = 'hold' | 'reset' | 'interpolate' | 'recompute';

/**
 * StateShape describes the memory layout of a state block.
 *
 * Must be JSON-serializable for save/load and inspection.
 */
export interface StateShape {
  /** Type identifier for the state */
  readonly type: string;

  /** Memory fields with their types */
  readonly fields: Record<string, StateFieldDesc>;

  /** Size hint for memory allocation (bytes) */
  readonly sizeHint?: number;
}

/**
 * State field descriptor.
 */
export interface StateFieldDesc {
  /** Field type */
  readonly type: 'number' | 'boolean' | 'vec2' | 'buffer';

  /** Default value */
  readonly defaultValue: unknown;

  /** Buffer size (for buffer type) */
  readonly size?: number;
}

/**
 * State memory - runtime state for a state block instance.
 */
export interface StateMemory {
  /** State shape */
  readonly shape: StateShape;

  /** Current state values (mutable) */
  values: Record<string, unknown>;

  /** Initialization timestamp (frame when created) */
  readonly initFrame: number;
}

/**
 * State block interface - extends regular block with state-specific properties.
 */
export interface StateBlock {
  /** Block type (e.g., 'Delay', 'Integrate', 'History') */
  readonly type: string;

  /** State shape declaration */
  readonly stateShape: StateShape;

  /** Scrub policy for this block */
  readonly scrubPolicy: ScrubPolicy;

  /**
   * Initialize state memory for a new instance.
   */
  initState(frame: number): StateMemory;

  /**
   * Update state for a frame.
   *
   * @param state - Current state memory (mutated in place)
   * @param inputs - Input values for this frame
   * @param ctx - Time context
   */
  updateState(state: StateMemory, inputs: Record<string, unknown>, ctx: TimeCtx): void;

  /**
   * Compute output values from current state.
   *
   * @param state - Current state memory (read-only)
   * @param inputs - Input values for this frame
   * @param ctx - Time context
   * @returns Output values
   */
  computeOutputs(
    state: StateMemory,
    inputs: Record<string, unknown>,
    ctx: TimeCtx
  ): Record<string, unknown>;

  /**
   * Reconstruct state for scrubbing.
   *
   * Called when TimeCtx mode is 'scrub' and time jumps.
   *
   * @param state - State memory to reconstruct
   * @param targetTime - Target time to reconstruct to
   * @param ctx - Time context
   */
  reconstructState?(state: StateMemory, targetTime: number, ctx: TimeCtx): void;
}

/**
 * State block registry - maps block type to state block implementation.
 */
export class StateBlockRegistry {
  private blocks = new Map<string, StateBlock>();

  /**
   * Register a state block implementation.
   */
  register(type: string, block: StateBlock): void {
    if (this.blocks.has(type)) {
      throw new Error(`State block type '${type}' already registered`);
    }
    this.blocks.set(type, block);
  }

  /**
   * Get state block implementation by type.
   */
  get(type: string): StateBlock | undefined {
    return this.blocks.get(type);
  }

  /**
   * Check if a block type is a state block.
   */
  isStateBlock(type: string): boolean {
    return this.blocks.has(type);
  }

  /**
   * Get all registered state block types.
   */
  getAllTypes(): string[] {
    return Array.from(this.blocks.keys());
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.blocks.clear();
  }
}

/**
 * Global state block registry instance.
 */
export const stateBlockRegistry = new StateBlockRegistry();
