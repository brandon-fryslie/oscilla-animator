# Evaluation: Default Source Reactivity Issue
Timestamp: 2025-12-28-164500
Confidence: FRESH
Git Commit: 332f50f
Scope: Default source value updates → compilation trigger chain

## User-Reported Issue

**Problem**: When changing default source values in the inspector, the values update in the store but the animation doesn't update until something else triggers a recompilation (like changing a connection).

**Expected**: Changing a default source value should immediately recompile the patch and update the animation.

**Actual**: Default source values change in memory, but no recompilation is triggered.

## Data Flow Analysis

I traced the complete data flow from inspector UI → stores → compilation:

### 1. Inspector UI → DefaultSourceStore (WORKS)

**File**: `src/editor/Inspector.tsx`
**Lines**: 1319-1321, 1342-1346

```typescript
const handleChange = (blockId: string, slotId: string, value: unknown) => {
  store.defaultSourceStore.setDefaultValueForInput(blockId, slotId, value);
};
```

The `DefaultSourceControl` component calls `handleChange` when user edits values (slider, number input, color picker, etc.).

**Status**: ✅ WORKS - Value updates are properly dispatched to the store.

### 2. DefaultSourceStore Mutation (WORKS)

**File**: `src/editor/stores/DefaultSourceStore.ts`
**Lines**: 110-114

```typescript
setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
  const ds = this.getDefaultSourceForInput(blockId, slotId);
  if (!ds) return;
  ds.value = value;
}
```

**Observability**: The `DefaultSourceStore.sources` Map is marked as `observable` in MobX (line 38).

**Status**: ✅ WORKS - Value is updated in the observable store.

### 3. DefaultSourceStore → Compilation Trigger (BROKEN)

**File**: `src/editor/compiler/integration.ts`
**Lines**: 1092-1107

The `setupAutoCompile` function uses MobX `reaction()` to track changes and trigger recompilation. Here's what it tracks:

```typescript
const dispose = reaction(
  // Track these observables
  () => ({
    blockCount: store.patchStore.blocks.length,
    blocks: store.patchStore.blocks.map((b: Block) => ({ id: b.id, type: b.type, params: JSON.stringify(b.params) })),
    connectionCount: store.patchStore.connections.length,
    connections: store.patchStore.connections.map((c: Connection) => `${c.from.blockId}:${c.from.slotId}->${c.to.blockId}:${c.to.slotId}`),
    seed: store.uiStore.settings.seed,
    busCount: store.busStore.buses.length,
    buses: store.busStore.buses.map(b => `${b.id}:${b.name}`),
  }),
  // React to changes
  () => {
    // Schedule new compile
    timeoutId = setTimeout(() => {
      store.logStore.debug('compiler', 'Auto-compile triggered');
      const result = service.compile();
      onCompile?.(result);
    }, debounce);
  }
);
```

**Status**: ❌ BROKEN - `defaultSourceStore.sources` is NOT tracked in the reaction.

## Root Cause

The `setupAutoCompile` reaction does NOT track default source values. It tracks:
- Blocks (count, types, params)
- Connections
- Seed

But **completely misses** `store.defaultSourceStore.sources`.

When a user changes a default source value:
1. ✅ The value updates in `DefaultSourceStore.sources` (observable mutation)
2. ❌ The `setupAutoCompile` reaction doesn't see it (not in tracked dependencies)
3. ❌ No recompilation is triggered
4. ❌ Animation continues using old compiled value

When a user changes a connection:
1. ✅ The connection changes in `PatchStore.connections` (tracked)
2. ✅ The `setupAutoCompile` reaction fires
3. ✅ Recompilation runs
4. ✅ Animation updates with NEW default source value (picked up from store during compilation)

This explains why the user sees the value change "when I change a connection or something" - the connection change triggers the missing recompilation.

## Alternative Investigation: GraphCommitted Event

I also checked if `DefaultSourceStore` emits `GraphCommitted` events (which would trigger diagnostics and potentially compilation):

**File**: `src/editor/stores/DefaultSourceStore.ts`

**Finding**: `DefaultSourceStore` has NO references to `emitGraphCommitted` or `GraphCommitted`. It's a silent store that:
- Stores default source values
- Provides getters/setters
- Does NOT emit events when values change

This is inconsistent with other stores:
- `PatchStore`: Emits `GraphCommitted` on block/connection changes (lines 128-144)
- `BusStore`: Likely emits events (not verified in this evaluation)

## Architecture Context

The system uses TWO mechanisms for change propagation:

### Mechanism 1: MobX Reactivity (Auto-Compile)
- `setupAutoCompile` uses MobX `reaction()` to watch observables
- When tracked observables change, triggers debounced recompilation
- **Missing**: `defaultSourceStore.sources` tracking

