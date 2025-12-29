/**
 * Tests for DebugUIStore
 *
 * Tests the debug UI state management.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DebugUIStore } from '../DebugUIStore';
import type { RuntimeHealthSnapshotEvent } from '../../events/types';

// Mock RootStore with minimal implementation
function createMockRootStore(): import('../RootStore').RootStore {
  return {
    events: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    patchStore: { patchRevision: 1 },
    busStore: { buses: [] },
  } as unknown as import('../RootStore').RootStore;
}

describe('DebugUIStore', () => {
  let store: DebugUIStore;
  let mockRootStore: ReturnType<typeof createMockRootStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRootStore = createMockRootStore();
    store = new DebugUIStore(mockRootStore);
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('initializes with drawer closed', () => {
      expect(store.isDrawerOpen).toBe(false);
    });

    it('initializes with overview tab', () => {
      expect(store.activeTab).toBe('overview');
    });

    it('initializes with probe mode off', () => {
      expect(store.probeMode).toBe(false);
    });

    it('initializes with null probe target', () => {
      expect(store.probeTarget).toBe(null);
    });

    it('subscribes to RuntimeHealthSnapshot events', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockRootStore.events.on).toHaveBeenCalledWith(
        'RuntimeHealthSnapshot',
        expect.any(Function)
      );
    });
  });

  describe('drawer actions', () => {
    it('opens drawer', () => {
      store.openDrawer();
      expect(store.isDrawerOpen).toBe(true);
    });

    it('opens drawer with specific tab', () => {
      store.openDrawer('buses');
      expect(store.isDrawerOpen).toBe(true);
      expect(store.activeTab).toBe('buses');
    });

    it('closes drawer', () => {
      store.openDrawer();
      store.closeDrawer();
      expect(store.isDrawerOpen).toBe(false);
    });

    it('sets active tab', () => {
      store.setActiveTab('buses');
      expect(store.activeTab).toBe('buses');
    });
  });

  describe('probe mode', () => {
    it('toggles probe mode on', () => {
      store.toggleProbeMode();
      expect(store.probeMode).toBe(true);
    });

    it('toggles probe mode off', () => {
      store.toggleProbeMode();
      store.toggleProbeMode();
      expect(store.probeMode).toBe(false);
    });

    it('clears probe target when disabling probe mode', () => {
      store.toggleProbeMode();
      store.setProbeTarget({ type: 'bus', busId: 'test_bus' });
      store.toggleProbeMode();
      expect(store.probeTarget).toBe(null);
    });
  });

  describe('probe target', () => {
    it('sets bus probe target', () => {
      const target = { type: 'bus' as const, busId: 'test_bus' };
      store.setProbeTarget(target);
      expect(store.probeTarget).toEqual(target);
    });

    it('sets block probe target', () => {
      const target = { type: 'block' as const, blockId: 'test_block' };
      store.setProbeTarget(target);
      expect(store.probeTarget).toEqual(target);
    });

    it('clears probe target immediately with no delay', () => {
      store.setProbeTarget({ type: 'bus', busId: 'test_bus' });
      store.setProbeTarget(null);
      expect(store.probeTarget).toBe(null);
    });

    it('clears probe target with delay', () => {
      store.setProbeTarget({ type: 'bus', busId: 'test_bus' });
      store.setProbeTarget(null, 150);

      // Target should still exist
      expect(store.probeTarget).toEqual({ type: 'bus', busId: 'test_bus' });

      // Advance timer
      vi.advanceTimersByTime(150);

      // Now target should be cleared
      expect(store.probeTarget).toBe(null);
    });

    it('cancels pending dismiss when setting new target', () => {
      store.setProbeTarget({ type: 'bus', busId: 'bus_1' });
      store.setProbeTarget(null, 150);

      // Before timer fires, set new target
      vi.advanceTimersByTime(50);
      store.setProbeTarget({ type: 'bus', busId: 'bus_2' });

      // Advance past original timer
      vi.advanceTimersByTime(150);

      // Target should still be bus_2
      expect(store.probeTarget).toEqual({ type: 'bus', busId: 'bus_2' });
    });
  });

  describe('cursor position', () => {
    it('updates cursor position', () => {
      store.updateCursorPosition(100, 200);
      expect(store.cursorPosition).toEqual({ x: 100, y: 200 });
    });

    it('throttles cursor position updates', () => {
      store.updateCursorPosition(100, 200);
      store.updateCursorPosition(110, 210); // Should be throttled

      expect(store.cursorPosition).toEqual({ x: 100, y: 200 });

      // Advance timer to allow next update
      vi.advanceTimersByTime(20);

      store.updateCursorPosition(120, 220);
      expect(store.cursorPosition).toEqual({ x: 120, y: 220 });
    });
  });

  describe('health snapshot', () => {
    it('updates latest health snapshot', () => {
      const snapshot: RuntimeHealthSnapshotEvent = {
        type: 'RuntimeHealthSnapshot',
        patchId: 'test_patch',
        activePatchRevision: 1,
        tMs: 1000,
        frameBudget: {
          fpsEstimate: 60,
          avgFrameMs: 16.67,
          worstFrameMs: 20,
        },
        evalStats: {
          nanCount: 0,
          infCount: 0,
          fieldMaterializations: 0,
        },
      };

      store.updateHealthSnapshot(snapshot);
      expect(store.latestHealthSnapshot).toEqual(snapshot);
    });
  });

  describe('computed health status', () => {
    it('returns ok with no snapshot', () => {
      expect(store.healthStatus).toBe('ok');
    });

    it('returns ok with zero bad values', () => {
      store.updateHealthSnapshot({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test',
        activePatchRevision: 1,
        tMs: 0,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 16, worstFrameMs: 20 },
        evalStats: { nanCount: 0, infCount: 0, fieldMaterializations: 0 },
      });
      expect(store.healthStatus).toBe('ok');
    });

    it('returns warning with 1-10 bad values', () => {
      store.updateHealthSnapshot({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test',
        activePatchRevision: 1,
        tMs: 0,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 16, worstFrameMs: 20 },
        evalStats: { nanCount: 5, infCount: 0, fieldMaterializations: 0 },
      });
      expect(store.healthStatus).toBe('warning');
    });

    it('returns error with >10 bad values', () => {
      store.updateHealthSnapshot({
        type: 'RuntimeHealthSnapshot',
        patchId: 'test',
        activePatchRevision: 1,
        tMs: 0,
        frameBudget: { fpsEstimate: 60, avgFrameMs: 16, worstFrameMs: 20 },
        evalStats: { nanCount: 8, infCount: 5, fieldMaterializations: 0 },
      });
      expect(store.healthStatus).toBe('error');
    });
  });

  describe('computed stability status', () => {
    it('returns stable by default', () => {
      expect(store.stabilityStatus).toBe('stable');
    });
  });
});
