/**
 * @file Signal Bridge Tests
 * @description Tests for temporary signal evaluation bridge
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SignalBridge,
  globalSignalBridge,
  UnregisteredSignalError,
  type SignalClosure,
  type SigEnv,
} from "../SignalBridge";

describe("SignalBridge", () => {
  let bridge: SignalBridge;

  beforeEach(() => {
    bridge = new SignalBridge();
  });

  describe("Registration", () => {
    it("should register a signal closure", () => {
      const closure: SignalClosure = (t) => t * 2;

      bridge.registerSignal(1, closure);

      expect(bridge.hasSignal(1)).toBe(true);
      expect(bridge.signalCount).toBe(1);
    });

    it("should register multiple signals", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(2, (t) => t * 2);
      bridge.registerSignal(3, (t) => t * 3);

      expect(bridge.signalCount).toBe(3);
      expect(bridge.hasSignal(1)).toBe(true);
      expect(bridge.hasSignal(2)).toBe(true);
      expect(bridge.hasSignal(3)).toBe(true);
    });

    it("should overwrite existing signal when registering same ID", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(1, (t) => t * 100);

      const env: SigEnv = { time: 10 };
      expect(bridge.evalSig(1, env)).toBe(1000);
    });

    it("should return registered signal IDs", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(5, (t) => t);
      bridge.registerSignal(10, (t) => t);

      const ids = bridge.getRegisteredSignalIds();

      expect(ids).toContain(1);
      expect(ids).toContain(5);
      expect(ids).toContain(10);
      expect(ids.length).toBe(3);
    });
  });

  describe("Unregistration", () => {
    it("should unregister a signal", () => {
      bridge.registerSignal(1, (t) => t);

      const wasRemoved = bridge.unregisterSignal(1);

      expect(wasRemoved).toBe(true);
      expect(bridge.hasSignal(1)).toBe(false);
      expect(bridge.signalCount).toBe(0);
    });

    it("should return false when unregistering non-existent signal", () => {
      const wasRemoved = bridge.unregisterSignal(999);

      expect(wasRemoved).toBe(false);
    });

    it("should allow re-registration after unregistration", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.unregisterSignal(1);
      bridge.registerSignal(1, (t) => t * 2);

      const env: SigEnv = { time: 10 };
      expect(bridge.evalSig(1, env)).toBe(20);
    });
  });

  describe("Evaluation", () => {
    it("should evaluate constant signal", () => {
      bridge.registerSignal(1, () => 42);

      const env: SigEnv = { time: 0 };
      const value = bridge.evalSig(1, env);

      expect(value).toBe(42);
    });

    it("should evaluate time-dependent signal", () => {
      bridge.registerSignal(1, (t) => t / 1000);

      const env1: SigEnv = { time: 1000 };
      const env2: SigEnv = { time: 2000 };

      expect(bridge.evalSig(1, env1)).toBe(1);
      expect(bridge.evalSig(1, env2)).toBe(2);
    });

    it("should evaluate sinusoidal signal", () => {
      bridge.registerSignal(1, (t) => Math.sin(t / 1000));

      const env: SigEnv = { time: Math.PI * 500 }; // sin(π/2) = 1
      const value = bridge.evalSig(1, env);

      expect(value).toBeCloseTo(1, 10);
    });

    it("should evaluate multiple different signals correctly", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(2, (t) => t * 2);
      bridge.registerSignal(3, (t) => t + 100);

      const env: SigEnv = { time: 10 };

      expect(bridge.evalSig(1, env)).toBe(10);
      expect(bridge.evalSig(2, env)).toBe(20);
      expect(bridge.evalSig(3, env)).toBe(110);
    });

    it("should pass correct time value to closure", () => {
      let capturedTime: number | undefined;
      bridge.registerSignal(1, (t) => {
        capturedTime = t;
        return 0;
      });

      const env: SigEnv = { time: 12345 };
      bridge.evalSig(1, env);

      expect(capturedTime).toBe(12345);
    });
  });

  describe("Error handling", () => {
    it("should throw UnregisteredSignalError for unregistered signal", () => {
      const env: SigEnv = { time: 0 };

      expect(() => bridge.evalSig(999, env)).toThrow(UnregisteredSignalError);
    });

    it("should include signal ID in error message", () => {
      const env: SigEnv = { time: 0 };

      try {
        bridge.evalSig(42, env);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(UnregisteredSignalError);
        const err = error as UnregisteredSignalError;
        expect(err.message).toContain("Signal 42");
        expect(err.message).toContain("registerSignal()");
      }
    });

    it("should throw even if signal was previously registered but unregistered", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.unregisterSignal(1);

      const env: SigEnv = { time: 0 };

      expect(() => bridge.evalSig(1, env)).toThrow(UnregisteredSignalError);
    });
  });

  describe("Clear", () => {
    it("should clear all signals", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(2, (t) => t);
      bridge.registerSignal(3, (t) => t);

      bridge.clear();

      expect(bridge.signalCount).toBe(0);
      expect(bridge.hasSignal(1)).toBe(false);
      expect(bridge.hasSignal(2)).toBe(false);
      expect(bridge.hasSignal(3)).toBe(false);
    });

    it("should allow registration after clear", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.clear();
      bridge.registerSignal(2, (t) => t * 2);

      expect(bridge.signalCount).toBe(1);
      expect(bridge.hasSignal(2)).toBe(true);
    });

    it("should be safe to call clear on empty bridge", () => {
      expect(() => bridge.clear()).not.toThrow();
      expect(bridge.signalCount).toBe(0);
    });
  });

  describe("Signal count", () => {
    it("should start at zero", () => {
      expect(bridge.signalCount).toBe(0);
    });

    it("should increment with each registration", () => {
      bridge.registerSignal(1, (t) => t);
      expect(bridge.signalCount).toBe(1);

      bridge.registerSignal(2, (t) => t);
      expect(bridge.signalCount).toBe(2);
    });

    it("should not increment when overwriting signal", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(1, (t) => t * 2);

      expect(bridge.signalCount).toBe(1);
    });

    it("should decrement when unregistering", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.registerSignal(2, (t) => t);

      bridge.unregisterSignal(1);

      expect(bridge.signalCount).toBe(1);
    });
  });

  describe("hasSignal", () => {
    it("should return false for unregistered signal", () => {
      expect(bridge.hasSignal(999)).toBe(false);
    });

    it("should return true for registered signal", () => {
      bridge.registerSignal(1, (t) => t);

      expect(bridge.hasSignal(1)).toBe(true);
    });

    it("should return false after unregistration", () => {
      bridge.registerSignal(1, (t) => t);
      bridge.unregisterSignal(1);

      expect(bridge.hasSignal(1)).toBe(false);
    });
  });

  describe("Complex signal closures", () => {
    it("should support closures with state (counter)", () => {
      let counter = 0;
      bridge.registerSignal(1, () => {
        counter++;
        return counter;
      });

      const env: SigEnv = { time: 0 };

      expect(bridge.evalSig(1, env)).toBe(1);
      expect(bridge.evalSig(1, env)).toBe(2);
      expect(bridge.evalSig(1, env)).toBe(3);
    });

    it("should support closures with captured variables", () => {
      const amplitude = 10;
      const frequency = 2;

      bridge.registerSignal(1, (t) => amplitude * Math.sin(frequency * t));

      const env: SigEnv = { time: Math.PI / 4 };
      const value = bridge.evalSig(1, env);

      expect(value).toBeCloseTo(10, 5);
    });

    it("should support multi-line closure logic", () => {
      bridge.registerSignal(1, (t) => {
        const normalized = t / 1000;
        const clamped = Math.max(0, Math.min(1, normalized));
        return clamped * 100;
      });

      expect(bridge.evalSig(1, { time: 0 })).toBe(0);
      expect(bridge.evalSig(1, { time: 500 })).toBe(50);
      expect(bridge.evalSig(1, { time: 1000 })).toBe(100);
      expect(bridge.evalSig(1, { time: 2000 })).toBe(100); // Clamped
    });
  });

  describe("Edge cases", () => {
    it("should handle signal ID 0", () => {
      bridge.registerSignal(0, (t) => t);

      expect(bridge.hasSignal(0)).toBe(true);
      expect(bridge.evalSig(0, { time: 42 })).toBe(42);
    });

    it("should handle large signal IDs", () => {
      const largeId = 999999;
      bridge.registerSignal(largeId, (t) => t);

      expect(bridge.hasSignal(largeId)).toBe(true);
      expect(bridge.evalSig(largeId, { time: 100 })).toBe(100);
    });

    it("should handle negative signal values", () => {
      bridge.registerSignal(1, () => -42);

      expect(bridge.evalSig(1, { time: 0 })).toBe(-42);
    });

    it("should handle NaN signal values", () => {
      bridge.registerSignal(1, () => NaN);

      expect(Number.isNaN(bridge.evalSig(1, { time: 0 }))).toBe(true);
    });

    it("should handle Infinity signal values", () => {
      bridge.registerSignal(1, () => Infinity);

      expect(bridge.evalSig(1, { time: 0 })).toBe(Infinity);
    });

    it("should handle zero time", () => {
      bridge.registerSignal(1, (t) => t * 2);

      expect(bridge.evalSig(1, { time: 0 })).toBe(0);
    });

    it("should handle negative time", () => {
      bridge.registerSignal(1, (t) => t);

      expect(bridge.evalSig(1, { time: -1000 })).toBe(-1000);
    });
  });
});

describe("Global SignalBridge", () => {
  // Note: These tests may affect each other if run in parallel
  // Clear the global bridge before each test

  beforeEach(() => {
    globalSignalBridge.clear();
  });

  it("should be a SignalBridge instance", () => {
    expect(globalSignalBridge).toBeInstanceOf(SignalBridge);
  });

  it("should work like a regular bridge", () => {
    globalSignalBridge.registerSignal(1, (t) => t * 2);

    expect(globalSignalBridge.evalSig(1, { time: 10 })).toBe(20);
  });

  it("should persist across accesses", () => {
    globalSignalBridge.registerSignal(1, (t) => t);

    // Access it elsewhere
    const value = globalSignalBridge.evalSig(1, { time: 42 });

    expect(value).toBe(42);
  });
});
