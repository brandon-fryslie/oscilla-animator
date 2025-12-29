# Technical Investigation: MobX Reactivity for Default Source Values

**Date**: 2025-12-28
**Status**: RESOLVED
**Issue**: Default source value changes in inspector do not trigger animation recompilation

---

## Resolution

Implemented **Approach E: Increment a Revision Counter**.

1.  Modified `src/editor/stores/DefaultSourceStore.ts`:
    *   Added `valueRevision` observable property (initialized to 0).
    *   Updated `setDefaultValue` and `setDefaultValueForInput` to increment `valueRevision` on every change.
2.  Modified `src/editor/compiler/integration.ts`:
    *   Updated `setupAutoCompile` reaction to track `store.defaultSourceStore.valueRevision` instead of mapping values.

This ensures that any change to a default source value (which updates the revision) reliably triggers the auto-compile reaction, bypassing potential issues with deep observability of Map values or `JSON.stringify` dependencies.

---

## Goal

When the user changes a default source value (e.g., a slider in the inspector panel), the animation should recompile and update immediately. Currently, the value changes in memory, but the animation does not update until some other change triggers recompilation (like adding/removing a connection).

---

## Architecture Overview

### Relevant Files

| File | Purpose |
|------|---------|
| `src/editor/stores/DefaultSourceStore.ts` | Stores default source values in a MobX observable Map |
| `src/editor/compiler/integration.ts` | Contains `setupAutoCompile()` which uses MobX `reaction()` to trigger recompilation |
| `src/editor/Inspector.tsx` | UI component that calls `setDefaultValueForInput()` on slider/input changes |
| `src/editor/runtime/player.ts` | Consumes compiled programs and renders animations |

### Data Flow

```
Inspector UI
    ↓
store.defaultSourceStore.setDefaultValueForInput(blockId, slotId, value)
    ↓
DefaultSourceStore.sources Map (MobX observable)
    ↓
(SHOULD TRIGGER) setupAutoCompile MobX reaction
    ↓
service.compile()
    ↓
player.setIRProgram(newProgram)
    ↓
Animation updates
```

---

## What Was Attempted

### Attempt 1: Add defaultSourceValues to setupAutoCompile Reaction

**File**: `src/editor/compiler/integration.ts:1094-1111`

Added tracking for default source values in the reaction's data expression:

```typescript
const dispose = reaction(
  () => ({
    blockCount: store.patchStore.blocks.length,
    blocks: store.patchStore.blocks.map((b: Block) => ({ id: b.id, type: b.type, params: JSON.stringify(b.params) })),
    connectionCount: store.patchStore.connections.length,
    connections: store.patchStore.connections.map((c: Connection) => `${c.from.blockId}:${c.from.slotId}->${c.to.blockId}:${c.to.slotId}`),
    seed: store.uiStore.settings.seed,
    // NEW: Default sources - track value changes to trigger recompilation
    defaultSourceValues: Array.from(store.defaultSourceStore.sources.values()).map(ds =>
      `${ds.id}:${JSON.stringify(ds.value)}`
    ),
    // ... bus tracking
  }),
  () => { /* trigger compile */ }
);
```

**Result**: Did not trigger recompilation on value changes.

### Attempt 2: Create Observable DefaultSource Class

**File**: `src/editor/stores/DefaultSourceStore.ts:31-54`

Created a `DefaultSource` class that calls `makeAutoObservable(this)` in its constructor:

```typescript
export class DefaultSource implements DefaultSourceState {
  id: string;
  type: TypeDesc;
  value: unknown;
  uiHint?: UIControlHint;
  rangeHint?: DefaultSourceState['rangeHint'];

  constructor(init: { ... }) {
    this.id = init.id;
    this.type = init.type;
    this.value = init.value;
    this.uiHint = init.uiHint;
    this.rangeHint = init.rangeHint;

    // Make this instance observable - all property mutations are tracked
    makeAutoObservable(this);
  }
}
```

Updated all creation points to use `new DefaultSource(...)`:
- `ensureDefaultSource()` (line 115)
- `createDefaultSourcesForBlock()` (line 200)
- `load()` (line 236)

Changed Map annotation to `observable.shallow` (line 84):

```typescript
makeObservable(this, {
  sources: observable.shallow,  // Map add/delete tracked, entries are self-observable
  // ... actions
});
```

