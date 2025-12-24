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
