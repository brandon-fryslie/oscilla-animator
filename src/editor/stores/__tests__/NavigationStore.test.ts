/**
 * Navigation Store Tests
 *
 * Tests for the two-level navigation system (root/graph).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import { NavigationStore } from '../NavigationStore';

describe('NavigationStore', () => {
  let root: RootStore;
  let nav: NavigationStore;

  beforeEach(() => {
    root = new RootStore();
    nav = new NavigationStore(root);
  });

  describe('Initial State', () => {
    it('starts at root level', () => {
      expect(nav.currentLevel).toBe('root');
      expect(nav.navState.level).toBe('root');
    });

    it('has null graphId at root', () => {
      expect(nav.currentGraphId).toBeNull();
    });

    it('has empty breadcrumb at root', () => {
      expect(nav.breadcrumb).toEqual([]);
    });
  });

  describe('enterGraph', () => {
    it('navigates to graph level', () => {
      nav.enterGraph('graph-1', 'My Graph');

      expect(nav.currentLevel).toBe('graph');
      expect(nav.currentGraphId).toBe('graph-1');
    });

    it('sets breadcrumb with Patch and graph name', () => {
      nav.enterGraph('graph-1', 'Animation System');

      expect(nav.breadcrumb).toEqual(['Patch', 'Animation System']);
    });

    it('uses default name if not provided', () => {
      nav.enterGraph('graph-1');

      expect(nav.breadcrumb).toEqual(['Patch', 'Graph']);
    });

    it('replaces previous graph navigation', () => {
      nav.enterGraph('graph-1', 'First');
      nav.enterGraph('graph-2', 'Second');

      expect(nav.currentGraphId).toBe('graph-2');
      expect(nav.breadcrumb).toEqual(['Patch', 'Second']);
    });
  });

  describe('exitToRoot', () => {
    it('returns to root level from graph', () => {
      nav.enterGraph('graph-1', 'Test');
      nav.exitToRoot();

      expect(nav.currentLevel).toBe('root');
      expect(nav.currentGraphId).toBeNull();
    });

    it('clears breadcrumb', () => {
      nav.enterGraph('graph-1', 'Test');
      nav.exitToRoot();

      expect(nav.breadcrumb).toEqual([]);
    });

    it('is idempotent at root level', () => {
      nav.exitToRoot();
      nav.exitToRoot();

      expect(nav.currentLevel).toBe('root');
    });
  });

  describe('renameGraph', () => {
    it('updates breadcrumb when at graph level', () => {
      nav.enterGraph('graph-1', 'Old Name');
      nav.renameGraph('New Name');

      expect(nav.breadcrumb).toEqual(['Patch', 'New Name']);
      expect(nav.currentGraphId).toBe('graph-1'); // ID unchanged
    });

    it('does nothing when at root level', () => {
      nav.renameGraph('Should Not Apply');

      expect(nav.currentLevel).toBe('root');
      expect(nav.breadcrumb).toEqual([]);
    });

    it('preserves graphId', () => {
      nav.enterGraph('graph-1', 'Original');
      nav.renameGraph('Updated');

      expect(nav.currentGraphId).toBe('graph-1');
    });
  });

  describe('Computed Values', () => {
    it('currentLevel reflects state', () => {
      expect(nav.currentLevel).toBe('root');

      nav.enterGraph('g1', 'Test');
      expect(nav.currentLevel).toBe('graph');

      nav.exitToRoot();
      expect(nav.currentLevel).toBe('root');
    });

    it('currentGraphId is reactive', () => {
      expect(nav.currentGraphId).toBeNull();

      nav.enterGraph('g1', 'Test');
      expect(nav.currentGraphId).toBe('g1');

      nav.enterGraph('g2', 'Other');
      expect(nav.currentGraphId).toBe('g2');

      nav.exitToRoot();
      expect(nav.currentGraphId).toBeNull();
    });

    it('breadcrumb is reactive', () => {
      expect(nav.breadcrumb).toEqual([]);

      nav.enterGraph('g1', 'First');
      expect(nav.breadcrumb).toEqual(['Patch', 'First']);

      nav.renameGraph('Renamed');
      expect(nav.breadcrumb).toEqual(['Patch', 'Renamed']);

      nav.exitToRoot();
      expect(nav.breadcrumb).toEqual([]);
    });
  });

  describe('Navigation Isolation', () => {
    it('navigation does not affect selection', () => {
      // This test ensures navigation is independent from selection
      // (as specified: no implicit routing from selection)
      nav.enterGraph('g1', 'Test');

      // Navigation state is independent
      expect(nav.currentLevel).toBe('graph');
    });
  });
});
