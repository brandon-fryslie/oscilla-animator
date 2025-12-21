/**
 * Bus Semantics Module
 *
 * Canonical bus semantics - ONLY place bus logic lives.
 *
 * CRITICAL: Use this module for all bus ordering/combine operations.
 * Do NOT duplicate this logic elsewhere (BusStore, compileBusAware, etc).
 *
 * Why this matters:
 * - BusStore and compileBusAware had DIFFERENT sorting implementations
 * - Same sortKey = different ordering in UI vs runtime
 * - Non-deterministic behavior when publisher order matters
 * - Single source of truth prevents these bugs
 */

import type { Publisher } from '../types';
import type { Artifact, RuntimeCtx, Vec2, Field, CompileCtx, Seed } from '../compiler/types';

// =============================================================================
// Publisher Sorting
// =============================================================================

/**
 * Get publishers for a bus, sorted deterministically.
 *
 * Sorting order:
 * 1. Primary: sortKey (ascending)
 * 2. Secondary: id.localeCompare (stable tie-breaker)
 *
 * This ensures identical ordering regardless of:
 * - Canvas layout changes
 * - Array insertion order
 * - Compilation order
 *
 * Per SORTKEY-CONTRACT.md, this is the ONLY way to sort publishers.
 *
 * @param busId - Bus ID to filter by
 * @param allPublishers - Complete list of publishers
 * @param includeDisabled - Include disabled publishers (default: false)
 */
export function getSortedPublishers(
  busId: string,
  allPublishers: Publisher[],
  includeDisabled = false
): Publisher[] {
  // Filter to bus and enabled state
  const busPublishers = allPublishers.filter(
    p => p.busId === busId && (includeDisabled || p.enabled)
  );

  // Sort by (sortKey, id) for deterministic ordering
  return [...busPublishers].sort((a, b) => {
    // Primary sort: sortKey ascending
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    // Stable tie-breaker: id alphabetically
    return a.id.localeCompare(b.id);
  });
}

// =============================================================================
// Signal Combination
// =============================================================================

/**
 * Combine Signal artifacts using the bus's combine mode.
 * Supports: 'last' and 'sum'
 *
 * @param artifacts - Sorted artifacts to combine (order matters for 'last')
 * @param mode - Combine mode
 * @param defaultValue - Default value if no artifacts
 */
export function combineSignalArtifacts(
  artifacts: Artifact[],
  mode: string,
  defaultValue: unknown
): Artifact {
  // No publishers: return default value
  if (artifacts.length === 0) {
    // Infer kind from default value type
    if (typeof defaultValue === 'number') {
      return { kind: 'Signal:number', value: () => defaultValue };
    }
    if (typeof defaultValue === 'object' && defaultValue !== null && 'x' in defaultValue) {
      return { kind: 'Signal:vec2', value: () => defaultValue as Vec2 };
    }
    // Fallback: return as scalar
    return { kind: 'Scalar:number', value: 0 };
  }

  // Single publisher: return as-is
  if (artifacts.length === 1) {
    return artifacts[0]!;
  }

  // Multiple publishers: combine based on mode
  if (mode === 'last') {
    // Highest sortKey wins (last in sorted array)
    return artifacts[artifacts.length - 1]!;
  }

  if (mode === 'sum') {
    // Sum all values - works for number and vec2
    const first = artifacts[0]!;

    if (first.kind === 'Signal:number') {
      const signals = artifacts.map(a => (a as typeof first).value);
      return {
        kind: 'Signal:number',
        value: (t: number, ctx: RuntimeCtx) => {
          let sum = 0;
          for (const sig of signals) {
            sum += sig(t, ctx);
          }
          return sum;
        },
      };
    }

    if (first.kind === 'Signal:vec2') {
      const signals = artifacts.map(a => (a as typeof first).value);
      return {
        kind: 'Signal:vec2',
        value: (t: number, ctx: RuntimeCtx) => {
          let sumX = 0;
          let sumY = 0;
          for (const sig of signals) {
            const v = sig(t, ctx);
            sumX += v.x;
            sumY += v.y;
          }
          return { x: sumX, y: sumY };
        },
      };
    }

    // For scalars, convert to signals and sum
    if (first.kind === 'Scalar:number') {
      const sum = artifacts.reduce((acc, a) => acc + ((a as typeof first).value ?? 0), 0);
      return { kind: 'Scalar:number', value: sum };
    }

    if (first.kind === 'Scalar:vec2') {
      const sum = artifacts.reduce(
        (acc, a) => {
          const v = (a as typeof first).value;
          return { x: acc.x + v.x, y: acc.y + v.y };
        },
        { x: 0, y: 0 }
      );
      return { kind: 'Scalar:vec2', value: sum };
    }

    // Unsupported type for sum
    return {
      kind: 'Error',
      message: `Sum mode not supported for type ${first.kind}`,
    };
  }

  // Unsupported combine mode
  return {
    kind: 'Error',
    message: `Unsupported combine mode: ${mode}. Signal buses support: last, sum`,
  };
}

