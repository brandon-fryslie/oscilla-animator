/**
 * EventStore - Discrete Event Trigger Storage
 *
 * Provides discrete event semantics for events like time wrap.
 * Unlike ValueStore (continuous numeric values), EventStore holds
 * one-shot triggers that fire once per frame and reset automatically.
 *
 * Events are NOT continuous values:
 * - Event triggered: { triggered: true, payload: {...} }
 * - Event not triggered: { triggered: false }
 * - Events reset at frame start (not persistent across frames)
 *
 * This prevents the wrong pattern where events are stored as numeric
 * values (0.0 or 1.0) and consumers must detect 0→1 edges manually.
 *
 * References:
 * - design-docs/spec/SPEC-05-time-architecture.md §278-312 (Event Semantics)
 * - .agent_planning/time-event-semantics/PLAN-2025-12-31-013758.md (P1)
 */

/**
 * Event slot value - discrete trigger with optional payload.
 *
 * An event is either triggered (this frame) or not triggered.
 * When triggered, it may carry a payload with event-specific data.
 */
export interface EventSlotValue {
  /** True if event was triggered this frame */
  triggered: boolean;

  /** Optional event payload (event-specific data) */
  payload?: {
    /** Phase at wrap time (0.0-1.0) for cyclic models */
    phase: number;

    /** Total wrap count since animation start */
    count: number;

    /** Frame delta (ms) when wrap occurred */
    deltaMs: number;
  };
}

/**
 * EventStore - Discrete Event Storage
 *
 * Stores discrete event triggers (not continuous values).
 * Events are one-shot: they fire once per frame and reset automatically.
 *
 * Lifecycle:
 * 1. Frame start: reset() clears all events
 * 2. Execution: steps call trigger() to fire events
 * 3. Consumers: blocks call check() to detect event
 * 4. Frame end: events are cleared by next reset()
 *
 * Key invariants:
 * - Events are discrete (not continuous numeric values)
 * - Events reset every frame (not persistent)
 * - Edge detection happens at storage level (not consumer level)
 * - Payloads are preserved until reset
 *
 * @example
 * ```typescript
 * const store = new EventStore();
 *
 * // Frame 1: wrap event fires
 * store.trigger(42, { phase: 0.8, count: 1, deltaMs: 16.67 });
 * console.log(store.check(42)); // true
 * console.log(store.getPayload(42)); // { phase: 0.8, count: 1, deltaMs: 16.67 }
 *
 * // Frame 2: reset() clears events
 * store.reset();
 * console.log(store.check(42)); // false
 * console.log(store.getPayload(42)); // undefined
 * ```
 */
export class EventStore {
  /** Event storage (slot → event value) */
  private events = new Map<number, EventSlotValue>();

  /**
   * Trigger an event for this frame.
   *
   * Sets the event's triggered flag to true and stores optional payload.
   * Multiple triggers to the same slot in one frame will overwrite payload.
   *
   * @param slot - Event slot index
   * @param payload - Optional event payload (phase, count, deltaMs)
   *
   * @example
   * ```typescript
   * // Trigger wrap event with payload
   * store.trigger(wrapSlot, { phase: 0.95, count: 2, deltaMs: 16.67 });
   * ```
   */
  public trigger(slot: number, payload?: EventSlotValue["payload"]): void {
    this.events.set(slot, { triggered: true, payload });
  }

  /**
   * Check if an event was triggered this frame.
   *
   * Returns true if trigger() was called for this slot this frame,
   * false otherwise.
   *
   * @param slot - Event slot index
   * @returns true if event triggered, false otherwise
   *
   * @example
   * ```typescript
   * if (store.check(wrapSlot)) {
   *   console.log("Wrap event fired!");
   * }
   * ```
   */
  public check(slot: number): boolean {
    return this.events.get(slot)?.triggered ?? false;
  }

  /**
   * Get event payload for a triggered event.
   *
   * Returns the payload if the event was triggered this frame,
   * undefined otherwise.
   *
   * @param slot - Event slot index
   * @returns Event payload or undefined
   *
   * @example
   * ```typescript
   * const payload = store.getPayload(wrapSlot);
   * if (payload) {
   *   console.log(`Wrap at phase ${payload.phase}, count ${payload.count}`);
   * }
   * ```
   */
  public getPayload(slot: number): EventSlotValue["payload"] | undefined {
    return this.events.get(slot)?.payload;
  }

  /**
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
   * Consume an event - check if triggered and return payload in one call.
   *
   * This is a convenience method that combines check() and getPayload().
   * Returns the payload if the event was triggered, undefined otherwise.
   *
   * @param slot - Event slot index
   * @returns Event payload if triggered, undefined otherwise
   *
   * @example
   * ```typescript
   * // BEFORE: separate check + getPayload
   * if (runtime.events.check(slot)) {
   *   const payload = runtime.events.getPayload(slot);
   *   // use payload...
   * }
   *
   * // AFTER: single consume() call
   * const payload = runtime.events.consume(slot);
   * if (payload) {
   *   // use payload...
   * }
   * ```
   */
  public consume(slot: number): EventSlotValue["payload"] | undefined {
    const event = this.events.get(slot);
    return event?.triggered === true ? event.payload : undefined;
  }

  /**
   * Check if any events were triggered this frame.
   *
   * Quick check for "did anything happen this frame?" without
   * needing to check individual slots.
   *
   * @returns true if at least one event was triggered, false otherwise
   *
   * @example
   * ```typescript
   * if (runtime.events.hasEvents()) {
   *   console.log("At least one event fired this frame");
   * }
   * ```
   */
  public hasEvents(): boolean {
    return this.events.size > 0;
  }

  /**
   * Get all triggered event slots for this frame.
   *
   * Returns an array of slot indices that have been triggered.
   * Useful for debugging or iterating over all active events.
   *
   * @returns Array of triggered slot indices
   *
   * @example
   * ```typescript
   * const triggered = runtime.events.getTriggered();
   * console.log(`Events fired: ${triggered.join(', ')}`);
   *
   * // Process all events
   * for (const slot of triggered) {
   *   const payload = runtime.events.getPayload(slot);
   *   console.log(`Event ${slot}: ${JSON.stringify(payload)}`);
   * }
   * ```
   */
  public getTriggered(): number[] {
    return Array.from(this.events.keys());
  }

  /**
=======
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
<<<<<<< HEAD
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> a30d736 (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
=======
>>>>>>> 3b1c0a6 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 7509ff8 (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> f1444f6 (feat(events): Implement EventStore for discrete event semantics)
=======
=======
>>>>>>> a2a2b5c (feat(events): Implement EventStore for discrete event semantics)
>>>>>>> 0f6bb08 (feat(events): Implement EventStore for discrete event semantics)
   * Reset all events (clear triggered flags).
   *
   * Called at the start of each frame to clear previous frame's events.
   * This ensures events are one-shot (fire once per frame).
   *
   * @example
   * ```typescript
   * // Frame start
   * store.reset();
   *
   * // Now all check() calls return false until trigger() is called
   * ```
   */
  public reset(): void {
    this.events.clear();
  }
}
