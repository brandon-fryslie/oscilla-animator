/**
 * @file Feature Flags - Compiler feature toggles
 * @description Controls which compiler and features are active.
 *
 * Feature flags allow gradual rollout of the unified architecture
 * while maintaining backward compatibility with the legacy compiler.
 */

export interface CompilerFeatureFlags {
  /**
   * Use unified compiler instead of legacy compiler.
   * When true, uses UnifiedCompiler for patch compilation.
   * When false, uses legacy compiler/integration.ts.
   */
  useUnifiedCompiler: boolean;

  /**
   * Enable strict state boundary validation.
   * When true, compiler rejects patches with implicit state.
   */
  strictStateValidation: boolean;

  /**
   * Enable bus compilation to Signal evaluators.
   * When false, buses use legacy runtime wiring.
   */
  busCompilation: boolean;

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
}

/**
 * Default feature flags.
 * Legacy compiler is the default until IR rendering is fully implemented.
 */
const DEFAULT_FLAGS: CompilerFeatureFlags = {
  useUnifiedCompiler: true,
  strictStateValidation: true,
  busCompilation: true,
  timeCtxPropagation: true,
  requireTimeRoot: true,
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
 * Convenience function for turning on all new features.
 */
export function enableUnifiedArchitecture(): void {
  currentFlags = {
    useUnifiedCompiler: true,
    strictStateValidation: true,
    busCompilation: true,
    timeCtxPropagation: true,
    requireTimeRoot: true, // Enforce TimeRoot in unified mode
  };
}

/**
 * Initialize feature flags from environment/localStorage.
 * Call this once at app startup.
 */
export function initializeFeatureFlags(): void {
  // Check localStorage for developer overrides
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem('compilerFeatureFlags');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        currentFlags = { ...DEFAULT_FLAGS, ...parsed };
        console.log('[FeatureFlags] Loaded from localStorage:', currentFlags);
        return;
      } catch (e) {
        console.warn('[FeatureFlags] Failed to parse localStorage flags:', e);
      }
    }
  }

  // Check environment variables (Vite import.meta.env)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env;

    if (env.VITE_USE_UNIFIED_COMPILER !== undefined) {
      currentFlags.useUnifiedCompiler = true;
    }
    if (env.VITE_STRICT_STATE_VALIDATION !== undefined) {
      currentFlags.strictStateValidation = env.VITE_STRICT_STATE_VALIDATION === 'true';
    }
    if (env.VITE_BUS_COMPILATION !== undefined) {
      currentFlags.busCompilation = env.VITE_BUS_COMPILATION === 'true';
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
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('compilerFeatureFlags', JSON.stringify(currentFlags));
    console.log('[FeatureFlags] Saved to localStorage:', currentFlags);
  }
}
