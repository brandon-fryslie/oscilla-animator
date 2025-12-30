/**
 * Validation functions for transform stacks.
 *
 * Validates:
 * - Scope legality (lens allowedScopes, adapter policies)
 * - Type legality (lens domain compatibility)
 * - Structural legality (cycles, depth limits)
 * - IR mode compatibility (Sprint 5)
 */

import type { TransformStack, TransformScope } from './types';
import type { CompileError } from '../compiler/types';
import { getAdapter, getLens } from './catalog';

/**
 * Validate that a lens is allowed in the given scope.
 *
 * Will be fully implemented in Sprint 2 when lens scope is expanded.
 */
export function validateLensScope(
  lensId: string,
  scope: TransformScope,
  errors: CompileError[]
): void {
  const def = getLens(lensId);

  if (!def) {
    errors.push({
      code: 'NotImplemented',
      message: `Unknown lens: ${lensId}`,
    });
    return;
  }

  // Scope validation will be implemented in Sprint 2
  // For now, only validate publisher/listener scopes
  if (scope === 'publisher' || scope === 'listener') {
    if (!def.allowedScopes.includes(scope)) {
      errors.push({
        code: 'AdapterError',
        message: `Lens '${def.label}' is not allowed in scope '${scope}'. Allowed scopes: ${def.allowedScopes.join(', ')}`,
      });
    }
  }
}

/**
 * Validate that an adapter is allowed in the given scope.
 *
 * Adapter policies:
 * - AUTO: Allowed everywhere (automatic type conversion)
 * - SUGGEST: Allowed but must be explicit (suggested by UI)
 * - EXPLICIT: Must be manually added (not auto-inserted)
 */
export function validateAdapterScope(
  adapterId: string,
  _scope: TransformScope,
  errors: CompileError[]
): void {
  const def = getAdapter(adapterId);

  if (!def) {
    errors.push({
      code: 'AdapterError',
      message: `Unknown adapter: ${adapterId}`,
    });
    return;
  }

  // All adapters are currently allowed in all scopes
  // Scope-specific adapter policies may be added in future sprints
}

/**
 * Validate an entire transform stack for a given scope.
 *
 * This is the main validation entrypoint called by the compiler.
 */
export function validateTransformStack(
  stack: TransformStack,
  scope: TransformScope,
  errors: CompileError[]
): void {
  for (const step of stack) {
    if (!step.enabled) {
      continue; // Skip disabled transforms
    }

    if (step.kind === 'adapter') {
      validateAdapterScope(step.step.adapterId, scope, errors);
    } else {
      validateLensScope(step.lens.lensId, scope, errors);
    }
  }
}

/**
 * Validate transform stack for IR mode compatibility.
 *
 * Placeholder for Sprint 5 - will check that all transforms have compileToIR implementations.
 */
export function validateForIRMode(
  _stack: TransformStack,
  _errors: CompileError[]
): void {
  // Implementation deferred to Sprint 5
  // For now, return without validation (existing IR behavior: reject adapters, ignore lenses)
  return;
}

/**
 * Validate lens parameter bindings for cycles and depth limits.
 *
 * Placeholder for Sprint 3 - will detect cycles and enforce max depth of 3.
 */
export function validateLensParamBindings(
  _stack: TransformStack,
  _errors: CompileError[],
  _visited: Set<string> = new Set(),
  _depth: number = 0
): void {
  // Implementation deferred to Sprint 3
  // Current compiler already handles lens param resolution
  return;
}
