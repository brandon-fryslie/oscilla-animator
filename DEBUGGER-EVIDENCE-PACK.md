# Debugger Evidence Pack: Actual Implementation Details

This document provides the actual code snippets and implementation details required to design a power-user debugger for Oscilla Animator. No hand-waving.

---

## 1. Program Representation + Concrete Compiled Program

### The Program<T> Type

```typescript
// src/editor/compiler/types.ts:122-125
export interface Program<T> {
  signal: (tMs: number, rt: RuntimeCtx) => T;
  event: (ev: KernelEvent) => KernelEvent[];
}
```

### How Programs Are Constructed

Programs are NOT built from a central dispatcher. They are built by **composing closures at compile time**.

**The Program creation site (compileBusAware.ts:611-618):**

```typescript
if (outArt.kind === 'RenderTree') {
  // Wrap RenderTree function into a Program structure
  const renderFn = outArt.value as (tMs: number, ctx: RuntimeCtx) => DrawNode;
  const program: Program<RenderTree> = {
    signal: renderFn,
    event: () => [],
  };
  return { ok: true, program, timeModel, errors: [], compiledPortMap };
}
```

The `renderFn` is itself a closure produced by `RenderInstances2D` (the render sink), which captures:
- Domain artifact (element identities)
- Field closures for positions, colors, radii
- Signal closures for animated values

###

**Oscillator composes upstream closures (Oscillator.ts:36-69):**

```typescript
compile({ inputs, params }) {
  const phaseSignal = phaseArtifact.value as Signal<number>;  // upstream closure
  const shapeFn = SHAPES[shape] ?? SHAPES.sine;

  // Output signal captures upstream signal + shape function
  const signal: Signal<number> = (t: number, ctx: RuntimeCtx): number => {
    const phase = phaseSignal(t, ctx);  // <-- calls upstream closure
    return shapeFn(phase) * amplitudeSignal(t, ctx) + biasSignal(t, ctx);
  };

  return { out: { kind: 'Signal:number', value: signal } };
}
```

### Architecture Verdict

**Closure-based, NOT centralized dispatch.**

Each block's `compile()` returns closures. These closures capture:
1. Params (from block instance)
2. Upstream closures (from `inputs` map)
3. Local computation logic

The final `program.signal` is one big nested closure tree.

**Instrumentation implication:** Must wrap closures at compile time; cannot intercept via dispatch table.

---

## 2. Runtime Storage of "Things You Can Inspect"

### Answer: **None. We recompute and discard.**

There is no runtime container for:
- Latest bus values
- Latest block outputs
- Cached field materializations

**Player has no value storage (player.ts:349-358):**

```typescript
private renderOnce(): void {
  if (this.program === null || this.program === undefined) return;

  const tree = this.program.signal(this.tMs, this.runtimeCtx);  // Fresh eval every frame

  // Basic health check for NaN/Infinity
  this.checkRenderHealth(tree);

  this.onFrame(tree, this.tMs);  // Passed to callback, then forgotten
}
```

**Player stores only:**
- `tMs` (current time)
- `program` (the compiled closure tree)
- `runtimeCtx` (viewport dimensions)
- Health metrics (frameTimes, nanCount, infCount)

**No compiledPortMap at runtime.** The `compiledPortMap` exists only during compilation:

```typescript
// compileBusAware.ts:576 - during compilation only
compiledPortMap.set(keyOf(blockId, outDef.name), produced);

// The map is returned with CompileResult but NOT used at runtime
return { ok: true, program, timeModel, errors: [], compiledPortMap };
```

**RuntimeCtx is minimal:**

```typescript
// types.ts:30-33
export interface RuntimeCtx {
  viewport: { w: number; h: number; dpr: number };
  reducedMotion?: boolean;
}
```

**Implication for debugger:** Every UI query triggers recomputation. To inspect values without recomputing, the debugger must:
1. Inject memoization wrappers during compilation
2. Or snapshot the closure outputs per frame into a trace buffer

---

## 3. Field Type and Materialization Site

### The Field Type

```typescript
// src/editor/compiler/types.ts:154
export type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[];
```

