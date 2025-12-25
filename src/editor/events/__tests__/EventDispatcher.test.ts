/**
 * EventDispatcher Unit Tests
 *
 * Tests for the typed event dispatcher.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventDispatcher } from '../EventDispatcher';
import type { EditorEvent } from '../types';

describe('EventDispatcher', () => {
  let dispatcher: EventDispatcher;
  let consoleErrorSpy: unknown;

  beforeEach(() => {
    dispatcher = new EventDispatcher();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (consoleErrorSpy as { mockRestore: () => void }).mockRestore();
  });

  describe('emit()', () => {
    it('calls registered handlers when event emitted', () => {
      const handler = vi.fn();
      dispatcher.on('MacroExpanded', handler);

      dispatcher.emit({
        type: 'MacroExpanded',
        macroType: 'test',
        createdBlockIds: ['block-1', 'block-2'],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        type: 'MacroExpanded',
        macroType: 'test',
        createdBlockIds: ['block-1', 'block-2'],
      });
    });

    it('calls multiple handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      dispatcher.on('PatchLoaded', handler1);
      dispatcher.on('PatchLoaded', handler2);
      dispatcher.on('PatchLoaded', handler3);

      dispatcher.emit({ type: 'PatchLoaded', blockCount: 5, connectionCount: 3 });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('calls handlers in registration order', () => {
      const callOrder: number[] = [];
      const handler1 = vi.fn(() => callOrder.push(1));
      const handler2 = vi.fn(() => callOrder.push(2));
      const handler3 = vi.fn(() => callOrder.push(3));

      dispatcher.on('PatchCleared', handler1);
      dispatcher.on('PatchCleared', handler2);
      dispatcher.on('PatchCleared', handler3);

      dispatcher.emit({ type: 'PatchCleared' });

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('succeeds with no handlers registered (no-op)', () => {
      expect(() => {
        dispatcher.emit({ type: 'PatchCleared' });
      }).not.toThrow();
    });

    it('isolates handler errors (other handlers still run)', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('test error');
      });
      const successHandler1 = vi.fn();
      const successHandler2 = vi.fn();

      dispatcher.on('BlockAdded', errorHandler);
      dispatcher.on('BlockAdded', successHandler1);
      dispatcher.on('BlockAdded', successHandler2);

      dispatcher.emit({
        type: 'BlockAdded',
        blockId: 'block-1',
        blockType: 'TestBlock',
        laneId: 'lane-1',
      });

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler1).toHaveBeenCalled();
      expect(successHandler2).toHaveBeenCalled();
    });

    it('logs handler errors to console.error', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('test error');
      });

      dispatcher.on('BlockRemoved', errorHandler);

      dispatcher.emit({
        type: 'BlockRemoved',
        blockId: 'block-1',
        blockType: 'TestBlock',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Event handler error [BlockRemoved]:',
        expect.any(Error)
      );
    });
  });

  describe('on()', () => {
    it('returns unsubscribe function that works', () => {
      const handler = vi.fn();
      const unsubscribe = dispatcher.on('CompileFinished', handler);

      dispatcher.emit({
        type: 'CompileFinished',
        compileId: 'c1',
        patchId: 'p1',
        patchRevision: 1,
        status: 'ok',
        durationMs: 100,
        diagnostics: [],
      });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      dispatcher.emit({
        type: 'CompileFinished',
        compileId: 'c2',
        patchId: 'p1',
        patchRevision: 2,
        status: 'ok',
        durationMs: 200,
        diagnostics: [],
      });
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('allows same handler to be registered multiple times', () => {
      const handler = vi.fn();

      dispatcher.on('CompileFinished', handler);
      dispatcher.on('CompileFinished', handler);

      dispatcher.emit({
        type: 'CompileFinished',
        compileId: 'c3',
        patchId: 'p1',
        patchRevision: 3,
        status: 'failed',
        durationMs: 50,
        diagnostics: [],
      });

      expect(handler).toHaveBeenCalledTimes(1) // Sets deduplicate;
    });

    it('unsubscribe is idempotent', () => {
      const handler = vi.fn();
      const unsubscribe = dispatcher.on('PatchLoaded', handler);

      unsubscribe();
      unsubscribe(); // Call twice

      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('subscribe()', () => {
    it('receives all event types', () => {
      const events: EditorEvent[] = [];
      dispatcher.subscribe((event) => events.push(event));

      dispatcher.emit({ type: 'PatchLoaded', blockCount: 1, connectionCount: 0 });
      dispatcher.emit({ type: 'PatchCleared' });
      dispatcher.emit({
        type: 'CompileFinished',
        compileId: 'c4',
        patchId: 'p1',
        patchRevision: 4,
        status: 'ok',
        durationMs: 50,
        diagnostics: [],
      });

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('PatchLoaded');
      expect(events[1].type).toBe('PatchCleared');
      expect(events[2].type).toBe('CompileFinished');
    });

    it('returns unsubscribe function that works', () => {
      const handler = vi.fn();
      const unsubscribe = dispatcher.subscribe(handler);

      dispatcher.emit({ type: 'PatchCleared' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      dispatcher.emit({ type: 'PatchCleared' });
      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });

    it('isolates global handler errors', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('global handler error');
      });
      const successHandler = vi.fn();

      dispatcher.subscribe(errorHandler);
      dispatcher.subscribe(successHandler);

      dispatcher.emit({ type: 'PatchCleared' });

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Global event handler error:',
        expect.any(Error)
      );
    });
  });

  describe('mixed subscriptions', () => {
    it('calls both type-specific and global handlers', () => {
      const typeHandler = vi.fn();
      const globalHandler = vi.fn();

      dispatcher.on('MacroExpanded', typeHandler);
      dispatcher.subscribe(globalHandler);

      dispatcher.emit({
        type: 'MacroExpanded',
        macroType: 'test',
        createdBlockIds: [],
      });

      expect(typeHandler).toHaveBeenCalledTimes(1);
      expect(globalHandler).toHaveBeenCalledTimes(1);
    });

    it('calls type-specific handlers before global handlers', () => {
      const callOrder: string[] = [];
      const typeHandler = vi.fn(() => callOrder.push('type'));
      const globalHandler = vi.fn(() => callOrder.push('global'));

      dispatcher.on('PatchLoaded', typeHandler);
      dispatcher.subscribe(globalHandler);

      dispatcher.emit({ type: 'PatchLoaded', blockCount: 0, connectionCount: 0 });

      expect(callOrder).toEqual(['type', 'global']);
    });
  });
});
