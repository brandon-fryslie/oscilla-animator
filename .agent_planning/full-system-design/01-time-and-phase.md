# Time and Phase

The bedrock conceptual model that makes "infinite, deterministic, multi-scale looping" real without timelines.

---

## The Core Idea

You do **not** build "an animation that lasts 5s."

You build a **system** that is evaluated at any time t, forever.

Looping and phase aren't special cases—they are **first-class time coordinate systems** that live alongside absolute time.

The architecture provides:
- **Canonical time** (seconds) for determinism and state
- **Derived loop clocks** (phase signals) for rhythmic structure
- **Multi-scale phase** for "infinite but rhyming"
- **Explicit state** only where you mean it

---

## The Three Time Spaces Model

To keep the system coherent, treat time as having three spaces:

1. **Absolute time** (t)
2. **Loop time** (phase, cycleIndex)
3. **State time** (values evolved by integrators/delays)

Most patches use (1) and (2).

Ambient evolution comes from controlled use of (3).

---

## Time Primitives: The Minimum Set

### Canonical Time Context (the only true clock)

Every evaluation receives a TimeCtx:
- `t`: absolute time in seconds (double)
- `dt`: delta time in seconds (double)
- `frame`: integer tick (monotonic)
- `mode`: "scrub" or "performance"

**Rule:** No block reads wall-clock or global time. Only TimeCtx.

### Loop Clocks are Programs, Not Global Engine Features

A "loop" is not an engine state. It is a **block/system** that produces buses:
- `phase`: 0..1 repeating coordinate
- optional `wrapTrigger`: a trigger on wrap
- optional `cycleIndex`: integer count of wraps (useful for macro variation)

This means you can have:
- many loops
- nested loops
- interacting loops
- loops inside composites

All deterministic, because they're derived from t or explicit state.

---

## Two Categories of Loop Clocks

### Derived (Scrub-Perfect) Clocks

Computed directly from t:
```
phase = fract((t + offset) / period)
cycleIndex = floor((t + offset) / period)
```

Properties:
- perfect scrubbing
- no drift
- no state
- deterministic across sessions

This is the default and should cover most looping behaviors.

### Stateful (Performance-First) Clocks

Evolve via explicit state blocks (Integrate / PhaseAccumulator).

Properties:
- can drift, wander, respond to input
- supports "human" timing, swing, elastic tempo, feedback
- in scrub mode: must define reintegration policy (deterministic)

These are how you get **ambient evolution** without randomness.

---

## Multi-Scale Looping: "Infinite But Rhyming"

Achieved by layering **several loop clocks** at different time scales:
- **micro loop**: 2–8 seconds (visible motion)
- **meso loop**: 20–60 seconds (phrase)
- **macro loop**: 2–10 minutes (regime shifts)

Technically trivial once loops are buses:
- phaseA, phaseB, phaseC
- derived relationships: phaseC = phaseB warped by tension, etc.

The architecture supports this by:
- making phase a first-class Signal domain
- making phase transforms cheap and composable

---

## Phase as a Coordinate System (Not Just a Number)

Phase isn't just "0..1." It is a time coordinate that supports operations:
- wrap / fold
- ease curves
- quantize to steps
- gating windows
- phase offset per element (Field phase offset)
- phase warp (nonlinear mapping)

**Key architectural rule:** Phase operations are pure and composable; they never imply hidden timing.

---

## Phase Domain Operations

- **Offset**: shift phase by constant or signal
- **Scale** (tempo): multiply phase progression rate
- **Wrap**: keep in [0,1) range
- **Fold**: bounce at boundaries
- **Quantize**: snap to discrete steps
- **Gate**: active only in [a,b) window
- **Warp**: nonlinear remapping (ease, power curve, skew)

All are **pure Signal → Signal transforms**.

---

## Phase as First-Class Signal Domain

Phase signals guarantee:
- value ∈ [0, 1)
- wrap detection is well-defined
- composability with phase-aware operators

---

## Looping is Just Phase Reuse

Once phase is a Signal, looping "just happens":
- If a visual attribute listens to phase → it loops
- If multiple attributes listen to the same phase → they loop together
- If attributes listen to related phases → polyrhythm

There is no special "looping engine."

---

## How Phase Interacts with State (The Exact Boundary)

State is only allowed through explicit memory blocks. Therefore:
- Derived phase clocks can never create feedback loops
- Stateful clocks can participate in legal feedback only if they cross memory boundaries
- Cycle legality is determined by SCC detection

This makes phase safe as a ubiquitous tool.

---

## What "Looping Mode" Means Architecturally

Looping is not "the engine repeats the animation."

Looping means:
- you are driving most visible behavior from **phase buses**
- and optionally using cycleIndex + slow state to evolve across cycles

So "Loop Mode" in UI is just a **preset of time buses and visualizations**, not a different runtime.

---

## Why This Architecture is WASM-Ready

Because evaluation reduces to:
- batch evaluation of Signals at t
- batch evaluation of Fields over an explicit element domain at t
- with state blocks as explicit memory stores

No hidden engine behavior. No UI-dependent time logic. No timeline coupling.

---

## Phase Primitives (Block Specifications)

### PhaseClock (Derived Phase)

Form: primitive
Purpose: derived scrub-safe phase

Inputs:
- `period`: (scalar, duration)
- `offset`: (scalar, duration) optional
- `phaseOffset`: (scalar, number) 0..1 optional

Outputs:
- `phase`: (signal, phase)

Implementation: `phase(t) = fract((t + offset)/period + phaseOffset)`

### PhaseMath

Purpose: common phase ops

Inputs:
- `phase`: (signal, phase)
- `op`: (scalar, string) enum: "wrap" | "fold" | "invert" | "quantize"
- `steps`: (scalar, number) for quantize

Outputs:
- `out`: (signal, phase)

### TriggerOnWrap

Form: primitive
Purpose: emit trigger when phase wraps

Inputs:
- `phase`: (signal, phase)

Outputs:
- `trig`: (signal, trigger)

Notes: Must be deterministic, derived from phase; no hidden state.

### PhaseAccumulator (STATEFUL)

Purpose: stateful phase with drift/tempo modulation

Inputs:
- `rate`: (signal, number) - tempo multiplier
- `initial`: (scalar, number)

Outputs:
- `phase`: (signal, phase)
- `cycle`: (signal, number) - cycle count

Notes:
- Explicit state
- Must declare scrub policy
