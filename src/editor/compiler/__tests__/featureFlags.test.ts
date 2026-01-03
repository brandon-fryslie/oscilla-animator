/**
 * Feature Flags Tests (P1-2)
 *
 * Tests for compiler feature flags, specifically the emitIR flag
 * that controls whether IR-based rendering is used.
 *
 * Validates:
 * - Default flag values (IR compilation is enabled by default)
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
    it("should have emitIR defaulting to true (IR compilation enabled)", () => {
      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true);
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
    it("should allow setting emitIR to false (disable IR compilation)", () => {
      setFeatureFlags({ emitIR: false });

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(false);
    });

    it("should allow setting emitIR back to true", () => {
      setFeatureFlags({ emitIR: false });
      setFeatureFlags({ emitIR: true });

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true);
    });

    it("should preserve other flags when setting one flag", () => {
      setFeatureFlags({ emitIR: false });

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(false);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.timeCtxPropagation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });

    it("should allow setting multiple flags at once", () => {
      setFeatureFlags({
        emitIR: false,
        strictStateValidation: false,
      });

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(false);
      expect(flags.strictStateValidation).toBe(false);
    });

    it("should reset all flags to defaults", () => {
      setFeatureFlags({
        emitIR: false, // Set to non-default
        strictStateValidation: false,
      });

      resetFeatureFlags();

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true); // Default is true
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });
  });

  describe("enableUnifiedArchitecture()", () => {
    it("should enable all unified architecture flags", () => {
      // First disable some flags
      setFeatureFlags({ emitIR: false, strictStateValidation: false });

      enableUnifiedArchitecture();

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true);
      expect(flags.strictStateValidation).toBe(true);
      expect(flags.timeCtxPropagation).toBe(true);
      expect(flags.requireTimeRoot).toBe(true);
    });

    it("should be idempotent (calling twice has same effect)", () => {
      enableUnifiedArchitecture();
      enableUnifiedArchitecture();

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true);
    });
  });

  describe("Flag Behavior - Closure-Only Mode", () => {
    it("should allow closure-only mode with emitIR: false", () => {
      setFeatureFlags({ emitIR: false });
      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(false);

      // This test just verifies the flag state
      // Actual compiler behavior is tested in integration.test.ts
    });
  });

  describe("Flag Behavior - IR Path", () => {
    it("should have IR path enabled by default", () => {
      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true); // Default is true (IR enabled)

      // This test just verifies the flag state
      // Actual IR rendering behavior is tested in IRRuntimeIntegration.test.ts
    });

    it("should allow toggling between closure-only and IR paths", () => {
      // Start with IR enabled (default)
      expect(getFeatureFlags().emitIR).toBe(true);

      // Disable IR
      setFeatureFlags({ emitIR: false });
      expect(getFeatureFlags().emitIR).toBe(false);

      // Enable IR again
      setFeatureFlags({ emitIR: true });
      expect(getFeatureFlags().emitIR).toBe(true);

      // Disable IR again
      setFeatureFlags({ emitIR: false });
      expect(getFeatureFlags().emitIR).toBe(false);
    });
  });

  describe("Flag Read", () => {
    it("should return current flags (TypeScript readonly)", () => {
      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(true); // Default is true (IR enabled)

      // This verifies that getFeatureFlags() returns the current state
      setFeatureFlags({ emitIR: false });
      const updatedFlags = getFeatureFlags();
      expect(updatedFlags.emitIR).toBe(false);
    });
  });

  describe("Partial Flag Updates", () => {
    it("should allow partial updates without affecting other flags", () => {
      // Set some flags to false
      setFeatureFlags({
        emitIR: false,
        strictStateValidation: false,
      });

      // Partial update - only change timeCtxPropagation
      setFeatureFlags({ timeCtxPropagation: false });

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(false);
      expect(flags.strictStateValidation).toBe(false);
      expect(flags.timeCtxPropagation).toBe(false);
      expect(flags.requireTimeRoot).toBe(true); // Unchanged from default
    });

    it("should handle empty partial updates", () => {
      setFeatureFlags({ emitIR: false });
      setFeatureFlags({});

      const flags = getFeatureFlags();
      expect(flags.emitIR).toBe(false);
    });
  });
});
