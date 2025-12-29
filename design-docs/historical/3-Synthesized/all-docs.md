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

---

## TimeRoot

Every patch must contain exactly one **TimeRoot** block that declares the patch’s fundamental time topology and meaning.

### TimeRoot Types

| Type             | Description                           | Use Case                         |
|------------------|-----------------------------------|---------------------------------|
| `FiniteTimeRoot`  | Finite performance with known duration | Logo stingers, intro/outro animations |
| `InfiniteTimeRoot`| Runs unbounded, no privileged cycle | Evolving installations, generative "weather" |

### Constraints

- Exactly one TimeRoot per patch (compile error if 0 or >1)
- TimeRoot cannot have upstream dependencies
- TimeRoot cannot exist inside composite definitions
- Conflicting topologies (e.g., multiple TimeRoots) are compile errors

---

## Patch Topology vs Player Playback Policy

- **Patch topology** is defined solely by the TimeRoot block.
- **Looping and cycles** are *derived signals* created by explicit operator blocks (e.g., cycle generators, phase mappers) and are **not** part of the TimeRoot.
- The player **never** changes or wraps the patch’s fundamental time `t`.
- The player may implement **view looping modes** (loop, ping-pong, once) for *finite* patches by mapping monotonic time `t` to a playback view time `tView`.
- Infinite patches typically create cycles by applying cycle/phase operators as needed, possibly nested or multiple.

---

## TimeModel

The compiler outputs a `TimeModel` describing the patch’s time topology.

```typescript
type TimeModel =
  | FiniteTimeModel
  | InfiniteTimeModel

interface FiniteTimeModel {
  kind: 'finite'
  durationMs: number
}

interface InfiniteTimeModel {
  kind: 'infinite'
  windowMs: number  // View window, not duration
}
```

---

## Player Time

**Player time is unbounded. The player never wraps `t`.**

```typescript
// Old (deleted):
time = time % maxTime

// New:
time += dt * speed
// No clamp, no wrap, no reset. Ever.
```

The player receives the `TimeModel` from the compiler and configures itself accordingly:

```typescript
player.applyTimeModel(timeModel)
```

---

## Player Playback Policy (View-Time Mapping)

| TimeModel  | Player Behavior (view-time)                         |
|------------|----------------------------------------------------|
| finite     | View time may loop, ping-pong, or play once within duration; scrubbing sets absolute time |
| infinite   | View time is sliding window over monotonic time; no looping or wrapping |

- **Looping modes** for finite patches affect only the *view-time* mapping, never the underlying monotonic time `t`.
- Infinite patches never loop in playback; cycles are derived explicitly in the patch.

---

## Derived Cycle and Phase Operators

- **Cycles and looping are derived signals**, created by explicit operator blocks such as `Cycle`, `PhaseFromTime`, or `CyclePhase`.
- These operators can exist under either `FiniteTimeRoot` or `InfiniteTimeRoot` patches.
- They produce signals such as:
  - `phase` (0..1 wrapped)
  - `wrap` events (cycle boundaries)
  - `cycleIndex` (completed cycles)
  - `energy` (activity level)
- Multiple cycle operators can coexist, enabling nested or parallel loops.

Additional cycles beyond the curated rails (A/B) are created as explicit operators in the patch and routed via user buses or direct connections. The rail set stays small to keep the UI legible; expressiveness comes from composition, not from expanding the privileged global surface.

- These are **not** topology declarations and do not affect the TimeRoot.

---

## Patch‑Level Global Rails (aka "Rails")

Every patch contains a small, fixed set of **Global Rails** (phase/pulse/energy/palette) without requiring explicit blocks on the canvas.

These rails are conceptually distinct from user-created buses. Rails are curated, patch-global modulation channels with explicit drive policy (normalled/patched/mixed). Buses are arbitrary routing fabric created by the user.

These overlay cycles:
- Are compiled as hidden PhaseFromTime operators
- Publish to reserved rails (phaseA, phaseB, pulseA, pulseB, energy, palette)
- Are part of the patch’s time semantics, not user graph topology

The overlay exists so that:
- New patches always have usable phase and pulse signals
- Users are not forced to wire a PhaseFromTime block just to get motion
- Cycles can be edited without polluting the graph

Overlay cycles are editable only via the Time Console UI and may be materialized into blocks for advanced users.

---

## Global Rails, Drive Policy, and Optional Bus Publication

Oscilla distinguishes:

- **Reserved bus**: `time` (Signal<time>) — infrastructure, always present.
- **Global Rails**: a fixed set of named modulation channels authored in the Time Console.
- **User buses**: arbitrary routing fabric created by the user.

### Reserved Bus: `time`

- `time` is a system-reserved bus and is always present in any bus-enabled patch.
- `time` cannot be deleted or renamed.
- `time` is published **only** by the TimeRoot.

### Global Rails

The following rails always exist in a patch:

- `phaseA` (Signal<phase>)
- `phaseB` (Signal<phase>)
- `pulseA` (Event or Signal<Unit> with edge semantics)
- `pulseB` (Event or Signal<Unit> with edge semantics)
- `energy` (Signal<number>)
- `palette` (Signal<color> or palette-domain signal)

Rails:
- cannot be deleted
- have locked TypeDesc
- are driven by the Modulation Rack by default (normalled)

### Rail Drive Policy

Each rail has an explicit drive policy, set in the Time Console:

- **Normalled**: the Modulation Rack drives the rail (default).
- **Patched**: the Modulation Rack is disconnected for that rail; only user publishers drive it.
- **Mixed**: both rack and user publishers drive the rail; the rail’s combine rule applies.

No hidden precedence is allowed. Publishing into a Normalled rail MUST surface a policy decision in UI.

### Optional Bus Mirroring

A rail MAY be mirrored into the user bus fabric only when explicitly enabled. Mirrored rail buses:

- have locked names matching the rail (`phaseA`, `phaseB`, `pulseA`, `pulseB`, `energy`, `palette`)
- cannot be deleted or renamed
- exist solely as an interoperability bridge for the bus system

### Combine Rules

Combine rules apply only when a rail is in **Mixed** policy or when mirrored values are combined with user publishers. Defaults:

- `phaseA`, `phaseB`: last
- `pulseA`, `pulseB`: or
- `energy`: sum
- `palette`: mix

These defaults are editable only in the Time Console (not in generic bus UI).

### Compilation Order

1. TimeRoot emits `time`
2. Modulation Rack derives rails from unbounded time
3. Rails are driven according to policy (Normalled/Patched/Mixed)
4. If enabled, rail values are mirrored into the bus fabric
5. User publishers are applied
6. Bus combine is evaluated

---

## TimeRoot Ports and Bus Publishing

### FiniteTimeRoot

**Inputs:**
- `duration`: Scalar<duration> — total duration (default 5000ms)

**Outputs:**
- `systemTime`: Signal<time> (monotonic, unbounded)

**Bus Publishing:**
- `systemTime` → reserved bus `time`

### InfiniteTimeRoot

**Inputs:**
- *(No required inputs; optional ambient parameters may be implemented as derived operators)*

**Outputs:**
- `systemTime`: Signal<time> (monotonic, unbounded)

**Bus Publishing:**
- `systemTime` → reserved bus `time`

### Notes

- TimeRoot publishes only the reserved `time` bus.
- Phase/pulse/energy/palette are produced by the Modulation Rack (or explicit operators) and routed via rails and optional mirroring.

---

## PhaseFromTime (Secondary Clock / Derived Phase)

PhaseFromTime is a **derived operator** that produces phase and cycle signals from an unbounded time input.

The Modulation Rack compiles to a small set of PhaseFromTime/Energy/Palette operators wired to the Global Rails.

- **Inputs (one required):**
  - `tIn`: Signal<time> OR
  - `phaseIn`: Signal<phase> (optional alternative)

- **Configuration:**
  - `period`: Scalar<duration> (must be > 0)
  - `mode`: Scalar<enum('loop'|'pingpong'|'once')>
  - `rate`: Signal<number> (optional, default 1)
  - `phaseOffset`: Signal<phase> (optional)
  - `reset`: Event (optional, deterministic)

- **Outputs:**
  - `phase`: Signal<phase> (0..1 clamped or wrapped depending on mode)
  - `u`: Signal<unit> (clamped [0,1])
  - `wrap`: Event (cycle boundary)
  - `cycleIndex`: Signal<number>

### Semantics

For `tIn`:

```
raw = (t * rate) / period
loop:     phase = frac(raw + offset)
once:     phase = clamp(raw + offset, 0, 1)
pingpong: phase = triangle(raw + offset)
```

- Uses unbounded `t`. No dependence on player `maxTime`.
- Never topology; always derived from TimeRoot time.

---

## Phase Scrubbing

**Scrubbing never resets state.**

| Action         | Effect                                  |
|----------------|-----------------------------------------|
| Scrub in finite | Sets absolute time `t`                  |
| Scrub in infinite | Offsets time origin                    |
| Scrub in cycle operators | Sets phase offset                  |

Requires:
- Phase offset injection
- NOT resetting player time
- NOT reinitializing patch state

---

## Signals and Fields Under TimeRoot

### Signals

- Receive unbounded monotonic `t`
- Phase generators and cycle operators map `t` to phase and cycle signals
- Multiple phase generators can coexist
- Signals never assume `t` wraps

### Fields

- Inherit phase indirectly
- Field expressions remain lazy
- No bulk re-evaluation on wrap
- Looping is topological, not evaluative

---

## Determinism Guarantees

- Player time is monotonic and never wraps
- Phase signals are deterministic functions of time and parameters
- Scrubbing is reversible and deterministic
- Seed reinitializes only on explicit user action

---

## Failure Is Explicit

Illegal cases are **compile errors**, not runtime hacks:

- Multiple or zero TimeRoots in a patch
- TimeRoot with upstream dependencies
- TimeRoot inside composite definitions
- Conflicting time topologies (e.g., finite + infinite)
- Phase reset without a state boundary
- PhaseFromTime (or equivalent) without time input
- PhaseFromTime with both `tIn` and `phaseIn` connected
- Period ≤ 0 in cycle operators

