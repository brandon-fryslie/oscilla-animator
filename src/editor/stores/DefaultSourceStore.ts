/**
 * @file Default Source Store
 * @description Manages implicit default sources for lens parameters.
 */
import { makeObservable, observable, action } from 'mobx';
import type { DefaultSourceState, TypeDesc, UIControlHint } from '../types';

export class DefaultSourceStore {
  sources: Map<string, DefaultSourceState> = new Map();

  constructor() {
    makeObservable(this, {
      sources: observable,
      ensureDefaultSource: action,
      setDefaultValue: action,
      load: action,
      clear: action,
    });
  }

  ensureDefaultSource(
    id: string,
    spec: { type: TypeDesc; value: unknown; uiHint?: UIControlHint; rangeHint?: DefaultSourceState['rangeHint'] }
  ): DefaultSourceState {
    const existing = this.sources.get(id);
    if (existing) return existing;

    const created: DefaultSourceState = {
      id,
      type: spec.type,
      value: spec.value,
      uiHint: spec.uiHint,
      rangeHint: spec.rangeHint,
    };
    this.sources.set(id, created);
    return created;
  }

  setDefaultValue(id: string, value: unknown): void {
    const existing = this.sources.get(id);
    if (!existing) return;
    existing.value = value;
  }

  load(defaultSources: DefaultSourceState[]): void {
    this.sources = new Map(defaultSources.map((source) => [source.id, source]));
  }

  clear(): void {
    this.sources.clear();
  }
}
