# Compiler and Runtime

The engineering truth behind the system. This defines how patches become evaluators and how the runtime executes them.

---

## Canonical Evaluation Pipeline (End to End)

Every frame, the runtime does:
1. Produce a TimeCtx
2. Evaluate all Signal buses
3. Evaluate all Field sinks (lazy, on demand)
4. Produce a RenderTree
5. Render

No block "runs."
No system "advances."
Everything is queried.

---

## Time is Data, Not Control Flow

### TimeCtx (The Only Time Source)

TimeCtx contains:
- `t`: absolute time (double)
- `dt`: delta since last frame
- `frame`: monotonic counter
- `mode`: scrub | performance

All temporal behavior emerges from reading this structure.

There are:
- no engine loops
- no timers
- no hidden clocks

---

## Signals: Pure Evaluators Over TimeCtx

A Signal is compiled to:
```
(TimeCtx, EvalCtx) → Value
```

Key properties:
- evaluated once per frame
- memoized per frame
- no side effects
- cheap

Phase signals are just Signals with wrap semantics.

---

## Fields: Lazy, Domain-Aware Expression Graphs

Fields compile to FieldExpr DAGs, not buffers.

A FieldExpr represents:
```
(elementId, TimeCtx, EvalCtx) → Value
```

But is evaluated in dense batches at sinks.

Key architectural rules:
- no per-element closures
- no hidden iteration
- explicit domain
- explicit identity

---

## Compiler Responsibilities (Non-Negotiable)

The compiler must:
- build a unified dependency graph (blocks + buses)
- detect illegal instantaneous cycles
- enforce memory boundaries
- preserve stable ordering
- produce evaluators with known state layouts

**It must fail loudly when invariants are violated. No fallbacks. No magic.**

### Bus Compilation Contract

For each bus:
1. Collect publishers
2. Sort by sortKey, then stable ID
3. Apply adapter chains
4. Combine using domain-specific reducer
5. Produce a single evaluator

This process is deterministic and repeatable.

---

## Runtime Responsibilities (Minimal by Design)

The runtime must:
- hold current state buffers
- call evaluators
- swap programs safely
- never infer meaning

The runtime does **not**:
- know about loops
- know about phase
- know about domains
- know about UI concepts

This separation is critical for WASM, testing, and longevity.

---

## Scrub vs Performance at the Architecture Level

The only difference is:
- how state blocks interpret TimeCtx

**Derived systems:**
- ignore mode
- always correct

**Stateful systems:**
- increment in performance
- reconstruct or freeze in scrub

This keeps behavior predictable.

---

## State: Explicit, Scoped, and Inspectable

State only exists in:
- Delay
- Integrate
- History
- Explicit state blocks

Each state block:
- declares its memory shape
- declares its scrub policy
- is visible in the UI
- participates in cycle validation

There is no implicit state anywhere else.

---

## Element Identity is a First-Class Concern

Every Field evaluation is parameterized by a Domain:
- stable element IDs
- consistent ordering
- optional topology (neighbors)

This ensures:
- no flicker
- stable per-element phase offsets
- valid per-element state

**Domain mismatch is a compile error.**

---

## Composite Expansion

Do composite expansion in the unified compiler, not in editorToPatch().

Keep editor serialization structural, and do expansion as a compile-time lowering pass.

### Why:
- editorToPatch() should be a faithful snapshot of what the user authored
- Single place for all lowering (composites, adapters, lenses-to-ops, bus resolution)
- Preserves determinism
- Reduces "why does saving change my patch?" confusion
- Compilation needs to support: recursive composites, shared definition caching, stable node identity mapping

### Exception:
If you want an "Expand Composite" editing action, that's an explicit user command that mutates the authored patch. That expansion happens in the editor layer as an operation, not automatically during export/compile.

So:
- **Authoring format:** composites remain references
- **Compiler:** expands to a lowered IR with stable identity mapping
- **Editor "Expand" command:** optional destructive transform of authored graph

---

## Program Identity and Compatibility

Each compiled program carries:
- a **structural signature**
- a **state layout description**
- a **bus layout map**

This allows the system to decide how safe a swap is.

### Compatibility Tiers

1. **Fully compatible**
   - Same buses
   - Same state blocks
   - Same domains

2. **Partially compatible**
   - Some state preserved
   - Some state remapped

3. **Incompatible**
   - Requires reset or crossfade

This is a deterministic decision, not a guess.

---

## Why This Architecture Scales

Because:
- time is uniform
- evaluation is pull-based
- state is explicit
- identity is stable
- composition is structural

You can add:
- new domains
- new loop types
- new state blocks
- new combiners

Without rewriting the system.

---

## Why This Architecture is Hard—But Correct

This design refuses:
- shortcuts
- hidden behavior
- timeline metaphors
- engine-level hacks

That makes it harder up front.

But it guarantees:
- infinite time
- determinism
- composability
- playability

Which is exactly what we're building.