### Mechanism 2: Event System (Diagnostics)
- Stores emit `GraphCommitted` events after mutations
- `DiagnosticHub` listens to `GraphCommitted` and reruns validators (lines 84-94 in `DiagnosticHub.ts`)
- **Missing**: `DefaultSourceStore` doesn't emit events

The default source system is **invisible to both mechanisms**.

## Impact Assessment

**Severity**: MODERATE
- Animation is functionally correct (values DO update when recompilation happens)
- No data corruption or loss
- Confusing UX (user changes value, nothing happens)
- Workaround exists (change any connection to force recompile)

**User Experience**: POOR
- Violates "live editing" principle
- Creates confusion ("is it broken?")
- Requires internal knowledge of when recompilation happens

**Consistency**: BROKEN
- Every other store triggers recompilation on changes
- Default sources are an invisible second-class citizen

## Fix Options

### Option 1: Add Default Sources to setupAutoCompile Reaction (Recommended)

**File**: `src/editor/compiler/integration.ts`
**Lines**: 1094-1107

Add default source tracking to the reaction:

```typescript
() => ({
  blockCount: store.patchStore.blocks.length,
  blocks: store.patchStore.blocks.map((b: Block) => ({ id: b.id, type: b.type, params: JSON.stringify(b.params) })),
  connectionCount: store.patchStore.connections.length,
  connections: store.patchStore.connections.map((c: Connection) => `${c.from.blockId}:${c.from.slotId}->${c.to.blockId}:${c.to.slotId}`),
  seed: store.uiStore.settings.seed,

  // ADD THIS: Track default source values
  defaultSourceCount: store.defaultSourceStore.sources.size,
  defaultSources: Array.from(store.defaultSourceStore.sources.values()).map(ds =>
    `${ds.id}:${JSON.stringify(ds.value)}`
  ),

  busCount: store.busStore.buses.length,
  // ... rest unchanged
})
```

**Pros**:
- Minimal change
- Consistent with existing pattern
- No event system changes needed

**Cons**:
- Duplicates pattern (every change requires updating the reaction)
- Still doesn't emit `GraphCommitted` events

### Option 2: Emit GraphCommitted from DefaultSourceStore

**File**: `src/editor/stores/DefaultSourceStore.ts`
**Lines**: 110-114

Update `setDefaultValueForInput` to emit event:

```typescript
setDefaultValueForInput(blockId: BlockId, slotId: string, value: unknown): void {
  const ds = this.getDefaultSourceForInput(blockId, slotId);
  if (!ds) return;
  ds.value = value;

  // Emit GraphCommitted event
  this.root?.patchStore.emitGraphCommitted(
    'userEdit',
    {
      blocksAdded: 0,
      blocksRemoved: 0,
      busesAdded: 0,
      busesRemoved: 0,
      bindingsChanged: 0,
      timeRootChanged: false,
    },
    [blockId]
  );
}
```

**Pros**:
- Consistent with other stores
- Would trigger diagnostics AND compilation (if auto-compile listens to GraphCommitted)
- Architecturally correct

**Cons**:
- Requires `DefaultSourceStore.root` reference (already exists, line 53)
- May trigger unnecessary work (diagnostics don't care about default source values)
- Assumes auto-compile reacts to `GraphCommitted` (needs verification)

### Option 3: Hybrid - Add to Reaction AND Emit Event

Combine both approaches for maximum consistency.

**Pros**:
- Fully consistent with rest of system
- Future-proof (works regardless of how compilation trigger evolves)

**Cons**:
- More invasive change
- Potential for double-triggering if auto-compile also watches events

## Recommendation

**Recommended Fix**: Option 1 (Add to setupAutoCompile reaction)

**Rationale**:
1. Minimal, surgical change
2. Immediately fixes user-reported issue
3. Consistent with current auto-compile pattern
4. Low risk of breaking changes

**Follow-up Work** (lower priority):
- Consider adding `GraphCommitted` emission for architectural consistency
- Consider refactoring auto-compile to use events instead of direct store observation
- Add tests for default source reactivity

## Test Plan

After implementing Option 1, verify:

1. **Fresh evaluation**: Change a default source value in inspector → animation updates within debounce window (300ms)
2. **No false positives**: Other changes still trigger compilation (blocks, connections, buses, seed)
3. **Performance**: No visible performance degradation from tracking default sources

## Files Involved

**Primary**:
- `src/editor/compiler/integration.ts` (setupAutoCompile function, lines 1083-1135)

**Secondary** (for reference):
- `src/editor/Inspector.tsx` (UI that changes values)
- `src/editor/stores/DefaultSourceStore.ts` (store being updated)

**Tests** (if they exist):
- Likely none - this is a reactivity integration issue, not a unit-testable bug

## Workflow Recommendation

✅ **CONTINUE** - Issue is clear, fix is straightforward, implementer can proceed.

No ambiguities found. The problem is a missing observable in a MobX reaction.
