/**
 * Field Statistics Computation
 *
 * Computes statistical measures for field data (Float32Array).
 * Used by field visualization components (heatmap, histogram).
 *
 * Performance target: <10ms for 10,000 elements
 */

export interface FieldStats {
  /** Number of elements in field */
  count: number;

  /** Minimum value */
  min: number;

  /** Maximum value */
  max: number;

  /** Arithmetic mean */
  mean: number;

  /** Standard deviation (sample) */
  stdDev: number;

  /** Number of NaN values found */
  nanCount: number;

  /** Number of Infinite values found */
  infCount: number;
}

/**
 * Compute statistics for a field of values.
 *
 * Uses Welford's online algorithm for numerically stable mean and variance.
 * Filters out NaN/Inf values from statistical calculations but reports their counts.
 *
 * @param fieldValues - Field data as Float32Array
 * @returns FieldStats object with min, max, mean, stdDev, and special value counts
 *
 * @example
 * ```ts
 * const field = new Float32Array([1, 2, 3, 4, 5]);
 * const stats = computeFieldStats(field);
 * // stats.mean === 3, stats.stdDev ≈ 1.58
 * ```
 */
export function computeFieldStats(fieldValues: Float32Array): FieldStats {
  const n = fieldValues.length;

  // Handle empty field
  if (n === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
      nanCount: 0,
      infCount: 0,
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let nanCount = 0;
  let infCount = 0;

  // Welford's online algorithm for mean and variance
  let count = 0; // Count of valid (non-NaN, non-Inf) values
  let mean = 0;
  let m2 = 0; // Sum of squared differences from mean

  for (let i = 0; i < n; i++) {
    const value = fieldValues[i];

    // Check for special values
    if (Number.isNaN(value)) {
      nanCount++;
      continue;
    }

    if (!Number.isFinite(value)) {
      infCount++;
      continue;
    }

    // Update min/max
    if (value < min) min = value;
    if (value > max) max = value;

    // Welford's algorithm: update mean and m2
    count++;
    const delta = value - mean;
    mean += delta / count;
    const delta2 = value - mean;
    m2 += delta * delta2;
  }

  // Handle case where all values are NaN or Inf
  if (count === 0) {
    return {
      count: n,
      min: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
      nanCount,
      infCount,
    };
  }

  // Compute sample standard deviation: sqrt(m2 / (n - 1))
  // Use n - 1 for sample stddev (Bessel's correction)
  const variance = count > 1 ? m2 / (count - 1) : 0;
  const stdDev = Math.sqrt(variance);

  return {
    count: n,
    min,
    max,
    mean,
    stdDev,
    nanCount,
    infCount,
  };
}

/**
 * Check if field stats indicate a valid field (no special values).
 *
 * @param stats - Field statistics
 * @returns True if field has no NaN or Inf values
 */
export function isValidField(stats: FieldStats): boolean {
  return stats.nanCount === 0 && stats.infCount === 0;
}

/**
 * Format field stats as human-readable string.
 *
 * @param stats - Field statistics
 * @returns Formatted string summary
 *
 * @example
 * ```ts
 * formatFieldStats(stats)
 * // "n=100, min=0.00, max=1.00, μ=0.50, σ=0.29"
 * ```
 */
export function formatFieldStats(stats: FieldStats): string {
  const parts: string[] = [];

  parts.push(`n=${stats.count}`);

  if (stats.count === 0) {
    return parts.join(', ');
  }

  // Only show stats if we have valid values
  const validCount = stats.count - stats.nanCount - stats.infCount;
  if (validCount > 0) {
    parts.push(`min=${stats.min.toFixed(2)}`);
    parts.push(`max=${stats.max.toFixed(2)}`);
    parts.push(`μ=${stats.mean.toFixed(2)}`);
    parts.push(`σ=${stats.stdDev.toFixed(2)}`);
  }

  if (stats.nanCount > 0) {
    parts.push(`NaN=${stats.nanCount}`);
  }

  if (stats.infCount > 0) {
    parts.push(`Inf=${stats.infCount}`);
  }

  return parts.join(', ');
}
