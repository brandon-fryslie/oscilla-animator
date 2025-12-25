/**
 * @file EventDispatcher
 * @description Synchronous, type-safe event dispatcher for editor coordination.
 *
 * Design principles:
 * - Synchronous-only (no async handlers)
 * - Non-blocking (listeners can't affect control flow)
 * - Error isolation (one bad handler can't break others)
 * - Deterministic (handlers called in registration order)
 * - Scoped (one instance per RootStore)
 *
 * Usage:
 * ```typescript
 * // Subscribe to specific event type
 * const unsubscribe = events.on('MacroExpanded', (event) => {
 *   console.log('Macro expanded:', event.macroType);
 * });
 *
 * // Subscribe to all events (for logging)
 * const unsubscribeAll = events.subscribe((event) => {
 *   console.log('Event:', event.type);
 * });
 *
 * // Emit an event
 * events.emit({
 *   type: 'MacroExpanded',
 *   macroType: 'MyMacro',
 *   createdBlockIds: ['block-1', 'block-2']
 * });
 *
 * // Clean up
 * unsubscribe();
 * unsubscribeAll();
 * ```
 */

import type { EditorEvent, EventHandler, EventOfType } from './types';

/**
 * EventDispatcher manages event subscriptions and emissions.
 * Scoped to a single RootStore instance for testability.
 */
export class EventDispatcher {
  /** Type-specific handlers (keyed by event type) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handlers = new Map<string, Set<EventHandler<any>>>();

  /** Global handlers that receive all events */
  private globalHandlers = new Set<EventHandler<EditorEvent>>();

  /**
   * Emit an event to all registered handlers.
   * Handlers are called synchronously in registration order.
   * Handler errors are isolated and logged but don't break the emit flow.
   *
   * @param event The event to emit
   */
  emit<T extends EditorEvent>(event: T): void {
    // Emit to type-specific handlers
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Event handler error [${event.type}]:`, error);
        }
      }
    }

    // Emit to global handlers
    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Global event handler error:', error);
      }
    }
  }

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   *
   * @param type The event type to subscribe to
   * @param handler The handler function
   * @returns Unsubscribe function
   */
  on<T extends EditorEvent['type']>(
    type: T,
    handler: EventHandler<EventOfType<T>>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    const handlers = this.handlers.get(type)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => handlers.delete(handler);
  }

  /**
   * Subscribe to all events (useful for logging/debugging).
   * Returns an unsubscribe function.
   *
   * @param handler The handler function
   * @returns Unsubscribe function
   */
  subscribe(handler: EventHandler<EditorEvent>): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }
}