---

## Implementation Mapping

- The compiler outputs:
  - **Program**: the patch’s computational graph
  - **TimeModel**: describing the patch’s time topology (`finite` or `infinite`)
- Runtime state includes:
  - Monotonic time `tMs` (milliseconds since patch start), unbounded and never wrapped
- The player:
  - Receives the `TimeModel`
  - Configures playback viewport/scrub window accordingly
  - Implements view-time mapping and looping modes for finite patches
  - Never wraps or resets the monotonic time `tMs`

---

## Playback Policy

- For **finite** patches, the player supports playback view modes:
  - `once`: play from 0 to duration without looping
  - `loop`: repeat playback continuously
  - `pingpong`: play forward then backward repeatedly
- These modes affect only the *view-time* mapping (`tView`) used for scrubbing and rendering
- The underlying monotonic time `t` is never wrapped or reset
- For **infinite** patches, playback is always monotonic sliding window, no looping or wrapping

---
# Time Console & Modulation Rack — Authoritative UI and Runtime Specification

This document specifies the **Time Console** and **Modulation Rack** systems for Oscilla. It is normative and implementation-facing.

---

## 1. Purpose

The Time Console is the **authoring surface for time**. It replaces any cycle or loop UI previously attached to the Player. The Player is a viewer/transport only.

Time authoring is split into two orthogonal layers:

- **TimeRoot** (topology): Finite or Infinite
- **Modulation Rack** (Global Rails): derived modulation lanes (Phase A/B, Pulse A/B, Energy, Palette)

The Modulation Rack provides **normalled** (default) patch‑level modulation so a new patch moves immediately without wiring. These rails are conceptually distinct from user-created buses:

- **Rails** are a small, fixed set of named modulation channels curated by the app.
- **Buses** are arbitrary user routing fabric (many, configurable, combinable).

Cycles are not topology. They are derived operators that transform the root time signal.

---

## 2. UI Placement

The Time Console MUST be visible whenever a patch is open.

It MAY appear as:
- A panel inside the Inspector
- Or a dedicated right-rail tab next to Buses / Debug

It MUST NOT live in the Player.

---

## 3. TimeRoot Editor (Topology)

Exactly one TimeRoot exists per patch.

### 3.1 Types

The only valid TimeRoots are:

```
FiniteTimeRoot
InfiniteTimeRoot
```



### 3.2 FiniteTimeRoot UI

Controls:
- Duration (ms or musical time)
- Cue points (optional)
- Playback policy (view-only):
  - Once
  - Loop
  - Ping-pong

This policy applies to **view-time (tView)**, not the actual root time signal.

### 3.3 InfiniteTimeRoot UI

Controls:
- Minimal: TimeChip
  - Small round 
- Expanded: 

The root time signal always increases monotonically.

## 3.4 Default Modulation Provisioning

When a new patch is created, the Modulation Rack is provisioned so the preview animates immediately:

- **Cycle A** is enabled with period = 2.0s, mode = loop, feeding **phaseA** and **pulseA** rails.
- **Cycle B** is disabled by default (but present) with period = 3.125s, mode = loop, feeding **phaseB** and **pulseB** rails when enabled.
- **Energy** and **Palette** lanes are enabled with default generators.

Rails always exist; lane enablement controls whether the rack actively drives them.

---

## 4. Modulation Rack (Global Rails)

The Modulation Rack is a **patch-level derived modulation system** that generates phase/pulse/energy/palette signals without cluttering the graph.

It is authored in the Time Console and compiled as hidden operators. These operators feed **Global Rails** by default (normalled), and may optionally publish into the user bus fabric when explicitly enabled.

### 4.1 Canonical Cycles

The patch has a fixed set of cycle lanes:

| Lane     | Default | Outputs                                  |
|----------|---------|------------------------------------------|
| Cycle A  | On      | phaseA (rail), pulseA (rail), cycleIndexA (internal)               |
| Cycle B  | Off     | phaseB (rail), pulseB (rail), cycleIndexB (internal)               |
| Energy   | On      | energy (rail)                                    |
| Palette  | On      | palette (rail)                                   |

These are not blocks on the canvas.

### 4.2 Cycle Lane Controls

Each cycle lane exposes:

- Period
- Mode: loop | pingpong | once
- Phase offset
- Rate multiplier
- Enable toggle
- Rail publish toggles per output

Example:
- phaseA → rail `phaseA`
- pulseA → rail `pulseA`
- energy → rail `energy`
- palette → rail `palette`

Defaults on new patch:
- Cycle A enabled, publishing phaseA + pulseA
- Energy + Palette enabled
- Cycle B disabled

### 4.3 Rail Drive Policy (Normalled vs Patched)

Each rail has an explicit drive policy, set in the Time Console:

- **Normalled**: the Modulation Rack drives the rail (default).
- **Patched**: the Modulation Rack is disconnected for that rail; only user publishers drive it.
- **Mixed**: both rack and user publishers drive the rail; the rail’s combine rule applies.

No hidden precedence is allowed. If a user publishes to a rail while it is Normalled, the UI MUST surface this and require an explicit policy choice.

---

## 6. Compilation

The compiler MUST:

1. Compile TimeRoot → root time signal
2. Compile Modulation Rack → derived SignalExpr operators
3. Feed Global Rails before any user blocks execute
4. If enabled, publish selected rail signals into the user bus fabric

Rack publishers behave like normal publishers but are marked:

```
origin = 'timeOverlay'
```

---

## 8. Player Interaction

The Player receives:

- TimeModel from compiler
- Uses view-time mapping only

The Player UI shows:
- TimeModel badge (Finite 12.0s / Infinite)
- View playback mode (once/loop/pingpong)

It does NOT show cycles.

The Player never edits or owns cycles. It only displays the TimeModel and current view‑time mapping.
All cycle editing happens in the Time Console.

## 8.1 Cycle UI Placement

All cycle and phase authoring occurs in the Time Console.

The Player UI is limited to:
- TimeModel badge (Finite / Infinite)
- View playback mode for finite patches (Once / Loop / Ping‑pong)
- speed, and run/freeze
- Note: Scrubbing has been DEFERRED

The Player MUST NOT contain any cycle, phase, or period editing UI.

Rail rows (phaseA, phaseB, pulseA, pulseB, energy, palette) MUST include a shortcut to open the Time Console to the corresponding Modulation Rack lane. These rails MAY be rendered in the Bus Board as a pinned “Global Rails” group, but they are not treated as ordinary user buses.

---

## 9. Why This Exists

This architecture gives:
- Cycles by default
- Infinite nesting via operators
- Zero canvas clutter
- Determinism
- Debuggability
- Rust/WASM-friendly IR

This is the canonical design for Oscilla time authoring.# Time Console & Modulation Rack — Authoritative UI and Runtime Specification

## 1. Overview

Time authoring is split into two orthogonal layers:

- **TimeRoot** (topology): Finite or Infinite
- **Modulation Rack** (Global Rails): derived modulation lanes (Phase A/B, Pulse A/B, Energy, Palette)

The Modulation Rack provides **normalled** (default) patch‑level modulation so a new patch moves immediately without wiring. These rails are conceptually distinct from user-created buses:

- **Rails** are a small, fixed set of named modulation channels curated by the app.
- **Buses** are arbitrary user routing fabric (many, configurable, combinable).

Cycles are not topology. They are derived operators that transform the root time signal.

## 2. TimeRoot

...

## 3. Time and Modulation Layers

...

### 3.4 Default Modulation Provisioning

When a new patch is created, the Modulation Rack is provisioned so the preview animates immediately:

- **Cycle A** is enabled with period = 2.0s, mode = loop, feeding **phaseA** and **pulseA** rails.
- **Cycle B** is disabled by default (but present) with period = 3.125s, mode = loop, feeding **phaseB** and **pulseB** rails when enabled.
- **Energy** and **Palette** lanes are enabled with default generators.

Rails always exist; lane enablement controls whether the rack actively drives them.

## 4. Modulation Rack (Global Rails)

The Modulation Rack is a **patch-level derived modulation system** that generates phase/pulse/energy/palette signals without cluttering the graph.

It is authored in the Time Console and compiled as hidden operators. These operators feed **Global Rails** by default (normalled), and may optionally publish into the user bus fabric when explicitly enabled.

### 4.1 Canonical Cycles

| Cycle   | Description              | Outputs                                      |
|---------|--------------------------|----------------------------------------------|
| Cycle A | Primary cycle lane       | `phaseA` (rail), `pulseA` (rail), `cycleIndexA` (internal) |
| Cycle B | Secondary cycle lane     | `phaseB` (rail), `pulseB` (rail), `cycleIndexB` (internal) |
| Energy  | Energy envelope lane     | `energy` (rail)                              |
| Palette | Palette modulation lane  | `palette` (rail)                             |

### 4.2 Cycle Lane Controls

...

### 4.3 Rail Drive Policy (Normalled vs Patched)

Each rail has an explicit drive policy, set in the Time Console:

- **Normalled**: the Modulation Rack drives the rail (default).
- **Patched**: the Modulation Rack is disconnected for that rail; only user publishers drive it.
- **Mixed**: both rack and user publishers drive the rail; the rail’s combine rule applies.

No hidden precedence is allowed. If a user publishes to a rail while it is Normalled, the UI MUST surface this and require an explicit policy choice.

---

## 5. User Buses and Routing Fabric

...

## 6. Compilation

The compiler MUST:

1. Compile TimeRoot → root time signal
2. Compile Modulation Rack → derived SignalExpr operators
3. Feed Global Rails before any user blocks execute
4. If enabled, publish selected rail signals into the user bus fabric

Rack publishers behave like normal publishers but are marked:

```
origin = 'timeOverlay'
```

## 7. Runtime Behavior

...

## 8. UI Integration

### 8.1 Cycle UI Placement

