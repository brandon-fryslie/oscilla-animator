/**
 * Viewport Store Tests
 *
 * Tests for viewport state management and coordinate conversion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../RootStore';
import { ViewportStore } from '../ViewportStore';

describe('ViewportStore', () => {
  let root: RootStore;
  let viewport: ViewportStore;

  beforeEach(() => {
    root = new RootStore();
    viewport = new ViewportStore(root);
  });

  describe('Initial State', () => {
    it('starts with default viewport', () => {
      expect(viewport.viewport.panX).toBe(0);
      expect(viewport.viewport.panY).toBe(0);
      expect(viewport.viewport.zoom).toBe(1.0);
      expect(viewport.viewport.density).toBe('normal');
    });
  });

  describe('setPan', () => {
    it('sets pan offset', () => {
      viewport.setPan(100, 200);

      expect(viewport.viewport.panX).toBe(100);
      expect(viewport.viewport.panY).toBe(200);
    });

    it('allows negative pan values', () => {
      viewport.setPan(-50, -100);

      expect(viewport.viewport.panX).toBe(-50);
      expect(viewport.viewport.panY).toBe(-100);
    });
  });

  describe('setZoom', () => {
    it('sets zoom level', () => {
      viewport.setZoom(1.5);

      expect(viewport.viewport.zoom).toBe(1.5);
    });

    it('clamps zoom to minimum 0.1', () => {
      viewport.setZoom(0.05);

      expect(viewport.viewport.zoom).toBe(0.1);
    });

    it('clamps zoom to maximum 5.0', () => {
      viewport.setZoom(10.0);

      expect(viewport.viewport.zoom).toBe(5.0);
    });

    it('allows zoom within valid range', () => {
      viewport.setZoom(2.5);

      expect(viewport.viewport.zoom).toBe(2.5);
    });
  });

  describe('setDensity', () => {
    it('sets density mode', () => {
      viewport.setDensity('detail');

      expect(viewport.viewport.density).toBe('detail');
    });

    it('allows all density modes', () => {
      viewport.setDensity('overview');
      expect(viewport.viewport.density).toBe('overview');

      viewport.setDensity('normal');
      expect(viewport.viewport.density).toBe('normal');

      viewport.setDensity('detail');
      expect(viewport.viewport.density).toBe('detail');
    });
  });

  describe('setViewport', () => {
    it('sets partial viewport state', () => {
      viewport.setViewport({ panX: 50 });

      expect(viewport.viewport.panX).toBe(50);
      expect(viewport.viewport.panY).toBe(0); // Unchanged
    });

    it('sets multiple properties at once', () => {
      viewport.setViewport({
        panX: 100,
        panY: 200,
        zoom: 1.5,
        density: 'detail',
      });

      expect(viewport.viewport.panX).toBe(100);
      expect(viewport.viewport.panY).toBe(200);
      expect(viewport.viewport.zoom).toBe(1.5);
      expect(viewport.viewport.density).toBe('detail');
    });

    it('applies zoom clamping', () => {
      viewport.setViewport({ zoom: 10.0 });

      expect(viewport.viewport.zoom).toBe(5.0);
    });
  });

  describe('zoomToFit', () => {
    it('calculates zoom to fit content', () => {
      const bounds = { x: 0, y: 0, width: 800, height: 600 };
      viewport.zoomToFit(bounds, 1000, 800, 40);

      // Should fit 800x600 content in 1000x800 viewport with 40px padding
      // Available: 920x720
      // Zoom: min(920/800, 720/600) = min(1.15, 1.2) = 1.0 (capped)
      expect(viewport.viewport.zoom).toBe(1.0);
    });

    it('centers content in viewport', () => {
      const bounds = { x: 100, y: 100, width: 200, height: 200 };
      viewport.zoomToFit(bounds, 800, 600, 40);

      // Content should be centered
      expect(viewport.viewport.panX).toBeCloseTo(200);
      expect(viewport.viewport.panY).toBeCloseTo(100);
    });

    it('does not zoom in beyond 100%', () => {
      const bounds = { x: 0, y: 0, width: 100, height: 100 };
      viewport.zoomToFit(bounds, 1000, 800, 40);

      // Should cap at 1.0 even though content could zoom further
      expect(viewport.viewport.zoom).toBe(1.0);
    });

    it('resets viewport for empty bounds', () => {
      viewport.setPan(100, 100);
      viewport.setZoom(2.0);

      viewport.zoomToFit({ x: 0, y: 0, width: 0, height: 0 }, 800, 600);

      expect(viewport.viewport.panX).toBe(0);
      expect(viewport.viewport.panY).toBe(0);
      expect(viewport.viewport.zoom).toBe(1.0);
    });

    it('respects padding parameter', () => {
      const bounds = { x: 0, y: 0, width: 800, height: 600 };
      viewport.zoomToFit(bounds, 1000, 800, 100);

      // With 100px padding, available space is smaller
      // Available: 800x600 exactly matches content at zoom 1.0
      expect(viewport.viewport.zoom).toBe(1.0);
    });
  });

  describe('resetViewport', () => {
    it('resets to default state', () => {
      viewport.setPan(100, 200);
      viewport.setZoom(2.5);
      viewport.setDensity('detail');

      viewport.resetViewport();

      expect(viewport.viewport.panX).toBe(0);
      expect(viewport.viewport.panY).toBe(0);
      expect(viewport.viewport.zoom).toBe(1.0);
      expect(viewport.viewport.density).toBe('normal');
    });
  });

  describe('Coordinate Conversion', () => {
    describe('screenToWorld', () => {
      it('converts screen coords to world coords with no pan/zoom', () => {
        const world = viewport.screenToWorld(100, 200);

        expect(world.x).toBe(100);
        expect(world.y).toBe(200);
      });

      it('applies pan offset', () => {
        viewport.setPan(50, 100);

        const world = viewport.screenToWorld(100, 200);

        expect(world.x).toBe(50); // (100 - 50) / 1.0
        expect(world.y).toBe(100); // (200 - 100) / 1.0
      });

      it('applies zoom scale', () => {
        viewport.setZoom(2.0);

        const world = viewport.screenToWorld(100, 200);

        expect(world.x).toBe(50); // 100 / 2.0
        expect(world.y).toBe(100); // 200 / 2.0
      });

      it('applies both pan and zoom', () => {
        viewport.setPan(40, 60);
        viewport.setZoom(2.0);

        const world = viewport.screenToWorld(100, 200);

        expect(world.x).toBe(30); // (100 - 40) / 2.0
        expect(world.y).toBe(70); // (200 - 60) / 2.0
      });
    });

    describe('worldToScreen', () => {
      it('converts world coords to screen coords with no pan/zoom', () => {
        const screen = viewport.worldToScreen(100, 200);

        expect(screen.x).toBe(100);
        expect(screen.y).toBe(200);
      });

      it('applies pan offset', () => {
        viewport.setPan(50, 100);

        const screen = viewport.worldToScreen(100, 200);

        expect(screen.x).toBe(150); // 100 * 1.0 + 50
        expect(screen.y).toBe(300); // 200 * 1.0 + 100
      });

      it('applies zoom scale', () => {
        viewport.setZoom(2.0);

        const screen = viewport.worldToScreen(100, 200);

        expect(screen.x).toBe(200); // 100 * 2.0
        expect(screen.y).toBe(400); // 200 * 2.0
      });

      it('applies both pan and zoom', () => {
        viewport.setPan(40, 60);
        viewport.setZoom(2.0);

        const screen = viewport.worldToScreen(100, 200);

        expect(screen.x).toBe(240); // 100 * 2.0 + 40
        expect(screen.y).toBe(460); // 200 * 2.0 + 60
      });
    });

    describe('Round-trip conversion', () => {
      it('converts screen->world->screen accurately', () => {
        viewport.setPan(37, 83);
        viewport.setZoom(1.7);

        const world = viewport.screenToWorld(123, 456);
        const screen = viewport.worldToScreen(world.x, world.y);

        expect(screen.x).toBeCloseTo(123);
        expect(screen.y).toBeCloseTo(456);
      });

      it('converts world->screen->world accurately', () => {
        viewport.setPan(37, 83);
        viewport.setZoom(1.7);

        const screen = viewport.worldToScreen(123, 456);
        const world = viewport.screenToWorld(screen.x, screen.y);

        expect(world.x).toBeCloseTo(123);
        expect(world.y).toBeCloseTo(456);
      });
    });
  });

  describe('getVisibleWorldBounds', () => {
    it('returns visible world bounds for viewport', () => {
      const bounds = viewport.getVisibleWorldBounds(800, 600);

      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(800);
      expect(bounds.height).toBe(600);
    });

    it('accounts for pan offset', () => {
      viewport.setPan(-100, -50);

      const bounds = viewport.getVisibleWorldBounds(800, 600);

      expect(bounds.x).toBe(100); // Pan negated in world space
      expect(bounds.y).toBe(50);
      expect(bounds.width).toBe(800);
      expect(bounds.height).toBe(600);
    });

    it('accounts for zoom level', () => {
      viewport.setZoom(2.0);

      const bounds = viewport.getVisibleWorldBounds(800, 600);

      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(400); // 800 / 2.0
      expect(bounds.height).toBe(300); // 600 / 2.0
    });

    it('accounts for both pan and zoom', () => {
      viewport.setPan(100, 50);
      viewport.setZoom(0.5);

      const bounds = viewport.getVisibleWorldBounds(800, 600);

      expect(bounds.x).toBe(-200); // (0 - 100) / 0.5
      expect(bounds.y).toBe(-100); // (0 - 50) / 0.5
      expect(bounds.width).toBe(1600); // 800 / 0.5
      expect(bounds.height).toBe(1200); // 600 / 0.5
    });
  });
});
