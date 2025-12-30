/**
 * Transform application engine.
 *
 * This module provides the canonical implementation for applying adapter chains
 * and lens stacks to artifacts. This is the single source of truth for all
 * transform application across wires, publishers, listeners, and lens params.
 */

import type { TransformStack, TransformScope } from './types';
import type { Artifact, CompileCtx, CompileError } from '../compiler/types';
import type { AdapterStep, LensInstance } from '../types';
import { getAdapter, getLens } from './catalog';
import { validateLensScope } from './validate';
import type { ParamResolutionContext } from '../lenses/lensResolution';
import { resolveLensParam } from '../lenses/lensResolution';

/**
 * Apply a single adapter step to an artifact.
 * Uses registry-based execution (Sprint 1 Deliverable 2).
 */
function applyAdapterStep(
  artifact: Artifact,
  step: AdapterStep,
  ctx: CompileCtx
): Artifact {
  const def = getAdapter(step.adapterId);

  if (def === null || def === undefined) {
    return { kind: 'Error', message: `Unknown adapter: ${step.adapterId}` };
  }

  if (def.apply === null || def.apply === undefined) {
    return { kind: 'Error', message: `Adapter ${step.adapterId} has no implementation` };
  }

  return def.apply(artifact, step.params, ctx);
}

/**
 * Get artifact type information for domain compatibility checks.
 */
function getArtifactType(artifact: Artifact): { world: 'signal' | 'field' | 'scalar'; domain: string } | null {
  switch (artifact.kind) {
    case 'Signal:float':
      return { world: 'signal', domain: 'float' };
    case 'Signal:vec2':
      return { world: 'signal', domain: 'vec2' };
    case 'Signal:phase':
      return { world: 'signal', domain: 'float' };
    case 'Signal:color':
      return { world: 'signal', domain: 'color' };
    case 'Field:float':
      return { world: 'field', domain: 'float' };
    case 'Field:vec2':
      return { world: 'field', domain: 'vec2' };
    case 'Field:color':
      return { world: 'field', domain: 'color' };
    case 'Scalar:float':
      return { world: 'scalar', domain: 'float' };
    case 'Scalar:vec2':
      return { world: 'scalar', domain: 'vec2' };
    case 'Scalar:boolean':
      return { world: 'scalar', domain: 'boolean' };
    default:
      return null;
  }
}

/**
 * Apply an adapter chain to an artifact.
 *
 * Sprint 3: Canonical implementation moved from compileBusAware.ts
 */
export function applyAdapterChain(
  artifact: Artifact,
  chain: AdapterStep[] | undefined,
  _scope: TransformScope,
  ctx: CompileCtx,
  errors: CompileError[]
): Artifact {
  if (chain === null || chain === undefined || chain.length === 0) {
    return artifact;
  }

  let current = artifact;

  for (const step of chain) {
    const next = applyAdapterStep(current, step, ctx);
    if (next.kind === 'Error') {
      errors.push({
        code: 'AdapterError',
        message: next.message,
      });
      return next;
    }
    current = next;
  }

  return current;
}

/**
 * Apply a lens stack to an artifact.
 *
 * Sprint 3: Canonical implementation moved from compileBusAware.ts
 *
 * This function handles:
 * - Scope validation (Sprint 2)
 * - Domain compatibility checks
 * - Lens parameter resolution (recursive with depth limit)
 * - Lens application via registry
 */
export function applyLensStack(
  artifact: Artifact,
  lensStack: LensInstance[] | undefined,
  scope: TransformScope,
  _ctx: CompileCtx,
  paramContext: ParamResolutionContext,
  errors: CompileError[]
): Artifact {
  if (lensStack === null || lensStack === undefined || lensStack.length === 0) {
    return artifact;
  }

  let current = artifact;

  for (const lens of lensStack) {
    if (lens.enabled === false) continue;

    // Sprint 2: Validate lens scope compatibility
    validateLensScope(lens.lensId, scope, errors);
    if (errors.length > 0) {
      // Early exit on scope validation errors
      return { kind: 'Error', message: `Lens scope validation failed: ${lens.lensId}` };
    }

    const def = getLens(lens.lensId);
    if (def === null || def === undefined) {
      continue;
    }

    const type = getArtifactType(current);
    // Domain compatibility check: exact domain match
    const domainCompatible =
      type !== null &&
      type !== undefined &&
      type.domain === def.domain;

    if (!domainCompatible) {
      errors.push({
        code: 'AdapterError',
        message: `Lens ${lens.lensId} is not type-preserving for ${current.kind}`,
      });
      return { kind: 'Error', message: `Lens type mismatch: ${lens.lensId}` };
    }

    // Resolve lens parameters
    const params: Record<string, Artifact> = {} as Record<string, Artifact>;
    for (const [paramKey, binding] of Object.entries(lens.params)) {
      params[paramKey] = resolveLensParam(binding, paramContext);
    }

    // Apply the lens
    if (def.apply !== null && def.apply !== undefined) {
      current = def.apply(current, params);
    }
  }

  return current;
}

/**
 * Apply a unified transform stack to an artifact.
 *
 * This is the main entrypoint for transform application.
 * Adapters are applied first, then lenses.
 *
 * Sprint 3: Enhanced to use canonical adapter/lens implementations
 */
export function applyTransformStack(
  artifact: Artifact,
  stack: TransformStack,
  scope: TransformScope,
  ctx: CompileCtx,
  paramContext: ParamResolutionContext,
  errors: CompileError[]
): Artifact {
  let current = artifact;

  for (const step of stack) {
    if (!step.enabled) {
      continue; // Skip disabled transforms
    }

    if (step.kind === 'adapter') {
      current = applyAdapterChain(current, [step.step], scope, ctx, errors);
    } else {
      current = applyLensStack(current, [step.lens], scope, ctx, paramContext, errors);
    }

    if (current.kind === 'Error') {
      return current;
    }
  }

  return current;
}
