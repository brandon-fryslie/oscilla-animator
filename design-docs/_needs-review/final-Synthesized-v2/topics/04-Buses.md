# Buses

## Source: 03-Buses.md

# Buses

## Overview

Buses are **named shared channels** that replace explicit wiring for common signals. They function like audio sends/returns in a DAW.

## Bus Architecture

### Publishers
Blocks that output to a bus. Multiple publishers can contribute to the same bus.

### Listeners
Blocks that receive from a bus. Multiple listeners can subscribe to the same bus.

### Combine Modes
When multiple publishers contribute to a bus, values are combined:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `sum` | Values are summed | energy |
| `average` | Values are averaged | blended signals |
| `max` | Maximum value wins | intensity peaks |
| `min` | Minimum value wins | constraints |
| `last` | Last publisher wins (by sortKey) | phaseA, palette, progress |
| `layer` | Layered composition | visual stacking |

**Note:** `or` and `mix` are NOT valid combine modes.

## Canonical Bus Set

These buses are reserved names with reserved semantics. The UI and default macros rely on them.

### Required Buses by TimeRoot Kind

> **RESOLVED (2025-12-28):** FiniteTimeRoot publishes to `progress` and `time`. InfiniteTimeRoot publishes only to `time`. Phase/pulse/energy come from the Time Console Modulation Rack, not from TimeRoot.

All TimeRoot types auto-publish to the standard buses for unified API.

**FiniteTimeRoot:**
- `progress` (Signal) - **required** (0..1 clamped)
- `phaseA` (Signal) - **auto-published** *(provisional)* (same as progress)
- `pulse` (Event) - **auto-published** *(provisional)* (end event)
- `energy` (Signal) - **auto-published** *(provisional)* (1.0 while running, 0 when complete)

**InfiniteTimeRoot:**
- Publishes only to `time` bus (monotonic time)
- Phase/pulse/energy come from Time Console rails, not TimeRoot

### Canonical Bus Type Contracts

**phaseA**
```typescript
TypeDesc: { world: 'signal', domain: 'phase', semantics: 'primary' }
```
- UI-primary phase reference for cyclic time
- Range: loop [0,1), pingpong [0,1] triangle
- Combine: `last`

**phaseB**
```typescript
TypeDesc: { world: 'signal', domain: 'phase', semantics: 'secondary' }
```
- Optional secondary phase lane
- Combine: `last`

**pulse**
```typescript
TypeDesc: { world: 'special', domain: 'event', semantics: 'pulse' }
```
- Musically useful trigger stream
- Wrap ticks, beat divisions, envelope triggers
- Combine: `last`

**energy**
```typescript
TypeDesc: { world: 'signal', domain: 'number', semantics: 'energy' }
```
- Intensity signal
- Range: [0, +infinity) or normalized [0,1]
- Combine: `sum`

**progress** (Finite only)
```typescript
TypeDesc: { world: 'signal', domain: 'unit', semantics: 'progress' }
```
- 0 -> 1 over duration (clamped)
- Combine: `last`

## Bus Production

### TimeRoot Publishing

TimeRoot blocks publish ONLY the reserved `time` bus:

**FiniteTimeRoot publishes:**
- `time` <- TimeRoot.systemTime (monotonic, unbounded)

**InfiniteTimeRoot publishes:**
- `time` <- TimeRoot.systemTime (monotonic, unbounded)

**Note:** Phase/pulse/energy/palette are produced by the **Time Console** (Modulation Rack) and routed via Global Rails. TimeRoot does NOT auto-publish to these rails.

### Secondary Phase Publishing (via Time Console)

**Note:** PhaseClock is removed. Phase/pulse rails are produced by the **Time Console** Modulation Rack.

Time Console Cycle B lane typically publishes:
- `phaseB` <- Cycle B phase
- `pulse` <- Cycle B wrap events (merged with Cycle A)
- `energy` <- envelope driven by phaseB (if energy lane enabled)

These are authored in the Time Console Modulation Rack, not via canvas blocks.

## UI Integration

The UI layer interacts with compiled patches via:

1. **BusStore**: Direct access to bus registry, publishers, listeners
   - UI controls can publish to buses like any other publisher
   - Lens stacks transform published values

2. **CompileResult.compiledPortMap**: Map<PortRef, Artifact>
   - UI scopes/meters read compiled artifact values
   - Allows introspection of any block output port

3. **CompileResult.timeModel**: TimeModel
   - Drives Time Console UI (Finite/Cycle/Infinite modes)
   - Player transport configuration

No special "UI bindings" are needed - the bus system is the universal integration layer.


## UI Control Publishers

UI controls (sliders, knobs, toggles) publish to buses via BusStore.createPublisher. They are treated as privileged publishers with high priority to override defaults.

**Publisher Properties**
- `sortKey = -1000` (high priority to override block-generated values)
- `blockId = 'ui-control-{id}'` (unique identifier)
- No compilation required - runtime only

**Example Flow**
```
UI Slider (user drags)
  ↓
BusStore.createPublisher({
  blockId: 'ui-control-1',
  busId: 'energy',
  sortKey: -1000
})
  ↓
Bus compilation: UI publisher has highest priority
  ↓
Listeners receive UI value via lens stack
  ↓
Runtime: slider changes propagate like any other publisher
```

**Key Design Points**
- UI controls are not special - they are just publishers with negative sortKey
- Lens stacks transform UI values before reaching listeners
- No separate "binding" system needed - unified bus architecture
- UI controls can override block outputs but not other UI controls (first UI control wins)

**Cross-reference**: See `design-docs/3-Synthesized/07-UI-Spec.md` for detailed UI control widget specifications.

Deterministic ordering via sortKey:
- Every publisher has a stable sortKey
- Combine operations use this ordering
- Results are deterministic across frames

## Multiple Publisher Rules

For control-plane signals (`phaseA`, `progress`):
- Must not have multiple publishers unless user explicitly changes bus policy
- Otherwise compile error

For data-plane signals (`energy`, `pulse`):
- Multiple publishers expected and valid
- Combine semantics apply

## Bus Board UI

Reserved buses appear pinned at top with "system" badge.

Each row shows:
- Type badge
- Publisher count
- Listener count
- Live scope visualization:
  - phase: ring sweep
  - pulse: tick flashes
  - energy: meter/sparkline
  - progress: bounded meter

## What Buses Drive in UI

| Bus | Drives |
|-----|--------|
| `phaseA` | Phase Ring in Cycle mode, phase readout, wrap timing |
| `pulse` | Flash/tick indicator, metrical overlays, sync points for "apply at next wrap" |
| `energy` | Intensity meter, auto-exposure, visual debugging overlays |
| `progress` | Bounded progress bar in Finite mode, "ended" detection |
