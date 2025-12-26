# Oscilla Animator Runtime Architecture Facts

This document captures the factual answers to 8 critical questions about the Oscilla runtime architecture. These facts are required to design a debugger/trace engine that works with the actual internals.

---

## 1. How Are Programs Represented at Runtime?

### The Types

```typescript
// src/editor/compiler/types.ts:122-125
export interface Program<T> {
  signal: (tMs: number, rt: RuntimeCtx) => T;
  event: (ev: KernelEvent) => KernelEvent[];
}
```

A `Program<RenderTree>` is the compiled output. The `signal` function is invoked once per frame to produce a `RenderTree` (a tree of `DrawNode` objects).

### Evaluation Model

**Closure-based, not dispatch-table.** Each block's compiler produces closures that capture their upstream dependencies. These closures are composed during compilation into a single `signal` function.

Example block output (from `RenderInstances2D.ts`):

```typescript
compile({ params, inputs }) {
  // Capture inputs at compile time
  const domain = domainArtifact.value;
  const positionField = positionsArtifact.value;
  const radiusSignal = ...;

  // Return a closure that evaluates at runtime
  const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
    // Sample signals at current time
    const broadcastRadius = radiusSignal(tMs, ctx);
    // Materialize fields
    const positions = positionField(seed, n, DEFAULT_CTX);
    // Build render tree
    return { kind: 'group', id: 'instances', children: circles };
  };

  return { render: { kind: 'RenderTree', value: renderFn } };
}
```

### Block Output Storage

Outputs are stored in a `Map<string, Artifact>` during compilation:

```typescript
// compileBusAware.ts:576
compiledPortMap.set(keyOf(blockId, outDef.name), produced);

// where keyOf = `${blockId}:${port}`
```

### Instrumentation Implications

- **Not centralized dispatch** - Cannot inject probes at a central evaluation point
- **Closures are composed at compile time** - Instrumentation requires compiler modifications
- **Output map is string-keyed** - Can intercept by port reference key

---

## 2. Where Do Bus Values Live at Runtime?

### Compile-Time Resolution

**Bus values are resolved during compilation, not at runtime.** The compiler:

1. Topologically sorts blocks including bus dependencies
2. Evaluates publishers in sortKey order
3. Combines artifacts per combine mode
4. Injects the combined value into listener blocks' inputs

```typescript
// compileBusAware.ts:697-751
function getBusValue(
  busId: string,
  buses: Bus[],
  publishers: Publisher[],
  compiledPortMap: Map<string, Artifact>,  // <-- compile-time map
  errors: CompileError[],
  applyPublisherStack?: ...
): Artifact {
  // Get sorted publishers
  const sortedPublishers = getSortedPublishers(busId, publishers, false);

  // Collect artifacts from compiledPortMap (not runtime values!)
  const artifacts: Artifact[] = [];
  for (const pub of sortedPublishers) {
    const key = keyOf(pub.from.blockId, pub.from.slotId);
    const artifact = compiledPortMap.get(key);
    artifacts.push(artifact);
  }

  // Combine artifacts (produces a Signal or Field)
  return combineSignalArtifacts(artifacts, bus.combineMode, bus.defaultValue);
}
```

### Runtime Behavior

The combined Signal/Field closure is injected into listener blocks at compile time. At runtime:

1. The Player calls `program.signal(tMs, ctx)`
2. This evaluates the top-level RenderTree closure
3. Which internally samples any captured bus signals
4. No explicit bus evaluation step at runtime

### Instrumentation Implications

- **No runtime bus map to intercept** - Bus combination happens at compile time
- **Instrumentation must wrap the produced closures** - e.g., wrap Signal functions
- **Can intercept at adapter/lens application** - These transform closures

---

## 3. What Is the Field Representation?

### The Type

```typescript
// src/core/types.ts:209
export type Field<A> = (seed: Seed, n: number, ctx: CompileCtx) => readonly A[];

// Also in compiler/types.ts:154
export type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[];
```

A Field is a **bulk function** that produces N values for N elements.

### Field Evaluation

Fields are evaluated **lazily at render sinks**, not during compilation:

