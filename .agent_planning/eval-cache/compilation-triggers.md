# Compilation Trigger System

**Cached**: 2025-12-28 16:45
**Source**: project-evaluator (default-source-reactivity evaluation)
**Confidence**: HIGH

## Architecture

The system uses **MobX reactions** to trigger auto-recompilation when observable state changes.

### Primary Mechanism: setupAutoCompile

**File**: `src/editor/compiler/integration.ts`
**Function**: `setupAutoCompile(store, service, options)`
**Lines**: 1083-1135

Uses MobX `reaction()` to watch specific observables and trigger debounced compilation.

### Tracked Observables (as of 2025-12-28)

```typescript
{
  blockCount: store.patchStore.blocks.length,
  blocks: store.patchStore.blocks.map((b) => ({ id: b.id, type: b.type, params: JSON.stringify(b.params) })),
  connectionCount: store.patchStore.connections.length,
  connections: store.patchStore.connections.map((c) => `${c.from.blockId}:${c.from.slotId}->${c.to.blockId}:${c.to.slotId}`),
  seed: store.uiStore.settings.seed,
  busCount: store.busStore.buses.length,
  buses: store.busStore.buses.map(b => `${b.id}:${b.name}`),
  publisherCount: store.busStore.publishers.length,
  publishers: store.busStore.publishers.map(p => `${p.id}:${p.from.blockId}.${p.from.slotId}->${p.busId}:${p.enabled}`),
  listenerCount: store.busStore.listeners.length,
  listeners: store.busStore.listeners.map(l => `${l.id}:${l.busId}->${l.to.blockId}.${l.to.slotId}:${l.enabled}`),
}
```

### NOT Tracked (Known Gaps)

- ❌ `store.defaultSourceStore.sources` (default source values)
  - **Impact**: Changing default source values in inspector doesn't trigger recompilation
  - **Workaround**: Change any connection to force recompile
  - **Fix**: Add to reaction tracked observables

### Compilation Flow

1. User changes tracked observable (e.g., adds block, changes connection)
2. MobX reaction fires
3. Debounce timer starts (default: 300ms)
4. After debounce, `service.compile()` is called
5. `CompileStarted` event emitted
6. Compilation runs (8-pass pipeline)
7. `CompileFinished` event emitted with diagnostics
8. If successful, `ProgramSwapped` event loads new IR into runtime

### Event System (Parallel)

**File**: `src/editor/diagnostics/DiagnosticHub.ts`

The event system runs in parallel:
- Stores emit `GraphCommitted` events after mutations
- `DiagnosticHub` listens and reruns validators
- Events do NOT directly trigger compilation (auto-compile uses MobX reactions)

**Known Issue**: `DefaultSourceStore` does NOT emit `GraphCommitted` events, making it invisible to diagnostics.

## How to Add New Compilation Triggers

To make a new observable trigger recompilation:

1. Add to `setupAutoCompile` reaction tracking (lines 1094-1107)
2. Use a deterministic serialization (JSON or string map)
3. Include enough detail to detect actual changes (not just counts)

Example:
```typescript
() => ({
  // ... existing tracked observables ...

  // New observable
  myFeatureCount: store.myStore.items.length,
  myFeature: store.myStore.items.map(item => `${item.id}:${JSON.stringify(item.data)}`),
})
```

## Debounce Behavior

- Default: 300ms
- Configurable via `AutoCompileOptions.debounce`
- Timer resets on every change (only last change triggers compilation)
- Used in `Editor.tsx` setup

## Testing Compilation Triggers

To verify an observable triggers compilation:

1. Make a change to the observable in UI
2. Check console for "Auto-compile triggered" log (if debug enabled)
3. Observe `CompileStarted` → `CompileFinished` events
4. Verify animation updates within debounce window
