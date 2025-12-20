# Core Invariants

The foundational truths that govern the entire system. These are non-negotiable and must be enforced at compile time.

---

## The Single Governing Invariant

**The system is a pure function of (TimeCtx, Patch Definition, Explicit State).**

Nothing else is allowed to influence evaluation.

This one sentence dictates:
- how looping works
- how scrubbing works
- how determinism is preserved
- how infinite time is possible

---

## TimeCtx Contract

Every evaluation receives a TimeCtx:
- `t`: absolute time in seconds (double)
- `dt`: delta time in seconds (double)
- `frame`: integer tick (monotonic)
- `mode`: "scrub" or "performance"

**Rule:** No block reads wall-clock or global time. Only TimeCtx.

### Why Absolute Time is Mandatory

Absolute time allows:
- perfect scrubbing for derived systems
- deterministic reconstruction
- stateless looping
- reproducible exports

Relative time only exists inside explicit state blocks.

---

## Signal vs Field Distinction

### Signals: Global, Continuous Influence

Signals are the "instrument control voltages":
- phase
- energy
- palette
- tension
- pulse

Properties:
- Evaluated once per frame, per bus
- Memoized per frame
- No side effects
- Cheap

Signals are where most "looping UX" lives.

### Fields: Per-Element Variation Over a Domain

Fields are "how each element experiences the world":
- per-particle velocity
- per-point phase offset
- per-letter grain
- per-stroke turbulence

A Field is not "a list that updates every frame."
A Field is a function over (element identity × time).

Formally:
- A Field answers: "Given this element, at this time, what is its value?"
- Time comes from Signals (especially phase)
- Identity comes from the Element Domain

**Critical rule:** Signals never depend on Fields.

---

## Bus Immutability Rules

When a Signal is consumed:
- the bus value is never mutated
- interpretation happens at the **listener port**

This keeps Signals:
- pure
- reusable
- debuggable

Two consumers can "feel" the same signal very differently without affecting each other.

---

## Explicit State-Only Memory

State is only allowed through explicit memory blocks:
- Delay
- Integrate
- History
- Explicit state blocks

Each state block:
- declares its memory shape
- declares its scrub policy
- is visible in the UI
- participates in cycle validation

**There is no implicit state anywhere else.**

Rules:
- No hidden per-element state
- No implicit accumulation
- No state without a memory block

---

## Element Domain Rules

Every Field is evaluated over a Domain.

A Domain defines:
- the set of elements (points, particles, glyphs, segments...)
- a stable identity for each element
- optional topology (neighbors, order, hierarchy)

A Domain value must provide:
- `count`: number
- `ids`: Uint32Array | BigInt64Array | string[] (stable identities)
- optional: `seed` or `seedBasis` for per-id hashing
- optional: topology metadata (neighbors)

### Key Invariant

**Element identity must not depend on array index.**

This guarantees:
- no flicker
- stable per-element phase offsets
- persistent per-element state (when used)

### Domain Mismatch is a Compile Error

- A Field bus combines FieldExprs, not arrays
- All publishers must share the same Domain
- Combine functions are lifted pointwise
- There is no implicit zipping or broadcasting across domains

---

## World Mismatch Rules

TypeDesc worlds: `scalar | signal | field | special`

TypeDesc domains: `number | vec2 | color | phase | trigger | domain | renderTree`

### World-Changing Operations are Heavy

Examples:
- Signal → Field (broadcast)
- Field → Signal (reduce)

These must:
- be explicit
- show a warning badge ("Heavy")
- require confirmation or an "Advanced" toggle

---

## Illegal Cycle Detection

State is only allowed through explicit memory blocks. Therefore:
- Derived phase clocks can never create feedback loops
- Stateful clocks can participate in legal feedback only if they cross memory boundaries
- Cycle legality is determined by SCC detection

### Compiler Must Enforce

- build a unified dependency graph (blocks + buses)
- detect illegal instantaneous cycles
- enforce memory boundaries
- preserve stable ordering
- produce evaluators with known state layouts

**It must fail loudly when invariants are violated. No fallbacks. No magic.**

---

## What We Explicitly Forbid

To preserve system integrity:
- implicit state creation
- hidden randomness
- engine-level time jumps
- automatic global resets
- silent fallbacks
- implicit wiring shortcuts
- hidden time access
- per-element eager APIs

Every discontinuity is either prevented, smoothed, or explicitly communicated.