Rail rows (phaseA, phaseB, pulseA, pulseB, energy, palette) MUST include a shortcut to open the Time Console to the corresponding Modulation Rack lane. These rails MAY be rendered in the Bus Board as a pinned “Global Rails” group, but they are not treated as ordinary user buses.

...

---

## Global Rails, Drive Policy, and Optional Bus Publication

Oscilla distinguishes:

- **Reserved bus**: `time` (Signal<time>) — infrastructure, always present.
- **Global Rails**: a fixed set of named modulation channels authored in the Time Console.
- **User buses**: arbitrary routing fabric created by the user.

### Reserved Bus: `time`

- `time` is a system-reserved bus and is always present in any bus-enabled patch.
- `time` cannot be deleted or renamed.
- `time` is published **only** by the TimeRoot.

### Global Rails

The following rails always exist in a patch:

- `phaseA` (Signal<phase>)
- `phaseB` (Signal<phase>)
- `pulseA` (Event or Signal<Unit> with edge semantics)
- `pulseB` (Event or Signal<Unit> with edge semantics)
- `energy` (Signal<number>)
- `palette` (Signal<color> or palette-domain signal)

Rails:
- cannot be deleted
- have locked TypeDesc
- are driven by the Modulation Rack by default (normalled)

### Rail Drive Policy

Each rail has an explicit drive policy, set in the Time Console:

- **Normalled**: the Modulation Rack drives the rail (default).
- **Patched**: the Modulation Rack is disconnected for that rail; only user publishers drive it.
- **Mixed**: both rack and user publishers drive the rail; the rail’s combine rule applies.

No hidden precedence is allowed. Publishing into a Normalled rail MUST surface a policy decision in UI.

### Optional Bus Mirroring

A rail MAY be mirrored into the user bus fabric only when explicitly enabled. Mirrored rail buses:

- have locked names matching the rail (`phaseA`, `phaseB`, `pulseA`, `pulseB`, `energy`, `palette`)
- cannot be deleted or renamed
- exist solely as an interoperability bridge for the bus system

### Combine Rules

Combine rules apply only when a rail is in **Mixed** policy or when mirrored values are combined with user publishers. Defaults:

- `phaseA`, `phaseB`: last
- `pulseA`, `pulseB`: or
- `energy`: sum
- `palette`: mix

These defaults are editable only in the Time Console (not in generic bus UI).

### Compilation Order

1. TimeRoot emits `time`
2. Modulation Rack derives rails from unbounded time
3. Rails are driven according to policy (Normalled/Patched/Mixed)
4. If enabled, rail values are mirrored into the bus fabric
5. User publishers are applied
6. Bus combine is evaluated

---

### TimeRoot Ports and Bus Publishing

...

### Notes

- TimeRoot publishes only the reserved `time` bus.
- Phase/pulse/energy/palette are produced by the Modulation Rack (or explicit operators) and routed via rails and optional mirroring.

---

### Derived Cycle and Phase Operators

Multiple cycle operators can coexist, enabling nested or parallel loops.

Additional cycles beyond the curated rails (A/B) are created as explicit operators in the patch and routed via user buses or direct connections. The rail set stays small to keep the UI legible; expressiveness comes from composition, not from expanding the privileged global surface.

---

### PhaseFromTime (Secondary Clock / Derived Phase)

PhaseFromTime is a derived operator that converts unbounded time into normalized phase signals.

The Modulation Rack compiles to a small set of PhaseFromTime/Energy/Palette operators wired to the Global Rails.

...
Yes — and this is the moment where the design either becomes modular or collapses back into a brittle special-case.

Let me be very clear about the architecture.

What you have right now:

“Rails are driven by the Time Console (cycles) and optionally mirrored into buses.”

That is only half of a modular system.

A true modular system must also allow the inverse:

Rails can be driven by the graph.

Otherwise:
	•	Phase A and Phase B are not oscillators
	•	They are just hardcoded metronomes
	•	And you’ve re-invented a timeline with two knobs

That would absolutely cap the system’s expressive ceiling.

⸻

The real abstraction

The correct abstraction is:

A Rail is a named, patch-global signal endpoint with a drive policy.

It is not:
	•	a clock
	•	a cycle
	•	a bus
	•	or a block

It is a binding point.

Just like in modular synths:
	•	CV in
	•	CV out
	•	normalled when nothing is patched
	•	overridden when something is patched

You already invented this when you created Normalled / Patched / Mixed.
You just hadn’t finished the thought yet.

⸻

How modular synths actually do this

On a real Eurorack module:

There is a jack called LFO 1.

Internally:
	•	It is driven by an oscillator.

But when you plug a cable into it:
	•	The internal oscillator is disconnected.
	•	Whatever voltage comes from the cable becomes the LFO.

That is exactly what Rails must be.

⸻

What this means for Oscilla

Each Rail (phaseA, phaseB, energy, palette…) has:
	•	A default internal generator (from the Time Console)
	•	A patchable external input (from buses)
	•	A combine rule if both are active

The drive policy defines which one wins.

So yes:

The Time Console must expose a way to bind each Rail to a Bus.

This is not optional.

⸻

The three drive modes, concretely

For every Rail:

Mode	Meaning
Normalled	Use the internal generator from the Time Console
Patched	Ignore internal generator, take value from a Bus
Mixed	Combine internal + bus using rail’s combine rule

This is identical to:
	•	Normalled jack
	•	Patched jack
	•	Summed CV

⸻

What breaks if you don’t allow this

If Rails cannot be driven by buses, then:
	•	You cannot:
	•	sync a cycle to an event
	•	reset a phase
	•	slave a clock
	•	quantize rhythm
	•	side-chain motion
	•	or do generative timing

You end up with:
	•	Two nice oscillators
	•	That are forever isolated from the rest of the patch

That is not modular.
That is decorative.

⸻

The correct UI

In the Time Console, for each Rail row:

You must have:
	•	Source selector:
	•	Internal
	•	Bus
	•	Both
	•	If Bus or Both:
	•	A bus picker

Example:

Phase A:
  [ Internal ⬤ ] [ Bus ○ ] [ Both ○ ]
  Bus:  (none)

Pulse A:
  [ Internal ○ ] [ Bus ⬤ ] [ Both ○ ]
  Bus:  KickTriggers

That is the exact UI pattern of modular synths.

⸻

This makes the whole system click

Now:
	•	You can use Phase A internally for:
	•	basic motion
	•	Or override it with:
	•	a sequencer
	•	a beat detector
	•	a MIDI clock
	•	another phase generator

And the rest of the patch doesn’t know or care.

That is the whole point of Rails.

⸻

Question: But how do I actually implement this?  Doesn't the graph need to be acyclic?

----

So yes, your instinct was correct:

“I’m not sure the system will work if we don’t allow cycles like that.”

It won’t.

But once you allow Rails to be driven by buses,
it becomes a real modulation system instead of a dressed-up timeline.

You’re right to worry. If you naïvely “wire bus → rail → bus” you can create real cycles.

The trick is: a Rail is not a node in the user graph. It’s an externally scheduled endpoint with explicit rules about where it may be read/written, and (if you allow feedback) the feedback must cross a state boundary.

Here’s the clean, long-term implementation spec.

⸻

1) Model Rails as “named runtime registers”, not graph nodes

In the compiler’s dependency graph, do not create RailValue nodes that participate in topo sort the same way blocks do.

Instead, treat Rails as:
	•	Inputs to user blocks (read-only)
	•	Optional outputs of the Time Console overlay (write-only, scheduled first)
	•	Optional outputs of the user graph (write-only, scheduled after overlay)

At runtime, Rails live in a dedicated store:

type RailId = 'phaseA'|'phaseB'|'pulseA'|'pulseB'|'energy'|'palette'|...;

interface RailStore {
  signal: Record<RailId, SignalExprId>; // or handles into value store
  meta: Record<RailId, { driveMode: 'internal'|'bus'|'both'; combine: CombineMode; ... }>;
}

Think “register file”.

⸻

2) Define a strict evaluation schedule with phases

Your runtime already wants a scheduled model (good). Use it.

Schedule phases per frame

Phase 0 — TimeRoot
	•	Produce time (monotonic).

Phase 1 — Time Console overlay
	•	Compute internal rail candidates: railInternal[railId].

Phase 2 — User graph
	•	Evaluate user blocks in topo order with rail reads allowed.
	•	Compute user rail publishers: railUser[railId] (if any).

Phase 3 — Resolve rails
	•	For each rail:
	•	apply drive policy (normalled/patched/mixed)
	•	produce final railFinal[railId]
	•	Publish railFinal to bus fabric only if “mirroring” is enabled (your current spec).

Phase 4 — Render sinks
	•	RenderInstances2D materializes fields, produces RenderTree.

This gives you determinism and makes “rails” feel like a global control voltage plane.

⸻

3) Where the acyclic constraint actually applies

Acyclic applies to:
	•	User block → user block connections
	•	User publishers/listeners between blocks and buses
	•	Anything that the compiler schedules via topo sort

Acyclic does not need to apply to:
	•	Reading a rail (it’s just reading the current frame’s resolved value)
	•	Writing to a rail (it’s writing a staged value that is resolved later)

Because rails are resolved by the schedule, not by graph edges.

⸻

4) Preventing illegal feedback loops

Even with staged rails, you can still create semantic feedback like:
	•	energy drives something that publishes back into energy

That is a feedback loop across frames if you allow it, and it must be explicit.

Rule: Rail writes cannot depend on the same-frame final rail value

Concretely:
	•	In Phase 2, user blocks may read railFinal from previous frame (or “current frame pre-resolve” — pick one, but be explicit).
	•	In Phase 3, railFinal for this frame is computed.

This creates a deliberate 1-frame delay boundary, which is equivalent to a memory block.

This is exactly how modular synth feedback works in practice: the cable loop exists, but the system has finite propagation and state.

Choose one of these two semantics (pick and lock it):

