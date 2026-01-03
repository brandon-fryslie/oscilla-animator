/**
 * Feature Flags Tests (P1-2)
 *
 * Tests for compiler feature flags, specifically the useUnifiedCompiler flag
 * that controls whether IR-based rendering is used.
 *
 * Validates:
 * - Default flag values (new IR compiler is default)
 * - Flag mutation (set/reset)
 * - Toggling between paths
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
    it("should have useUnifiedCompiler defaulting to false (legacy compiler is default)", () => {
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
    });

    it("should have strictStateValidation defaulting to true", () => {
      const flags = getFeatureFlags();
      expect(flags.strictStateValidation).toBe(true);
    });

    it("should have timeCtxPropagation defaulting to true", () => {
      const flags = getFeatureFlags();
      expect(flags.timeCtxPropagation).toBe(true);
    });

    it("should have requireTimeRoot defaulting to true", () => {
      const flags = getFeatureFlags();
      expect(flags.requireTimeRoot).toBe(true);
    });
  });

  describe("Flag Mutation", () => {
    it("should allow setting useUnifiedCompiler to false (legacy mode)", () => {
      setFeatureFlags({ useUnifiedCompiler: false });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
    });

    it("should allow setting useUnifiedCompiler back to true", () => {
      setFeatureFlags({ useUnifiedCompiler: false });
      setFeatureFlags({ useUnifiedCompiler: true });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
    });

    it("should preserve other flags when setting one flag", () => {
      setFeatureFlags({ useUnifiedCompiler: false });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.timeCtxPropagation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });

    it("should allow setting multiple flags at once", () => {
      setFeatureFlags({
        useUnifiedCompiler: false,
        strictStateValidation: false,
      });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
      expect(flags.strictStateValidation).toBe(false);
    });

    it("should reset all flags to defaults", () => {
      setFeatureFlags({
        useUnifiedCompiler: true, // Set to non-default
        strictStateValidation: false,
      });

      resetFeatureFlags();

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false); // Default is now false
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });
  });

  describe("enableUnifiedArchitecture()", () => {
    it("should enable all unified architecture flags", () => {
      // First disable some flags
      setFeatureFlags({ useUnifiedCompiler: false, strictStateValidation: false });

      enableUnifiedArchitecture();

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.timeCtxPropagation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });

    it("should be idempotent (calling twice has same effect)", () => {
      enableUnifiedArchitecture();
      enableUnifiedArchitecture();

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(true);
    });
  });

  describe("Flag Behavior - Legacy Path", () => {
    it("should allow legacy path with useUnifiedCompiler: false", () => {
      setFeatureFlags({ useUnifiedCompiler: false });
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);

      // This test just verifies the flag state
      // Actual legacy compiler behavior is tested in integration.test.ts
    });
  });

  describe("Flag Behavior - IR Path", () => {
    it("should have IR path disabled by default", () => {
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false); // Default is now false (IR disabled)

      // This test just verifies the flag state
      // Actual IR rendering behavior is tested in IRRuntimeIntegration.test.ts
    });

    it("should allow toggling between legacy and IR paths", () => {
      // Start with legacy (default)
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
      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false); // Default is now false (IR disabled)

      // This verifies that getFeatureFlags() returns the current state
      setFeatureFlags({ useUnifiedCompiler: true });
      const updatedFlags = getFeatureFlags();
      expect(updatedFlags.useUnifiedCompiler).toBe(true);
    });
  });

  describe("Partial Flag Updates", () => {
    it("should allow partial updates without affecting other flags", () => {
      // Set some flags to false
      setFeatureFlags({
        useUnifiedCompiler: false,
        strictStateValidation: false,
      });

      // Partial update - only change timeCtxPropagation
      setFeatureFlags({ timeCtxPropagation: false });

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
      expect(flags.strictStateValidation).toBe(false);
      expect(flags.timeCtxPropagation).toBe(false);
      expect(flags.requireTimeRoot).toBe(true); // Unchanged from default
    });

    it("should handle empty partial updates", () => {
      setFeatureFlags({ useUnifiedCompiler: false });
      setFeatureFlags({});

      const flags = getFeatureFlags();
      expect(flags.useUnifiedCompiler).toBe(false);
    });
  });
});
