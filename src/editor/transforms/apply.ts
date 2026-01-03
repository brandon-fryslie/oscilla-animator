/**
 * Transform application engine.
 *
 * Phase 1: Unified Runtime Dispatcher
 *
 * This module provides the canonical implementation for applying transforms
 * (both adapters and lenses) to artifacts. Single code path for all transform
 * application across wires, publishers, listeners, and lens params.
 *
 * References:
 * - .agent_planning/lens-adapter-unification/PLAN-2026-01-02-transform-unification.md
 * - .agent_planning/lens-adapter-unification/DOD-2026-01-02-transform-unification.md
 */

import type { TransformStack, TransformScope, TransformStep } from './types';
import type { Artifact, CompileCtx, CompileError, RuntimeCtx } from '../compiler/types';
import { TRANSFORM_REGISTRY } from './TransformRegistry';
import { validateLensScope } from './validate';
import type { ParamResolutionContext } from '../lenses/lensResolution';
import { resolveLensParam } from '../lenses/lensResolution';

/**
 * Context for transform application.
 * Combines CompileCtx and RuntimeCtx for unified handling.
 */
export interface TransformContext {
  compileCtx: CompileCtx;
  runtimeCtx?: RuntimeCtx;
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
 * Resolve parameters for a transform step.
 * Handles both adapter params (simple Record<string, unknown>)
 * and lens params (LensParamBinding[] resolved to Artifacts).
 */
function resolveTransformParams(
  step: TransformStep,
  paramContext: ParamResolutionContext
): Record<string, Artifact> {
  if (step.kind === 'adapter') {
    // Adapters have simple params that need to be wrapped as artifacts
    const params: Record<string, Artifact> = {};
    if (step.step.params) {
      for (const [key, value] of Object.entries(step.step.params)) {
        // Wrap primitive values as scalar artifacts
        if (typeof value === 'number') {
          params[key] = { kind: 'Scalar:float', value };
        } else if (typeof value === 'boolean') {
          params[key] = { kind: 'Scalar:boolean', value };
        } else if (typeof value === 'string') {
          params[key] = { kind: 'Scalar:string', value };
        } else {
          // For complex values, store as-is (may need enhancement)
          params[key] = value as Artifact;
        }
      }
    }
    return params;
  } else {
    // Lenses have LensParamBinding that must be resolved recursively
    const params: Record<string, Artifact> = {};
    for (const [paramKey, binding] of Object.entries(step.lens.params)) {
      params[paramKey] = resolveLensParam(binding, paramContext);
    }
    return params;
  }
}

/**
 * Apply a single transform step to a value.
 * Works identically for adapters and lenses.
 *
 * Phase 1 Deliverable: Unified apply function for both transform types.
 */
export function applyTransformStep(
  value: Artifact,
  step: TransformStep,
  scope: TransformScope,
  ctx: CompileCtx,
  paramContext: ParamResolutionContext,
  errors: CompileError[]
): Artifact {
  // Skip if disabled
  if (!step.enabled) {
    return value;
  }

  // Get transform ID
  const id = step.kind === 'adapter' ? step.step.adapterId : step.lens.lensId;

  // Get transform definition from registry
  const def = TRANSFORM_REGISTRY.getTransform(id);

  if (!def) {
    const error: CompileError = {
      code: 'AdapterError',
      message: `Unknown transform: ${id}`
    };
    errors.push(error);
    return { kind: 'Error', message: error.message };
  }

  // Lens-specific validation
  if (step.kind === 'lens') {
    // Validate lens scope compatibility
    validateLensScope(step.lens.lensId, scope, errors);
    if (errors.length > 0) {
      return { kind: 'Error', message: `Lens scope validation failed: ${id}` };
    }

    // Domain compatibility check: exact domain match
    const type = getArtifactType(value);
    const domainCompatible =
      type !== null &&
      type !== undefined &&
      def.domain !== undefined &&
      type.domain === def.domain;

    if (!domainCompatible) {
      const error: CompileError = {
        code: 'AdapterError',
        message: `Lens ${id} is not type-preserving for ${value.kind}`
      };
      errors.push(error);
      return { kind: 'Error', message: error.message };
    }
  }

  // Check if transform has implementation
  if (!def.apply) {
    const error: CompileError = {
      code: 'AdapterError',
      message: `Transform ${id} has no implementation`
    };
    errors.push(error);
    return { kind: 'Error', message: error.message };
  }

  // Resolve parameters (unified for both types)
  const params = resolveTransformParams(step, paramContext);

  // Apply the transform
  // Note: We need to handle the different signatures gracefully
  // Adapters: (artifact, params, ctx: CompileCtx) => Artifact
  // Lenses: (value, params, ctx: RuntimeCtx) => Artifact
  if (step.kind === 'adapter') {
    // Adapter apply expects CompileCtx
    const adapterApply = def.apply as (artifact: Artifact, params: Record<string, unknown>, ctx: CompileCtx) => Artifact;
    // Convert artifact params back to unknown for adapters (temporary during transition)
    const unwrappedParams: Record<string, unknown> = {};
    for (const [key, artifact] of Object.entries(params)) {
      if (artifact.kind === 'Scalar:float' || artifact.kind === 'Scalar:int') {
        unwrappedParams[key] = artifact.value;
      } else if (artifact.kind === 'Scalar:boolean') {
        unwrappedParams[key] = artifact.value;
      } else if (artifact.kind === 'Scalar:string') {
        unwrappedParams[key] = artifact.value;
      } else {
        unwrappedParams[key] = artifact;
      }
    }
    return adapterApply(value, unwrappedParams, ctx);
  } else {
    // Lens apply expects RuntimeCtx (but we may not have one at compile time)
    const lensApply = def.apply as (value: Artifact, params: Record<string, Artifact>, ctx?: RuntimeCtx) => Artifact;
    return lensApply(value, params);
  }
}

/**
 * Apply a chain of transforms to a value.
 * Single entry point for all transform application.
 *
 * Phase 1 Deliverable: Unified dispatcher that iterates transform chain.
 */
export function applyTransforms(
  value: Artifact,
  transforms: TransformStep[],
  scope: TransformScope,
  ctx: CompileCtx,
  paramContext: ParamResolutionContext,
  errors: CompileError[]
): Artifact {
  let current = value;

  for (const step of transforms) {
    const result = applyTransformStep(current, step, scope, ctx, paramContext, errors);

    if (result.kind === 'Error') {
      return result; // Early exit on error
    }

    current = result;
  }

  return current;
}

/**
 * Apply a unified transform stack to an artifact.
 *
 * This is the main entrypoint for transform application.
 * Handles TransformStack which may contain interleaved adapters and lenses.
 */
export function applyTransformStack(
  artifact: Artifact,
  stack: TransformStack,
  scope: TransformScope,
  ctx: CompileCtx,
  paramContext: ParamResolutionContext,
  errors: CompileError[]
): Artifact {
  // Convert TransformStack to array and apply
  return applyTransforms(artifact, Array.from(stack), scope, ctx, paramContext, errors);
}
