# Time Architecture

## Source: 02-Time-Architecture.md

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
- Publish to reserved rails (phaseA, phaseB, pulse, energy, palette)
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

- `time` (Signal<time>) — reserved, always present, published only by TimeRoot
- `phaseA` (Signal<phase>) — primary phase modulation
- `phaseB` (Signal<phase>) — secondary phase modulation
- `pulse` (Event) — discrete time boundary events
- `energy` (Signal<number>) — intensity/activity level
- `palette` (Signal<number>) — palette position [0,1]

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

- have locked names matching the rail (`phaseA`, `phaseB`, `pulse`, `pulse`, `energy`, `palette`)
- cannot be deleted or renamed
- exist solely as an interoperability bridge for the bus system

### Combine Rules

Combine rules apply only when a rail is in **Mixed** policy or when mirrored values are combined with user publishers. Defaults:

- `phaseA`, `phaseB`: last
- `pulse`: last
- `energy`: sum
- `palette`: last

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


## Source: 02.1-TimeConsole-UI.md

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

- **Cycle A** is enabled with period = 2.0s, mode = loop, feeding **phaseA** and **pulse** rails.
- **Cycle B** is disabled by default (but present) with period = 3.125s, mode = loop, feeding **phaseB** and **pulse** rails when enabled.
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
| Cycle A  | On      | phaseA (rail), pulse (rail), cycleIndexA (internal)               |
| Cycle B  | Off     | phaseB (rail), pulse (rail), cycleIndexB (internal)               |
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
- pulse → rail `pulse`
- energy → rail `energy`
- palette → rail `palette`

Defaults on new patch:
- Cycle A enabled, publishing phaseA + pulse
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
- Scrubbing is REQUIRED (finite: absolute time, infinite: view window offset)

The Player MUST NOT contain any cycle, phase, or period editing UI.

Rail rows (phaseA, phaseB, pulse, energy, palette) MUST include a shortcut to open the Time Console to the corresponding Modulation Rack lane. These rails MAY be rendered in the Bus Board as a pinned “Global Rails” group, but they are not treated as ordinary user buses.

---

## 9. Why This Exists

This architecture gives:
- Cycles by default
- Infinite nesting via operators
- Zero canvas clutter
- Determinism
- Debuggability
- Rust/WASM-friendly IR

This is the canonical design for Oscilla time authoring.

## Source: 02.2-Time-and-Rails.md

# Time Console & Modulation Rack — Authoritative UI and Runtime Specification

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

- **Cycle A** is enabled with period = 2.0s, mode = loop, feeding **phaseA** and **pulse** rails.
- **Cycle B** is disabled by default (but present) with period = 3.125s, mode = loop, feeding **phaseB** and **pulse** rails when enabled.
- **Energy** and **Palette** lanes are enabled with default generators.

Rails always exist; lane enablement controls whether the rack actively drives them.

## 4. Modulation Rack (Global Rails)

The Modulation Rack is a **patch-level derived modulation system** that generates phase/pulse/energy/palette signals without cluttering the graph.

It is authored in the Time Console and compiled as hidden operators. These operators feed **Global Rails** by default (normalled), and may optionally publish into the user bus fabric when explicitly enabled.

### 4.1 Canonical Cycles

| Cycle   | Description              | Outputs                                      |
|---------|--------------------------|----------------------------------------------|
| Cycle A | Primary cycle lane       | `phaseA` (rail), `pulse` (rail), `cycleIndexA` (internal) |
| Cycle B | Secondary cycle lane     | `phaseB` (rail), `pulse` (rail), `cycleIndexB` (internal) |
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

Rail rows (phaseA, phaseB, pulse, energy, palette) MUST include a shortcut to open the Time Console to the corresponding Modulation Rack lane. These rails MAY be rendered in the Bus Board as a pinned “Global Rails” group, but they are not treated as ordinary user buses.

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

- `time` (Signal<time>) — reserved, always present, published only by TimeRoot
- `phaseA` (Signal<phase>) — primary phase modulation
- `phaseB` (Signal<phase>) — secondary phase modulation
- `pulse` (Event) — discrete time boundary events
- `energy` (Signal<number>) — intensity/activity level
- `palette` (Signal<number>) — palette position [0,1]

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

- have locked names matching the rail (`phaseA`, `phaseB`, `pulse`, `pulse`, `energy`, `palette`)
- cannot be deleted or renamed
- exist solely as an interoperability bridge for the bus system

### Combine Rules

Combine rules apply only when a rail is in **Mixed** policy or when mirrored values are combined with user publishers. Defaults:

- `phaseA`, `phaseB`: last
- `pulse`: last
- `energy`: sum
- `palette`: last

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


## Source: 02.3-Rails-More.md

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

type RailId = 'phaseA'|'phaseB'|'pulse'|'pulse'|'energy'|'palette'|...;

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

If you want, next I can write the exact TypeScript types for RailPolicy, CompiledTimeOverlay, and the runtime RailStore/resolve algorithm so engineers can implement it without inventing anything.

## Source: 02.99-Time-DEFERRED-WORK.md

NOTE: this work has been DEFERRED until the new compiler architecture is in place

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
- **Provenance** — bus values show source `TimeOverlay.CycleA.phase`