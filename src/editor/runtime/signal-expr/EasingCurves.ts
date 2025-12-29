/**
 * Easing Curves for Transform Steps
 *
 * Built-in easing curves for transform chains.
 * All curves expect input in [0, 1] and return output in [0, 1] (typically).
 *
 * References:
 * - .agent_planning/signalexpr-runtime/SPRINT-04-transform.md §P1 "Implement Basic Easing Curves"
 */

/**
 * Easing curve definition - pure function from [0,1] to [0,1].
 */
export interface EasingCurve {
  /** Human-readable name for debugging */
  name: string;
  /** Curve function: t in [0,1] -> output (typically [0,1]) */
  fn: (t: number) => number;
}

/**
 * Easing curve table - holds all available curves.
 */
export interface EasingCurveTable {
  /** Array of curves, indexed by curveId */
  curves: EasingCurve[];
}

/**
 * Built-in easing curves.
 *
 * Includes 7 standard curves:
 * - linear: t
 * - easeInQuad: t²
 * - easeOutQuad: 1 - (1-t)²
 * - easeInOutQuad: smoothstep-like quadratic
 * - easeInCubic: t³
 * - easeOutCubic: 1 - (1-t)³
 * - smoothstep: 3t² - 2t³
 */
export const BUILTIN_CURVES: EasingCurve[] = [
  {
    name: "linear",
    fn: (t: number): number => t,
  },
  {
    name: "easeInQuad",
    fn: (t: number): number => t * t,
  },
  {
    name: "easeOutQuad",
    fn: (t: number): number => t * (2 - t),
  },
  {
    name: "easeInOutQuad",
    fn: (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  },
  {
    name: "easeInCubic",
    fn: (t: number): number => t * t * t,
  },
  {
    name: "easeOutCubic",
    fn: (t: number): number => {
      const t1 = t - 1;
      return t1 * t1 * t1 + 1;
    },
  },
  {
    name: "smoothstep",
    fn: (t: number): number => t * t * (3 - 2 * t),
  },
];

/**
 * Create a default easing curve table with built-in curves.
 *
 * @returns Table with 7 built-in curves
 *
 * @example
 * ```typescript
 * const curves = createBuiltinCurves();
 * console.log(curves.curves[0].name); // "linear"
 * console.log(curves.curves[0].fn(0.5)); // 0.5
 * ```
 */
export function createBuiltinCurves(): EasingCurveTable {
  return { curves: BUILTIN_CURVES };
}

/**
 * Apply an easing curve to an input value.
 *
 * CRITICAL: Input is clamped to [0, 1] before applying curve.
 * This ensures curves always receive valid input.
 *
 * @param curveId - Index into curve table
 * @param t - Input value (will be clamped to [0, 1])
 * @param table - Easing curve table
 * @returns Eased value
 * @throws Error if curveId is out of bounds
 *
 * @example
 * ```typescript
 * const table = createBuiltinCurves();
 * console.log(applyEasing(0, 0.5, table)); // 0.5 (linear)
 * console.log(applyEasing(1, 0.5, table)); // 0.25 (easeInQuad)
 * console.log(applyEasing(1, 1.5, table)); // 1.0 (clamped to 1.0, then squared)
 * ```
 */
export function applyEasing(
  curveId: number,
  t: number,
  table: EasingCurveTable
): number {
  if (curveId < 0 || curveId >= table.curves.length) {
    throw new Error(
      `Invalid easing curve ID: ${curveId} (table has ${table.curves.length} curves)`
    );
  }

  // Clamp input to [0, 1] before applying curve
  const clampedT = Math.max(0, Math.min(1, t));

  return table.curves[curveId].fn(clampedT);
}