**Result**: Did not trigger recompilation on value changes.

### Attempt 3: Replace Map Entry on Value Change (Earlier attempt, BROKE UI)

**File**: `src/editor/stores/DefaultSourceStore.ts:130-134`

Tried replacing the entire Map entry instead of mutating the value:

```typescript
setDefaultValue(id: string, value: unknown): void {
  const existing = this.sources.get(id);
  if (existing === undefined) return;
  this.sources.set(id, { ...existing, value });  // Replace entry
}
```

**Result**: Broke UI - sliders became locked in place because they held references to the old objects.

---

## Current State of Code

### DefaultSourceStore.ts

```typescript
// Line 31-54: DefaultSource class with makeAutoObservable
export class DefaultSource implements DefaultSourceState {
  // ... properties
  constructor(init: { ... }) {
    // ... assign properties
    makeAutoObservable(this);
  }
}

// Line 68-93: Store with observable.shallow Map
export class DefaultSourceStore {
  sources: Map<string, DefaultSource> = new Map();

  constructor() {
    makeObservable(this, {
      sources: observable.shallow,
      // ... actions
    });
  }
}

// Line 158-162: Value mutation via direct property assignment
setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
  const ds = this.getDefaultSourceForInput(blockId, slotId);
  if (!ds) return;
  ds.value = value;  // Direct mutation on observable class instance
}
```

### integration.ts

```typescript
// Lines 1094-1111: setupAutoCompile reaction data expression
() => ({
  // ... other tracking
  defaultSourceValues: Array.from(store.defaultSourceStore.sources.values()).map(ds =>
    `${ds.id}:${JSON.stringify(ds.value)}`  // Accesses ds.value
  ),
  // ...
}),
```

---

## Hypotheses for Why It's Not Working

### Hypothesis 1: Reaction Data Expression Not Creating Dependencies

MobX reactions track which observables are accessed during the data expression execution. The issue might be:

- `Array.from(store.defaultSourceStore.sources.values())` creates a new array, which might not establish proper observable dependencies
- The `.map()` callback might not be tracking properly because it's a closure

**Test**: Add a `console.log` inside the data expression to verify it runs on value change.

### Hypothesis 2: observable.shallow Not Tracking Entry Mutations

With `observable.shallow`, MobX only tracks:
- Map entries being added or removed (`set()`, `delete()`)
- NOT mutations to properties of objects already in the Map

Even though `DefaultSource` is `makeAutoObservable`, the reaction might not be establishing a dependency on `ds.value` because:
- The Map iteration happens first (observable access)
- Then `.value` access happens in a separate context

**Test**: Try using `observable` (deep) instead of `observable.shallow`.

### Hypothesis 3: JSON.stringify Doesn't Create Observable Dependency

`JSON.stringify(ds.value)` might not establish an observable dependency because JSON.stringify is a native function that doesn't trigger MobX proxy getters in the expected way.

**Test**: Replace `JSON.stringify(ds.value)` with direct value access: `ds.value`.

### Hypothesis 4: Reaction Comparison Using Structural Equality

MobX reactions use `structuralEquals` to compare the data expression results. If the serialized string is the same (unlikely but possible), the reaction won't fire.

**Test**: Add a revision counter that increments on every change.

### Hypothesis 5: makeAutoObservable Order Issue

`makeAutoObservable(this)` is called AFTER property assignment in the constructor. By the time MobX wraps the object, the properties already have values, which might affect proxy creation.

**Test**: Move `makeAutoObservable(this)` before property assignment, or use explicit `observable` annotations.

---

## Alternative Approaches to Investigate

### Approach A: Use computed for Reaction Data

Instead of computing the data expression inline, use a `computed` value that MobX can properly track:

```typescript
// In DefaultSourceStore
get valuesSnapshot(): string[] {
  return Array.from(this.sources.values()).map(ds =>
    `${ds.id}:${JSON.stringify(ds.value)}`
  );
}

// In setupAutoCompile
() => ({
  // ...
  defaultSourceValues: store.defaultSourceStore.valuesSnapshot,
})
```

### Approach B: Direct autorun Instead of reaction

Use `autorun` which tracks dependencies more simply:

