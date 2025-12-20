/**
 * @file FlowFieldOriginBlock - Flow field position generator
 * @description Generates per-element positions using noise-based flow field.
 *
 * Architecture:
 * - Outputs Field<Point> as FieldExpr node (lazy evaluation)
 * - Uses FieldExpr map combinator with noise function
 * - Deterministic: same seed produces same positions across evaluations
 * - Domain-aware: stable element IDs produce stable positions
 */

import type { Domain, ElementId } from '../Domain';
import type { FieldExpr } from '../FieldExpr';
import { mapFieldExpr, domainFieldExpr, functionRegistry } from '../FieldExpr';
import type { TimeCtx } from '../TimeCtx';

/**
 * Point in 2D space.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * FlowFieldOrigin block parameters.
 */
export interface FlowFieldOriginParams {
  noiseScale: number;
  flowStrength: number;
  seed: number;
}

/**
 * Default parameters.
 */
const DEFAULT_PARAMS: FlowFieldOriginParams = {
  noiseScale: 0.01,
  flowStrength: 100,
  seed: 42,
};

/**
 * Simple 2D noise function (Perlin-like).
 * Deterministic based on seed and position.
 */
function noise2D(x: number, y: number, seed: number): number {
  // Simple hash-based noise (not true Perlin, but deterministic)
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Flow field position function - converts element index to flow field position.
 *
 * This function is registered in the function registry and called during
 * FieldExpr evaluation.
 */
function flowFieldPositionFn(
  _srcValue: unknown,
  params: unknown,
  elementId: ElementId,
  _timeCtx: TimeCtx
): Point {
  const { noiseScale, flowStrength, seed } = params as FlowFieldOriginParams;

  // Parse element ID as index
  const idx = parseInt(elementId, 10);

  // Base position (grid layout)
  const gridSize = 10;
  const baseX = (idx % gridSize) * 50;
  const baseY = Math.floor(idx / gridSize) * 50;

  // Sample noise at base position
  const noiseX = noise2D(baseX * noiseScale, baseY * noiseScale, seed);
  const noiseY = noise2D(baseX * noiseScale + 100, baseY * noiseScale + 100, seed + 1000);

  // Convert noise to angle
  const angle = noiseX * Math.PI * 2;

  // Apply flow strength
  const offsetX = Math.cos(angle) * flowStrength * noiseY;
  const offsetY = Math.sin(angle) * flowStrength * noiseY;

  return {
    x: baseX + offsetX,
    y: baseY + offsetY,
  };
}

// Register the function
functionRegistry.register('flowFieldPosition', flowFieldPositionFn as (...args: unknown[]) => unknown);

/**
 * Create FlowFieldOrigin FieldExpr.
 *
 * @param domain - Domain for the field
 * @param params - Block parameters
 * @returns FieldExpr<Point> node
 */
export function createFlowFieldOriginExpr(
  domain: Domain,
  params: Partial<FlowFieldOriginParams> = {}
): FieldExpr<Point> {
  const fullParams: FlowFieldOriginParams = {
    ...DEFAULT_PARAMS,
    ...params,
  };

  // Create a domain source, then map it to flow field positions
  const domainSource = domainFieldExpr(domain);

  return mapFieldExpr<number, Point>(
    domainSource,
    'flowFieldPosition',
    fullParams as unknown as Record<string, unknown>
  );
}

/**
 * FlowFieldOriginBlock - generates flow field positions for elements.
 *
 * Example usage:
 * ```typescript
 * const domain = createSimpleDomain('elements', 100);
 * const expr = createFlowFieldOriginExpr(domain, {
 *   noiseScale: 0.02,
 *   flowStrength: 150,
 *   seed: 12345
 * });
 * const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);
 * ```
 */
export const FlowFieldOriginBlock = {
  type: 'FlowFieldOrigin',

  /**
   * Create FieldExpr for this block.
   */
  createExpr: createFlowFieldOriginExpr,
} as const;
