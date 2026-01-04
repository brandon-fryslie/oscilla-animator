/**
 * DEPRECATED: Legacy auto-adapter pathfinding
 *
 * This file is part of the old adapter system and is being phased out.
 * The new unified transform system (TransformRegistry) should be used instead.
 *
 * TODO: Migrate remaining usages to TRANSFORM_REGISTRY and remove this file.
 * See: src/editor/transforms/TransformRegistry.ts
 */

import type { TypeDesc, AdapterStep, AdapterPolicy } from '../types';
import { TRANSFORM_REGISTRY } from '../transforms/TransformRegistry';
import { typeDescToString } from '../ir/types/TypeDesc';

/**
 * Check if two types are directly compatible (no adapter needed).
 * With structured TypeDesc, compare using string representation.
 */
function isDirectlyCompatible(from: TypeDesc, to: TypeDesc): boolean {
  return typeDescToString(from) === typeDescToString(to);
}

export interface AutoAdapterResult {
  ok: boolean;
  chain?: AdapterStep[];
  reason?: string;
  suggestions?: AdapterStep[][];
  requiresExplicit?: boolean;
}

/**
 * Find an adapter path from one type to another.
 *
 * @deprecated Use TRANSFORM_REGISTRY.findAdapters() instead
 */
export function findAdapterPath(
  from: TypeDesc,
  to: TypeDesc,
  context: 'wire' | 'publisher' | 'listener' | 'lensParam' = 'wire'
): AutoAdapterResult {
  if (isDirectlyCompatible(from, to)) {
    return { ok: true, chain: [] };
  }

  const cacheKey = `${context}|${typeDescToString(from)}->${typeDescToString(to)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Use TRANSFORM_REGISTRY to find adapters
  const allAdapters = TRANSFORM_REGISTRY.getAllAdapters().map(transform => ({
    id: transform.id,
    policy: (transform.policy ?? 'EXPLICIT') as AdapterPolicy,
    cost: transform.cost ?? 0,
    from: transform.inputType === 'same' ? from : (transform.inputType as TypeDesc),
    to: transform.outputType === 'same' ? to : (transform.outputType as TypeDesc),
  }));

  const candidates = findCandidatePaths(from, to, allAdapters);

  const autoPaths = candidates.filter((path) => path.every((step) => isAutoAllowed(step.policy, step.cost, context)));
  if (autoPaths.length > 0) {
    const best = chooseBestPath(autoPaths);
    const result = {
      ok: true,
      chain: best.map((step) => ({
        kind: 'adapter' as const,
        adapterId: step.id,
        params: {},
        from,
        to,
        adapter: step.id,
      })),
    };
    cache.set(cacheKey, result);
    return result;
  }

  const suggestPaths = candidates.filter((path) => path.every((step) => isSuggestAllowed(step.policy)));
  if (suggestPaths.length > 0) {
    const result = {
      ok: false,
      reason: 'Adapter requires suggestion',
      suggestions: chooseBestPaths(suggestPaths).map((path) => path.map((step) => ({
        kind: 'adapter' as const,
        adapterId: step.id,
        params: {},
        from,
        to,
        adapter: step.id,
      }))),
    };
    cache.set(cacheKey, result);
    return result;
  }

  const explicitPaths = candidates.filter((path) => path.every((step) => step.policy !== 'FORBIDDEN'));
  if (explicitPaths.length > 0) {
    const result = {
      ok: false,
      reason: 'Adapter requires explicit confirmation',
      requiresExplicit: true,
      suggestions: chooseBestPaths(explicitPaths).map((path) => path.map((step) => ({
        kind: 'adapter' as const,
        adapterId: step.id,
        params: {},
        from,
        to,
        adapter: step.id,
      }))),
    };
    cache.set(cacheKey, result);
    return result;
  }

  const result = {
    ok: false,
    reason: `No adapter found from ${typeDescToString(from)} to ${typeDescToString(to)}`,
  };
  cache.set(cacheKey, result);
  return result;
}

const cache = new Map<string, AutoAdapterResult>();
const MAX_CHAIN_LENGTH = 2;
const COST_HEAVY_THRESHOLD = 100;

function typeKey(desc: TypeDesc): string {
  // Convert TypeDesc object to string for comparison
  return typeDescToString(desc);
}

function findCandidatePaths(from: TypeDesc, to: TypeDesc, adapters: Array<{ from: TypeDesc; to: TypeDesc; id: string; policy: AdapterPolicy; cost: number }>) {
  const paths: Array<Array<{ id: string; policy: AdapterPolicy; cost: number; from: TypeDesc; to: TypeDesc }>> = [];

  for (const adapter of adapters) {
    if (typeKey(adapter.from) === typeKey(from) && typeKey(adapter.to) === typeKey(to)) {
      paths.push([adapter]);
    }
  }

  if (MAX_CHAIN_LENGTH > 1) {
    for (const first of adapters) {
      if (typeKey(first.from) !== typeKey(from)) continue;
      for (const second of adapters) {
        if (typeKey(first.to) !== typeKey(second.from)) continue;
        if (typeKey(second.to) !== typeKey(to)) continue;
        paths.push([first, second]);
      }
    }
  }

  return paths;
}

function isAutoAllowed(policy: AdapterPolicy, cost: number, context: string): boolean {
  if (policy !== 'AUTO') return false;
  if (cost >= COST_HEAVY_THRESHOLD) return false;
  if (context === 'publisher' && cost >= COST_HEAVY_THRESHOLD) return false;
  if (context === 'listener' && cost >= COST_HEAVY_THRESHOLD) return false;
  if (context === 'wire' && cost >= COST_HEAVY_THRESHOLD) return false;
  return true;
}

function isSuggestAllowed(policy: AdapterPolicy): boolean {
  return policy === 'AUTO' || policy === 'SUGGEST';
}

function chooseBestPath(paths: Array<Array<{ id: string; policy: AdapterPolicy; cost: number; from: TypeDesc; to: TypeDesc }>>) {
  const bestPaths = chooseBestPaths(paths);
  // We know bestPaths is non-empty when this function is called
  // because callers only invoke this after checking paths.length > 0
  return bestPaths[0];
}

function chooseBestPaths(paths: Array<Array<{ id: string; policy: AdapterPolicy; cost: number; from: TypeDesc; to: TypeDesc }>>) {
  return [...paths].sort((a, b) => {
    const scoreA = scorePath(a);
    const scoreB = scorePath(b);
    if (scoreA !== scoreB) return scoreA - scoreB;
    if (a.length !== b.length) return a.length - b.length;
    const idsA = a.map((step) => step.id).join(',');
    const idsB = b.map((step) => step.id).join(',');
    return idsA.localeCompare(idsB);
  });
}

function scorePath(path: Array<{ cost: number; from: TypeDesc; to: TypeDesc }>): number {
  const costScore = path.reduce((sum, step) => sum + step.cost, 0);
  const hopPenalty = path.length * 0.5;
  // With structured TypeDesc, we can check world differences
  const worldPenalty = path.reduce((sum, step) => {
    return sum + (step.from.world !== step.to.world ? 1 : 0);
  }, 0);
  return costScore + hopPenalty + worldPenalty;
}
