# Engineering Phases

Concrete sequencing: how to build this correctly, without backtracking, to a first released product.

---

## Assumptions

- **Correctness > speed**
- **No fallbacks**
- **Lazy Fields from day one**
- **Bus-centric architecture is non-negotiable**

The goal is not a demo.
The goal is a **stable, expressive instrument** that can grow for years.

---

## Guiding Principles

Before phases, three hard rules:

1. **No provisional architectures** — If something will be removed later, don't build it now.
2. **Structural work before UX polish** — UI only lands once semantics are locked.
3. **Every phase must produce a shippable internal milestone** — Even if not user-facing.

---

## Phase 0: Lock Invariants

### Goal
Make it impossible to accidentally violate the system's core truths.

### Work
- Freeze and document:
  - TimeCtx contract
  - Signal vs Field distinction
  - Bus immutability rules
  - Explicit state-only memory
  - Element Domain rules
- Add compile-time assertions for:
  - world mismatches
  - domain mismatches
  - illegal cycles
- Remove or forbid:
  - implicit wiring shortcuts
  - hidden time access
  - per-element eager APIs

### Deliverable
- Compiler fails loudly on invalid constructs
- Architecture doc becomes enforceable, not aspirational

---

## Phase 1: Bus-Aware Compiler Core

### Goal
Make buses real in the compiler and runtime.

### Work
- Unified dependency graph:
  - BlockOut nodes
  - BusValue nodes
- Deterministic ordering:
  - sortKey + stable ID
- Bus compilation pipeline:
  - adapter application
  - combine
- Signal buses end-to-end
- SCC detection + memory block registry
- Strict failure on illegal graphs

### Deliverable
- Patches compile and evaluate entirely through buses
- Wire-only graphs still supported but deprecated internally
- No UI changes yet

---

## Phase 2: Lazy Field Foundation

### Goal
Get Field semantics right, permanently.

### Work
- FieldExpr DAG representation
- Domain abstraction:
  - stable IDs
  - ordering guarantees
- Field combinators:
  - map
  - zip
  - reduce (explicit only)
- Lazy evaluation model:
  - sink-driven materialization
  - dense batch evaluation
- Field bus combination semantics
- Domain mismatch hard errors

### Deliverable
- Per-element stability
- No eager field buffers anywhere
- Performance proportional to render sinks only

**This is the most technically demanding phase—do not rush it.**

---

## Phase 3: Phase & Loop Primitives

### Goal
Make looping structural, not a UI trick.

### Work
- Derived phase blocks (stateless)
- Stateful phase accumulators
- Phase domain operations:
  - wrap
  - quantize
  - fold
  - warp
- Phase-trigger primitives
- Cycle index signals
- Clear scrub vs performance semantics

### Deliverable
- Infinite, scrub-perfect looping systems
- Multi-scale phase interactions
- No timeline concepts anywhere

---

## Phase 4: Runtime Safety & Live Editing

### Goal
Make the system unbreakable during play.

### Work
- Compile → validate → swap runtime
- Program compatibility signatures
- State mapping rules
- Output crossfade fallback (only)
- Error isolation and localization
- Zero-frame freezes

### Deliverable
- Live editing with no jank
- Systems behave like instruments
- Users can experiment fearlessly

---

## Phase 5: Bus Board UI

### Goal
Replace lanes with a musical, legible control surface.

### Work
- Bus Board layout
- Bus rows with live visualization
- Combine mode UI
- Silent value editing
- Binding UI (bus picker + lens)
- Interpretation stack editor

### Deliverable
- Buses become the primary mental model
- Users understand "why things move"

---

## Phase 6: Phase-Centric UX Polish

### Goal
Make infinite time feel good.

### Work
- Phase visualizations (rings, wraps)
- Mode-specific UI (Scrub / Loop / Performance)
- Default bus scaffolds
- Tutorial integration
- Performance mode layout

### Deliverable
- Infinite animation feels intuitive
- Phase is discoverable, not intimidating

---

## Phase 7: Composites & Reuse

### Goal
Enable scale without complexity.

### Work
- Composite authoring
- Internal bus exposure
- Scoped buses (optional, gated)
- Composite introspection
- Migration-safe expansion

### Deliverable
- Reusable "visual instruments"
- Library-ready systems

---

## Phase 8: First Release Polish

### Goal
Ship something people can live inside.

### Work
- Default patch templates
- Starter instruments
- UX refinement
- Documentation + tutorial polish
- Performance tuning (hot paths only)

### Deliverable
- v1.0 release:
  - infinite
  - deterministic
  - expressive
  - unbreakable

---

## Explicit Deferrals (Intentional—NOT v1)

These are **not** v1:
- Timeline/keyframes
- Automatic randomness
- Implicit state
- Per-element JS scripting
- Advanced exports
- WASM execution backend (design-ready only)

Deferring these preserves integrity.

---

## What Success Looks Like After v1

You know this worked if:
- Users let patches run for hours
- People share systems, not clips
- Edits feel playful, not risky
- Complexity grows without collapse
- You don't need to redesign time again

---

## Final Note

You are not building:
- an animation editor
- a node graph
- a generative toy

You are building:

> **A deterministic, infinite visual instrument.**

This roadmap protects that truth.
