/**
 * EventStore Unit Tests
 *
 * Tests for EventStore - discrete event trigger storage with one-shot semantics.
 *
 * Per DOD lines 57-60:
 * - Test: EventStore.trigger() then check() returns true
 * - Test: EventStore.check() on unset event returns false
 * - Test: EventStore.reset() clears all events
 * - Test: Payload is preserved after trigger, accessible via getPayload()
 */

import { describe, it, expect, beforeEach } from "vitest";
import { EventStore } from "../EventStore";

describe("EventStore", () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore();
  });

  // =========================================================================
  // Basic Trigger/Check Semantics
  // =========================================================================

  describe("trigger and check", () => {
    it("check() returns true after trigger()", () => {
      const slot = 42;

      // Trigger the event
      store.trigger(slot);

      // Check should return true
      expect(store.check(slot)).toBe(true);
    });

    it("check() returns false for unset event", () => {
      const slot = 42;

      // Never triggered
      expect(store.check(slot)).toBe(false);
    });

    it("check() returns false for different slot", () => {
      const slot1 = 42;
      const slot2 = 43;

      // Trigger slot1
      store.trigger(slot1);

      // Check slot2 should return false
      expect(store.check(slot2)).toBe(false);
    });

    it("multiple triggers to same slot overwrite", () => {
      const slot = 42;

      // First trigger
      store.trigger(slot, { phase: 0.5, count: 1, deltaMs: 16.67 });

      // Second trigger with different payload
      store.trigger(slot, { phase: 0.8, count: 2, deltaMs: 16.67 });

      // Check returns true (still triggered)
      expect(store.check(slot)).toBe(true);

      // Payload is the latest one
      const payload = store.getPayload(slot);
      expect(payload).toEqual({ phase: 0.8, count: 2, deltaMs: 16.67 });
    });
  });

  // =========================================================================
  // Payload Storage
  // =========================================================================

  describe("payload storage", () => {
    it("preserves payload after trigger", () => {
      const slot = 42;
      const payload = { phase: 0.95, count: 3, deltaMs: 16.67 };

      // Trigger with payload
      store.trigger(slot, payload);

      // Payload should be accessible
      expect(store.getPayload(slot)).toEqual(payload);
    });

    it("returns undefined for unset event payload", () => {
      const slot = 42;

      // Never triggered
      expect(store.getPayload(slot)).toBeUndefined();
    });

    it("trigger without payload stores triggered=true with no payload", () => {
      const slot = 42;

      // Trigger without payload
      store.trigger(slot);

      // Check returns true
      expect(store.check(slot)).toBe(true);

      // Payload is undefined
      expect(store.getPayload(slot)).toBeUndefined();
    });

    it("payload includes correct phase, count, deltaMs", () => {
      const slot = 42;

      store.trigger(slot, {
        phase: 0.123456,
        count: 42,
        deltaMs: 16.666667,
      });

      const payload = store.getPayload(slot);
      expect(payload).toBeDefined();
      expect(payload!.phase).toBeCloseTo(0.123456, 6);
      expect(payload!.count).toBe(42);
      expect(payload!.deltaMs).toBeCloseTo(16.666667, 6);
    });
  });

  // =========================================================================
  // Reset Semantics (Frame Boundaries)
  // =========================================================================

  describe("reset", () => {
    it("reset() clears all events", () => {
      const slot1 = 42;
      const slot2 = 43;

      // Trigger multiple events
      store.trigger(slot1, { phase: 0.5, count: 1, deltaMs: 16.67 });
      store.trigger(slot2, { phase: 0.8, count: 2, deltaMs: 16.67 });

      // Both should be triggered
      expect(store.check(slot1)).toBe(true);
      expect(store.check(slot2)).toBe(true);

      // Reset
      store.reset();

      // Both should now return false
      expect(store.check(slot1)).toBe(false);
      expect(store.check(slot2)).toBe(false);
    });

    it("reset() clears all payloads", () => {
      const slot = 42;

      // Trigger with payload
      store.trigger(slot, { phase: 0.95, count: 3, deltaMs: 16.67 });
      expect(store.getPayload(slot)).toBeDefined();

      // Reset
      store.reset();

      // Payload should be undefined
      expect(store.getPayload(slot)).toBeUndefined();
    });

    it("events can be triggered again after reset", () => {
      const slot = 42;

      // Trigger, reset, trigger again
      store.trigger(slot, { phase: 0.5, count: 1, deltaMs: 16.67 });
      store.reset();
      store.trigger(slot, { phase: 0.8, count: 2, deltaMs: 16.67 });

      // Should be triggered with new payload
      expect(store.check(slot)).toBe(true);
      expect(store.getPayload(slot)).toEqual({
        phase: 0.8,
        count: 2,
        deltaMs: 16.67,
      });
    });

    it("reset() is idempotent", () => {
      const slot = 42;

      store.trigger(slot);
      store.reset();
      store.reset(); // Second reset

      // Should still return false
      expect(store.check(slot)).toBe(false);
    });
  });

  // =========================================================================
  // One-Shot Semantics (Events Fire Once Per Frame)
  // =========================================================================

  describe("one-shot semantics", () => {
    it("simulates frame lifecycle: trigger → check → reset → no event", () => {
      const slot = 42;

      // Frame 1: Event fires
      store.trigger(slot, { phase: 0.95, count: 1, deltaMs: 16.67 });
      expect(store.check(slot)).toBe(true); // Event detected

      // Frame 2: Reset at start
      store.reset();
      expect(store.check(slot)).toBe(false); // Event cleared

      // Frame 3: No new trigger
      expect(store.check(slot)).toBe(false); // Still no event
    });

    it("different events can trigger independently", () => {
      const wrapSlot = 42;
      const customSlot = 100;

      // Trigger wrap event
      store.trigger(wrapSlot, { phase: 1.0, count: 1, deltaMs: 16.67 });

      // Trigger custom event (no payload)
      store.trigger(customSlot);

      // Both should be triggered
      expect(store.check(wrapSlot)).toBe(true);
      expect(store.check(customSlot)).toBe(true);

      // Wrap has payload, custom does not
      expect(store.getPayload(wrapSlot)).toBeDefined();
      expect(store.getPayload(customSlot)).toBeUndefined();

      // Reset clears both
      store.reset();
      expect(store.check(wrapSlot)).toBe(false);
      expect(store.check(customSlot)).toBe(false);
    });
  });

  // =========================================================================
  // Convenience Methods (Ergonomics)
  // =========================================================================

  describe("consume (check + getPayload combined)", () => {
    it("returns payload when event is triggered", () => {
      const slot = 42;
      const payload = { phase: 0.95, count: 3, deltaMs: 16.67 };

      store.trigger(slot, payload);

      // consume() should return payload
      const consumed = store.consume(slot);
      expect(consumed).toEqual(payload);
    });

    it("returns undefined when event is not triggered", () => {
      const slot = 42;

      // Never triggered
      const consumed = store.consume(slot);
      expect(consumed).toBeUndefined();
    });

    it("returns undefined for triggered event without payload", () => {
      const slot = 42;

      // Trigger without payload
      store.trigger(slot);

      // consume() returns undefined (no payload, even though triggered)
      const consumed = store.consume(slot);
      expect(consumed).toBeUndefined();
    });

    it("returns undefined after reset", () => {
      const slot = 42;
      const payload = { phase: 0.5, count: 1, deltaMs: 16.67 };

      store.trigger(slot, payload);
      store.reset();

      // After reset, consume() returns undefined
      const consumed = store.consume(slot);
      expect(consumed).toBeUndefined();
    });

    it("works as expected in typical usage pattern", () => {
      const wrapSlot = 100;

      // Frame 1: No wrap
      let payload = store.consume(wrapSlot);
      expect(payload).toBeUndefined();

      // Frame 2: Wrap happens
      store.trigger(wrapSlot, { phase: 0.95, count: 1, deltaMs: 16.67 });
      payload = store.consume(wrapSlot);
      expect(payload).toBeDefined();
      expect(payload!.count).toBe(1);

      // Frame 3: Reset, no wrap
      store.reset();
      payload = store.consume(wrapSlot);
      expect(payload).toBeUndefined();
    });
  });

  describe("hasEvents (quick check for any events)", () => {
    it("returns false when no events triggered", () => {
      expect(store.hasEvents()).toBe(false);
    });

    it("returns true when at least one event triggered", () => {
      store.trigger(42);
      expect(store.hasEvents()).toBe(true);
    });

    it("returns true when multiple events triggered", () => {
      store.trigger(42);
      store.trigger(43);
      store.trigger(44);

      expect(store.hasEvents()).toBe(true);
    });

    it("returns false after reset", () => {
      store.trigger(42);
      expect(store.hasEvents()).toBe(true);

      store.reset();
      expect(store.hasEvents()).toBe(false);
    });

    it("returns true even for events without payload", () => {
      store.trigger(42); // No payload
      expect(store.hasEvents()).toBe(true);
    });
  });

  describe("getTriggered (enumerate all triggered slots)", () => {
    it("returns empty array when no events triggered", () => {
      const triggered = store.getTriggered();
      expect(triggered).toEqual([]);
    });

    it("returns single slot when one event triggered", () => {
      store.trigger(42);

      const triggered = store.getTriggered();
      expect(triggered).toEqual([42]);
    });

    it("returns all triggered slots when multiple events fired", () => {
      store.trigger(42);
      store.trigger(100);
      store.trigger(5);

      const triggered = store.getTriggered();
      expect(triggered).toHaveLength(3);
      expect(triggered).toContain(42);
      expect(triggered).toContain(100);
      expect(triggered).toContain(5);
    });

    it("returns empty array after reset", () => {
      store.trigger(42);
      store.trigger(43);

      store.reset();

      const triggered = store.getTriggered();
      expect(triggered).toEqual([]);
    });

    it("handles slot index 0 correctly", () => {
      store.trigger(0);
      store.trigger(1);

      const triggered = store.getTriggered();
      expect(triggered).toContain(0);
      expect(triggered).toContain(1);
    });

    it("can be used to iterate over all events", () => {
      // Trigger multiple events with payloads
      store.trigger(42, { phase: 0.5, count: 1, deltaMs: 16.67 });
      store.trigger(100, { phase: 0.8, count: 2, deltaMs: 16.67 });

      // Iterate over all triggered events
      const triggered = store.getTriggered();
      const payloads = triggered.map((slot) => store.getPayload(slot));

      expect(payloads).toHaveLength(2);
      expect(payloads[0]).toBeDefined();
      expect(payloads[1]).toBeDefined();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe("edge cases", () => {
    it("handles slot index 0", () => {
      const slot = 0;

      store.trigger(slot);
      expect(store.check(slot)).toBe(true);

      store.reset();
      expect(store.check(slot)).toBe(false);
    });

    it("handles large slot indices", () => {
      const slot = 999999;

      store.trigger(slot, { phase: 0.5, count: 1, deltaMs: 16.67 });
      expect(store.check(slot)).toBe(true);
      expect(store.getPayload(slot)).toBeDefined();
    });

    it("handles negative slot indices (if allowed by implementation)", () => {
      const slot = -1;

      // EventStore uses Map, so negative indices are technically allowed
      store.trigger(slot);
      expect(store.check(slot)).toBe(true);
    });

    it("handles payload with zero values", () => {
      const slot = 42;

      store.trigger(slot, { phase: 0.0, count: 0, deltaMs: 0.0 });

      const payload = store.getPayload(slot);
      expect(payload).toEqual({ phase: 0.0, count: 0, deltaMs: 0.0 });
    });

    it("handles payload with extreme values", () => {
      const slot = 42;

      store.trigger(slot, {
        phase: 0.9999999,
        count: Number.MAX_SAFE_INTEGER,
        deltaMs: 1000000,
      });

      const payload = store.getPayload(slot);
      expect(payload!.phase).toBeCloseTo(0.9999999, 7);
      expect(payload!.count).toBe(Number.MAX_SAFE_INTEGER);
      expect(payload!.deltaMs).toBe(1000000);
    });
  });
});
