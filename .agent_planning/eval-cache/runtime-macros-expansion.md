# Runtime Behavior - Macro Expansion

**Confidence:** FRESH (2025-12-20)
**Scope:** Macro expansion system runtime behavior

## Macro Expansion Requirements

### Bus Dependency
Macros that use `publishers` or `listeners` require buses to exist BEFORE expansion:

```typescript
// This will FAIL if bus doesn't exist:
store.busStore.addPublisher('energy', blockId, 'out');
// Error: Bus energy not found
```

**Implication**: `BusStore.createDefaultBuses()` must create all buses referenced by macros.

### Current Default Buses

`BusStore.createDefaultBuses()` creates:
- `phaseA` ✅
- `pulse` ✅  
- `progress` ✅

### Missing Canonical Buses

According to design docs, these are also canonical but NOT created by default:
- `energy` ❌ (used by animatedCircleRing, pulsingGrid)
- `palette` ❌ (used by rainbowGrid)

**Impact**: 60% of Quick Start macros fail on expansion.

## No Programmatic Compilation API

**Finding**: RootStore has no `compile()` method.

**Current workflow**: 
- Compilation is reactive/automatic in UI
- Triggered by MobX reactions when patch changes
- No way to programmatically trigger compilation in tests

**Implication**: Cannot verify compilation success in unit tests. Must use browser-based E2E tests.

## Successful Expansion Pattern

Macros that don't use buses CAN expand successfully:
- `macro:simpleGrid` ✅ (no buses)
- `macro:lineWave` ✅ (no buses)

Expansion creates expected blocks and connections without errors.

## Test Limitations

**Cannot verify in unit tests:**
- Actual compilation (no API)
- Visual rendering (requires canvas)
- Animation playback (requires runtime)
- Console errors (requires browser)

**Must use browser for:**
- Full macro validation
- Rendering verification
- Animation playback testing
