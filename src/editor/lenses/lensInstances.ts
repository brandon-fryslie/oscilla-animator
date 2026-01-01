import type { DefaultSourceStore } from '../stores/DefaultSourceStore';
import type { LensDefinition, LensInstance, LensParamBinding } from '../types';
import { TRANSFORM_REGISTRY, isLensTransform } from '../transforms/TransformRegistry';

/**
 * Create a LensInstance from a LensDefinition using literal bindings.
 * This stores param values directly on the instance, no DefaultSourceStore needed.
 */
export function createLensInstanceFromDefinition(
  lens: LensDefinition,
  _bindingId: string,
  lensIndex: number,
  _defaultSourceStore: DefaultSourceStore
): LensInstance {
  const transform = TRANSFORM_REGISTRY.getTransform(lens.type);
  const def = transform != null && isLensTransform(transform) ? transform : null;

  if (def == null) {
    // Unknown lens type - just pass through params as literals
    const paramBindings: Record<string, LensParamBinding> = {};
    for (const [paramKey, value] of Object.entries(lens.params)) {
      paramBindings[paramKey] = { kind: 'literal', value };
    }
    return {
      lensId: lens.type,
      params: paramBindings,
      enabled: true,
      sortKey: lensIndex,
    };
  }

  // Build param bindings using literal values
  const paramBindings: Record<string, LensParamBinding> = {};
  for (const [paramKey, spec] of Object.entries(def.params ?? {})) {
    const value = paramKey in lens.params ? lens.params[paramKey] : spec.default;
    paramBindings[paramKey] = { kind: 'literal', value };
  }

  return {
    lensId: def.id,
    params: paramBindings,
    enabled: true,
    sortKey: lensIndex,
  };
}

/**
 * Convert a LensInstance back to a LensDefinition for UI editing.
 * Handles both literal and defaultSource bindings.
 */
export function lensInstanceToDefinition(
  lens: LensInstance,
  defaultSourceStore: DefaultSourceStore
): LensDefinition {
  const params: Record<string, unknown> = {};
  for (const [paramKey, binding] of Object.entries(lens.params)) {
    if (binding.kind === 'literal') {
      params[paramKey] = binding.value;
    } else if (binding.kind === 'default') {
      const source = defaultSourceStore.sources.get(binding.defaultSourceId);
      if (source != null) {
        params[paramKey] = source.value;
      }
    }
    // bus bindings are not editable in the UI, skip them
  }
  return { type: lens.lensId, params };
}
