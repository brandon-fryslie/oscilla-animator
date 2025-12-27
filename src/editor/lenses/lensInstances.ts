import type { DefaultSourceStore } from '../stores/DefaultSourceStore';
import type { LensDefinition, LensInstance, LensParamBinding } from '../types';
import { getLens } from './LensRegistry';

export function createLensParamDefaultSourceId(bindingId: string, lensIndex: number, paramKey: string): string {
  return `ds:${bindingId}:${lensIndex}:${paramKey}`;
}

export function createLensInstanceFromDefinition(
  lens: LensDefinition,
  bindingId: string,
  lensIndex: number,
  defaultSourceStore: DefaultSourceStore
): LensInstance {
  const def = getLens(lens.type);
  if (def == null) {
    return {
      lensId: lens.type,
      params: {},
      enabled: true,
      sortKey: lensIndex,
    };
  }

  const paramBindings: Record<string, LensParamBinding> = {};
  for (const [paramKey, spec] of Object.entries(def.params)) {
    const id = createLensParamDefaultSourceId(bindingId, lensIndex, paramKey);
    const value = paramKey in lens.params ? lens.params[paramKey] : spec.default;
    // First ensure the source exists
    defaultSourceStore.ensureDefaultSource(id, {
      type: spec.type,
      value,
      uiHint: spec.uiHint,
    });
    // Then update the value (ensureDefaultSource doesn't update existing sources)
    defaultSourceStore.setDefaultValue(id, value);
    paramBindings[paramKey] = { kind: 'default', defaultSourceId: id };
  }

  return {
    lensId: def.id,
    params: paramBindings,
    enabled: true,
    sortKey: lensIndex,
  };
}

export function lensInstanceToDefinition(
  lens: LensInstance,
  defaultSourceStore: DefaultSourceStore
): LensDefinition {
  const params: Record<string, unknown> = {};
  for (const [paramKey, binding] of Object.entries(lens.params)) {
    if (binding.kind === 'default') {
      const source = defaultSourceStore.sources.get(binding.defaultSourceId);
      if (source != null) {
        params[paramKey] = source.value;
      }
    }
  }
  return { type: lens.lensId, params };
}
