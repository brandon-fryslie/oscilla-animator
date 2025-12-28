/**
 * @file Viewport Store
 * @description Manages viewport state (pan, zoom, density) and coordinate conversion.
 *
 * Reference: design-docs/8-UI-Redesign/4-ReactComponentTree.md
 *
 * Density affects information shown, not visual scale (blocks don't resize arbitrarily).
 * Coordinate conversion utilities allow translation between screen and world space.
 */

import { makeObservable, observable, action } from 'mobx';
import type { RootStore } from './RootStore';

/**
 * Density mode affects how much information is shown at different zoom levels.
 * - overview: minimal info, compact
 * - normal: standard detail
 * - detail: maximum info shown
 */
export type DensityMode = 'overview' | 'normal' | 'detail';

/**
 * Viewport state for the graph board.
 */
export interface ViewportState {
  /** Pan offset X (world units) */
  panX: number;
  /** Pan offset Y (world units) */
  panY: number;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
  /** Information density mode */
  density: DensityMode;
}

/**
 * Rectangle in world or screen coordinates.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ViewportStore {
  root: RootStore;

  /**
   * Current viewport state.
   */
  viewport: ViewportState = {
    panX: 0,
    panY: 0,
    zoom: 1.0,
    density: 'normal',
  };

  constructor(root: RootStore) {
    this.root = root;

    makeObservable(this, {
      viewport: observable,
      setPan: action,
      setZoom: action,
      setDensity: action,
      setViewport: action,
      zoomToFit: action,
      resetViewport: action,
    });
  }

  // =============================================================================
  // Actions - Viewport Manipulation
  // =============================================================================

  /**
   * Set pan offset.
   */
  setPan(panX: number, panY: number): void {
    this.viewport.panX = panX;
    this.viewport.panY = panY;
  }

  /**
   * Set zoom level (clamped to reasonable range).
   */
  setZoom(zoom: number): void {
    this.viewport.zoom = Math.max(0.1, Math.min(5.0, zoom));
  }

  /**
   * Set density mode.
   */
  setDensity(density: DensityMode): void {
    this.viewport.density = density;
  }

  /**
   * Set entire viewport state at once.
   */
  setViewport(state: Partial<ViewportState>): void {
    if (state.panX !== undefined) this.viewport.panX = state.panX;
    if (state.panY !== undefined) this.viewport.panY = state.panY;
    if (state.zoom !== undefined) this.setZoom(state.zoom);
    if (state.density !== undefined) this.viewport.density = state.density;
  }

  /**
   * Zoom to fit the given world bounds in the viewport.
   * @param bounds - World space bounds to fit
   * @param viewportWidth - Viewport width in screen pixels
   * @param viewportHeight - Viewport height in screen pixels
   * @param padding - Padding around content (default 40)
   */
  zoomToFit(
    bounds: Rect,
    viewportWidth: number,
    viewportHeight: number,
    padding: number = 40
  ): void {
    if (bounds.width === 0 || bounds.height === 0) {
      // Empty bounds, reset to default
      this.resetViewport();
      return;
    }

    // Calculate zoom to fit with padding
    const availableWidth = viewportWidth - padding * 2;
    const availableHeight = viewportHeight - padding * 2;

    const zoomX = availableWidth / bounds.width;
    const zoomY = availableHeight / bounds.height;
    const zoom = Math.min(zoomX, zoomY, 1.0); // Don't zoom in beyond 100%

    // Center the content
    const panX = -(bounds.x * zoom) + (viewportWidth - bounds.width * zoom) / 2;
    const panY = -(bounds.y * zoom) + (viewportHeight - bounds.height * zoom) / 2;

    this.setZoom(zoom);
    this.setPan(panX, panY);
  }

  /**
   * Reset viewport to default state.
   */
  resetViewport(): void {
    this.viewport = {
      panX: 0,
      panY: 0,
      zoom: 1.0,
      density: 'normal',
    };
  }

  // =============================================================================
  // Utilities - Coordinate Conversion
  // =============================================================================

  /**
   * Convert screen coordinates to world coordinates.
   * @param screenX - X coordinate in screen space (pixels)
   * @param screenY - Y coordinate in screen space (pixels)
   * @returns World coordinates
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const { panX, panY, zoom } = this.viewport;
    return {
      x: (screenX - panX) / zoom,
      y: (screenY - panY) / zoom,
    };
  }

  /**
   * Convert world coordinates to screen coordinates.
   * @param worldX - X coordinate in world space
   * @param worldY - Y coordinate in world space
   * @returns Screen coordinates (pixels)
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const { panX, panY, zoom } = this.viewport;
    return {
      x: worldX * zoom + panX,
      y: worldY * zoom + panY,
    };
  }

  /**
   * Get the visible world bounds for the current viewport.
   * @param viewportWidth - Viewport width in screen pixels
   * @param viewportHeight - Viewport height in screen pixels
   * @returns Visible world bounds
   */
  getVisibleWorldBounds(viewportWidth: number, viewportHeight: number): Rect {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(viewportWidth, viewportHeight);

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }
}
