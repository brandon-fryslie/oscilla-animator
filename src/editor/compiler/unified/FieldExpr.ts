/**
 * @file FieldExpr - Lazy Field expression system
 * @description Implements lazy, domain-aware Field<T> evaluation via expression DAGs.
 *
 * Architecture:
 * - Fields compile to FieldExpr nodes (not eager arrays)
 * - Evaluation happens at sinks, batched over domain elements
 * - No per-element closures (all iteration is in batch evaluator)
 * - Memoization prevents redundant evaluation per frame
 *
 * Key Principle: FieldExpr is a description of computation, not computed values.
 * Evaluation is deferred until a sink requests values for specific elements.
 */

import type { Domain, ElementId } from './Domain';
import type { TimeCtx } from './TimeCtx';

/**
 * FieldExpr node kinds.
 */
export type FieldExprKind =
  | 'const'     // Constant value for all elements
  | 'domain'    // Domain source (element indices)
  | 'source'    // Source from artifact (block output)
  | 'map'       // Transform via function
  | 'zip'       // Combine two fields
  | 'bus'       // Combined bus publishers
  | 'adapter';  // Type adapter

/**
 * Function registry ID for map/zip operations.
 */
export type FunctionId = string;

/**
 * FieldExpr - lazy expression tree for Field<T> values.
 *
 * Each node represents a computation step. Evaluation is deferred until
 * a sink requests values for specific elements.
 */
export type FieldExpr<T> =
  | { kind: 'const'; value: T; domain: Domain }
  | { kind: 'domain'; domain: Domain }
  | { kind: 'source'; sourceId: string; domain: Domain }
  | { kind: 'map'; src: FieldExpr<unknown>; fnId: FunctionId; params?: Record<string, unknown> }
  | { kind: 'zip'; a: FieldExpr<unknown>; b: FieldExpr<unknown>; fnId: FunctionId }
  | { kind: 'bus'; busId: string; publishers: FieldExpr<T>[]; combineMode: string; domain: Domain }
  | { kind: 'adapter'; src: FieldExpr<unknown>; fnId: FunctionId };

/**
 * Function registry for map/zip operations.
 *
 * Functions are registered with unique IDs and called during evaluation.
 */
export class FunctionRegistry {
  private functions = new Map<FunctionId, (...args: unknown[]) => unknown>();

  /**
   * Register a function with an ID.
   */
  register(id: FunctionId, fn: (...args: unknown[]) => unknown): void {
    this.functions.set(id, fn);
  }

  /**
   * Get a function by ID.
   */
  get(id: FunctionId): ((...args: unknown[]) => unknown) | undefined {
    return this.functions.get(id);
  }

  /**
   * Check if function is registered.
   */
  has(id: FunctionId): boolean {
    return this.functions.has(id);
  }
}

/**
 * Global function registry for FieldExpr operations.
 */
export const functionRegistry = new FunctionRegistry();

/**
 * Memoization cache for FieldExpr evaluation.
 *
 * Cache key: `${exprNodeId}:${elementId}:${frame}`
 */
export class MemoCache {
  private cache = new Map<string, unknown>();
  private currentFrame = -1;

  /**
   * Clear cache (call at start of each frame).
   */
  clear(frame: number): void {
    if (frame !== this.currentFrame) {
      this.cache.clear();
      this.currentFrame = frame;
    }
  }

  /**
   * Get cached value.
   */
  get(exprNodeId: string, elementId: ElementId, frame: number): unknown {
    const key = `${exprNodeId}:${elementId}:${frame}`;
    return this.cache.get(key);
  }

  /**
   * Set cached value.
   */
  set(exprNodeId: string, elementId: ElementId, frame: number, value: unknown): void {
    const key = `${exprNodeId}:${elementId}:${frame}`;
    this.cache.set(key, value);
  }
}

/**
 * Context for FieldExpr evaluation.
 */
export interface FieldExprCtx {
  /** Compiled artifacts (block outputs, sources) */
  readonly artifacts: Map<string, unknown>;

