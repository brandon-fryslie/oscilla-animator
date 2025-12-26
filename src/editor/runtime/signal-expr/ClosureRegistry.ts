/**
 * Closure Registry
 *
 * Registry for storing and retrieving legacy closures by ID.
 * This is TEMPORARY infrastructure to support gradual migration from
 * closure-based signals to SignalExpr IR.
 *
 * Philosophy:
 * - O(1) lookup by closure ID
 * - Simple Map-based storage
 * - Clearable for hot-swap scenarios
 * - Will be removed once all blocks are migrated
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-06-closureBridge.md §P0 "Implement Closure Registry"
 * - design-docs/12-Compiler-Final/01.1-CompilerMigration-Roadmap.md
 */

import type { LegacyClosure } from "./LegacyClosure";

/**
 * Closure registry interface.
 *
 * Provides storage and retrieval of legacy closures by string ID.
 * IDs typically match block/port identity from the compiler.
 */
export interface ClosureRegistry {
  /** Register a legacy closure by ID */
  register(id: string, closure: LegacyClosure): void;

  /** Get a closure by ID, returns undefined if not found */
  get(id: string): LegacyClosure | undefined;

  /** Check if closure exists */
  has(id: string): boolean;

  /** Get count of registered closures */
  size(): number;

  /** Clear all closures (for testing/hot-swap) */
  clear(): void;
}

/**
 * Create a closure registry.
 *
 * Factory function for creating a new closure registry.
 * Uses Map for O(1) lookup performance.
 *
 * @returns New closure registry
 *
 * @example
 * ```typescript
 * const registry = createClosureRegistry();
 *
 * // Register a closure
 * registry.register('osc-1-output', (t, ctx) => Math.sin(t * 0.001));
 *
 * // Retrieve a closure
 * const closure = registry.get('osc-1-output');
 * if (closure) {
 *   const value = closure(1000, ctx);
 * }
 *
 * // Check existence
 * if (registry.has('osc-1-output')) {
 *   // closure exists
 * }
 *
 * // Clear all (hot-swap)
 * registry.clear();
 * ```
 */
export function createClosureRegistry(): ClosureRegistry {
  const closures = new Map<string, LegacyClosure>();

  return {
    register(id: string, closure: LegacyClosure): void {
      closures.set(id, closure);
    },

    get(id: string): LegacyClosure | undefined {
      return closures.get(id);
    },

    has(id: string): boolean {
      return closures.has(id);
    },

    size(): number {
      return closures.size;
    },

    clear(): void {
      closures.clear();
    },
  };
}
