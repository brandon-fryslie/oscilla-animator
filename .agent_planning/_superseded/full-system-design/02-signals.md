# Signals

Signals are the primary carrier of phase, looping, rhythm, and "instrument-ness."
If Fields are the texture of the image, Signals are the music.

---

## Signals as the Dominant Temporal Abstraction

In a phase-driven, infinite system:
- **Signals** are how time is felt
- **Fields** are how time is expressed per element

This is a deliberate inversion from typical node systems where everything becomes per-element too early.

Signals now carry:
- phase
- rhythm
- energy
- regime
- palette intent
- global tension
- events / pulses

Most looping behavior lives entirely in the Signal world.

---

## Signal Evaluation Model

### Evaluated Once Per Frame, Per Bus

Architecturally:
- Each Signal bus compiles to **one evaluator**
- That evaluator is called **once per frame**
- All consumers read the same value

A Signal is compiled to:
```
(TimeCtx, EvalCtx) → Value
```

Key properties:
- evaluated once per frame
- memoized per frame
- no side effects
- cheap

### Three Major Consequences

1. **Performance**
   - Signals are cheap
   - Loop clocks are effectively free

2. **Coherence**
   - Everything "moves together" unless explicitly desynchronized

3. **Musicality**
   - Signals behave like shared control voltages

---

## Phase is a First-Class Signal Domain

Phase is not just number.

It has:
- wrap semantics
- cyclical meaning
- interpretation affordances in UI

### Phase Signals Guarantee:
- value ∈ [0, 1)
- wrap detection is well-defined
- composability with phase-aware operators

### Phase Operations Include:
- offset
- scale (tempo)
- fold
- quantize
- gate windows
- nonlinear warp

All are **pure Signal → Signal transforms**.

---

## Signals Define Global Structure

Signals are where you encode:
- when things happen
- how often
- how intense
- which regime is active

Fields should almost never be responsible for:
- timing
- pacing
- rhythm
- global transitions

That separation is what keeps systems legible.

---

## Events are Signals with Sparse Semantics

Event / trigger signals are Signals with special combination rules:
- boolean-ish
- edge-based
- often derived from phase or energy

Examples:
- wrapTrigger from phase
- threshold crossings
- peak detectors
- quantized rhythm ticks

These are still Signals, not Fields.

---

## Signal Buses Encourage Shared Causality

Because Signals are global:
- multiple blocks can publish to energy
- multiple attributes can interpret energy differently

This creates:
- cohesion without uniformity
- variation without chaos
- musical dynamics

This is the visual analog of:
> "one drum groove, many instruments responding."

---

## Adapter Chains are Perception, Not Mutation

When a Signal is consumed:
- the bus value is never mutated

This keeps Signals:
- pure
- reusable
- debuggable

It also means:
- two consumers can "feel" the same signal very differently
- without affecting each other

---

## Signals and State: The Only Legal Interaction

Signals themselves are stateless unless:
- they are produced by a stateful block
- or depend on a stateful bus

This makes the flow explicit:
```
t → phase → threshold → trigger → Integrate → tension → warp phase
```

Every memory boundary is visible.

---

## Why This Makes the System Feel Like a Music Visualizer

Music visualizers work because:
- audio is a shared signal
- visuals interpret it differently
- timing coherence is global

By elevating Signals to this role, Loom:
- behaves musically
- encourages exploration
- remains infinite without repetition

---

## Signal Primitives (Block Specifications)

### EnvelopeAD (STATEFUL)

Form: primitive
Purpose: simple trigger→envelope

Inputs:
- `trig`: (signal, trigger)
- `attack`: (scalar, duration)
- `decay`: (scalar, duration)

Outputs:
- `env`: (signal, number) 0..1

Notes:
- Explicit state (current value, phase)
- Declares scrub policy: performance-only unless you implement reconstruction

### DelaySignalNumber (STATEFUL)

Form: primitive
Purpose: delay numeric signal (feedback-safe boundary)

Inputs:
- `x`: (signal, number)
- `delay`: (scalar, duration)

Outputs:
- `y`: (signal, number)

Notes: This is a legal cycle breaker for SCC validation.

### IntegrateNumber (STATEFUL)

Purpose: integrate dx/dt into state

Inputs:
- `dx`: (signal, number)
- `initial`: (scalar, number)
- `clampMin`: (scalar, number) optional
- `clampMax`: (scalar, number) optional

Outputs:
- `x`: (signal, number)

---

## UX Implications for Signals

Because Signals matter so much, the UI must:
- always show Signal buses
- visualize them clearly (sparklines, rings)
- make it trivial to bind to them
- make interpretation stacks obvious

Users should feel that:
> "Signals are the rhythm section of my system."
