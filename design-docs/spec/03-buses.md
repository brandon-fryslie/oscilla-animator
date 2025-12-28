# Bus System

## Overview

Buses are named shared channels that replace explicit wiring for common signals. They function like audio sends/returns in a DAW.

## Architecture

### Publishers
Blocks that output to a bus. Multiple publishers can contribute.

### Listeners
Blocks that receive from a bus. Multiple listeners can subscribe.

### Combine Modes

When multiple publishers contribute, values are combined:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `sum` | Values are summed | energy |
| `average` | Values are averaged | blended signals |
| `max` | Maximum value wins | intensity peaks |
| `min` | Minimum value wins | constraints |
| `last` | Last publisher wins (by sortKey) | phaseA, palette, progress |
| `layer` | Layered composition | visual stacking |

**Note:** `or` and `mix` are NOT valid combine modes.

### Publisher Ordering

Every publisher has a stable `sortKey`. Combine operations use this ordering for deterministic results.

## Reserved Buses (Global Rails)

| Bus | Type | Combine | Default |
|-----|------|---------|---------|
| `time` | Signal<time> | last | 0 |
| `phaseA` | Signal<phase> | last | 0 |
| `phaseB` | Signal<phase> | last | 0 |
| `pulse` | Event | last | never fires |
| `energy` | Signal<number> | sum | 0 |
| `palette` | Signal<color> | last | #0b1020 |
| `progress` | Signal<unit> | last | 0 |

**Properties:**
- Pinned at top of Bus Board with "system" badge
- Origin: `built-in`
- Cannot be deleted

## Frame Latching

Rail reads are frame-latched: reads see the previous frame's value.

This ensures:
- No circular dependencies within a frame
- Deterministic evaluation order
- Predictable timing behavior

## TimeRoot Publishing

TimeRoot blocks publish only to the `time` bus:
- **FiniteTimeRoot** — `time` + `progress`
- **InfiniteTimeRoot** — `time` only

Phase/pulse/energy/palette come from the Time Console, not TimeRoot.

## Bus Binding

Bindings connect bus values to block inputs:

```typescript
interface BusBinding {
  busId: BusId
  portRef: PortRef
  adapters: AdapterId[]  // Applied in order
}
```

## Adapters (Perception Stack)

A listener can have multiple adapters chained:

```
bus.energy -> [scale(0.5)] -> [smooth(0.1)] -> [clamp(0,1)] -> block.input
```

This "perception stack" defines how this listener perceives the bus value.

## UI Control Publishers

UI controls (sliders, knobs) can publish to buses:
- `sortKey = -1000` (high priority to override defaults)
- `blockId = 'ui-control-{id}'`
- No compilation required — runtime only

## Multiple Publisher Rules

**Control-plane signals** (`phaseA`, `progress`):
- Must not have multiple publishers unless explicitly configured
- Otherwise compile error

**Data-plane signals** (`energy`, `pulse`):
- Multiple publishers expected and valid
- Combine semantics apply

## Bus Validation

Compiler enforces:
- Reserved bus type matching
- Required buses present for TimeRoot kind
- Publisher ordering deterministic
