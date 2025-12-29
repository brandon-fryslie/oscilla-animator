
import { makeObservable, observable, action, reaction, makeAutoObservable } from 'mobx';

// --- Mocks & Simplified Classes ---

// Mock Block ID type
type SlotWorld = 'signal' | 'field' | 'scalar' | 'config';

interface TypeDesc {
  world: SlotWorld;
  domain: string;
  category: string;
  busEligible: boolean;
}

interface DefaultSourceState {
  id: string;
  type: TypeDesc;
  value: unknown;
  uiHint?: any;
  rangeHint?: any;
}

// 1. Copy of DefaultSource from DefaultSourceStore.ts
class DefaultSource implements DefaultSourceState {
  id: string;
  type: TypeDesc;
  value: unknown;
  uiHint?: any;
  rangeHint?: any;

  constructor(init: {
    id: string;
    type: TypeDesc;
    value: unknown;
    uiHint?: any;
    rangeHint?: any;
  }) {
    this.id = init.id;
    this.type = init.type;
    this.value = init.value;
    this.uiHint = init.uiHint;
    this.rangeHint = init.rangeHint;

    // Make this instance observable - all property mutations are tracked
    makeAutoObservable(this);
  }
}

// 2. Simplified DefaultSourceStore
class DefaultSourceStore {
  sources: Map<string, DefaultSource> = new Map();
  valueRevision = 0;

  constructor() {
    makeObservable(this, {
      sources: observable.shallow,
      valueRevision: observable,
      ensureDefaultSource: action,
      setDefaultValue: action,
    });
  }

  ensureDefaultSource(id: string, spec: any): DefaultSource {
    const existing = this.sources.get(id);
    if (existing !== undefined) return existing;

    const created = new DefaultSource({
      id,
      type: spec.type,
      value: spec.value,
    });
    this.sources.set(id, created);
    return created;
  }

  setDefaultValue(id: string, value: unknown): void {
    const existing = this.sources.get(id);
    if (existing === undefined) return;
    existing.value = value;
    this.valueRevision++;
  }
}

// 3. Simplified RootStore & Other Stores
class RootStore {
  patchStore = {
    blocks: [],
    connections: [],
  };
  uiStore = {
    settings: { seed: 123 },
  };
  busStore = {
    buses: [],
    publishers: [],
    listeners: [],
  };
  defaultSourceStore = new DefaultSourceStore();
}

// 4. Simplified Service
const service = {
  compile: () => {
    console.log('[Service] Compile triggered!');
    return { ok: true, errors: [] };
  }
};

// 5. Setup AutoCompile (Logic from integration.ts)
function setupAutoCompile(store: RootStore, service: any) {
  let compileCount = 0;

  reaction(
    () => {
      console.log('[Reaction] Data expression running...');
      return {
        // blockCount: store.patchStore.blocks.length,
        // seed: store.uiStore.settings.seed,
        // Default sources - track value changes to trigger recompilation
        defaultSourceRevision: store.defaultSourceStore.valueRevision, 
      };
    },
    (data) => {
      console.log(`[Reaction] Effect triggered! Revision: ${data.defaultSourceRevision}`);
      compileCount++;
      service.compile();
    },
    { fireImmediately: false }
  );
  
  return () => {};
}

import { test } from 'vitest';

// --- Test ---

test('MobX Reproduction', async () => {
  console.log('--- Starting Reproduction Test ---');
  const store = new RootStore();
  const dsId = 'ds-1';
  
  // 1. Create a default source
  console.log('1. Creating Default Source...');
  store.defaultSourceStore.ensureDefaultSource(dsId, {
    type: { world: 'signal', domain: 'number' },
    value: 10
  });

  // 2. Setup Reaction
  console.log('2. Setting up AutoCompile...');
  setupAutoCompile(store, service);

  // 3. Change Value
  console.log('3. Changing Value to 20...');
  store.defaultSourceStore.setDefaultValue(dsId, 20);

  // 4. Change Value Again
  console.log('4. Changing Value to 30...');
  store.defaultSourceStore.setDefaultValue(dsId, 30);
  
  console.log('--- Test Complete ---');
});