  /** Bus artifacts (compiled bus outputs) */
  readonly busArtifacts: Map<string, unknown>;

  /** Memoization cache */
  readonly memoCache: MemoCache;
}

/**
 * Create a FieldExprCtx.
 */
export function createFieldExprCtx(): FieldExprCtx {
  return {
    artifacts: new Map(),
    busArtifacts: new Map(),
    memoCache: new MemoCache(),
  };
}

/**
 * Generate stable node ID for FieldExpr (for memoization).
 */
function getNodeId(expr: FieldExpr<unknown>): string {
  switch (expr.kind) {
    case 'const':
      return `const:${JSON.stringify(expr.value)}`;
    case 'domain':
      return `domain:${expr.domain.id}`;
    case 'source':
      return `source:${expr.sourceId}`;
    case 'map':
      return `map:${expr.fnId}:${getNodeId(expr.src)}`;
    case 'zip':
      return `zip:${expr.fnId}:${getNodeId(expr.a)}:${getNodeId(expr.b)}`;
    case 'bus':
      return `bus:${expr.busId}`;
    case 'adapter':
      return `adapter:${expr.fnId}:${getNodeId(expr.src)}`;
  }
}

/**
 * Evaluate FieldExpr for a single element.
 *
 * @param expr - FieldExpr to evaluate
 * @param elementId - Element ID to evaluate for
 * @param timeCtx - Time context
 * @param evalCtx - Evaluation context
 * @returns Evaluated value
 */
export function evaluateFieldExpr<T>(
  expr: FieldExpr<T>,
  elementId: ElementId,
  timeCtx: TimeCtx,
  evalCtx: FieldExprCtx
): T {
  const nodeId = getNodeId(expr);

  // Check memo cache
  const cached = evalCtx.memoCache.get(nodeId, elementId, timeCtx.frame);
  if (cached !== undefined) {
    return cached as T;
  }

  // Evaluate based on kind
  let result: T;

  switch (expr.kind) {
    case 'const':
      result = expr.value;
      break;

    case 'domain': {
      // Domain node: return element index as number
      result = parseInt(elementId, 10) as T;
      break;
    }

    case 'source': {
      // Get source artifact (pre-computed array or FieldExpr)
      const artifact = evalCtx.artifacts.get(expr.sourceId);
      if (artifact == null) {
        throw new Error(`Source artifact not found: ${expr.sourceId}`);
      }

      // If artifact is array, index by element ID (assuming numeric IDs)
      if (Array.isArray(artifact)) {
        const idx = parseInt(elementId, 10);
        result = artifact[idx] as T;
      } else {
        throw new Error(`Source artifact is not an array: ${expr.sourceId}`);
      }
      break;
    }

    case 'map': {
      const srcValue = evaluateFieldExpr(expr.src, elementId, timeCtx, evalCtx);
      const fn = functionRegistry.get(expr.fnId);
      if (fn == null) {
        throw new Error(`Function not found: ${expr.fnId}`);
      }
      result = fn(srcValue, expr.params ?? {}, elementId, timeCtx) as T;
      break;
    }

    case 'zip': {
      const aValue = evaluateFieldExpr(expr.a, elementId, timeCtx, evalCtx);
      const bValue = evaluateFieldExpr(expr.b, elementId, timeCtx, evalCtx);
      const fn = functionRegistry.get(expr.fnId);
      if (fn == null) {
        throw new Error(`Function not found: ${expr.fnId}`);
      }
      result = fn(aValue, bValue, elementId, timeCtx) as T;
      break;
    }

    case 'bus': {
      // Bus combines multiple publishers
      const publisherValues = expr.publishers.map((pub) =>
        evaluateFieldExpr(pub, elementId, timeCtx, evalCtx)
      );

      // Apply combine mode
      result = combineValues(publisherValues, expr.combineMode) as T;
      break;
    }

    case 'adapter': {
      const srcValue = evaluateFieldExpr(expr.src, elementId, timeCtx, evalCtx);
      const fn = functionRegistry.get(expr.fnId);
      if (fn == null) {
        throw new Error(`Adapter function not found: ${expr.fnId}`);
      }
      result = fn(srcValue) as T;
      break;
    }
  }

  // Cache result
  evalCtx.memoCache.set(nodeId, elementId, timeCtx.frame, result);

  return result;
}