A Field is a **bulk function** returning N values for N elements.

### Concrete Field Creation (PositionMapGrid.ts:43-71)

```typescript
compile({ params, inputs }) {
  const domain = domainArtifact.value;
  const cols = Number(params.cols ?? 10);
  const spacing = Number(params.spacing ?? 20);
  const originX = Number(params.originX ?? 100);
  const originY = Number(params.originY ?? 100);

  // Field is a closure over domain + params
  const positionField: PositionField = (_seed, n) => {
    const elementCount = Math.min(n, domain.elements.length);
    const out = new Array<Vec2>(elementCount);  // <-- plain Array, not typed

    for (let i = 0; i < elementCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      out[i] = {
        x: originX + col * spacing,
        y: originY + row * spacing,
      };
    }
    return out;
  };

  return { pos: { kind: 'Field:vec2', value: positionField } };
}
```

### Materialization Site (RenderInstances2D.ts:98-117)

**This is where Field closures are invoked:**

```typescript
const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
  const n = domain.elements.length;
  const seed = 0;

  // ===== FIELD MATERIALIZATION HAPPENS HERE =====
  const positions = positionField(seed, n, DEFAULT_CTX);   // Field invoked
  const colors = colorField(seed, n, DEFAULT_CTX);         // Field invoked

  let radii: readonly number[];
  if (radiusMode === 'field' && isDefined(radiusField)) {
    radii = radiusField(seed, n, DEFAULT_CTX);             // Field invoked
  } else if (radiusMode === 'signal' && isDefined(radiusSignal)) {
    const broadcastRadius = radiusSignal(tMs, ctx);        // Signal sampled
    radii = new Array(n).fill(broadcastRadius);
  } else {
    radii = new Array(n).fill(5);
  }

  // Build shapes from materialized arrays
  const circles: DrawNode[] = [];
  for (let i = 0; i < n; i++) {
    circles.push({
      kind: 'shape',
      id: `circle-${domain.elements[i]}`,
      geom: { kind: 'circle', cx: positions[i].x, cy: positions[i].y, r: radii[i] },
      style: { fill: colors[i], opacity },
    });
  }
  // ...
};
```

### Array Type

**Plain arrays, not typed arrays:**
```typescript
const out = new Array<Vec2>(elementCount);
```

**Implication for debugger:**
- Materialization probes go in `RenderInstances2D.renderFn`
- Can wrap `positionField(seed, n, ctx)` calls to measure timing + capture values
- No typed array pooling to track

---

## 4. Bus Evaluation Timing: Compile-Time vs Runtime

### Answer: **Compile-time combination, runtime evaluation.**

Bus values are **combined at compile time** into a single closure. That closure is **evaluated at runtime** when sampled.

### The Bus Combine Function (compileBusAware.ts:697-751)

```typescript
function getBusValue(
  busId: string,
  buses: Bus[],
  publishers: Publisher[],
  compiledPortMap: Map<string, Artifact>,  // <-- compile-time artifact map
  errors: CompileError[],
  applyPublisherStack?: (artifact: Artifact, publisher: Publisher) => Artifact
): Artifact {
  const bus = buses.find(b => b.id === busId);
  if (bus === undefined) {
    return { kind: 'Error', message: `Bus ${busId} not found` };
  }

  // Get enabled publishers, sorted by sortKey
  const sortedPublishers = getSortedPublishers(busId, publishers, false);

  // Collect artifacts (closures) from publishers
  const artifacts: Artifact[] = [];
  for (const pub of sortedPublishers) {
    const key = keyOf(pub.from.blockId, pub.from.slotId);
    const artifact = compiledPortMap.get(key);  // <-- lookup at compile time

    const shaped = applyPublisherStack ? applyPublisherStack(artifact, pub) : artifact;
    artifacts.push(shaped);
  }

  // Combine artifacts into ONE artifact (closure)
  if (isFieldBus(bus)) {
    return combineFieldArtifacts(artifacts, bus.combineMode, bus.defaultValue);
  } else {
    return combineSignalArtifacts(artifacts, bus.combineMode, bus.defaultValue);
  }
}
```

