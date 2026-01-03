# Findings - Bus Initialization

**Confidence:** FRESH (2025-12-20)
**Scope:** BusStore default bus creation

## Issue: Incomplete Canonical Bus Creation

### What Was Found
`BusStore.createDefaultBuses()` only creates 3 of 5 canonical buses:
- ✅ `phaseA` (Signal<phase>, combine: last)
- ✅ `pulse` (Event, combine: or)
- ✅ `progress` (Signal<unit>, combine: last)
- ❌ `energy` (Signal<number>, combine: sum) - MISSING
- ❌ `palette` (Signal<color>, combine: last) - MISSING

### Impact
Macros that reference missing buses fail at expansion time:
```
Error: Bus energy not found
  at BusStore.addPublisher (BusStore.ts:215:13)
```

**Affected macros (Group 1):**
- `macro:animatedCircleRing` - publishes to `energy`
- `macro:rainbowGrid` - publishes to `palette`
- `macro:pulsingGrid` - publishes to `energy`, listens to `energy`

**Failure rate**: 3/5 Quick Start macros (60%)

### Root Cause
According to design docs (`design-docs/3-Synthesized/03-Buses.md`), `energy` and `palette` are canonical buses, but `BusStore.createDefaultBuses()` implementation doesn't create them.

### Fix Required
Add `energy` and `palette` bus creation to `BusStore.createDefaultBuses()` method.

### Verification
After fix, this should pass:
```typescript
const store = new RootStore();
const energyBus = store.busStore.buses.find(b => b.id === 'energy');
const paletteBus = store.busStore.buses.find(b => b.id === 'palette');
expect(energyBus).toBeDefined();
expect(paletteBus).toBeDefined();
```
