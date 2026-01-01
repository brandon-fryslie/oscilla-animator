/**
 * @file Feature Flags - Compiler feature toggles
 * @description Controls which compiler and features are active.
 *
 * Feature flags allow gradual rollout of the unified architecture
 * while maintaining backward compatibility.
 */

export interface CompilerFeatureFlags {
  /**
   * Enable strict state boundary validation.
   * When true, compiler rejects patches with implicit state.
   */
  strictStateValidation: boolean;

  /**
   * Enable TimeCtx propagation through all evaluators.
   * When false, uses legacy time management.
   */
  timeCtxPropagation: boolean;

  /**
   * Require exactly one TimeRoot block per patch.
   * When true, compiler rejects patches without TimeRoot or with multiple TimeRoots.
   * When false, compiler infers TimeModel from legacy time blocks or uses infinite default.
   */
  requireTimeRoot: boolean;

  /**
   * Enable IR compilation alongside closure compilation.
   * When true, compiler emits IR in addition to closures.
   * When false, compiler only produces closures (legacy mode).
   *
   * Toggle this to false to temporarily disable IR compilation for debugging.
   */
  emitIR: boolean;
}

/**
 * Default feature flags.
 * Unified compiler is now always used.
 */
const DEFAULT_FLAGS: CompilerFeatureFlags = {
  strictStateValidation: true,
  timeCtxPropagation: true,
  requireTimeRoot: true,
  emitIR: false, // Temporarily disabled - set to true to enable IR compilation
};

/**
 * Current feature flags.
 * Can be modified at runtime for testing.
 */
let currentFlags: CompilerFeatureFlags = { ...DEFAULT_FLAGS };

/**
 * Get current feature flags.
 */
export function getFeatureFlags(): Readonly<CompilerFeatureFlags> {
  return currentFlags;
}

/**
 * Set feature flags.
 * Primarily for testing - production code should use environment variables.
 */
export function setFeatureFlags(flags: Partial<CompilerFeatureFlags>): void {
  currentFlags = { ...currentFlags, ...flags };
}

/**
 * Reset feature flags to defaults.
 */
export function resetFeatureFlags(): void {
  currentFlags = { ...DEFAULT_FLAGS };
}

/**
 * Enable unified architecture features.
 * Convenience function for turning on all features.
 */
export function enableUnifiedArchitecture(): void {
  currentFlags = {
    strictStateValidation: true,
    timeCtxPropagation: true,
    requireTimeRoot: true,
    emitIR: true,
  };
}

/**
 * Initialize feature flags from environment/localStorage.
 * Call this once at app startup.
 */
export function initializeFeatureFlags(): void {
  // Check localStorage for developer overrides
  if (typeof window !== 'undefined' && window.localStorage != null) {
    const stored = localStorage.getItem('compilerFeatureFlags');
    if (stored != null && stored !== '') {
      try {
        const parsed: unknown = JSON.parse(stored);
        const parsedFlags = parsed as Partial<CompilerFeatureFlags>;
        currentFlags = { ...DEFAULT_FLAGS, ...parsedFlags };
        console.log('[FeatureFlags] Loaded from localStorage:', currentFlags);
        return;
      } catch (e) {
        console.warn('[FeatureFlags] Failed to parse localStorage flags:', e);
      }
    }
  }

  // Check environment variables (Vite import.meta.env)
  if (typeof import.meta !== 'undefined' && import.meta.env != null) {
    const env = import.meta.env as Record<string, unknown>;

    if (env.VITE_STRICT_STATE_VALIDATION !== undefined) {
      currentFlags.strictStateValidation = env.VITE_STRICT_STATE_VALIDATION === 'true';
    }
    if (env.VITE_TIMECTX_PROPAGATION !== undefined) {
      currentFlags.timeCtxPropagation = env.VITE_TIMECTX_PROPAGATION === 'true';
    }

    console.log('[FeatureFlags] Loaded from environment:', currentFlags);
  }
}

/**
 * Save current flags to localStorage for persistence.
 * Useful for developer testing.
 */
export function saveFeatureFlagsToLocalStorage(): void {
  if (typeof window !== 'undefined' && window.localStorage != null) {
    localStorage.setItem('compilerFeatureFlags', JSON.stringify(currentFlags));
    console.log('[FeatureFlags] Saved to localStorage:', currentFlags);
  }
}