### Signal Combine (busSemantics.ts:103-119)

```typescript
if (mode === 'sum') {
  const signals = artifacts.map(a => (a as { value: Signal }).value);
  return {
    kind: 'Signal:number',
    value: (t: number, ctx: RuntimeCtx) => {  // <-- combined closure
      let sum = 0;
      for (const sig of signals) {
        sum += sig(t, ctx);  // Each publisher's signal evaluated at runtime
      }
      return sum;
    },
  };
}
```

### Listener Binding Resolution (compileBusAware.ts:487-513)

```typescript
if (busListener !== null && busListener !== undefined) {
  // Input comes from a bus - get the bus value AT COMPILE TIME
  const busArtifact = getBusValue(busListener.busId, ...);

  // Apply adapters and lenses AT COMPILE TIME
  const adapted = applyAdapterChain(busArtifact, busListener.adapterChain, ctx, errors);
  const lensed = applyLensStack(adapted, busListener.lensStack, ...);

  // Store the resulting closure for this input
  inputs[p.name] = lensed;  // <-- wired at compile time
}
```

### Verdict

| Phase | What Happens |
|-------|--------------|
| Compile | Publishers sorted, artifacts collected, combined into one closure |
| Runtime | Combined closure sampled each frame; internally samples each publisher |

**Probe placement:**
- "Publisher eval" → wrap each publisher's artifact.value call inside the combined closure
- "Combine step" → wrap the combineSignalArtifacts return value
- "Listener binding" → probe is in the input resolution

---

## 5. Adapter vs Lens Execution Points

### AdapterStep Definition

```typescript
// Used throughout, e.g., in Publisher.adapterChain
interface AdapterStep {
  adapterId: string;  // e.g., 'ConstToSignal', 'BroadcastSignalToField'
  params?: Record<string, unknown>;
}
```

### Adapter Application (compileBusAware.ts:776-798)

```typescript
function applyAdapterChain(
  artifact: Artifact,
  chain: AdapterStep[] | undefined,
  ctx: CompileCtx,
  errors: CompileError[]
): Artifact {
  if (chain === null || chain === undefined || chain.length === 0) return artifact;
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

### Adapter Step Implementation (compileBusAware.ts:800-911)

```typescript
function applyAdapterStep(artifact: Artifact, step: AdapterStep, ctx: CompileCtx): Artifact {
  const [adapterName] = step.adapterId.split(':');

  switch (adapterName) {
    case 'ConstToSignal': {
      if (artifact.kind === 'Scalar:number') {
        return { kind: 'Signal:number', value: () => artifact.value };  // wrap constant
      }
      // ...
    }
    case 'BroadcastSignalToField': {
      if (artifact.kind === 'Signal:number') {
        return {
          kind: 'Field:number',
          value: (_seed, n, compileCtx) => {
            const time = (compileCtx.env as { t?: number }).t ?? 0;
            const v = artifact.value(time, { viewport: { w: 0, h: 0, dpr: 1 } });
            return Array.from({ length: n }, () => v);  // broadcast
          },
        };
      }
      // ...
    }
    case 'PhaseToNumber': {
      if (artifact.kind === 'Signal:phase') {
        return { kind: 'Signal:number', value: artifact.value };  // reinterpret
      }
      // ...
    }
    // ... more adapters
  }
}
```

### Lens Application (compileBusAware.ts:913-978)

```typescript
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
  if (lensStack === null || lensStack === undefined || lensStack.length === 0) return artifact;
  let current = artifact;

  for (const lens of lensStack) {
    if (lens.enabled === false) continue;
    const def = getLens(lens.lensId);
    if (def === null || def === undefined) continue;

    // Resolve lens parameters (may involve bus lookups!)
    const params: Record<string, Artifact> = {};
    for (const [paramKey, binding] of Object.entries(lens.params)) {
      params[paramKey] = resolveLensParam(binding, {
        resolveBus: (busId) => getBusValue(busId, buses, publishers, compiledPortMap, errors),
        resolveWire: (blockId, slotId) => compiledPortMap.get(keyOf(blockId, slotId)),
        // ...
      });
    }

    // Apply lens transformation
    if (def.apply !== null && def.apply !== undefined) {
      current = def.apply(current, params);  // <-- THE LENS CALL SITE
    }
  }
  return current;
}
```

### Lens Definition Example (LensRegistry.ts:148-175)

```typescript
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
      return value * scale + offset;  // Transform happens inside wrapped closure
    }),
});
```

### Call Sites Summary

| Operation | Call Site | Publisher? | Listener? |
|-----------|-----------|------------|-----------|
| `applyAdapterChain` | compileBusAware.ts:502 | Via `applyPublisherStack` | Yes |
| `applyLensStack` | compileBusAware.ts:503-512 | Via `applyPublisherStack` | Yes |
| `applyPublisherStack` | compileBusAware.ts:753-774 | Yes | (Called by listener path) |
| `def.apply` (lens) | compileBusAware.ts:972-973 | Yes | Yes |

**Publisher path:** `getBusValue` → `applyPublisherStack` → `applyAdapterChain` → `applyLensStack`
**Listener path:** `getBusValue` → `applyAdapterChain` → `applyLensStack`

---

## 6. RenderTree Build Path

### RenderTree Types (renderTree.ts + types.ts:139-144)

```typescript
export type DrawNode =
  | { kind: 'group'; id: NodeId; children: readonly DrawNode[]; tags?: readonly string[] }
  | { kind: 'shape'; id: NodeId; geom: Geometry; style?: Style; tags?: readonly string[] }
  | { kind: 'effect'; id: NodeId; effect: Effect; child: DrawNode; tags?: readonly string[] };

