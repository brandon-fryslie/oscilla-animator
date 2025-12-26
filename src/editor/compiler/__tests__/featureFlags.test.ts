/**
 * Feature Flags Tests (P1-2)
 *
 * Tests for compiler feature flags, specifically the useUnifiedCompiler flag
 * that controls whether IR-based rendering is used.
 *
 * Validates:
 * - Default flag values
 * - Flag mutation (set/reset)
 * - Legacy path still works with flag disabled
 * - IR path works with flag enabled
 *
 * Reference: .agent_planning/compiler-rendering-integration/DOD-2025-12-26-110434.md §P1-2
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  getFeatureFlags,
  setFeatureFlags,
  resetFeatureFlags,
  enableUnifiedArchitecture,
} from "../featureFlags";

describe("Feature Flags", () => {
  // Reset flags after each test to avoid cross-test contamination
  afterEach(() => {
    resetFeatureFlags();
  });

  describe("Default Values", () => {
    it("should have useUnifiedCompiler defaulting to false", () => {
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
    });

    it("should have strictStateValidation defaulting to false", () => {
      const flags = getFeatureFlags();
      expect(flags.strictStateValidation).toBe(false);
    });

    it("should have busCompilation defaulting to false", () => {
      const flags = getFeatureFlags();
      expect(flags.busCompilation).toBe(false);
    });

    it("should have timeCtxPropagation defaulting to false", () => {
      const flags = getFeatureFlags();
      expect(flags.timeCtxPropagation).toBe(false);
    });

    it("should have requireTimeRoot defaulting to true", () => {
      const flags = getFeatureFlags();
      expect(flags.requireTimeRoot).toBe(true);
    });
  });

  describe("Flag Mutation", () => {
    it("should allow setting useUnifiedCompiler to true", () => {
      setFeatureFlags({ useUnifiedCompiler: true });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
    });

    it("should allow setting useUnifiedCompiler to false", () => {
      setFeatureFlags({ useUnifiedCompiler: true });
      setFeatureFlags({ useUnifiedCompiler: false });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
    });

    it("should preserve other flags when setting one flag", () => {
      setFeatureFlags({ useUnifiedCompiler: true });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
      expect(flags.strictStateValidation).toBe(false);
      expect(flags.busCompilation).toBe(false);
      expect(flags.timeCtxPropagation).toBe(false);
      expect(flags.requireTimeRoot).toBe(true);
    });

    it("should allow setting multiple flags at once", () => {
      setFeatureFlags({
        useUnifiedCompiler: true,
        strictStateValidation: true,
      });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.busCompilation).toBe(false);
    });

    it("should reset all flags to defaults", () => {
      setFeatureFlags({
        useUnifiedCompiler: true,
        strictStateValidation: true,
        busCompilation: true,
      });

      resetFeatureFlags();

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
      expect(flags.strictStateValidation).toBe(false);
      expect(flags.busCompilation).toBe(false);
      expect(flags.requireTimeRoot).toBe(true);
    });
  });

  describe("enableUnifiedArchitecture()", () => {
    it("should enable all unified architecture flags", () => {
      enableUnifiedArchitecture();

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.busCompilation).toBe(true);
      expect(flags.timeCtxPropagation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });

    it("should be reversible with resetFeatureFlags()", () => {
      enableUnifiedArchitecture();
      expect(getFeatureFlags().useUnifiedCompiler).toBe(true);

      resetFeatureFlags();
      expect(getFeatureFlags().useUnifiedCompiler).toBe(false);
    });
  });

  describe("Flag Behavior - Legacy Path", () => {
    it("should use legacy path with useUnifiedCompiler: false", () => {
      // Ensure flag is false (default)
      resetFeatureFlags();
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);

      // This test just verifies the flag state
      // Actual legacy compiler behavior is tested in integration.test.ts
      // and other compiler tests
    });

    it("should not affect legacy compiler when flag is false", () => {
      setFeatureFlags({ useUnifiedCompiler: false });

      // Legacy compiler tests continue to work
      // This is a smoke test - actual legacy tests are elsewhere
      expect(getFeatureFlags().useUnifiedCompiler).toBe(false);
    });
  });

  describe("Flag Behavior - IR Path", () => {
    it("should enable IR path with useUnifiedCompiler: true", () => {
      setFeatureFlags({ useUnifiedCompiler: true });
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);

      // This test just verifies the flag state
      // Actual IR rendering behavior is tested in IRRuntimeIntegration.test.ts
    });

    it("should allow toggling between legacy and IR paths", () => {
      // Start with legacy
      resetFeatureFlags();
      expect(getFeatureFlags().useUnifiedCompiler).toBe(false);

      // Switch to IR
      setFeatureFlags({ useUnifiedCompiler: true });
      expect(getFeatureFlags().useUnifiedCompiler).toBe(true);

      // Switch back to legacy
      setFeatureFlags({ useUnifiedCompiler: false });
      expect(getFeatureFlags().useUnifiedCompiler).toBe(false);

      // Switch to IR again
      setFeatureFlags({ useUnifiedCompiler: true });
      expect(getFeatureFlags().useUnifiedCompiler).toBe(true);
    });
  });

  describe("Flag Read", () => {
    it("should return current flags (TypeScript readonly)", () => {
      // The returned object is typed as readonly but not deeply frozen
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);

      // This verifies that getFeatureFlags() returns the current state
      setFeatureFlags({ useUnifiedCompiler: true });
      const updatedFlags = getFeatureFlags();
      expect(updatedFlags.useUnifiedCompiler).toBe(true);
    });
  });

  describe("Partial Flag Updates", () => {
    it("should allow partial updates without affecting other flags", () => {
      // Set initial state
      setFeatureFlags({
        useUnifiedCompiler: true,
        strictStateValidation: true,
      });

      // Partial update
      setFeatureFlags({ busCompilation: true });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.busCompilation).toBe(true);
      expect(flags.timeCtxPropagation).toBe(false);
    });

    it("should handle empty partial updates", () => {
      setFeatureFlags({ useUnifiedCompiler: true });
      setFeatureFlags({});

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
    });
  });
});