Option A (recommended): Rails are “frame-latched”.
	•	Reads in Phase 2 see railFinal[t-1].
	•	Writes affect railFinal[t].
	•	This guarantees no instantaneous algebraic loops, ever.

Option B: Rails are “same-frame” but require memory boundary detection.
	•	Reads see railFinal[t].
	•	Then you must SCC-detect cycles that go through rails and require a state block.
	•	This is harder and will bite you.

If you care about performance + determinism + debuggability: Option A.

⸻

5) How “Rail driven by Bus” works without cycles

When a rail is in Patched or Mixed mode with a selected bus source:
	•	You are not actually wiring “bus graph → rail graph”.
	•	You are selecting a bus value handle to sample during the rail resolve step.

Implementation:
	•	During compilation, precompute for each rail:
	•	sourceBusId?: BusId
	•	sourceAdapterChain?: AdapterStep[] (optional)
	•	driveMode

At runtime Phase 3:

const busValue = evalBus(sourceBusId)           // bus evaluation is already well-defined
const adapted = applyAdapters(busValue, chain)
railUserCandidate = adapted
railFinal = resolve(railInternalCandidate, railUserCandidate, driveMode, combineMode)

Key point: rail resolve happens after user graph evaluation, so bus evaluation is already complete for the frame.

And with frame-latched reads, even if bus evaluation uses rails, it’s using the previous frame’s rails, so you stay acyclic.

⸻

6) Compiler changes (minimal but “right”)

You add a new compilation product:

interface CompiledTimeOverlay {
  internal: Record<RailId, SignalExprId>; // generated from Time Console (cycles, palette gen, etc.)
  policy: Record<RailId, RailPolicy>;     // normalled/patched/mixed + combine rules
  busBindings: Record<RailId, null | { busId: string; adapters?: AdapterStep[] }>;
}

And the compiled program becomes:

interface CompiledProgram {
  schedule: {
    timeRoot: Step[];
    overlay: Step[];
    userGraph: Step[];      // topo-ordered block steps
    railResolve: Step[];    // deterministic per-rail
    render: Step[];
  };
  valueStoreLayout: ...;    // indexed handles for speed + Rust path
}

No rails appear as nodes in the topo graph.

⸻

7) Diagnostics you absolutely need

When a user picks “Bus” as a rail source:
	•	If the selected bus ultimately depends on that same rail in a way that creates same-frame dependency, that’s fine under frame-latched semantics but you must surface it as:

“This creates a feedback loop via rail energy. Oscilla will apply a 1-frame delay automatically (rail is frame-latched).”

And show in power-user debug:
	•	rail read = previous frame
	•	rail write = current frame

So nobody goes insane.

⸻

Bottom line

You keep the user graph acyclic by:
	1.	Taking rails out of the dependency graph
	2.	Resolving rails in a dedicated schedule phase
	3.	Making rail reads frame-latched (effectively a built-in memory boundary)

That gives you:
	•	no algebraic loops
	•	deterministic behavior
	•	clean debug story
	•	easy Rust/WASM implementation (it’s just a register file + schedule)

If you want, next I can write the exact TypeScript types for RailPolicy, CompiledTimeOverlay, and the runtime RailStore/resolve algorithm so engineers can implement it without inventing anything.NOTE: this work has been DEFERRED until the new compiler architecture is in place

### 4.3 Bus Binding & Publication Policy

Each Cycle Overlay lane has explicit bus publication controls.

For each output (phase, pulse, cycleIndex, energy, palette), the Time Console MUST show:
- Target bus
- Enabled/disabled toggle
- Conflict indicator if user publishers exist

When user publishers target a reserved bus, the Time Console MUST expose a precedence selector for that bus:

- Overlay only
- User only
- Mixed

Changing this policy immediately enables/disables overlay publishers for that bus.

No implicit overrides are permitted.

---

## 5. PatchTimeOverlay Data Model

Add to Patch:

```
timeOverlay: {
  cycles: {
    A: CycleSpec,
    B: CycleSpec,
    energy: EnergySpec,
    palette: PaletteSpec
  }
}
```
---


## 7. Debugging & Transparency

The system MUST support:

- **Reveal in Graph** — show generated operators as read-only nodes
- **Convert to Blocks** — materialize overlay cycles onto canvas
- **Provenance** — bus values show source `TimeOverlay.CycleA.phase`# Buses

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
| `last` | Last publisher wins (by sortKey) | phaseA, palette, progress |
| `sum` | Values are summed | energy |
| `or` | Events are merged | pulse |

## Canonical Bus Set

These buses are reserved names with reserved semantics. The UI and default macros rely on them.

### Required Buses by TimeRoot Kind

> **⚠️ PROVISIONAL (2025-12-23):** The unified auto-publication across all TimeRoot types is under evaluation. This provides API consistency but the original spec had minimal publications per TimeRoot type. FiniteTimeRoot originally only published `progress`; InfiniteTimeRoot originally published nothing (phase/pulse came from explicit PhaseClock blocks).

All TimeRoot types auto-publish to the standard buses for unified API.

**FiniteTimeRoot:**
- `progress` (Signal) - **required** (0..1 clamped)
- `phaseA` (Signal) - **auto-published** *(provisional)* (same as progress)
- `pulse` (Event) - **auto-published** *(provisional)* (end event)
- `energy` (Signal) - **auto-published** *(provisional)* (1.0 while running, 0 when complete)


- `phaseA` (Signal) - **auto-published** (primary phase)
- `pulse` (Event) - **auto-published** (wrap event)
- `energy` (Signal) - **auto-published** (constant 1.0)

**InfiniteTimeRoot:**
- `phaseA` (Signal) - **auto-published** *(provisional)* (ambient cycle based on periodMs)
- `pulse` (Event) - **auto-published** *(provisional)* (ambient cycle boundary)
- `energy` (Signal) - **auto-published** *(provisional)* (constant 1.0)

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
- Combine: `or`

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

All TimeRoot blocks auto-publish to the canonical buses for unified API:


- `phaseA` <- TimeRoot.phase
- `pulse` <- TimeRoot.wrap
- `energy` <- TimeRoot.energy

**FiniteTimeRoot publishes:**
- `progress` <- TimeRoot.progress
- `phaseA` <- TimeRoot.phase *(provisional)*
- `pulse` <- TimeRoot.end *(provisional)*
- `energy` <- TimeRoot.energy *(provisional)*

**InfiniteTimeRoot publishes:** *(all provisional)*
- `phaseA` <- TimeRoot.phase (ambient cycle)
- `pulse` <- TimeRoot.pulse (ambient cycle boundary)
- `energy` <- TimeRoot.energy

This is automatic - the compiler ensures these are published.

### Secondary Clock Publishing

PhaseClock typically publishes:
- `phaseB` <- PhaseClock.phase
- `pulse` <- PhaseClock.wrap (optional merge)
- `energy` <- envelope(phaseB) (if used as LFO)

These are authored by the patch or templates.

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
# Adapters

## Overview

Adapters (also called Lenses) are type conversion operations that transform values between compatible types. They are attached to listener bindings, not to buses themselves.

## Core Principle

**Adapters are unary-only and attached to listener bindings.**

They are:
- Pure and stateless
- Applied at read time
- Part of the perception stack

Stateful transforms are blocks, not adapters.

## Adapter Categories

### 1. Cast Adapters
Convert between related types without loss.

| From | To | Adapter |
|------|-----|---------|
| `Signal<phase>` | `Signal<number>` | `phaseToNumber` |
| `Signal<unit>` | `Signal<number>` | `unitToNumber` |
| `number` | `phase` | `numberToPhase` (with wrap) |

### 2. Lift Adapters
Promote from one world to another.

| From | To | Adapter |
|------|-----|---------|
| `Scalar<T>` | `Signal<T>` | `constSignal` |
| `Signal<T>` | `Field<T>` | `broadcast` |
| `Scalar<T>` | `Field<T>` | `constField` |

### 3. Reduce Adapters
Collapse from many to one.

| From | To | Adapter |
|------|-----|---------|
| `Field<number>` | `Signal<number>` | `fieldSum` |
| `Field<number>` | `Signal<number>` | `fieldMean` |
| `Field<number>` | `Signal<number>` | `fieldMax` |

### 4. Lens Adapters
Shape values without changing type.

| Type | Adapter | Description |
|------|---------|-------------|
| `Signal<number>` | `scale(factor)` | Multiply by constant |
| `Signal<number>` | `offset(amount)` | Add constant |
| `Signal<number>` | `clamp(min, max)` | Clamp to range |
| `Signal<number>` | `smooth(rate)` | Exponential smoothing |
| `Signal<phase>` | `warp(curve)` | Phase warping |

## Perception Stack

A listener can have multiple adapters chained:

```
bus.energy -> [scale(0.5)] -> [smooth(0.1)] -> [clamp(0,1)] -> block.input
```

This is the "perception stack" - how this particular listener perceives the bus.

## Adapter Declaration

Adapters are declared per-binding:

```typescript
interface BusBinding {
  busId: BusId
  portRef: PortRef
  adapters: AdapterId[]  // Applied in order
}
```

## Required Adapters for Golden Patch

1. `Signal<T>` -> `Field<T>` (broadcast)
2. `Field<phase>` wrapping semantics (wrap/pingpong)
3. `Event` merge (or) - bus combine
4. `Signal<number>` shaping/clamp

## UI for Adapters

Binding UI shows:
- Source bus
- Adapter chain (editable)
- Type before/after each adapter
- Preview of transformed value

## Constraints

- Adapters must be type-safe (compiler verifies)
- Adapters cannot introduce state
- Adapters cannot change domain identity
- Adapters are deterministic
# Compilation

## Compiler Pipeline

```
Patch JSON
    |
    v
Graph Build (blocks, connections, bus bindings)
    |
    v
Validation (types, topology, constraints)
    |
    v
TimeRoot Analysis -> TimeModel
    |
    v
Bus Resolution (publishers, listeners, combine)
    |
    v
SCC Detection (feedback analysis)
    |
    v
Artifact Compilation
    |
    v
CompiledProgram { program, timeModel, uiBindings }
```