export type RenderTree = DrawNode;

// Geometry variants
type Geometry =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number }
  | { kind: 'svgPath'; d: string };

// Effect variants
type Effect =
  | { kind: 'opacityMul'; mul: number }
  | { kind: 'transform2d'; transform: Transform2D }
  | { kind: 'transform3d'; transform: Transform3D }
  | { kind: 'filter'; filter: string };
```

### RenderInstances2D Compiler (RenderInstances2D.ts:98-169)

```typescript
const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
  const n = domain.elements.length;
  const seed = 0;

  // === FIELD MATERIALIZATION ===
  const positions = positionField(seed, n, DEFAULT_CTX);
  const colors = colorField(seed, n, DEFAULT_CTX);

  // === BUILD SHAPE NODES ===
  const circles: DrawNode[] = [];
  for (let i = 0; i < n; i++) {
    const pos = positions[i];
    const r = radii[i] ?? 5;
    const color = colors[i] ?? '#ffffff';

    if (isDefined(pos)) {
      circles.push({
        kind: 'shape',
        id: `circle-${domain.elements[i]}`,  // Stable ID from domain
        geom: { kind: 'circle', cx: pos.x, cy: pos.y, r },
        style: { fill: color as string, opacity },
      });
    }
  }

  // === BUILD GROUP NODE ===
  const children: DrawNode = {
    kind: 'group',
    id: 'instances',
    children: circles,
  };

  // === OPTIONAL EFFECT WRAPPER ===
  if (glow) {
    return {
      kind: 'effect',
      id: 'glow-wrapper',
      effect: { kind: 'filter', filter: `drop-shadow(0 0 ${10 * glowIntensity}px currentColor)` },
      child: children,
    };
  }

  return children;
};

return { render: { kind: 'RenderTree', value: renderFn } };
```

### SVG Renderer (svgRenderer.ts:38-55)

```typescript
export class SvgRenderer {
  private readonly svg: SVGSVGElement;
  private nodeMap = new Map<string, SVGElement>();  // id → DOM element
  private usedIds = new Set<string>();

  render(tree: RenderTree): void {
    this.usedIds.clear();
    // Reconcile tree against DOM using nodeMap
    this.renderNode(root, tree, rootCtx);
    this.cleanup();  // Remove orphaned nodes
  }
}
```

### Flow Summary

```
program.signal(tMs, ctx)
  → RenderInstances2D.renderFn(tMs, ctx)
    → positionField(seed, n, ctx)     [FIELD MATERIALIZATION]
    → colorField(seed, n, ctx)        [FIELD MATERIALIZATION]
    → radiusField/radiusSignal        [FIELD/SIGNAL]
    → for loop: build DrawNode[]
    → return { kind: 'group', children }
  → SvgRenderer.render(tree)
    → reconcile against DOM