```typescript
// RenderInstances2D.ts:98-117
const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
  const n = domain.elements.length;
  const seed = 0;

  // THIS IS WHERE FIELD MATERIALIZATION HAPPENS
  const positions = positionField(seed, n, DEFAULT_CTX);
  const colors = colorField(seed, n, DEFAULT_CTX);

  // Radius: field or signal
  let radii: readonly number[];
  if (radiusMode === 'field') {
    radii = radiusField(seed, n, DEFAULT_CTX);  // <-- Materialization
  } else if (radiusMode === 'signal') {
    const broadcastRadius = radiusSignal(tMs, ctx);
    radii = new Array(n).fill(broadcastRadius);
  }

  // Build circles from materialized data...
};
```

### Field Combination

Fields can be combined on Field buses:

```typescript
// busSemantics.ts:232-244
if (mode === 'sum') {
  const combined: Field<number> = (seed, n, ctx) => {
    const allValues = fields.map(f => f(seed, n, ctx));  // Evaluate all fields
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const vals of allValues) {
        sum += vals[i] ?? 0;
      }
      result.push(sum);
    }
    return result;
  };
  return { kind: 'Field:number', value: combined };
}
```

### Instrumentation Implications

- **Field evaluation is in render sinks** - `RenderInstances2D` is the primary sink
- **Can wrap Field functions** - Intercept the `(seed, n, ctx) => T[]` call
- **Materialization is identifiable** - Happens when field function is invoked

---

## 4. How Are Adapters and Lenses Applied?

### Adapter Application

Adapters are applied inline during bus resolution:

```typescript
// compileBusAware.ts:776-798
function applyAdapterChain(
  artifact: Artifact,
  chain: AdapterStep[] | undefined,
  ctx: CompileCtx,
  errors: CompileError[]
): Artifact {
  if (!chain || chain.length === 0) return artifact;
  let current = artifact;

  for (const step of chain) {
    const next = applyAdapterStep(current, step, ctx);
    if (next.kind === 'Error') {
      errors.push({ code: 'AdapterError', message: next.message });
      return next;
    }
    current = next;
  }
  return current;
}
```

Each adapter step transforms an Artifact into a new Artifact (e.g., `ConstToSignal`, `BroadcastScalarToField`).

### Lens Application

Lenses are more complex - they can have parameters that themselves come from buses:

```typescript
// compileBusAware.ts:913-978
function applyLensStack(
  artifact: Artifact,
  lensStack: LensInstance[] | undefined,
  ctx: CompileCtx,
  defaultSources: Map<string, DefaultSourceState>,
  buses: Bus[],
  publishers: Publisher[],
  compiledPortMap: Map<string, Artifact>,
  errors: CompileError[],
  depth: number = 0
): Artifact {
  if (!lensStack || lensStack.length === 0) return artifact;
  let current = artifact;

  for (const lens of lensStack) {
    if (lens.enabled === false) continue;
    const def = getLens(lens.lensId);
    if (!def) continue;

    // Resolve lens parameters (may require bus/wire lookups)
    const params: Record<string, Artifact> = {};
    for (const [paramKey, binding] of Object.entries(lens.params)) {
      params[paramKey] = resolveLensParam(binding, { resolveBus, resolveWire, ... });
    }

    // Apply lens transformation
    if (def.apply) {
      current = def.apply(current, params);
    }
  }
  return current;
}
```

### Lens Definition Example

```typescript
// LensRegistry.ts:148-175
registerLens({
  id: 'scale',
  label: 'Gain',
  domain: 'number',
  allowedScopes: ['publisher', 'listener'],
  params: {
    scale: { type: SCALAR_NUM, default: 1, uiHint: { kind: 'number', step: 0.1 } },
    offset: { type: SCALAR_NUM, default: 0, uiHint: { kind: 'number', step: 0.1 } },
  },
  apply: (artifact, params) =>
    mapNumberArtifact(artifact, (value, t, ctx) => {
      const scale = resolveNumberParam(params.scale, t ?? 0, ctx ?? DEFAULT_RUNTIME_CTX);
      const offset = resolveNumberParam(params.offset, t ?? 0, ctx ?? DEFAULT_RUNTIME_CTX);
      return value * scale + offset;
    }),
});
```

