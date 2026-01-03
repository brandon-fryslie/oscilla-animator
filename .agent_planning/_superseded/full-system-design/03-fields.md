# Fields

Fields are where looping, phase, and infinite time stop being abstract and become texture, grain, and life.
This document explains how Fields behave in a phase-driven system without collapsing into chaos, jank, or performance death.

---

## Reframing Fields: Not "Arrays Over Time"

A critical mental shift:

A Field is not "a list that updates every frame."
A Field is a function over (element identity × time).

Formally:
- A Field answers the question: "Given this element, at this time, what is its value?"
- Time comes from Signals (especially phase)
- Identity comes from the Element Domain

This reframing is what makes infinite animation feasible.

---

## Lazy Fields are Non-Negotiable for Infinite Systems

Because:
- Infinite time means no fixed evaluation window
- Per-element × per-frame eager computation does not scale
- Fields must compose without materializing intermediate buffers

Therefore:
- Fields are represented as expression graphs (FieldExpr DAGs)
- Evaluation is pulled by sinks, not pushed by sources
- Materialization happens only when rendering or exporting

This allows:
- deep composability
- late binding to phase
- cheap experimentation

---

## Element Domain: The Anchor of Stability

Every Field is evaluated over a Domain.

A Domain defines:
- the set of elements (points, particles, glyphs, segments...)
- a stable identity for each element
- optional topology (neighbors, order, hierarchy)

### Key Invariant

**Element identity must not depend on array index.**

This guarantees:
- no flicker
- stable per-element phase offsets
- persistent per-element state (when used)

### Domain Identity Contract

A Domain value must provide:
- `count`: number
- `ids`: Uint32Array | BigInt64Array | string[] (stable identities)
- optional: `seed` or `seedBasis` for per-id hashing
- optional: topology metadata (neighbors)

---

## How Looping Propagates into Fields

Fields never "loop" on their own.

They loop because:
- they consume phase Signals
- they interpret phase per element

Examples:
- `phase + elementHash * 0.2`
- `quantize(phase, steps = elementIndex % 5)`
- `gate(phase, window = elementGroup)`

This creates:
- coherent global rhythm
- local desynchronization
- rich texture

All without any Field-level time accumulation.

---

## Field Buses: Combining Per-Element Influence

A Field bus combines FieldExprs, not arrays.

### Combination Semantics:
- Combination is per element
- Combine functions are lifted pointwise

For example:
- Field sum: `value(e) = A(e) + B(e)`
- Field max: `value(e) = max(A(e), B(e))`

There is no implicit zipping or broadcasting across domains.

**Domain mismatch is a compile error.**

---

## Phase Inside Fields: Controlled Multiplicity

Fields can consume phase Signals in three main ways:

1. **Uniform phase**: Every element sees the same phase
2. **Offset phase**: Phase is shifted per element via stable hash
3. **Derived phase**: Per-element phase computed from signal + field

All are explicit, cheap, and deterministic.

---

## Stateful Fields: Rare, Explicit, and Scoped

State inside Fields is allowed only when:
- explicitly declared (DelayLine, IntegrateField, History)
- keyed by element identity
- bounded in memory

Rules:
- No hidden per-element state
- No implicit accumulation
- No state without a memory block

This prevents runaway complexity.

---

## Performance Model for Fields

The system is optimized around this flow:
1. Build a FieldExpr DAG
2. Fuse compatible operations
3. Evaluate in dense batches at sinks
4. Use typed buffers
5. Avoid per-element closures

### Critical Guarantee

**The cost of a Field is proportional to the number of elements only at render time, not at authoring time.**

This is what makes live editing viable.

---

## FieldExpr Materialization

RenderInstances2D (and similar renderers) should batch-evaluate all fields into typed buffers once per frame (per domain), then render from those buffers.

