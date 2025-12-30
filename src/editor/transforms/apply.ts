/**
 * Transform application engine.
 *
 * This module provides the canonical implementation for applying adapter chains
 * and lens stacks to artifacts. In Sprint 1, it wraps existing compiler logic.
 * In Sprint 3, it will become the single source of truth.
 */

import type { TransformStack, TransformScope } from './types';
import type { Artifact, CompileCtx, CompileError } from '../compiler/types';
import type { AdapterStep, LensInstance } from '../types';

/**
 * Apply an adapter chain to an artifact.
 *
 * Sprint 1: Placeholder wrapper.
 * Deliverable 2: Will use registry-based execution.
 * Sprint 3: Will contain canonical implementation.
 */
export function applyAdapterChain(
  artifact: Artifact,
  _chain: AdapterStep[],
  _scope: TransformScope,
  _ctx: CompileCtx,
  _errors: CompileError[]
): Artifact {
  // Placeholder for Sprint 1 Deliverable 1
  // Will be implemented in Deliverable 2 when we add registry execution
  return artifact;
}

/**
 * Apply a lens stack to an artifact.
 *
 * Sprint 1: Placeholder wrapper.
 * Sprint 3: Will contain canonical implementation.
 */
export function applyLensStack(
  artifact: Artifact,
  _stack: LensInstance[],
  _scope: TransformScope,
  _ctx: CompileCtx,
  _errors: CompileError[]
): Artifact {
  // Placeholder for Sprint 1 Deliverable 1
  // Will be implemented in Sprint 3
  return artifact;
}

/**
 * Apply a unified transform stack to an artifact.
 *
 * This is the main entrypoint for transform application.
 * Adapters are applied first, then lenses.
 */
export function applyTransformStack(
  artifact: Artifact,
  stack: TransformStack,
  scope: TransformScope,
  ctx: CompileCtx,
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
      current = applyLensStack(current, [step.lens], scope, ctx, errors);
    }

    if (current.kind === 'Error') {
      return current;
    }
  }

  return current;
}
