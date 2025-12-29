/**
 * Tests for TraceController
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TraceController } from '../TraceController';

describe('TraceController', () => {
  beforeEach(() => {
    // Reset singleton before each test
    TraceController._resetForTesting();

    // Clear localStorage
    if (typeof window !== 'undefined' && window.localStorage !== null && window.localStorage !== undefined) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    // Clean up
    TraceController._resetForTesting();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = TraceController.instance;
      const instance2 = TraceController.instance;
      expect(instance1).toBe(instance2);
    });
  });

  describe('Mode Management', () => {
    it('should default to "off" mode', () => {
      const controller = TraceController.instance;
      expect(controller.getMode()).toBe('off');
    });

    it('should set mode to "timing"', () => {
      const controller = TraceController.instance;
      controller.setMode('timing');
      expect(controller.getMode()).toBe('timing');
    });

    it('should set mode to "full"', () => {
      const controller = TraceController.instance;
      controller.setMode('full');
      expect(controller.getMode()).toBe('full');
    });

    it('should switch modes', () => {
      const controller = TraceController.instance;

      controller.setMode('timing');
      expect(controller.getMode()).toBe('timing');

      controller.setMode('full');
      expect(controller.getMode()).toBe('full');

      controller.setMode('off');
      expect(controller.getMode()).toBe('off');
    });
  });

  describe('shouldEmitSpans', () => {
    it('should return false in "off" mode', () => {
      const controller = TraceController.instance;
      controller.setMode('off');
      expect(controller.shouldEmitSpans()).toBe(false);
    });

    it('should return true in "timing" mode', () => {
      const controller = TraceController.instance;
      controller.setMode('timing');
      expect(controller.shouldEmitSpans()).toBe(true);
    });

    it('should return true in "full" mode', () => {
      const controller = TraceController.instance;
      controller.setMode('full');
      expect(controller.shouldEmitSpans()).toBe(true);
    });
  });

  describe('shouldCaptureValues', () => {
    it('should return false in "off" mode', () => {
      const controller = TraceController.instance;
      controller.setMode('off');
      expect(controller.shouldCaptureValues()).toBe(false);
    });

    it('should return false in "timing" mode', () => {
      const controller = TraceController.instance;
      controller.setMode('timing');
      expect(controller.shouldCaptureValues()).toBe(false);
    });

    it('should return true in "full" mode', () => {
      const controller = TraceController.instance;
      controller.setMode('full');
      expect(controller.shouldCaptureValues()).toBe(true);
    });
  });

  describe('Persistence (localStorage)', () => {
    it('should persist mode to localStorage', () => {
      if (typeof window === 'undefined') {
        // Skip in non-browser environment
        return;
      }

      const controller = TraceController.instance;
      controller.setMode('timing');

      const stored = window.localStorage.getItem('oscilla.debug.traceMode');
      expect(stored).toBe('timing');
    });

    it('should restore mode from localStorage', () => {
      if (typeof window === 'undefined') {
        // Skip in non-browser environment
        return;
      }

      // Manually set localStorage
      window.localStorage.setItem('oscilla.debug.traceMode', 'full');

      // Reset and create new instance
      TraceController._resetForTesting();
      const controller = TraceController.instance;

      expect(controller.getMode()).toBe('full');
    });

    it('should default to "off" if localStorage has invalid value', () => {
      if (typeof window === 'undefined') {
        // Skip in non-browser environment
        return;
      }

      // Set invalid value
      window.localStorage.setItem('oscilla.debug.traceMode', 'invalid');

      // Reset and create new instance
      TraceController._resetForTesting();
      const controller = TraceController.instance;

      expect(controller.getMode()).toBe('off');
    });
  });

  describe('Mode Behavior Matrix', () => {
    const modes = ['off', 'timing', 'full'] as const;

    it.each(modes)('mode=%s should have consistent behavior', (mode) => {
      const controller = TraceController.instance;
      controller.setMode(mode);

      const shouldEmit = controller.shouldEmitSpans();
      const shouldCapture = controller.shouldCaptureValues();

      // Verify consistency
      if (mode === 'off') {
        expect(shouldEmit).toBe(false);
        expect(shouldCapture).toBe(false);
      } else if (mode === 'timing') {
        expect(shouldEmit).toBe(true);
        expect(shouldCapture).toBe(false);
      } else if (mode === 'full') {
        expect(shouldEmit).toBe(true);
        expect(shouldCapture).toBe(true);
      }
    });
  });
});
