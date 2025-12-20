# Time Architecture

## Fundamental Principle

**There is exactly ONE time system. The patch defines time topology. The player does not.**

This is non-negotiable.

The player never decides:
- Duration
- Looping
- Ping-pong
- Infinity

The player:
- Hosts
- Observes
- Controls rate
- Controls freeze/run

But never defines temporal structure.

## TimeRoot

Every patch must contain exactly one **TimeRoot** block that declares "what time means."

### TimeRoot Types

| Type | Description | Use Case |
|------|-------------|----------|
| `FiniteTimeRoot` | Finite performance with known duration | Logo stingers, intro/outro animations |
| `CycleTimeRoot` | Primary cycle that repeats | Ambient loops, music visualizers |
| `InfiniteTimeRoot` | Runs forever without privileged cycle | Evolving installations, generative "weather" |

### Constraints
- Exactly one TimeRoot per patch (compile error if 0 or >1)
- TimeRoot cannot have upstream dependencies
- TimeRoot cannot exist inside composite definitions
- Conflicting topologies are compile errors

## TimeModel

TimeModel is the compiler output that describes the patch's time topology.

```typescript
type TimeModel =
  | FiniteTimeModel
  | CyclicTimeModel
  | InfiniteTimeModel

interface FiniteTimeModel {
  kind: 'finite'
  durationMs: number
}

interface CyclicTimeModel {
  kind: 'cyclic'
  periodMs: number
  phaseDomain: '0..1'
}

interface InfiniteTimeModel {
  kind: 'infinite'
  windowMs: number  // View window, not duration
}
```

## Player Time

**Player time is unbounded. The player never wraps `t`.**

```typescript
// Old (deleted):
time = time % maxTime

// New:
time += dt * speed
// No clamp, no wrap, no reset. Ever.
```

The player receives TimeModel from compiler and configures itself:
```typescript
player.applyTimeModel(timeModel)
```

| TimeModel | Player Behavior |
|-----------|-----------------|
| finite | Shows bounded scrub window |
| cyclic | Shows phase-wrapped view |
| infinite | Shows sliding window |

## CycleTimeRoot

The primary time declaration for looping patches.

### Ports

**Inputs:**
- `period`: Scalar<duration> - Cycle period
- `mode`: Scalar<enum('loop'|'pingpong')>
- `phaseOffset`: Signal<phase> (optional)
- `drift`: Signal<number> (optional)

**Outputs:**
- `t`: Signal<time> (unbounded)
- `cycleT`: Signal<time> (0..period or pingpong)
- `phase`: Signal<phase> (primary)
- `wrap`: Event (pulse)
- `cycleIndex`: Signal<number>

### Bus Publishing
CycleTimeRoot automatically publishes:
- `phase` -> reserved bus `phaseA`
- `wrap` -> reserved bus `pulse`

## PhaseClock (Secondary Clock)

PhaseClock is a **derived** clock, not a topology declaration.

**Rule: A patch loops only if it has a CycleTimeRoot.**

### PhaseClock's Role
- Secondary cycle generator in a CycleRoot patch
- Local LFO in an InfiniteRoot patch
- Progress mapper in a FiniteRoot patch

It is **never** the primary time source.

### Ports

**Inputs (one required):**
- `tIn`: Signal<time> OR
- `phaseIn`: Signal<phase>

**Configuration:**
- `period`: Scalar<duration> (must be > 0)
- `mode`: Scalar<enum('loop'|'pingpong'|'once')>
- `rate`: Signal<number> (optional, default 1)
- `phaseOffset`: Signal<phase> (optional)
- `reset`: Event (optional, deterministic)

**Outputs:**
- `phase`: Signal<phase>
- `u`: Signal<unit> (clamped [0,1])
- `wrap`: Event
- `cycleIndex`: Signal<number>

### Semantics

For `tIn`:
```
raw = (t * rate) / period
loop:     phase = frac(raw + offset)
once:     phase = clamp(raw + offset, 0, 1)
pingpong: phase = triangle(raw + offset)
```

Uses unbounded `t`. No dependence on player `maxTime`.

## Phase Scrubbing

**Scrubbing never resets state.**

| Action | Effect |
|--------|--------|
| Scrub in cyclic | Sets phase offset |
| Scrub in infinite | Offsets time origin |
| Scrub in finite | Sets absolute time |

Requires:
- Phase offset injection
- NOT resetting player time
- NOT reinitializing patch state

## Signals and Fields Under TimeRoot

### Signals
- Receive unbounded `t`
- Phase generators map `t` to phase
- Multiple phase generators can coexist
- Signals never assume `t` wraps

### Fields
- Inherit phase indirectly
- FieldExpr remains lazy
- No bulk re-evaluation on wrap
- Looping is topological, not evaluative

## Determinism Guarantees

- Player time is monotonic
- Phase is deterministic
- Scrub is reversible
- Seed reinitializes only on explicit user action

## Failure Is Explicit

Illegal cases are **compile errors**, not runtime hacks:
- Conflicting cycles
- Finite + infinite topology
- Phase reset without state boundary
- PhaseClock with no time input
- PhaseClock with both tIn and phaseIn
- Period <= 0