## Compiler Output Contract

```typescript
interface CompiledProgram {
  program: Program<RenderTree>
  timeModel: TimeModel
}
```


**UI Integration**: UI reads `CompileResult.compiledPortMap` and `CompileResult.timeModel` for introspection. No separate binding layer needed.
## TimeModel Inference

The compiler analyzes the patch graph and infers the time model.

**Rules (deterministic):**

2. If any feedback loop crosses memory blocks without full cycle closure -> infinite
3. If only FiniteTimeRoot exists -> finite
4. If conflicting models exist -> error (patch invalid)

**There is no fallback.**

## Validation Passes

### 1. Type Checking
- Port type compatibility
- Bus type matching
- Adapter validity
- World/domain agreement

### 2. Topology Validation
- Exactly one TimeRoot
- TimeRoot has no upstream dependencies
- No TimeRoot in composites
- Time-derived blocks connect to TimeRoot

### 3. Bus Validation
- Reserved bus type enforcement
- Required buses present for TimeRoot kind
- Publisher ordering deterministic

### 4. SCC Analysis
- Detect strongly connected components
- Verify memory boundaries on cycles
- Flag illegal feedback loops

## Error System

### Error Structure

```typescript
interface CompileError {
  code: string
  severity: 'error' | 'warning'
  title: string
  message: string
  details?: string[]
  locations?: ErrorLocation[]
  help?: { label: string, action: FixAction }[]
}
```

### Error Locations

```typescript
type ErrorLocation =
  | { kind: 'Block', blockId: string }
  | { kind: 'Port', blockId: string, portId: string }
  | { kind: 'Bus', busId: string }
  | { kind: 'Edge', from: PortRef, to: PortRef }
  | { kind: 'SCC', nodes: GraphNodeId[] }
```

## Error Taxonomy

### TimeRoot Errors (TR-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| TR-001 | No Time Topology | 0 TimeRoot blocks |
| TR-002 | Conflicting Time Topology | >1 TimeRoot blocks |
| TR-003 | TimeRoot cannot be driven | Inputs connected to TimeRoot |
| TR-004 | Invalid Composite Definition | TimeRoot inside composite |

### TimeModel Errors (TM-xxx)

| Code | Title | Condition |
|------|-------|-----------|


| TM-103 | Reserved bus has wrong type | Type mismatch on reserved bus |
| TM-104 | Missing required system bus | Required bus not bound |

### PhaseClock Errors (PC-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| PC-201 | PhaseClock needs time input | Neither tIn nor phaseIn connected |
| PC-202 | Ambiguous PhaseClock input | Both tIn and phaseIn connected |
| PC-203 | Invalid clock period | period <= 0 |

### Feedback Errors (FB-xxx)

| Code | Title | Condition |
|------|-------|-----------|
| FB-301 | Illegal feedback loop | SCC with no memory boundary |
| FB-302 | Feedback loop not fully buffered | Some cycle paths bypass memory |
| FB-303 | Finite topology conflicts with feedback | Unbounded feedback in FiniteRoot |

## Composite Resolution

Composites are resolved (expanded) during compilation:
- Internal nodes get stable IDs from composite instance + internal key
- Bus bindings are preserved through expansion
- State keys are derived from composite context

## Dependency Graph

The compiler builds a unified dependency graph with:
- BlockOut nodes (block outputs)
- BusValue nodes (combined bus values)
- Publisher edges
- Listener edges

Deterministic ordering via sortKey + stable ID.

## Compile-Time Assertions

The compiler enforces at compile time:
- World mismatches (signal vs field)
- Domain mismatches (phase vs number)
- Illegal cycles (feedback without memory)

These become compile errors, not runtime issues.
# Runtime & Hot Swap

## Runtime Model

The runtime evaluates compiled programs frame by frame, maintaining deterministic state.

### Evaluation Loop
```
while running:
    t += dt * speed
    ctx = { t, seed, dt, runState }
    output = program.run(ctx)
    render(output)
```

Key properties:
- `t` is monotonic and unbounded
- No wrapping or clamping of player time
- Phase wrapping happens inside phase generators
- State is preserved across frames

## Hot Swap Architecture

Hot swap is **never "replace the world immediately."** It is a deterministic two-step process.

### Two-Phase Commit

**Phase 1: Compile in background**
- Old program continues rendering continuously
- New program compiles on the side

**Phase 2: Swap at deterministic boundary**
- Swap occurs only at a Swap Boundary
- Swap is atomic on a frame boundary
- There is always exactly one program driving the preview

## Change Classification

Every edit is classified before compilation:

### Class A: Param-Only
No structural changes.

**Examples:**
- Changing a scalar value
- Tweaking a lens mapping
- Modifying a bus combine mode
- Changing color constants

**Guarantee:**
- No state reset
- Apply immediately (next frame after compile)
- No warning UI

### Class B: Structural but State-Preserving

**Examples:**
- Adding/removing a stateless block
- Rewiring stateless parts of graph
- Adding a PhaseClock (secondary)
- Changing bus subscriptions (non-critical)

**Guarantee:**
- Preserve all eligible state
- Swap occurs at safe boundary
- UI shows "Scheduled change" indicator

### Class C: Topology / Identity / State-Resetting

**Examples:**
- Changing TimeRoot kind

- Changing Domain count or element identity
- Editing memory blocks in feedback loops
- Changes that modify SCC structure

**Guarantee:**
- Explicit user acknowledgement required
- Swap is gated and can be scheduled
- State reset may be unavoidable
- UI presents choices and consequences

**No silent resets. Ever.**

## Swap Boundaries

### Frame Boundary
Always available. Swap at the next rendered frame.
- Use for Class A changes
- Also allowed for Class B if safe

### Pulse Boundary
Preferred for cyclic patches. Swap when the pulse bus fires.
- Available only if pulse bus exists in BusStore
- Used for changes that would cause phase discontinuity

### User Boundary (Freeze-Required)
Swap only when the user freezes.
- Used when Class C and cannot be made continuous

## State Preservation

### Stateful Nodes
Nodes with persistent internal memory:
- DelayLine
- Integrate
- SampleHold
- Explicit State blocks
- Renderers with per-instance caches

### StateKey
```typescript
StateKey = { blockId: string, internalKey?: string }
```

For composites: internal nodes derive stable IDs from composite instance + internalStableKey.

### State Migration
At swap time:
1. New program requests state entries by StateKey
2. Runtime copies old state if keys and types match
3. Missing or type-mismatched keys initialize to default

### Partial State Loss
If Class B change results in partial state loss:
- Surface to user: "Some state will reinitialize (2 nodes)"
- Provide inspection list for debugging

## TimeRoot-Specific No-Jank Behavior

### Changing Parameters Within Same Kind

**FiniteTimeRoot.duration:**
- If RUNNING: swap at frame boundary only if mapping can stay continuous
- Keep current progress constant, recompute localT mapping


- If RUNNING: schedule swap on pulse boundary
- If no pulse bus: require freeze
- Reason: changing period mid-cycle causes phase discontinuity

**InfiniteTimeRoot.window:**
- Always safe - frame-boundary swap, no state reset

### Changing TimeRoot Kind
This is **always Class C**.

UI requires explicit choice:
- Apply now (resets topology + view transforms)
- Apply on boundary (if going to Cycle and pulse exists)
- Apply when frozen (always available)

## Domain Identity (Element-Level No-Jank)

Domain changes are Class C unless identity is preserved.

Changing:
- Element count
- Sampling strategy
- Ordering

...is a topology/identity change.

### Allowed State-Preserving Domain Edits
- Old elements keep their IDs
- New elements get new IDs deterministically
- Removed elements disappear deterministically

If you cannot guarantee this, treat as Class C.

## Definition of "Jank"

A swap is "no-jank" if:
- No blank frame
- No flicker due to renderer clearing
- Phase continuity maintained when claimed
- State continuity maintained when claimed
- No hard reset unless explicitly confirmed

## Player & Runtime APIs

### Swap Scheduling
```typescript
player.scheduleProgramSwap(newProgram, {
  boundary: 'frame' | 'pulse' | 'freeze',
  preserveState: boolean,
})
```

### Pulse Boundary Detection
- Evaluate pulse signal each frame
- Detect rising edges
- Trigger swap when edge occurs
- If pulse not present, boundary option unavailable

## Determinism of Swap Timing

Swap boundary timing is deterministic given:
- Patch
- Seed
- Edit sequence
- User choices

Rules:
- Frame boundary = next rendered frame after compile completion
- Pulse boundary = next pulse edge after compile completion
- Freeze boundary = when user freezes after compile completion

No race conditions.
# UI Specification

## Guiding Principle

**The UI is driven exclusively by `CompiledProgram.timeModel`.**

No inference from PhaseClock. No heuristics. No player-side looping.

The current timeline player is replaced with a **Time Console**: a single area that changes structure depending on the TimeModel.

## Global Player UI (Always Present)

### Run State
- RUN / FREEZE button pair
- Live indicator:
  - `● RUNNING` when evaluating
  - `○ FROZEN` when frozen
- Freeze preserves state exactly

### Speed
- Speed control (multiplier, default 1.0)
- Applies to system time advance (dt scaling)
- Does not change topology

### Seed / Re-seed
- Seed display + edit
- Changing seed triggers explicit "Reinitialize" action with confirmation
- No implicit resets

### Compile Status
- Small status pill: `OK` / `Compiling...` / `Error`
- On compile, preview continues rendering old program until swap

### Mode Badge (Time Topology)
Prominent badge reflecting the TimeRoot:
- `FINITE`
- `CYCLE`
- `INFINITE`

This is the user's "what kind of thing am I building?" anchor.

## FINITE Mode UI

### Visual Form: Bounded Progress Bar
- `0.00s` on left
- Duration on right
- Playhead moves left to right and stops

### Controls
- Scrub (drag playhead): sets localT
- Jump to start/end

