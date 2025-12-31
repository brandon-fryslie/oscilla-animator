/**
 * Time Resolution Tests
 *
 * Tests for resolveTime function - derives time signals from tAbsMs + TimeModel.
 */

import { describe, it, expect } from "vitest";
import { resolveTime, createTimeState } from "../timeResolution";
import type { TimeModelIR } from "../../../compiler/ir";

describe("resolveTime", () => {
  // =========================================================================
  // Finite Time Model
  // =========================================================================

  describe("finite time model", () => {
    const finiteModel: TimeModelIR = {
      kind: "finite",
      durationMs: 1000,
    };

    it("returns tModelMs clamped to duration", () => {
      const time = resolveTime(500, finiteModel);
      expect(time.tAbsMs).toBe(500);
      expect(time.tModelMs).toBe(500);
    });

    it("clamps tModelMs to 0 when tAbsMs < 0", () => {
      const time = resolveTime(-100, finiteModel);
      expect(time.tAbsMs).toBe(-100);
      expect(time.tModelMs).toBe(0);
    });

    it("clamps tModelMs to durationMs when tAbsMs > duration", () => {
      const time = resolveTime(2000, finiteModel);
      expect(time.tAbsMs).toBe(2000);
      expect(time.tModelMs).toBe(1000);
    });

    it("computes progress01 correctly", () => {
      const time0 = resolveTime(0, finiteModel);
      expect(time0.progress01).toBe(0);

      const time500 = resolveTime(500, finiteModel);
      expect(time500.progress01).toBe(0.5);

      const time1000 = resolveTime(1000, finiteModel);
      expect(time1000.progress01).toBe(1);
    });

    it("does not include cyclic-only fields", () => {
      const time = resolveTime(500, finiteModel);
      expect(time.phase01).toBeUndefined();
      expect(time.wrapEvent).toBeUndefined();
    });
  });

  // =========================================================================
  // Cyclic Time Model (Loop Mode)
  // =========================================================================

  describe("cyclic time model (loop)", () => {
    const cyclicModel: TimeModelIR = {
      kind: "cyclic",
      periodMs: 1000,
      mode: "loop",
      phaseDomain: "0..1",
    };

    it("wraps tModelMs to period", () => {
      const time = resolveTime(1500, cyclicModel);
      expect(time.tAbsMs).toBe(1500);
      expect(time.tModelMs).toBeCloseTo(500, 5);
    });

    it("computes phase01 correctly", () => {
      const time0 = resolveTime(0, cyclicModel);
      expect(time0.phase01).toBeCloseTo(0, 5);

      const time500 = resolveTime(500, cyclicModel);
      expect(time500.phase01).toBeCloseTo(0.5, 5);

      const time1500 = resolveTime(1500, cyclicModel);
      expect(time1500.phase01).toBeCloseTo(0.5, 5);
    });

    it("detects wrap event (simplified test)", () => {
      // Note: Wrap detection is approximate (uses 16.67ms frame delta)
      // This is a basic sanity check - full wrap detection would need
      // multiple frames with actual deltas
      const time = resolveTime(1000, cyclicModel);
      expect(time.wrapEvent).toBeDefined();
    });

    it("does not include finite-only fields", () => {
      const time = resolveTime(500, cyclicModel);
      expect(time.progress01).toBeUndefined();
    });
  });

  // =========================================================================
  // Infinite Time Model
  // =========================================================================

  describe("infinite time model", () => {
    const infiniteModel: TimeModelIR = {
      kind: "infinite",
      windowMs: 10000,
    };

    it("passes through tAbsMs unchanged", () => {
      const time = resolveTime(5000, infiniteModel);
      expect(time.tAbsMs).toBe(5000);
      expect(time.tModelMs).toBe(5000);
    });

    it("does not include derived signals", () => {
      const time = resolveTime(5000, infiniteModel);
      expect(time.phase01).toBeUndefined();
      expect(time.wrapEvent).toBeUndefined();
      expect(time.progress01).toBeUndefined();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("edge cases", () => {
    it("handles zero duration finite model", () => {
      const zeroModel: TimeModelIR = { kind: "finite", durationMs: 0 };
      const time = resolveTime(100, zeroModel);
      expect(time.tModelMs).toBe(0);
      expect(time.progress01).toBe(0); // Avoid divide by zero
    });

    it("handles zero period cyclic model", () => {
      const zeroModel: TimeModelIR = {
        kind: "cyclic",
        periodMs: 0,
        mode: "loop",
        phaseDomain: "0..1",
      };
      const time = resolveTime(100, zeroModel);
      expect(time.phase01).toBe(0); // Avoid divide by zero
    });
  });

  // =========================================================================
  // P2: Scrub Mode Detection
  // =========================================================================

  describe("scrub mode detection", () => {
    const cyclicModel: TimeModelIR = {
      kind: "cyclic",
      periodMs: 1000,
      mode: "loop",
      phaseDomain: "0..1",
    };

    it("detects scrub when mode === 'scrub'", () => {
      const timeState = createTimeState();
      const time = resolveTime(500, cyclicModel, timeState, 'scrub');
      expect(time.isScrub).toBe(true);
    });

    it("detects scrub when deltaMs < 0 (backward scrub)", () => {
      const timeState = createTimeState();

      // First frame: 1500ms
      resolveTime(1500, cyclicModel, timeState, 'playback');

      // Second frame: 500ms (backward scrub across wrap boundary)
      const time = resolveTime(500, cyclicModel, timeState, 'playback');
      expect(time.isScrub).toBe(true);
    });

    it("detects scrub when |deltaMs| > 1000 (large jump)", () => {
      const timeState = createTimeState();

      // First frame: 0ms
      resolveTime(0, cyclicModel, timeState, 'playback');

      // Second frame: 2000ms (large forward jump)
      const time = resolveTime(2000, cyclicModel, timeState, 'playback');
      expect(time.isScrub).toBe(true);
    });

    it("does NOT detect scrub for normal playback", () => {
      const timeState = createTimeState();

      // First frame: 0ms
      resolveTime(0, cyclicModel, timeState, 'playback');

      // Second frame: 16.67ms (60fps)
      const time = resolveTime(16.67, cyclicModel, timeState, 'playback');
      expect(time.isScrub).toBe(false);
    });

    it("suppresses wrapEvent during backward scrub", () => {
      const timeState = createTimeState();

      // First frame: 1500ms (tModelMs = 500ms)
      const time1 = resolveTime(1500, cyclicModel, timeState, 'playback');
      expect(time1.wrapEvent).toBe(0.0); // No wrap yet

      // Second frame: 500ms (backward scrub, crosses wrap boundary)
      // tModelMs goes from 500ms -> 500ms (no actual wrap in tModelMs)
      const time2 = resolveTime(500, cyclicModel, timeState, 'playback');
      expect(time2.isScrub).toBe(true);
      expect(time2.wrapEvent).toBe(0.0); // Suppressed due to scrub
    });

    it("suppresses wrapEvent during large forward jump", () => {
      const timeState = createTimeState();

      // First frame: 0ms
      resolveTime(0, cyclicModel, timeState, 'playback');

      // Second frame: 2500ms (large jump, crosses multiple wraps)
      const time = resolveTime(2500, cyclicModel, timeState, 'playback');
      expect(time.isScrub).toBe(true);
      expect(time.wrapEvent).toBe(0.0); // Suppressed due to scrub
    });

    it("fires wrapEvent during normal playback wrap", () => {
      const timeState = createTimeState();

      // First frame: 950ms
      const time1 = resolveTime(950, cyclicModel, timeState, 'playback');
      expect(time1.wrapEvent).toBe(0.0); // No wrap yet

      // Second frame: 1010ms (normal playback, crosses wrap)
      const time2 = resolveTime(1010, cyclicModel, timeState, 'playback');
      expect(time2.isScrub).toBe(false);
      expect(time2.wrapEvent).toBe(1.0); // Wrap event fires
    });

    it("defaults to playback mode when mode not specified", () => {
      const timeState = createTimeState();

      // First frame: 0ms
      resolveTime(0, cyclicModel, timeState);

      // Second frame: 16.67ms (no mode specified)
      const time = resolveTime(16.67, cyclicModel, timeState);
      expect(time.isScrub).toBe(false);
    });
  });
});
