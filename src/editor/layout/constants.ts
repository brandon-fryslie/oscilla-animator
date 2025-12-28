/**
 * Layout Constants
 *
 * Fixed values for the layout algorithm.
 * All measurements in world-space units.
 *
 * @see design-docs/8-UI-Redesign/5-NewUIRules-2of3.md (Section 10)
 */

import type { DensityMode, Role } from './types';

// =============================================================================
// Connector Thresholds
// =============================================================================

/**
 * Maximum connector length to draw (world units).
 * Edges longer than this become OverflowLinks.
 */
export const Lmax = 220;

/**
 * Vertical alignment tolerance for proximity enforcement (world units).
 * If blocks are within this distance, consider them aligned.
 */
export const Ysnap = 48;

// =============================================================================
// Grid Spacing
// =============================================================================

/** Gap between columns (world units) */
export const colGap = 40;

/** Vertical gap between blocks (world units) */
export const vGap = 12;

/** Extra gap at cluster boundaries (world units) */
export const clusterGap = 24;

// =============================================================================
// Port Positioning
// =============================================================================

/** Port rail offset from block edge (world units) */
export const portRailOffset = 8;

/** Top padding before first port (world units) */
export const topPadding = 12;

/** Height per port row (world units) */
export const portRowHeight = 16;

// =============================================================================
// Block Sizing by Density
// =============================================================================

/**
 * Block dimensions by density mode.
 * These are fixed sizes - hover expansion is a visual overlay only.
 */
export const BLOCK_SIZES: Record<DensityMode, { w: number; h: number }> = {
  overview: { w: 260, h: 36 },
  normal: { w: 300, h: 56 },
  detail: { w: 340, h: 96 },
};

// =============================================================================
// Role Priority
// =============================================================================

/**
 * Role ordering priority (lower = earlier in column).
 * Used for deterministic row ordering within clusters.
 */
export const ROLE_PRIORITY: Record<Role, number> = {
  time: 0,
  identity: 1,
  io: 2,
  state: 3,
  operator: 4,
  render: 5,
};

// =============================================================================
// Proximity Enforcement
// =============================================================================

/**
 * Maximum blocks to move in one proximity enforcement pass.
 * Prevents cascade reshuffles.
 */
export const moveBudgetPerPass = 20;

/**
 * Maximum proximity enforcement iterations.
 * Prevents infinite loops.
 */
export const maxProximityIterations = 3;

/**
 * Minimum total edge length improvement to continue (world units).
 * If improvement is less than this, stop iterating.
 */
export const minImprovementEpsilon = 10;