### Instrumentation Implications

- **Adapters/lenses are applied at compile time** - They wrap closures
- **Can intercept before/after each step** - Wrap `applyAdapterStep` and `def.apply`
- **Lens parameters can be dynamic** - May need to trace their resolution too

---

## 5. Where Does RenderTree Get Built?

### RenderTree Type

```typescript
// renderTree.ts:159
export type RenderTree = DrawNode;

export type DrawNode = GroupNode | ShapeNode | EffectNode;

export interface GroupNode {
  kind: 'group';
  id: string;
  children: readonly DrawNode[];
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}

export interface ShapeNode {
  kind: 'shape';
  id: string;
  geom: Geometry;
  style?: Style;
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}

export interface EffectNode {
  kind: 'effect';
  id: string;
  effect: Effect;
  child: DrawNode;
  tags?: readonly string[];
  meta?: Record<string, unknown>;
}
```

### RenderTree Construction Path

1. **Compilation produces a RenderTree closure:**
   ```typescript
   { kind: 'RenderTree', value: (tMs, ctx) => DrawNode }
   ```

2. **Player invokes the closure each frame:**
   ```typescript
   // player.ts:352-353
   const tree = this.program.signal(this.tMs, this.runtimeCtx);
   this.onFrame(tree, this.tMs);
   ```

3. **`RenderInstances2D` builds nodes from materialized Fields:**
   ```typescript
   // RenderInstances2D.ts:119-141
   const circles: DrawNode[] = [];
   for (let i = 0; i < n; i++) {
     circles.push({
       kind: 'shape',
       id: `circle-${domain.elements[i]}`,
       geom: { kind: 'circle', cx: pos.x, cy: pos.y, r },
       style: { fill: color, opacity },
     });
   }
   ```

### Instrumentation Implications

- **Field materialization in render sinks** - This is where "why did this render?" answers come from
- **Can wrap the render function** - Intercept `program.signal` output
- **Node IDs are stable** - `circle-${domain.elements[i]}` enables tracking

---

## 6. Is There a Runtime Cache?

### Compile-Time Geometry Cache

```typescript
// context.ts:17-31
export class SimpleGeometryCache implements GeometryCache {
  private cache = new Map<string, unknown>();
  private objectCache = new WeakMap<object, unknown>();

  get<K extends object, V>(key: K, compute: () => V): V {
    if (this.objectCache.has(key)) {
      return this.objectCache.get(key) as V;
    }
    const value = compute();
    this.objectCache.set(key, value);
    return value;
  }
}
```

### Usage Pattern

The cache is available in `CompileCtx.geom` but is **not currently used** extensively:

```typescript
// RenderInstances2D.ts:23-29 - Each sink has its own default ctx
const DEFAULT_CTX = {
  env: {},
  geom: {
    get<K extends object, V>(_key: K, compute: () => V): V {
      return compute();  // <-- No caching, just compute!
    },
    invalidate() {},
  },
};
```

### Runtime Signal/Field Evaluation

**No memoization.** Signals are re-evaluated every frame:

```typescript
// player.ts:349-358
private renderOnce(): void {
  if (!this.program) return;
  const tree = this.program.signal(this.tMs, this.runtimeCtx);  // Fresh eval
  this.onFrame(tree, this.tMs);
}
```

### Instrumentation Implications

- **No cache hit/miss to track** - Every evaluation is fresh
- **Could add caching as part of instrumentation** - Memoize signal results keyed by t
- **Frame-level caching could help debugging** - Same t should produce same output

---

## 7. How Often Do You Recompile?

### Compilation Triggers

Auto-compilation is debounced and triggered by MobX reactions:

```typescript
// integration.ts:936-981
export function setupAutoCompile(
  store: RootStore,
  service: CompilerService,
  options: AutoCompileOptions = {}
): () => void {
  const { debounce = 300, onCompile } = options;

  const dispose = reaction(
    () => ({
      blockCount: store.patchStore.blocks.length,
      blocks: store.patchStore.blocks.map(b => ({ id, type, params: JSON.stringify(b.params) })),
      connectionCount: store.patchStore.connections.length,
      connections: store.patchStore.connections.map(c => ...),
      seed: store.uiStore.settings.seed,
    }),
    () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const result = service.compile();
        onCompile?.(result);
      }, debounce);  // 300ms default
    }
  );
}
```