```

---

## 7. Cache Strategy

### Answer: **No caching at runtime. Everything recomputes.**

**Geometry cache exists but is not used effectively:**

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

**But render sinks use a NO-OP default:**

```typescript
// RenderInstances2D.ts:21-29
const DEFAULT_CTX = {
  env: {},
  geom: {
    get<K extends object, V>(_key: K, compute: () => V): V {
      return compute();  // <-- ALWAYS RECOMPUTES, NEVER CACHES
    },
    invalidate() {},
  },
};
```

**No frame-to-frame memoization:**
- Signals recompute every frame
- Fields rematerialize every frame
- No "last value" cache anywhere

**No typed buffer pooling:**
- Arrays are created fresh: `new Array<Vec2>(elementCount)`
- No reuse between frames

**Implication for debugger:**
- Without cache visibility, performance traces show phantom bottlenecks
- Debugger should inject memoization to distinguish:
  - "This value actually changed"
  - "This value was the same but we recomputed anyway"

---

## 8. Output Indexing Scheme

### Answer: **String-keyed throughout. No compile-time indexing.**

**Port outputs use string keys:**

```typescript
// compileBusAware.ts:576
compiledPortMap.set(keyOf(blockId, outDef.name), produced);

// where keyOf = (blockId: string, port: string) => `${blockId}:${port}`
```

**Publisher/Listener references use strings:**

```typescript
interface Publisher {
  id: string;
  busId: string;
  from: {
    blockId: string;   // string
    slotId: string;    // string
    direction: 'output';
  };
  // ...
}
```

**Block outputs are returned as Record<string, Artifact>:**

```typescript
// TimeRoot.ts:108-115
return {
  systemTime: { kind: 'Signal:Time', value: systemTime },
  progress: { kind: 'Signal:number', value: progress },
  phase: { kind: 'Signal:phase', value: phase },
  end: { kind: 'Event', value: end },
  energy: { kind: 'Signal:number', value: energy },
};
// Keys are strings: 'systemTime', 'progress', 'phase', 'end', 'energy'
```

**No numeric indexing in compiled program.**

The structure in the compiled program is:
```typescript
// What exists:
compiledPortMap: Map<string, Artifact>  // "block-123:phase" → artifact

// What does NOT exist:
blockOutputs: Artifact[][]  // No numeric indexing
```

**Implication for power-user tracing:**

To achieve high-frequency sampling ("trace every block every frame"), the debugger should:
1. Build a compile-time index: `Map<string, number>` mapping `"blockId:port"` → index
2. Use `Float64Array` or similar for trace buffers
3. Convert back to strings only for UI display

---

## Summary: What Can Be Probed

| Target | Where to Probe | Compile-time? | Runtime? |
|--------|----------------|---------------|----------|
| Block output | Wrap artifact closure at `compiledPortMap.set` | Yes | Via closure |
| Bus combine | Wrap `combineSignalArtifacts` return | Yes | Via closure |
| Adapter step | Wrap `applyAdapterStep` return | Yes | Via closure |
| Lens step | Wrap `def.apply` return | Yes | Via closure |
| Field materialization | Wrap `positionField(seed, n, ctx)` in render sink | No | Yes |
| Signal sample | Wrap `signal(t, ctx)` anywhere | No | Yes |
| RenderTree output | Wrap `program.signal` at Player level | No | Yes |

## Architecture for Debug Engine

Given these facts:

1. **Probe injection:** Must happen at compile time by wrapping closures
2. **Trace storage:** Debugger must maintain its own `Map<string, TraceEntry[]>` since Player discards values
3. **Field tracking:** Insert probes in `RenderInstances2D.renderFn` to capture materialization events
4. **Index for speed:** Build `portKey → index` map at compile time, use typed arrays for trace buffers
5. **Causal graph:** Reconstruct from closure composition order captured during compilation