// =============================================================================
// Field Combination
// =============================================================================

/**
 * Combine Field artifacts using the bus's combine mode.
 * Fields support: 'last', 'sum', 'average', 'max', 'min'
 *
 * Field combination is lazy: we return a new Field that evaluates
 * all source fields and combines them per-element at evaluation time.
 *
 * @param artifacts - Sorted artifacts to combine (order matters for 'last')
 * @param mode - Combine mode
 * @param defaultValue - Default value if no artifacts
 */
export function combineFieldArtifacts(
  artifacts: Artifact[],
  mode: string,
  defaultValue: unknown
): Artifact {
  // No publishers: return constant field with default value
  if (artifacts.length === 0) {
    if (typeof defaultValue === 'number') {
      const constField: Field<number> = (_seed: Seed, n: number, _ctx: CompileCtx) => {
        const result: number[] = [];
        for (let i = 0; i < n; i++) {
          result.push(defaultValue);
        }
        return result;
      };
      return { kind: 'Field:number', value: constField };
    }
    // Fallback for non-number defaults
    return {
      kind: 'Error',
      message: `Default value type not supported for Field bus: ${typeof defaultValue}`,
    };
  }

  // Single publisher: return as-is
  if (artifacts.length === 1) {
    return artifacts[0]!;
  }

  // Multiple publishers: combine based on mode
  const first = artifacts[0]!;

  // Ensure all artifacts are Field:number
  if (first.kind !== 'Field:number') {
    return {
      kind: 'Error',
      message: `Field combination only supports Field:number, got ${first.kind}`,
    };
  }

  const fields = artifacts.map(a => (a as { kind: 'Field:number'; value: Field<number> }).value);

  if (mode === 'last') {
    // Highest sortKey wins (last in sorted array)
    return artifacts[artifacts.length - 1]!;
  }

  if (mode === 'sum') {
    const combined: Field<number> = (seed: Seed, n: number, ctx: CompileCtx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (const vals of allValues) {
          sum += vals[i] ?? 0;
        }
        result.push(sum);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  if (mode === 'average') {
    const combined: Field<number> = (seed: Seed, n: number, ctx: CompileCtx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (const vals of allValues) {
          sum += vals[i] ?? 0;
        }
        result.push(sum / fields.length);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  if (mode === 'max') {
    const combined: Field<number> = (seed: Seed, n: number, ctx: CompileCtx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let maxVal = -Infinity;
        for (const vals of allValues) {
          const v = vals[i] ?? -Infinity;
          if (v > maxVal) maxVal = v;
        }
        result.push(maxVal);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  if (mode === 'min') {
    const combined: Field<number> = (seed: Seed, n: number, ctx: CompileCtx) => {
      const allValues = fields.map(f => f(seed, n, ctx));
      const result: number[] = [];
      for (let i = 0; i < n; i++) {
        let minVal = Infinity;
        for (const vals of allValues) {
          const v = vals[i] ?? Infinity;
          if (v < minVal) minVal = v;
        }
        result.push(minVal);
      }
      return result;
    };
    return { kind: 'Field:number', value: combined };
  }

  // Unsupported combine mode
  return {
    kind: 'Error',
    message: `Unsupported combine mode: ${mode}. Field buses support: last, sum, average, max, min`,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that a combine mode is supported for a given world.
 */
export function validateCombineMode(world: 'signal' | 'field', mode: string): boolean {
  if (world === 'signal') {
    return ['last', 'sum'].includes(mode);
  }
  if (world === 'field') {
    return ['last', 'sum', 'average', 'max', 'min'].includes(mode);
  }
  return false;
}

/**
 * Get supported combine modes for a world.
 */
export function getSupportedCombineModes(world: 'signal' | 'field'): string[] {
  if (world === 'signal') {
    return ['last', 'sum'];
  }
  if (world === 'field') {
    return ['last', 'sum', 'average', 'max', 'min'];
  }
  return [];
}
