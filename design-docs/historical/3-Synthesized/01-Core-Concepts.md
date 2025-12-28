# Core Concepts

## The Type Hierarchy

The system distinguishes between different "worlds" of computation:

| World | Description | Evaluation |
|-------|-------------|------------|
| **Scalar** | Compile-time constants | Once at compile |
| **Signal** | Time-indexed values | Once per frame |
| **Field** | Per-element lazy expressions | At render sinks |
| **Event** | Discrete triggers | Edge detection |

## Signals

A **Signal** is a continuous, time-indexed value.

```typescript
type Signal<A> = (t: Time, ctx: Context) => A
```

### Key Properties
- Evaluated once per frame (not per element)
- Receives unbounded `t` - signals never assume `t` wraps
- Phase/cycle generators map unbounded `t` to phase internally (derived cycles), never by wrapping global time
- Multiple phase generators can coexist

### Common Signal Types
- `Signal<number>` - numerical values
- `Signal<phase>` - phase values in [0,1)
- `Signal<time>` - time in milliseconds
- `Signal<color>` - color values
- `Signal<vec2>` - 2D vectors

## Fields

A **Field** is a per-element value computed lazily from a Domain.

```typescript
/**
 * A lazy per-element expression.
 * Evaluated by render sinks via a cursor/plan; it is NOT an eager array.
 */
type Field<T> = FieldExpr<T>
```

### Key Properties
- Lazy evaluation — computed only when a render sink requests elements
- Supports partial evaluation (only the elements a sink needs)
- Materialization is an optimization, not the semantic contract
- Deterministic across edits via stable Domain identity

### FieldExpr IR
Fields are represented as a lazy DAG:
- `const` - constant field
- `source` - source field (pos0, idRand)
- `broadcast` - Signal lifted to Field
- `mapUnary` - per-element transformation
- `zipBinary` - combine two fields
- `zipSignal` - combine field with signal

### Materialization Semantics
A render sink *may* choose to materialize a field into contiguous buffers (e.g. Float32Array) once per frame for GPU upload.
This is a backend optimization decision and must preserve the lazy contract: a Field is defined by what `get(i)` returns for each element index, not by any particular buffering strategy.

## Domains

A **Domain** represents stable element identity.

### Properties
- Stable element IDs (survive edits)
- Deterministic ordering
- Deterministic element count
- Topology-aware (grid, path, etc.)

### Domain Contract
- Elements have stable IDs for state mapping
- Ordering is consistent across frames
- Identity is opaque and stable (e0…eN-1). Structural semantics (row/col, u/v, arc-length, etc.) are exposed as derived Fields.
- Identity does not encode meaning; meaning is carried by derived fields

## Programs

A **Program** is a complete animation with signal and events.

```typescript
interface Program<Out> {
  run: Signal<Out>
  events?: EventSpec[]
}
```

## TimeRoot, TimeModel, and TimeCtx

A patch declares exactly one **TimeRoot**. TimeRoot does not generate time — it declares the *time contract* of the patch.

### TimeModel (Compile‑time contract)

`TimeModel` is a static declaration produced by the compiler. It describes what kind of time the program is authored against.

```ts
type TimeModel =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'infinite' };
```

Meaning:

- `finite(durationMs)`  
  The patch has a meaningful authored duration.  
  Exporters, cue systems, and timeline UIs may reference this duration.  
  Playback may still loop or window the view, but the program itself is finite.

- `infinite()`  
  The patch has no end.  
  There is no canonical duration.  
  Playback UI presents a movable *time window* for viewing or recording.

**TimeModel is immutable during execution.**  
Changing it recompiles the patch.

---

### TimeCtx (Runtime input)

`TimeCtx` is what actually flows into the program every frame.

```ts
interface TimeCtx {
  t: number;        // Unbounded, monotonically increasing time in ms
  dt: number;       // Delta time
  seed: number;    // Deterministic seed
}
```

Rules:

- `t` never wraps
- `t` never resets when looping playback
- `t` is never clamped by TimeModel

TimeModel constrains **how time is interpreted**, not how time flows.

---

### Cycles are derived, not roots

Cycles are created by **CycleSpecs** layered on top of `TimeCtx.t`.

A CycleSpec produces:

- phase signals (0..1)
- pulse events
- energy envelopes

Example:

```ts
CycleSpec {
  periodMs: 4000
  phaseBus: "phaseA"
  pulseBus: "pulse"
  energyBus: "energy"
}
```

Multiple CycleSpecs may coexist.  
They all read from the same unbounded `t`.

---

### Player responsibility

The Player never alters `t`.

It may:
- loop the *view*
- ping‑pong the *view*
- window the *view*
- record a window

But the program always sees the same absolute time axis.

This is what makes:
- nested cycles
- seamless exports
- no‑jank hot‑swap
- deterministic replay  
possible.

Do not confuse:
- **TimeModel** → what kind of time this patch is
- **TimeCtx** → the actual time flowing through the system
- **Cycles** → derived oscillators layered on top

TimeRoot selects TimeModel.  
Player selects how TimeCtx is presented.  
Nothing ever wraps time.

## Type Descriptors

Every port and bus has a TypeDesc:

```typescript
interface TypeDesc {
  world: 'scalar' | 'signal' | 'field' | 'special'
  domain: 'time' | 'phase' | 'number' | 'unit' | 'color' | 'vec2' | 'event' | ...
  semantics?: 'primary' | 'secondary' | 'energy' | 'progress' | ...
}
```

This enables:
- Type-safe connections
- Adapter inference
- UI customization per type

## Non-Negotiable Invariants

1. **No `Math.random()` at runtime** - Breaks scrubbing/replay  
2. **All randomness is seeded and deterministic** (may be evaluated at compile-time or as a pure function of (seed, domainId, t))  
3. **Animations are time-indexed programs**  
4. **Full separation**: compile-time -> run-time -> render-time  
   Runtime evaluation must not require eager Field materialization; sinks choose materialization strategies.  
5. **Explicit state-only memory** - No hidden state  
6. **World mismatches are compile errors**  
7. **Domain mismatches are compile errors**