/**
 * Batch evaluate FieldExpr for all elements in domain.
 *
 * @param expr - FieldExpr to evaluate
 * @param domain - Domain to iterate over
 * @param timeCtx - Time context
 * @param evalCtx - Evaluation context
 * @returns Array of evaluated values
 */
export function batchEvaluateFieldExpr<T>(
  expr: FieldExpr<T>,
  domain: Domain,
  timeCtx: TimeCtx,
  evalCtx: FieldExprCtx
): readonly T[] {
  // Clear memo cache for this frame
  evalCtx.memoCache.clear(timeCtx.frame);

  const results: T[] = [];
  for (const elementId of domain.elements) {
    results.push(evaluateFieldExpr(expr, elementId, timeCtx, evalCtx));
  }

  return results;
}

/**
 * Combine values based on combine mode.
 */
function combineValues(values: unknown[], combineMode: string): unknown {
  if (values.length === 0) {
    return undefined;
  }

  switch (combineMode) {
    case 'sum':
      return values.reduce((acc: number, v) => acc + (v as number), 0);

    case 'average': {
      const sum = values.reduce((acc: number, v) => acc + (v as number), 0);
      return sum / values.length;
    }

    case 'max':
      return Math.max(...(values as number[]));

    case 'min':
      return Math.min(...(values as number[]));

    case 'last':
      return values[values.length - 1];

    case 'layer':
      // For composite values (like transforms), apply in order
      // This is a placeholder - real implementation depends on type
      return values[values.length - 1];

    default:
      throw new Error(`Unknown combine mode: ${combineMode}`);
  }
}

/**
 * FieldExpr combinators.
 */

/**
 * Map: transform a Field<A> to Field<B>.
 */
export function mapFieldExpr<A, B>(
  expr: FieldExpr<A>,
  fnId: FunctionId,
  params?: Record<string, unknown>
): FieldExpr<B> {
  return {
    kind: 'map',
    src: expr,
    fnId,
    params,
  };
}

/**
 * Zip: combine two Field<A> and Field<B> to Field<C>.
 */
export function zipFieldExpr<A, B, C>(
  a: FieldExpr<A>,
  b: FieldExpr<B>,
  fnId: FunctionId
): FieldExpr<C> {
  return {
    kind: 'zip',
    a,
    b,
    fnId,
  };
}

/**
 * Const: constant value for all elements.
 */
export function constFieldExpr<T>(value: T, domain: Domain): FieldExpr<T> {
  return {
    kind: 'const',
    value,
    domain,
  };
}

/**
 * Domain: reference domain elements (produces element indices).
 */
export function domainFieldExpr(domain: Domain): FieldExpr<number> {
  return {
    kind: 'domain',
    domain,
  };
}

/**
 * Source: reference a pre-computed Field from block output.
 */
export function sourceFieldExpr<T>(sourceId: string, domain: Domain): FieldExpr<T> {
  return {
    kind: 'source',
    sourceId,
    domain,
  };
}

/**
 * Get domain from FieldExpr (if available).
 */
export function getFieldExprDomain(expr: FieldExpr<unknown>): Domain | undefined {
  switch (expr.kind) {
    case 'const':
    case 'domain':
    case 'source':
    case 'bus':
      return expr.domain;
    case 'map':
      return getFieldExprDomain(expr.src);
    case 'zip':
      return getFieldExprDomain(expr.a) ?? getFieldExprDomain(expr.b);
    case 'adapter':
      return getFieldExprDomain(expr.src);
  }
}