### Readouts
- Time: `1.23s / 4.50s`
- Progress: `27%`

### Behavior
- If RUN and reaches end: holds at end, shows `ENDED`
- FREEZE freezes at current local time

### Not Shown
- No infinity symbol
- No phase ring
- No wrap indicators
- No "cycle" labeling


## CYCLE Mode UI

### Visual Form: Phase Ring
Cycle mode is not a timeline. It is a phase instrument.

**Primary visualization: a phase ring (circular scrubber)**

Elements:
- Circular ring with moving indicator dot
- Wrap seam visible but subtle (tick mark at top)
- Displays `Period: 4.50s`
- Shows `Mode: Loop` or `Mode: Pingpong`

The circle prevents the "start/end" mental model.

### Primary Controls
- **Phase Scrub**: dragging around ring sets phaseOffset (does not reset state)
- **Period editor**: `Period 4.50s` (click to edit)
- **Mode toggle**: Loop/Pingpong (structural change; may require confirmation)

### Secondary Phase Lanes (Optional)
Below the main ring, optional mini-strips for:
- Phase B (if present/published)
- Other declared phases

These are read-only unless explicitly designated as scrubbable.

### Readouts
- `Phase A: 0.37`
- `Cycle #: 128`
- Wrap indicator flashes on wrap event

### Not Shown
- No "end"
- No "duration"
- No time range slider
- No global loop toggle (looping is inherent)

## INFINITE Mode UI

### Visual Form: Sliding Window Scope
Communicates: "This runs forever; you are viewing a window into it."

**Primary visualization: a scope window strip**

Elements:
- Horizontal strip representing observation window
- Labeled: `Window: 10s`
- "now" marker at right edge
- Window scrolls continuously when RUN

### Primary Controls
- **Window size editor**: `Window 10s` (click to edit)
- **View scrub**: dragging shifts timeOffset (view transform, not system time)
- **Optional "Hold View" toggle**: freezes view offset while system continues

### Readouts
- `Now: 12m 34s` (time since start)
- `View Offset: -2.3s` if user scrubs away from "now"

### Not Shown
- No loop icon
- No phase ring by default
- No suggestion of repetition
- No "Cycles Detected" inference from PhaseClocks

## Interaction Rules (All Modes)

### Scrub Never Resets State
Scrubbing changes view transforms:
- Finite: local time mapping
- Cycle: phase offset mapping
- Infinite: timeOffset mapping

NOT:
- System time resets
- State reinitialization

### Structural Changes Require Explicit Intent
Topology-changing edits (TimeRoot kind, period, duration, mode) while RUNNING:

Modal choice:
- Apply now (may reinitialize time mapping)
- Apply on next wrap (Cycle only)
- Apply when frozen

No silent application.

### Player Never Loops Time
No `loopMode` in player UI anymore.

Player only:
- Advances system time
- Freezes system time
- Scales dt



## TimeRoot Picker

TimeRoot is first-class in the editor header:

```
Time Topology
  ○ Finite
  ● Cycle
  ○ Infinite
```

Selecting changes which TimeRoot block exists (single instance).

## Bus Board UI

### Layout
Reserved buses pinned at top with "system" badge.

### Row Contents
- Type badge
- Publisher count
- Listener count
- Live scope visualization:
  - phase: ring sweep
  - pulse: tick flashes
  - energy: meter/sparkline
  - progress: bounded meter

### Binding UI
Shows:
- Source bus
- Adapter chain (editable)
- Type before/after each adapter

## Scheduled Change UI

### Class A Changes
- No UI interruption
- Subtle "Compiling..." pill
- Swap on next frame

### Class B Changes
- Small banner: "Change scheduled"
- Selector:
  - "Apply now" (if safe)
  - "On next pulse" (if available)
  - "On freeze" (always)

Defaults:
- Cycle patches: "On next pulse"
- Infinite patches: "Apply now"

### Class C Changes
Modal dialog (blocking, explicit):

**Title:** "Time topology change"

**Body:**
- What will change (mode badge)
- Whether state will reset
- When it can be applied

**Buttons:**
- Apply now
- Apply on next pulse (if available)
- Apply when frozen
- Cancel

No hidden "don't show again."

## Acceptance Criteria

1. Player never shows linear timeline in Cycle or Infinite
2. Looping is visually obvious in Cycle mode without words
3. Infinite mode never implies repetition
4. Scrubbing never causes a reset
5. UI state is derived from timeModel only
6. No "loop toggle" anywhere in player
7. PhaseClock looping does not change player UI mode
# Export

## Core Principle

**Export is a lowering pipeline, not a playback feature.**

Export does not use the player transport. Export is a compiler-driven evaluation pipeline:

```
Patch -> CompiledProgram(program, timeModel) -> ExportPlan -> Artifact(s)
```

Export is deterministic and reproducible:
- Given patch JSON + seed + export settings
- Output bytes are stable

## Export Planning

Export begins by deriving an ExportTimePlan from timeModel:

```typescript
type ExportTimePlan =
  | { kind: 'finite'; durationMs: number; sample: SamplePlan }
  | { kind: 'cyclic'; periodMs: number; loops: number; sample: SamplePlan }
  | { kind: 'infinite'; windowMs: number; durationMs: number; sample: SamplePlan }
```

**Key decision:** Even infinite exports become finite in exported media. Export chooses a finite capture duration by policy, not by hack.

## Sampling

Export is defined by an explicit sampling plan:

```typescript
interface SamplePlan {
  fps: number               // for video
  steps?: number            // for SVG keyframe sampling
  shutter?: number          // optional motion blur accumulation
}
```

Export evaluates the program at a set of times:
- Video: `t_i = i * (1000/fps)` for `i = 0..N-1`
- SVG: `t_i = i * (periodMs/steps)` for `i = 0..steps`



There is no "wrap maxTime."

## Export by TimeModel

### FiniteTimeRoot Export

**Video:**
- Export duration is exactly `durationMs`
- Frame count `N = ceil(durationMs * fps / 1000)`
- Last frame at `t = durationMs`

**SVG/CSS:**
- Keyframes sampled across [0, duration]
- CSS animation-duration = durationMs
- iteration-count = 1

No looping implied.



**Core rule: loop closure must be exact.**

For loop mode:
- Exported animation must satisfy: frame 0 == frame N (modulo tolerance)
- Sampling must align exactly to the cycle

**Video Export - Strategy A (exact-cycle frame count):**
- Choose integer N such that N/fps == periodMs/1000 exactly
- If period isn't representable: adjust fps or period to fit

**Video Export - Strategy B (phase-driven sampling - required long-term):**
- Sample phase directly: phase_i = i / N
- Evaluate program with CycleRoot.phase = phase_i
- Decouples loop closure from fps
- Guarantees loop closure across arbitrary cycle lengths

**Pingpong:**
- Export loops as pingpong (forward then backward) seamlessly
- Sample across [0..1..0] phase shape

**SVG/CSS:**
- CSS animation-iteration-count: infinite
- CSS animation-timing-function: linear
- Keyframes sampled across phase for exact closure:
  - k_i = phase_i
  - offset = i/N

### InfiniteTimeRoot Export

Infinite patches cannot be exported as "infinite." They must be captured.

**Video:**
- User chooses capture duration (default: 30s)
- Standard sampling

**SVG/CSS - Option A "Looping excerpt":**
- User chooses a cycle lens or capture-to-cycle process
- Phase-lock a chosen phase bus, OR
- Bake a segment and crossfade endpoints
- Explicitly labeled as approximation

**SVG/CSS - Option B "Finite excerpt":**
- CSS iteration-count = 1
- A "recording" of a window, not a loop

UI must not pretend infinite SVG is the same as cyclic SVG.

## Export UI

### Finite Export UI
- Duration locked to TimeRoot.duration
- Choose: fps, resolution, format

### Cycle Export UI
- Period locked to TimeRoot.period
- Controls:
  - "Export loopable clip"
  - "Frames per cycle" (explicit integer)
  - "Export by phase (exact closure)" toggle (should be default)
  - Number of loops for video (optional)
- **Loop Integrity indicator:**
  - Green when closure exact
  - Amber when approximation

### Infinite Export UI
- Capture duration slider (required)
- "Export as excerpt" (finite)
- Optional: "Attempt loopable excerpt" (marked as approximation)

## Technical Requirements

### Export Must Run Without Interactive Player
Export cannot depend on:
- Player loop mode
- Player UI
- Tick logic

Export must use:
- Compiled program + timeModel
- Deterministic evaluation context

### Phase-Driven Evaluation (Required for Cycle Export)
To guarantee closure independent of fps:
- Supply CycleRoot with phaseOverride


This is not a hack; it is the correct abstraction.

## Determinism Guarantees

Exports must:
- Embed seed in metadata (or export manifest)
- Embed export plan (fps, frames-per-cycle, capture duration)
- Produce identical output given same inputs

No hidden randomness, no wall-clock dependence.

## Export Failure Modes

Export must fail with clear errors if:
- TimeRoot missing/invalid

- Phase-driven evaluation not possible due to illegal feedback
- Non-exportable renderer feature used (SVG limitations)

When features can be approximated:
- Emit warnings and label artifact as "approximate"
# Block Registry

## Block Categories

### 1. Time/Topology Primitives
Define the fundamental time structure of the patch.

### 2. Signal Primitives
Process and generate time-indexed values.

### 3. Domain/Field Primitives
Handle element identity and per-element computation.

### 4. Render Primitives
Produce visual output from fields and signals.

### 5. Composites
Pre-built combinations of primitives for common patterns.

---

## Time/Topology Primitives

> **⚠️ PROVISIONAL (2025-12-23):** The unified output set across all TimeRoot types (phase, pulse, energy auto-publication) is under evaluation. This design provides API consistency but may be revised based on user feedback. Original spec had more minimal outputs per TimeRoot type.


