import { makeObservable, observable, action, reaction } from 'mobx';
import { test } from 'vitest';

// --- Mocks & Simplified Classes ---

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

// 1. Plain Object (no makeAutoObservable)
interface DefaultSource extends DefaultSourceState {}

// 2. Simplified DefaultSourceStore with Deep Observable Map
class DefaultSourceStore {
  // Deep observable map by default if we use 'observable'
  sources = new Map<string, DefaultSource>();

  constructor() {
    makeObservable(this, {
      sources: observable, // Deep observation
      ensureDefaultSource: action,
      setDefaultValue: action,
    });
  }

  ensureDefaultSource(id: string, spec: any): DefaultSource {
    const existing = this.sources.get(id);
    if (existing !== undefined) return existing;

    const created: DefaultSource = {
      id,
      type: spec.type,
      value: spec.value,
    };
    this.sources.set(id, created);
    return created;
  }

  setDefaultValue(id: string, value: unknown): void {
    const existing = this.sources.get(id);
    if (existing === undefined) return;
    
    // IMPORTANT: With deep observable map, 'existing' is a proxy.
    // Modifying it triggers observers.
    existing.value = value;
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
      // Simulate how integration.ts tracks values
      return {
        defaultSourceValues: Array.from(store.defaultSourceStore.sources.values()).map(ds => 
          `${ds.id}:${JSON.stringify(ds.value)}`
        ),
      };
    },
    (data) => {
      console.log(`[Reaction] Effect triggered! Values: ${data.defaultSourceValues}`);
      compileCount++;
      service.compile();
    },
    { fireImmediately: false }
  );
  
  return () => {};
}

// --- Test ---

test('MobX Reproduction - Deep Map', async () => {
  console.log('--- Starting Reproduction Test (Deep Map) ---');
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