### Compilation Events

```typescript
// integration.ts:662-668
store.events.emit({
  type: 'CompileStarted',
  compileId,
  patchId,
  patchRevision,
  trigger: 'graphCommitted',
});

// On completion:
store.events.emit({
  type: 'CompileFinished',
  compileId, patchId, patchRevision,
  status: 'ok' | 'failed',
  durationMs,
  diagnostics,
  programMeta,
});
```

### Program Swap

```typescript
// player.ts:196-212
setActivePatchRevision(revision: number): void {
  const previousRevision = this.activePatchRevision;
  this.activePatchRevision = revision;

  if (this.events && revision !== previousRevision) {
    this.events.emit({
      type: 'ProgramSwapped',
      patchId: 'default',
      patchRevision: revision,
      compileId: randomUUID(),
      swapMode: previousRevision === 0 ? 'hard' : 'soft',
      swapLatencyMs: 0,
      stateBridgeUsed: false,
    });
  }
}
```

### Instrumentation Implications

- **Debounced at 300ms** - Not every keystroke, but roughly interactive
- **Events already exist** - `CompileStarted`, `CompileFinished`, `ProgramSwapped`
- **patchRevision is tracked** - Can correlate traces to specific program versions

---

## 8. Do Blocks Have Stable Output Indices?

### Name-Based, Not Index-Based

Outputs are identified by **string keys**, not numeric indices:

```typescript
// compileBusAware.ts:576
compiledPortMap.set(keyOf(blockId, outDef.name), produced);

// keyOf = `${blockId}:${port}`
// Example: "block-123:phase" or "cycle-root:wrap"
```

### Port Definitions

```typescript
// Block compiler outputs are declared by name:
outputs: [
  { name: 'phase', type: { kind: 'Signal:phase' } },
  { name: 'wrap', type: { kind: 'Event' } },
  { name: 'energy', type: { kind: 'Signal:number' } },
]
```

### Indexing Pattern

```typescript
// To look up a specific output:
const artifact = compiledPortMap.get(`${blockId}:${portName}`);

// Publishers/listeners use slotId:
publisher.from = { blockId, slotId: 'phase', direction: 'output' }
listener.to = { blockId, slotId: 'radius', direction: 'input' }
```

### Instrumentation Implications

- **String keys, not array indices** - Can't use `blockOutputs[blockId][i]`
- **Predictable key format** - `${blockId}:${portName}` is stable
- **Could intern to indices for speed** - Build a `Map<string, number>` at compile time

---

## Summary: What's Hookable

| Area | Hookable? | How |
|------|-----------|-----|
| Block evaluation | Yes | Wrap output closures during compilation |
| Bus combination | Yes | Wrap `combineSignalArtifacts` / `combineFieldArtifacts` |
| Adapter/Lens | Yes | Wrap `applyAdapterStep` / `def.apply` |
| Field materialization | Yes | Wrap Field function calls in render sinks |
| RenderTree output | Yes | Wrap `program.signal` at Player level |
| Compile events | Already exists | `CompileStarted`, `CompileFinished`, `ProgramSwapped` |
| Runtime health | Already exists | `RuntimeHealthSnapshot` from Player |

## What's NOT Currently Hookable

1. **Per-signal sample caching** - Signals are re-evaluated every call
2. **Causal tracing** - No "why did this value change?" tracking
3. **Field-level provenance** - No tracking of which Field produced which element
4. **Intermediate signal values** - Only final RenderTree is captured

## Recommended Instrumentation Points

For a debug engine:

1. **Compiler instrumentation** - Wrap artifact closures with tracing
2. **Bus evaluation hooks** - Emit events in `getBusValue` and combine functions
3. **Render sink wrapping** - Track field materializations in `RenderInstances2D`
4. **Player frame hook** - Already has `onFrame` callback for post-render inspection
5. **Build time index** - Map `blockId:port` → numeric index for trace efficiency