**Role:** TimeRoot

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| periodMs | Scalar<duration> | Cycle period (default 3000ms) |
| mode | Scalar<enum> | 'loop' or 'pingpong' |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| systemTime | Signal<time> | Monotonic time in ms |
| cycleT | Signal<time> | Time within current cycle (0..period) |
| phase | Signal<phase> | 0..1 wrapped at period |
| wrap | Event | Fires on cycle boundary |
| cycleIndex | Signal<number> | Number of completed cycles |
| energy | Signal<number> | Constant 1.0 baseline |

**Auto-publishes:** `phase` -> `phaseA`, `wrap` -> `pulse`, `energy` -> `energy`

### FiniteTimeRoot
**Role:** TimeRoot

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| duration | Scalar<duration> | Total duration (default 5000ms) |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| systemTime | Signal<time> | Monotonic time in ms |
| progress | Signal<unit> | 0..1 clamped progress |
| phase | Signal<phase> | Same as progress (0..1 clamped) *(provisional)* |
| end | Event | Fires once when progress reaches 1 *(provisional)* |
| energy | Signal<number> | 1.0 while animating, 0 when complete *(provisional)* |

**Auto-publishes:** `progress` -> `progress`, `phase` -> `phaseA` *(provisional)*, `end` -> `pulse` *(provisional)*, `energy` -> `energy` *(provisional)*



### InfiniteTimeRoot
**Role:** TimeRoot

Ambient, unbounded time with an optional repeating cycle for bus publications.

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| periodMs | Scalar<duration> | Ambient cycle period (default 10000ms) *(provisional)* |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| systemTime | Signal<time> | Monotonic time in ms |
| phase | Signal<phase> | Ambient 0..1 cycle based on periodMs *(provisional)* |
| pulse | Event | Fires on ambient cycle boundary *(provisional)* |
| energy | Signal<number> | Constant 1.0 *(provisional)* |

**Auto-publishes:** `phase` -> `phaseA` *(provisional)*, `pulse` -> `pulse` *(provisional)*, `energy` -> `energy` *(provisional)*

> *Provisional outputs added for API consistency. Original spec only required `systemTime` - phase/pulse should come from explicit PhaseClock blocks in generative patches. The `periodMs` input provides convenience but may encourage over-reliance on the ambient cycle.*

---

## Signal Primitives

### PhaseClock
Secondary clock (derived, not topology).

**Inputs (one required):**
| Port | Type | Description |
|------|------|-------------|
| tIn | Signal<time> | Time input |
| phaseIn | Signal<phase> | OR phase input |
| period | Scalar<duration> | Clock period |
| mode | Scalar<enum> | loop/pingpong/once |
| rate | Signal<number> | Speed multiplier |
| phaseOffset | Signal<phase> | Phase offset |
| reset | Event | Reset trigger |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Output phase |
| u | Signal<unit> | Clamped [0,1] |
| wrap | Event | Wrap event |
| cycleIndex | Signal<number> | Cycle count |

### Oscillator

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Phase input |
| shape | Scalar<enum> | sine/cosine/triangle/saw |
| amplitude | Signal<number> | Amplitude |
| bias | Signal<number> | DC offset |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| out | Signal<number> | Oscillator output |

### Shaper

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| in | Signal<number> | Input signal |
| kind | Scalar<enum> | tanh/softclip/sigmoid/smoothstep/pow |
| amount | Scalar<number> | Shaping amount |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| out | Signal<number> | Shaped output |

### EnvelopeAD

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| trigger | Event | Trigger event |
| attack | Scalar<duration> | Attack time |
| decay | Scalar<duration> | Decay time |
| peak | Scalar<number> | Peak value |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| env | Signal<number> | Envelope output |

### PulseDivider

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Phase input |
| divisions | Scalar<number> | Number of divisions |
| mode | Scalar<enum> | rising/wrap |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| tick | Event | Subdivision tick |

### ColorLFO

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| phase | Signal<phase> | Phase input |
| base | Scalar<color> | Base color |
| hueSpan | Scalar<number> | Hue rotation range |
| sat | Scalar<number> | Saturation |
| light | Scalar<number> | Lightness |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| color | Signal<color> | Output color |

### Math Signal Blocks
- **AddSignal** - Signal + Signal -> Signal
- **MulSignal** - Signal * Signal -> Signal
- **MinSignal** / **MaxSignal** - Component-wise min/max
- **ClampSignal** - Clamp to range

---

## Domain/Field Primitives

### GridDomain

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| rows | Scalar<number> | Row count |
| cols | Scalar<number> | Column count |
| spacing | Scalar<number> | Grid spacing |
| origin | Scalar<vec2> | Grid origin |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Element identity |
| pos0 | Field<vec2> | Base positions |

**Domain contract:** stable element IDs (row/col), deterministic ordering.

### StableIdHash

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Domain input |
| salt | Scalar<number/string> | Hash salt |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| u01 | Field<number> | Per-element [0,1) |

### FieldFromSignalBroadcast

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Domain for count |
| signal | Signal<T> | Signal to broadcast |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| field | Field<T> | Broadcasted field |

### FieldMapUnary

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| a | Field<A> | Input field |
| fn | Scalar<enum/functionId> | Map function |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| b | Field<B> | Mapped field |

### FieldZipBinary

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| a | Field<A> | First field |
| b | Field<B> | Second field |
| fn | Scalar<enum/functionId> | Combine function |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| c | Field<C> | Combined field |

### FieldZipSignal

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| field | Field<A> | Field input |
| signal | Signal<B> | Signal input |
| fn | Scalar<enum/functionId> | Combine function |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| out | Field<C> | Combined field |

### JitterFieldVec2

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| idRand | Field<number> | Per-element random |
| phase | Signal<phase> | Phase for animation |
| amount | Scalar<number> | Drift amount (pixels) |
| frequency | Scalar<number> | Cycles per phrase |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| drift | Field<vec2> | Per-element drift |

### FieldAddVec2 / FieldColorize / FieldOpacity
Standard per-element operations for position, color, and opacity.

---

## Render Primitives

### RenderInstances2D

**Inputs:**
| Port | Type | Description |
|------|------|-------------|
| domain | Domain | Element source |
| position | Field<vec2> | Positions |
| radius | Field<number> | Radii |
| fill | Field<color> | Fill colors |
| opacity | Field<number> | Opacities |

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| renderTree | RenderTree | Render output |

**Implementation requirements:**
- Materialize fields efficiently into typed buffers
- Preserve element ordering consistent with Domain
- Minimal per-frame allocation
- Tolerate lazy FieldExpr chains

### ViewportInfo

**Outputs:**
| Port | Type | Description |
|------|------|-------------|
| size | Scalar<vec2> | Viewport size |
| center | Scalar<vec2> | Viewport center |

---

## Composite Library

### AmbientLoopRoot


**Exposes:** period, mode

### BreathEnergy
Oscillator + Shaper publishing to energy bus.

**Exposes:** amount, bias, curve

### PulseAccentEnergy
PulseDivider + EnvelopeAD publishing to energy bus.

**Exposes:** divisions, decay, amount

### SlowPaletteDrift
PhaseClock (32s) + ColorLFO publishing to palette bus.

**Exposes:** phrasePeriod, hueSpan, base color

### BreathingDotsRenderer
Complete rendering composite: GridDomain + StableIdHash + phase spread + radius + jitter + RenderInstances2D.

**Exposes:** rows/cols/spacing, radius min/max, drift amount, palette variance

---

## Block Implementation Properties

### Non-Negotiable Properties
1. **Domain identity contract** - stable element IDs, deterministic ordering
2. **Lazy Field evaluation** - FieldExpr graph, evaluation only at render sinks
3. **Bus determinism** - stable publisher ordering, reserved bus type enforcement
4. **No-jank program swap** - schedule swaps at pulse boundary, preserve state keys
5. **Export by phase** - cyclic export must be phase-sampled for closure
# Golden Patch: "Breathing Constellation"

## Purpose

This patch serves as the canonical reference for:
- TimeRoot / TimeModel correctness
- Bus-first authoring (no wires required)
- Lazy Field evaluation
- No-jank live edits
- Musically-legible ambient loop
- Export sanity (cycle-accurate, phase-driven sampling)

It's deliberately small enough to implement now, but rich enough to stay relevant as the system grows.

## Description

A loopable ambient system: a grid of dots that "breathes" (radius), slowly drifts (position jitter), color-cycles on a long phrase, and has occasional "spark" accents synced to pulse subdivisions.

## Patch Contract

### Time Topology

- **Compiled TimeModel:** `{ kind: 'cyclic', periodMs: 8000 }`
- **Required UI buses present:** phaseA, pulse, energy, palette

### Canonical Buses

| Bus | Type | Combine | Silent Value |
|-----|------|---------|--------------|
| phaseA | Signal<phase> | last | 0 |
| pulse | Event | or | never fires |
| energy | Signal<number> | sum | 0 |
| palette | Signal<color> | last | #0b1020 |
| phaseB | Signal<phase> | last | 0 |

---

## Block Graph

### A) Time Topology Block


- Params: period = 8s, mode = loop
- Publishes:
  - `phaseA` <- phase (primary)
  - `pulse` <- wrap

### B) Domain + Arrangement

**GridDomain**
- Params: rows = 20, cols = 20, spacing = 22, center = viewport center
- Outputs:
  - domain (element identity + count)
  - pos0: Field<vec2> (base positions)

### C) Global Rhythmic Structure

**PhaseClock** (secondary phrase)
- Inputs: tIn <- TimeRoot.t
- Params: period = 32s, mode = loop
- Publishes: phaseB <- its phase

This gives multi-scale looping (8s loop + 32s phrase).

### D) Energy Generation

**WaveShaper** ("breath")
- Subscribes: phaseA
- Computes: breath = 0.5 - 0.5*cos(2π*phaseA)
- Publishes: energy += breath * 0.35

**PulseDivider**
- Subscribes: phaseA
- Params: divisions = 8
- Publishes: pulse OR= subPulse

**AccentEnvelope**
- Subscribes: pulse
- Params: attack = 0, decay = 0.18s
- Publishes: energy += accent * 0.65

