/**
 * @file TimeCtx tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TimeCtxManager, TimeCtxFactory } from '../TimeCtx';

describe('TimeCtx', () => {
  describe('TimeCtxManager', () => {
    let manager: TimeCtxManager;

    beforeEach(() => {
      manager = new TimeCtxManager();
    });

    it('creates initial context at t=0', () => {
      const ctx = manager.createContext(0);

      expect(ctx.t).toBe(0);
      expect(ctx.dt).toBe(0);
      expect(ctx.frame).toBe(0);
      expect(ctx.mode).toBe('performance');
    });

    it('increments frame counter on subsequent frames', () => {
      const ctx1 = manager.createContext(0);
      const ctx2 = manager.createContext(0.016);
      const ctx3 = manager.createContext(0.032);

      expect(ctx1.frame).toBe(0);
      expect(ctx2.frame).toBe(1);
      expect(ctx3.frame).toBe(2);
    });

    it('calculates dt correctly', () => {
      manager.createContext(0);
      const ctx2 = manager.createContext(0.016);
      const ctx3 = manager.createContext(0.032);

      expect(ctx2.dt).toBeCloseTo(0.016);
      expect(ctx3.dt).toBeCloseTo(0.016);
    });

    it('handles mode transitions', () => {
      const ctx1 = manager.createContext(0, 'performance');
      const ctx2 = manager.createContext(0.5, 'scrub');
      const ctx3 = manager.createContext(1.0, 'scrub');

      expect(ctx1.mode).toBe('performance');
      expect(ctx2.mode).toBe('scrub');
      expect(ctx3.mode).toBe('scrub');

      // Frame should not increment when mode changes
      expect(ctx2.frame).toBe(0);
      // But should increment on next frame in same mode
      expect(ctx3.frame).toBe(1);
    });

    it('resets state correctly', () => {
      manager.createContext(1.0);
      manager.createContext(2.0);

      expect(manager.getCurrentFrame()).toBeGreaterThan(0);

      manager.reset();

      const ctx = manager.createContext(0);
      expect(ctx.t).toBe(0);
      expect(ctx.frame).toBe(0);
      expect(ctx.dt).toBe(0);
    });
  });

  describe('TimeCtxFactory', () => {
    it('creates performance context', () => {
      const ctx = TimeCtxFactory.forPerformance(1.5, 0.016, 90);

      expect(ctx.t).toBe(1.5);
      expect(ctx.dt).toBe(0.016);
      expect(ctx.frame).toBe(90);
      expect(ctx.mode).toBe('performance');
    });

    it('creates scrub context with dt=0', () => {
      const ctx = TimeCtxFactory.forScrub(2.0, 120);

      expect(ctx.t).toBe(2.0);
      expect(ctx.dt).toBe(0);
      expect(ctx.frame).toBe(120);
      expect(ctx.mode).toBe('scrub');
    });

    it('creates initial context', () => {
      const ctx = TimeCtxFactory.initial();

      expect(ctx.t).toBe(0);
      expect(ctx.dt).toBe(0);
      expect(ctx.frame).toBe(0);
      expect(ctx.mode).toBe('performance');
    });
  });
});
