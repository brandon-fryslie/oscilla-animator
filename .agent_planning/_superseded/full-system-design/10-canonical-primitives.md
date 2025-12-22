# Canonical Primitives

The block registry for the "Element Domain + Mapper + Renderer" architecture.
Each primitive is a small orthogonal concept that doesn't secretly bundle two axes.
Anything that bundles axes becomes a composite (starter macro) later.

---

## Type System Foundation

### TypeDesc Worlds
- `scalar`: static parameter
- `signal`: time-varying global value
- `field`: per-element value over a Domain
- `special`: domain, renderTree, path refs

### TypeDesc Domains
- `number`, `vec2`, `color`, `phase`, `trigger`
- `domain` (special)
- `renderTree` (special)

### Port Notation
`name: (world, domain[, semantics])`

### Assumptions
- All blocks are pure unless explicitly marked STATEFUL
- Field outputs are lazy (compile to FieldExpr) and are always evaluated against a Domain

---

## Domain Primitives (Element Populations)

### DomainN

Form: primitive
Purpose: Create a stable population of N elements.

**Inputs:**
- `n`: (scalar, number) integer expected
- `seed`: (scalar, number) optional, default 0

**Outputs:**
- `domain`: (special, domain)

**Notes:**
- Domain IDs must be stable across recompiles as long as (seed,n) unchanged
- Count changes obey stable extension/shrink policy:
  - shrinking: keep first K IDs (stable)
  - growing: append new IDs deterministically

Why this is primitive #1: nothing else can be per-element without a Domain.

---

### DomainFromSVGSample

Form: primitive
Purpose: Create domain from an SVG asset by sampling.

**Inputs:**
- `svgAsset`: (special, path)
- `sampleCount`: (scalar, number)
- `seed`: (scalar, number) optional

**Outputs:**
- `domain`: (special, domain)
- `bounds`: (special, bounds) optional

**Notes:**
- IDs stable for a given (assetId, sampleCount, seed)
- Sampling method should be deterministic

---

## Position Mappers (Domain → Field<vec2>)

### PositionMapGrid

Form: primitive
Purpose: Map domain IDs to grid positions.

**Inputs:**
- `domain`: (special, domain)
- `rows`: (scalar, number)
- `cols`: (scalar, number)
- `spacing`: (scalar, number)
- `origin`: (scalar, vec2)
- `order`: (scalar, string) enum: "rowMajor" | "serpentine"
- `fit`: (scalar, string) enum: "wrap" | "crop" | "pad"

**Outputs:**
- `pos`: (field, vec2)

**Notes:**
- Always emits a position for every element ID
- If rows*cols ≠ domain.count, behavior defined by `fit`

---

### PositionMapCircle

Form: primitive
Purpose: Map domain IDs to a circle/ring.

**Inputs:**
- `domain`: (special, domain)
- `center`: (scalar, vec2)
- `radius`: (scalar, number)
- `startAngle`: (scalar, number) radians
- `winding`: (scalar, number) +1/-1
- `distribution`: (scalar, string) enum: "even" | "goldenAngle"

**Outputs:**
- `pos`: (field, vec2)

---

### PositionMapLine

Form: primitive
Purpose: Map domain IDs to a line.

**Inputs:**
- `domain`: (special, domain)
- `a`: (scalar, vec2)
- `b`: (scalar, vec2)
- `distribution`: (scalar, string) enum: "even" | "easeInOut"

**Outputs:**
- `pos`: (field, vec2)

---

## Field Generators (Domain → Field)

### FieldConstNumber

Form: primitive
Purpose: Uniform per-element numeric value.

**Inputs:**
- `domain`: (special, domain)
- `value`: (scalar, number)

**Outputs:**
- `out`: (field, number)

---

### FieldConstColor

**Inputs:**
- `domain`: (special, domain)
- `value`: (scalar, color)

**Outputs:**
- `out`: (field, color)

---

### FieldConstVec2

**Inputs:**
- `domain`: (special, domain)
- `value`: (scalar, vec2)

**Outputs:**
- `out`: (field, vec2)

---

### FieldHash01ById

Form: primitive
Purpose: Deterministic per-element variation in [0,1).

**Inputs:**
- `domain`: (special, domain)
- `seed`: (scalar, number) default 0

**Outputs:**
- `u`: (field, number) 0..1

**Notes:**
- Must be stable for a given element ID + seed
- Should not depend on element index ordering

---

### FieldHashVec2ById

**Inputs:**
- `domain`: (special, domain)
- `seed`: (scalar, number)

**Outputs:**
- `v`: (field, vec2) each component 0..1 or -1..1

---

## Field Combinators (Lazy FieldExpr Constructors)

### FieldMapNumber

Form: primitive
Purpose: Unary mapping over Field<number>.

**Inputs:**
- `x`: (field, number)
- `fn`: (scalar, string) enum: "neg" | "abs" | "sin" | "tanh" | "smoothstep" | ...
- optional params depending on fn

**Outputs:**
- `y`: (field, number)

**Notes:** Compiles to a FieldExpr map node; fusable.

---

### FieldZipNumber

Form: primitive
Purpose: Binary op over number fields.