### Why This is the Correct Sink Boundary:
- A renderer is a natural materialization sink
- If fields materialize ad-hoc upstream, you'll duplicate work and blow cache locality
- If you evaluate per element via callbacks, you'll get GC pressure and death-by-dispatch

### What to Batch-Evaluate

Request a field evaluation plan for each required attribute:
- `pos`: vec2 (required)
- `size`: number
- `rot`: number
- `fill`: color
- `opacity`: number

Then in one renderer tick:
1. Ensure a DomainRuntime exists for that domain
2. Evaluate each required FieldExpr into a typed buffer:
   - number → Float32Array/Float64Array
   - vec2 → two arrays or interleaved
   - color → packed Uint32Array or 4 floats
3. Run render logic over those buffers

### Caching / Invalidation

- Cache by (FieldExprId, DomainId, frameStamp)
- Do not reallocate buffers every frame—keep arenas per renderer+domain and reuse
- Fields that are static w.r.t time can be cached across frames until inputs change

---

## How Fields Stay Intuitive for Users

Despite all this machinery, the UX rule is simple:
- Users never "edit a Field"
- Users bind buses and tweak interpretation
- Fields emerge from structure, not configuration

The complexity is structural, not procedural.

---

## Why This Feels Musical Instead of Mechanical

In music:
- the rhythm is shared
- each instrument interprets it differently
- texture comes from timing offsets, not randomness

Fields play the role of instruments.
Phase is the rhythm.

The result:
- infinite variation
- stable identity
- expressive systems

---

## Field Primitives (Block Specifications)

### FieldConstNumber

Form: primitive
Purpose: uniform per-element numeric value

Inputs:
- `domain`: (special, domain)
- `value`: (scalar, number)

Outputs:
- `out`: (field, number)

### FieldConstColor

Inputs:
- `domain`: (special, domain)
- `value`: (scalar, color)

Outputs:
- `out`: (field, color)

### FieldConstVec2

Inputs:
- `domain`: (special, domain)
- `value`: (scalar, vec2)

Outputs:
- `out`: (field, vec2)

### FieldHash01ById

Form: primitive
Purpose: deterministic per-element variation in [0,1)

Inputs:
- `domain`: (special, domain)
- `seed`: (scalar, number) default 0

Outputs:
- `u`: (field, number) 0..1

Notes:
- Must be stable for a given element ID + seed
- Should not depend on element index ordering

### FieldHashVec2ById

Inputs:
- `domain`: (special, domain)
- `seed`: (scalar, number)

Outputs:
- `v`: (field, vec2) each component 0..1 or -1..1

### FieldMapNumber

Form: primitive
Purpose: unary mapping over Field<number>

Inputs:
- `x`: (field, number)
- `fn`: (scalar, string) enum: "neg" | "abs" | "sin" | "tanh" | "smoothstep" | ...
- optional params depending on fn

Outputs:
- `y`: (field, number)

Notes: Compiles to a FieldExpr map node; fusable.

### FieldZipNumber

Form: primitive
Purpose: binary op over number fields

Inputs:
- `a`: (field, number)
- `b`: (field, number)
- `op`: (scalar, string) enum: "add" | "sub" | "mul" | "min" | "max"

Outputs:
- `out`: (field, number)

### FieldZipVec2

Inputs:
- `a`: (field, vec2)
- `b`: (field, vec2)
- `op`: (scalar, string) enum: "add" | "sub"

Outputs:
- `out`: (field, vec2)

### FieldMapVec2

Inputs:
- `v`: (field, vec2)
- `fn`: (scalar, string) enum: "rotate" | "scale" | "normalize" | "clampLen"
- params: `angle`, `s`, `maxLen` as appropriate

Outputs:
- `out`: (field, vec2)

### FieldFromSignalNumber (World-Lift)

Purpose: broadcast a signal into a domain-aligned field

Inputs:
- `domain`: (special, domain)
- `x`: (signal, number)

Outputs:
- `out`: (field, number)

Notes: Mark as "Heavy" in UI, but very useful.