```typescript
import { autorun } from 'mobx';

autorun(() => {
  // Access observables
  const values = Array.from(store.defaultSourceStore.sources.values())
    .map(ds => ds.value);

  // This will run whenever any ds.value changes
  scheduleCompile();
});
```

### Approach C: Event-Based Trigger

Emit a custom event when default source values change:

```typescript
setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
  const ds = this.getDefaultSourceForInput(blockId, slotId);
  if (!ds) return;
  ds.value = value;

  // Explicitly trigger recompilation
  this.root?.triggerRecompile?.();
}
```

### Approach D: MobX observe() for Map

Use MobX's `observe()` function to watch for deep changes:

```typescript
import { observe } from 'mobx';

observe(store.defaultSourceStore.sources, (change) => {
  // This fires on Map changes
  scheduleCompile();
});
```

### Approach E: Increment a Revision Counter

Add a revision counter that forces the reaction to see a change:

```typescript
// In DefaultSourceStore
valueRevision = 0;

setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
  const ds = this.getDefaultSourceForInput(blockId, slotId);
  if (!ds) return;
  ds.value = value;
  this.valueRevision++;  // Force observable change
}

// In setupAutoCompile
() => ({
  // ...
  defaultSourceRevision: store.defaultSourceStore.valueRevision,
})
```

---

## Debugging Steps

1. **Verify reaction fires at all**:
   ```typescript
   const dispose = reaction(
     () => {
       console.log('Reaction data expression running');
       return { /* ... */ };
     },
     () => {
       console.log('Reaction effect running');
     }
   );
   ```

2. **Verify observable access**:
   ```typescript
   import { trace } from 'mobx';

   autorun(() => {
     trace(true);  // Log all observable accesses
     const values = store.defaultSourceStore.sources.values();
   });
   ```

3. **Verify setDefaultValueForInput is called**:
   ```typescript
   setDefaultValueForInput(...) {
     console.log('setDefaultValueForInput called', blockId, slotId, value);
     // ...
   }
   ```

4. **Check if ds.value is actually observable**:
   ```typescript
   import { isObservable, isObservableProp } from 'mobx';

   const ds = store.defaultSourceStore.getDefaultSource(id);
   console.log('isObservable:', isObservable(ds));
   console.log('isObservableProp value:', isObservableProp(ds, 'value'));
   ```

---

## MobX Concepts Involved

### observable.shallow vs observable

- `observable.shallow`: Only the container (Map) is observable; entries are stored as-is
- `observable`: Container AND all nested objects are made observable recursively

The theory was that `DefaultSource` with `makeAutoObservable` provides its own observability, so `observable.shallow` is sufficient. This may not be interacting correctly with the reaction.

### makeAutoObservable Timing

`makeAutoObservable(this)` must be called after all property declarations but wraps existing property values into observables. The order matters.

### reaction() Dependency Tracking

A MobX `reaction()` tracks dependencies during the first execution of the data expression. If an observable is not accessed during that execution, changes to it won't trigger the reaction.

The data expression:
```typescript
() => ({
  defaultSourceValues: Array.from(store.defaultSourceStore.sources.values()).map(ds =>
    `${ds.id}:${JSON.stringify(ds.value)}`
  ),
})
```

Dependencies that SHOULD be tracked:
1. `store.defaultSourceStore.sources` (the Map)
2. Each `ds.value` accessed in the `.map()` callback

If either is not tracked, the reaction won't fire.

---

## Recommended Next Steps

1. **Add debugging to confirm the failure point**:
   - Is `setDefaultValueForInput` being called?
   - Is the reaction data expression running on value change?
   - Is `ds.value` actually observable?

2. **Try Approach E (revision counter)** as the simplest fix that bypasses the MobX dependency tracking issue

3. **Investigate MobX configuration** - Are there any MobX settings that might affect proxy behavior?

4. **Consider Approach C (event-based)** as a more architectural solution that doesn't rely on MobX reactivity working correctly across complex data structures

---

## References

- [MobX Reactions Documentation](https://mobx.js.org/reactions.html)
- [MobX observable.shallow](https://mobx.js.org/observable-state.html#available-annotations)
- [MobX makeAutoObservable](https://mobx.js.org/observable-state.html#makeautoobservable)
- Project files:
  - `src/editor/stores/DefaultSourceStore.ts`
  - `src/editor/compiler/integration.ts`
  - `src/editor/Inspector.tsx`
