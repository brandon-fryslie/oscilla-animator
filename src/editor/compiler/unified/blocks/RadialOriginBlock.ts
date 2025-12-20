/**
 * @file RadialOriginBlock - Radial position field generator
 * @description Generates per-element positions in a radial pattern around a center point.
 *
 * Architecture:
 * - Outputs Field<Point> as FieldExpr node (lazy evaluation)
 * - Uses FieldExpr map combinator (not closures)
 * - Domain-aware: stable element IDs produce stable positions
 * - Deterministic: same seed = same positions
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
 * RadialOrigin block parameters.
 */
export interface RadialOriginParams {
  centerX: number;
  centerY: number;
  radius: number;
  angleOffset: number;
  elementCount: number; // Total number of elements (for even distribution)
}

/**
 * Default parameters.
 */
const DEFAULT_PARAMS: Omit<RadialOriginParams, 'elementCount'> = {
  centerX: 0,
  centerY: 0,
  radius: 100,
  angleOffset: 0,
};

/**
 * Radial position function - converts element index to radial position.
 *
 * This function is registered in the function registry and called during
 * FieldExpr evaluation.
 */
function radialPositionFn(
  _srcValue: unknown,
  params: unknown,
  elementId: ElementId,
  _timeCtx: TimeCtx
): Point {
  const { centerX, centerY, radius, angleOffset, elementCount } = params as RadialOriginParams;

  // Parse element ID as index
  const idx = parseInt(elementId, 10);

  // Calculate angle based on index (evenly distributed around circle)
  const angleStep = (2 * Math.PI) / elementCount;
  const angle = (idx * angleStep) + angleOffset;

  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

// Register the function
functionRegistry.register('radialPosition', radialPositionFn as (...args: unknown[]) => unknown);

/**
 * Create RadialOrigin FieldExpr.
 *
 * @param domain - Domain for the field
 * @param params - Block parameters
 * @returns FieldExpr<Point> node
 */
export function createRadialOriginExpr(
  domain: Domain,
  params: Partial<Omit<RadialOriginParams, 'elementCount'>> = {}
): FieldExpr<Point> {
  const fullParams: RadialOriginParams = {
    ...DEFAULT_PARAMS,
    ...params,
    elementCount: domain.elements.length,
  };

  // Create a domain source, then map it to positions
  const domainSource = domainFieldExpr(domain);

  return mapFieldExpr<number, Point>(
    domainSource,
    'radialPosition',
    fullParams as unknown as Record<string, unknown>
  );
}

/**
 * RadialOriginBlock - generates radial positions for elements.
 *
 * Example usage:
 * ```typescript
 * const domain = createSimpleDomain('elements', 10);
 * const expr = createRadialOriginExpr(domain, {
 *   centerX: 100,
 *   centerY: 100,
 *   radius: 50,
 *   angleOffset: 0
 * });
 * const positions = batchEvaluateFieldExpr(expr, domain, timeCtx, evalCtx);
 * ```
 */
export const RadialOriginBlock = {
  type: 'RadialOrigin',

  /**
   * Create FieldExpr for this block.
   */
  createExpr: createRadialOriginExpr,
} as const;