**Inputs:**
- `a`: (field, number)
- `b`: (field, number)
- `op`: (scalar, string) enum: "add" | "sub" | "mul" | "min" | "max"

**Outputs:**
- `out`: (field, number)

---

### FieldZipVec2

**Inputs:**
- `a`: (field, vec2)
- `b`: (field, vec2)
- `op`: (scalar, string) enum: "add" | "sub"

**Outputs:**
- `out`: (field, vec2)

---

### FieldMapVec2

**Inputs:**
- `v`: (field, vec2)
- `fn`: (scalar, string) enum: "rotate" | "scale" | "normalize" | "clampLen"
- params: `angle`, `s`, `maxLen` as appropriate

**Outputs:**
- `out`: (field, vec2)

---

### FieldFromSignalNumber (World-Lift)

Purpose: Broadcast a signal into a domain-aligned field.

**Inputs:**
- `domain`: (special, domain)
- `x`: (signal, number)

**Outputs:**
- `out`: (field, number)

**Notes:** Mark as "Heavy" in UI, but very useful.

---

## Signal Primitives (Time/Phase/Trigger)

### PhaseClock

Form: primitive
Purpose: Derived scrub-safe phase.

**Inputs:**
- `period`: (scalar, duration)
- `offset`: (scalar, duration) optional
- `phaseOffset`: (scalar, number) 0..1 optional

**Outputs:**
- `phase`: (signal, phase)

**Implementation:** `phase(t) = fract((t + offset)/period + phaseOffset)`

---

### PhaseMath

Purpose: Common phase ops.

**Inputs:**
- `phase`: (signal, phase)
- `op`: (scalar, string) enum: "wrap" | "fold" | "invert" | "quantize"
- `steps`: (scalar, number) for quantize

**Outputs:**
- `out`: (signal, phase)

---

### TriggerOnWrap

Form: primitive
Purpose: Emit trigger when phase wraps.

**Inputs:**
- `phase`: (signal, phase)

**Outputs:**
- `trig`: (signal, trigger)

**Notes:** Must be deterministic, derived from phase; no hidden state.

---

### EnvelopeAD (STATEFUL)

Form: primitive
Purpose: Simple trigger→envelope.

**Inputs:**
- `trig`: (signal, trigger)
- `attack`: (scalar, duration)
- `decay`: (scalar, duration)

**Outputs:**
- `env`: (signal, number) 0..1

**Notes:**
- Explicit state (current value, phase)
- Declares scrub policy: performance-only unless reconstruction implemented

---

### DelaySignalNumber (STATEFUL)

Form: primitive
Purpose: Delay numeric signal (feedback-safe boundary).

**Inputs:**
- `x`: (signal, number)
- `delay`: (scalar, duration)

**Outputs:**
- `y`: (signal, number)

**Notes:** This is a legal cycle breaker for SCC validation.

---

### IntegrateNumber (STATEFUL)

Purpose: Integrate dx/dt into state.

**Inputs:**
- `dx`: (signal, number)
- `initial`: (scalar, number)
- `clampMin`: (scalar, number) optional
- `clampMax`: (scalar, number) optional

**Outputs:**
- `x`: (signal, number)

---

## Renderer Primitives (Field Sinks → RenderTree)

### RenderInstances2D

Form: primitive
Purpose: Draw one instance per domain element.

**Inputs:**
- `domain`: (special, domain)
- `pos`: (field, vec2)
- `shape`: (scalar, string) enum: "circle" | "square" | "triangle" | "path"
- `pathAsset`: (special, path) required if shape="path"
- `size`: (field, number)
- `rot`: (field, number) optional, default 0
- `fill`: (field, color)
- `opacity`: (field, number) optional, default 1

**Outputs:**
- `tree`: (special, renderTree)

**Notes:**
- This is the primary Field materialization sink
- Internally should evaluate fields into typed buffers once per frame for the domain

---

### LayerCombine

Form: primitive
Purpose: Combine multiple RenderTrees into one.

**Inputs:**
- `a`: (special, renderTree)
- `b`: (special, renderTree)
- `mode`: (scalar, string) enum: "over" | "add" | "multiply"

**Outputs:**
- `out`: (special, renderTree)

---

## Implementation Order Summary

1. DomainN
2. PositionMapGrid
3. FieldConstNumber, FieldConstColor
4. FieldHash01ById
5. FieldMapNumber, FieldZipNumber
6. PhaseClock
7. RenderInstances2D
8. LayerCombine
9. PositionMapCircle (+ Line)
10. TriggerOnWrap, EnvelopeAD
11. DelaySignalNumber, IntegrateNumber
12. Heavy lifts: FieldFromSignalNumber, reducers later

---

## Minimal "Ship It" Set

The tightest viable set:
1. DomainN
2. PositionMapGrid
3. FieldConstNumber + FieldConstColor
4. FieldMapNumber + FieldZipNumber
5. FieldHash01ById
6. PhaseClock
7. RenderInstances2D

This set alone supports:
- GridPoints, CirclePoints (with one more mapper)
- per-element variation
- phase-driven motion
- palette motion
- ambient evolution (with integrator later)