Result: meaningful "intensity" signal with smooth breathing and rhythmic accents.

### E) Palette

**PaletteLFO**
- Subscribes: phaseB (slow phrase)
- Computes: hue rotate slowly across 32s
- Publishes: palette = color

---

## Field Shaping

### A) Per-Element Phase Offset

**StableIdHash**
- Input: domain
- Output: idRand: Field<number> in [0,1)

**FieldMap** ("SpreadPhase")
- Inputs: phaseA (Signal), idRand (Field)
- Output: phasePer = frac(phaseA + idRand * 0.35)

Coherent motion with per-element phase offsets.

### B) Radius Field

**RadiusFromEnergy**
- Inputs: energy (Signal), phasePer (Field)
- Compute:
  - base radius = 2.0
  - breathe radius = 10.0 * smoothstep(phasePer)
  - accent gain = 6.0 * clamp(energy, 0, 1.5)
- Output: radius: Field<number>

This is the heart of the "breathing dots."

### C) Position Drift

**JitterField**
- Inputs: idRand (Field), phaseB (Signal)
- Output: drift: Field<vec2> (±2 px)

**AddFieldVec2**
- Inputs: pos0, drift
- Output: pos: Field<vec2>

---

## Renderer Block

**RenderInstances2D**
- Inputs:
  - domain
  - position: Field<vec2> <- pos
  - radius: Field<number> <- radius
  - fill: Field<color> <- derived from palette + idRand
  - opacity: Field<number> <- 0.85 + 0.15 * sin(phasePer)
- Output: RenderTree

No compositors required. Should look alive immediately.

---

## UI Behavior Requirements

### Time Console
- Must show CYCLE badge
- Must show Phase Ring bound to phaseA
- Must show pulse indicator ticking (wrap + subdivisions)

### Bus Board
- phaseA row shows phase scope/ring
- energy row shows meter oscillating
- palette row shows swatch drifting

### Live Editing (No-Jank)

While RUNNING:
| Change | Class | Behavior |
|--------|-------|----------|
| GridDomain rows/cols | C | Requires explicit apply boundary |
| Breath amplitude | A | Instant swap next frame |


---

## Export Expectations

If exported as a loopable clip:
- Phase-driven sampling must produce exact loop closure
- Frame 0 and Frame N should match visually (within tolerance)

This patch is the canary for cycle export correctness.

---

## Acceptance Tests

### 1. Time Correctness
- Changing player loop mode should not exist / do nothing
- `t` never wraps; only phase does

### 2. UI Correctness
- Cycle UI appears only because TimeModel is cyclic
- Infinite UI never appears for this patch

### 3. No-Jank
- Param tweak on breath amplitude changes visuals with no flicker
- Period change can be scheduled at next pulse and swaps cleanly

### 4. Determinism
- Same seed -> identical motion every reload
- Different seed -> different but stable per-element offsets

### 5. Performance Sanity
- ~400 dots (20x20): smooth
- ~2500 dots (50x50): degrade gracefully but not collapse (lazy-field stress test)

---

## Why This Is The Golden Patch

It exercises exactly what has been hard:

- PhaseClock used correctly as secondary
- Buses as glue (phaseA, pulse, energy, palette)
- Lazy Fields that must not explode performance
- Stable element identity (domain + StableIdHash)
- Renderer consuming many fields and one domain
- Testable no-jank swap boundaries
# Implementation Roadmap

## Overview

This roadmap is dependency-ordered to build the system correctly without backtracking. Each work package produces a meaningful, testable increment using the Golden Patch as the integration harness.

## The Spine

1. TimeRoot defines topology and time signals
2. Buses are the shared routing fabric
3. Domain defines element identity
4. Lazy FieldExpr defines per-element computation
5. Render sinks materialize fields efficiently
6. Hot swap keeps it playable under edits
7. Composites make it usable
8. Export is evaluation under TimeModel

---

## WP0: Lock the Contracts

### Goal
Make the system strict enough that later layers can rely on invariants without defensive code.

### Must-Haves
- TypeDesc is authoritative for ports + buses
- Reserved bus names/types enforced (phaseA, pulse, energy, palette, progress)
- Exactly one TimeRoot enforced at compile time
- TimeRoot cannot have upstream dependencies
- No composite may contain a TimeRoot

### Deliverables
- Compile-time validation pass emitting structured errors
- Reserved bus registry rules

### Golden Patch Checkpoint
Patch loads, validates, and produces intelligible errors until time/runtime exists.

---

## WP1: TimeRoot + TimeModel + Player Rewrite

### Goal
Make looping/finite/infinite a property of the patch, not the player.

### Must-Haves

- Compiler outputs TimeModel
- Player runs unbounded `t` and never wraps/clamps
- Time Console UI driven by timeModel only

### Deliverables

- Player transport rewrite (remove loopMode)
- Time Console UI rework: CYCLE badge, phase ring, pulse indicator
- Bus auto-publication from TimeRoot

### Golden Patch Checkpoint
With dummy RenderTree: phase ring animating, pulse indicator ticking, no wrapping bugs.

---

## WP2: Bus-Aware Compiler Graph

### Goal
Make bus routing real and deterministic.

### Must-Haves
- Compiler graph includes: block outputs, bus value nodes, publisher/listener edges
- Deterministic publisher ordering (sortKey)
- Bus combination semantics: last, sum, or
- Hot-swap safe: old program runs until new compiles

### Deliverables
- Unified bus-aware compile pipeline
- Bus artifact compilation with stable ordering

### Golden Patch Checkpoint
Signal-only parts work: breath energy, pulse events, palette color. Bus Board scopes show movement.

---

## WP3: Domain + Stable Element Identity

### Goal
Introduce "stuff to animate" with stable identity so Field graphs have a spine.

### Must-Haves
- Domain type as first-class artifact (stable IDs, deterministic ordering)
- GridDomain produces: Domain, Field<vec2> for positions
- StableIdHash produces Field<number> in [0,1)

### Deliverables
- Domain artifact + utilities
- GridDomain block compiler
- StableIdHash block compiler

### Golden Patch Checkpoint
Debug outputs: element count, grid preview, stable hash values as grayscale.

---

## WP4: Lazy FieldExpr Core

### Goal
Make Fields fully lazy and composable.

### Must-Haves
- FieldExpr IR: const, source, broadcast, map, zip, wrap
- Evaluation only at declared sinks
- FieldExpr nodes carry TypeDesc metadata

### Deliverables
- FieldExpr data model
- Type checking rules for FieldExpr composition
- FieldExpr evaluator interface (correct first, lazy)

### Golden Patch Checkpoint
Can build: phasePer, drift, radius field - nothing materializes until asked.

---

## WP5: Render Sink + Buffer Materialization

### Goal
RenderInstances2D becomes the first serious sink for efficient field evaluation.

### Must-Haves
- RenderInstances2D consumes: Domain, Field<position>, Field<radius>, Field<fill>, Field<opacity>
- Materialization into typed buffers with stable reuse
- Field evaluation supports batch evaluation into typed arrays

### Deliverables
- RenderInstances2D compiler + runtime renderer
- Buffer pool / arena
- FieldExpr -> "evaluateMany" pipeline
- ViewportInfo block

### Golden Patch Checkpoint
Full "Breathing Constellation" renders: grid of dots, breathing radius, drifting positions, palette drift. Holds frame rate at reasonable sizes.

---

## WP6: No-Jank Hot Swap Scheduling

### Goal
Editing while running feels instrument-like.

### Must-Haves
- Change classification (Param / Structural / Topology)
- Program swap scheduling: frame, pulse, freeze boundaries
- State preservation: StateKey mapping
- UI: "Change scheduled" banner and modal for topology changes

### Deliverables
- Swap scheduler in player/runtime
- Pulse-edge detection from pulse bus
- UI affordances for apply-now/apply-on-pulse/apply-on-freeze
- Guarantees: no blank frame, no flicker, no silent reset

### Golden Patch Checkpoint
While running: breath amplitude instant, period change scheduled at next pulse, grid size requires explicit boundary.

---

## WP7: Composite Library

### Goal
Turn the Golden Patch into a usable template and canonical learning artifact.

### Must-Haves
- Composite instance system works with bus bindings
- Composite editing/expansion consistent with bus routing and TimeRoot constraints
- Composites: AmbientLoopRoot, BreathEnergy, PulseAccentEnergy, SlowPaletteDrift, BreathingDotsRenderer

### Deliverables
- Composite resolution strategy
- Composite library UI surfacing
- Golden Patch as one-click template

### Golden Patch Checkpoint
User can insert "Breathing Constellation" template -> it works and is editable live.

---

## WP8: Export Correctness

### Goal
Export produces truly loopable clips/SVG.

### Must-Haves
- Export uses TimeModel-derived ExportTimePlan
- Cycle export supports phase-driven sampling
- Loop closure guarantee
- Export UI reflects topology

### Deliverables
- Export pipeline
- Phase-driven evaluation pathway
- Loop integrity reporting

### Golden Patch Checkpoint
Export "Breathing Constellation" as loop: plays seamlessly in external player, no visible seam.

---

## WP9: Feedback Readiness

### Goal
Ensure the system can later host dynamical systems safely.

### Must-Haves
- SCC detection with memory boundary policy
- Memory block registry
- Deterministic integration semantics
- Transport vs scrub-safe declared

### Deliverables
- Graph SCC validation
- Memory blocks integrated into state system

### Golden Patch Checkpoint
Not required for visuals, but required for architecture coherence.

---

## Explicit Deferrals

These are **not** v1:
- Timeline/keyframes
- Automatic randomness
- Implicit state
- Per-element JS scripting
- Advanced exports
- WASM execution backend (design-ready only)

Deferring these preserves integrity.

---

## Success Metrics

You know this worked if:
- Users let patches run for hours
- People share systems, not clips
- Edits feel playful, not risky
- Complexity grows without collapse
- You don't need to redesign time again
