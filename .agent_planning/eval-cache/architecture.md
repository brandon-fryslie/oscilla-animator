# Architecture Cache

**Cached**: 2025-12-23 05:13
**Source**: project-evaluator + design doc review
**Confidence**: HIGH

## Core Architecture Pattern
**Visual animation editor** with **node-based patch bay** interface

**Philosophy**: "Animations are not timelines. They are living systems that happen to be observed over time."

## Time System (The Keystone)
**Fundamental Principle**: The patch defines time topology. The player does not.

### TimeRoot Types (Exactly ONE per patch)
1. **FiniteTimeRoot** - Known duration, one-shot playback
2. **CycleTimeRoot** - Repeating cycle with phase
3. **InfiniteTimeRoot** - Unbounded generative time

### Current Implementation Status (2025-12-23)
**SPEC VIOLATION DETECTED**:

| TimeRoot Type | Spec Outputs | Implementation Outputs | Status |
|---------------|--------------|------------------------|--------|
| FiniteTimeRoot | systemTime, progress, localT | systemTime, progress, **phase**, end, energy | ❌ Extra outputs |
| CycleTimeRoot | t, cycleT, phase, wrap, cycleIndex | systemTime, cycleT, phase, wrap, cycleIndex, energy | ✅ Matches (renamed t → systemTime) |
| InfiniteTimeRoot | systemTime | systemTime, **phase**, **pulse**, energy | ❌ Extra outputs |

**Spec says** (from `09-Blocks.md`):
- **FiniteTimeRoot**: systemTime, localT, progress
- **InfiniteTimeRoot**: systemTime (ONLY)

**Implementation has**:
- **FiniteTimeRoot**: Added `phase` and `energy` outputs
- **InfiniteTimeRoot**: Added `phase`, `pulse`, `energy` outputs

### Auto-Publications (Bus System)

| TimeRoot Type | Spec Auto-Pubs | Implementation Auto-Pubs | Status |
|---------------|----------------|--------------------------|--------|
| FiniteTimeRoot | `progress` → `progress` | `progress` → `progress`<br>`phase` → `phaseA`<br>`end` → `pulse` | ❌ Extra pubs |
| CycleTimeRoot | `phase` → `phaseA`<br>`wrap` → `pulse` | `phase` → `phaseA`<br>`wrap` → `pulse`<br>`start` → `pulse` | ⚠️ Extra start event |
| InfiniteTimeRoot | None (spec: only `energy` encouraged) | `phase` → `phaseA`<br>`pulse` → `pulse`<br>`energy` → `energy` | ❌ Should not publish phase/pulse |

**From `03-Buses.md`**:
> **InfiniteTimeRoot:**
> - None required
> - `energy` - strongly encouraged
> - `phaseA` - optional (local oscillators), does NOT imply cyclic UI

The spec says InfiniteTimeRoot CAN have phaseA from local oscillators, but **should not auto-publish from the TimeRoot itself**.

## Type System Hierarchy
1. **Scalar** - Compile-time constants
2. **Signal** - Time-indexed values (once per frame)
3. **Field** - Per-element lazy expressions (evaluated at render sinks only)
4. **Event** - Discrete triggers (edge detection)

## Store Architecture (MobX)
```
RootStore
├── PatchStore      # Blocks, connections, lanes
├── BusStore        # Buses, publishers, listeners
├── UIStateStore    # Selection, playback state
└── CompositeStore  # Composite definitions
```

## Compiler Pipeline
1. **Validation** - Type checking, constraints (exactly-one-TimeRoot, etc.)
2. **TimeModel Extraction** - Infer time topology from TimeRoot
3. **Bus Resolution** - Auto-publications, publisher/listener graph
4. **Block Compilation** - Per-block compilers produce runtime artifacts
5. **Program Assembly** - Final executable program

## Runtime
- **Player** - Transport control, owns unbounded time `t`
- **TimeModel** - Configures player UI (not player behavior)
- **Hot Swap** - Change classification, state preservation

## Known Architectural Debt
1. **TimeRoot outputs violate spec** - Implementation added outputs not in design docs
2. **Auto-publication rules inconsistent** - Extra publications beyond spec
3. **Validation not implemented** - Exactly-one-TimeRoot, upstream dependencies
4. **Player may have legacy loopMode** - Should be removed (time topology in patch only)

## Determinism Requirements
- No `Math.random()` at runtime
- All randomness seeded, evaluated at compile-time
- Same seed = identical output every time
- Scrubbing never resets state
