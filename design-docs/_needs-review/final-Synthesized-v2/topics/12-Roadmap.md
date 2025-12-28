# Roadmap

## Source: 11-Roadmap.md

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
- Implement FiniteTimeRoot and InfiniteTimeRoot (NO CycleTimeRoot)
- Compiler outputs TimeModel (`finite` or `infinite` only)
- Player runs unbounded `t` and never wraps/clamps
- Time Console UI driven by timeModel only
- Time Console Modulation Rack produces Global Rails (phaseA, phaseB, pulse, energy, palette)

### Deliverables
- FiniteTimeRoot and InfiniteTimeRoot block compilers
- Player transport rewrite (remove loopMode from topology - keep as view-time policy)
- Time Console UI: Modulation Rack for rails, view playback modes for finite
- TimeRoot publishes only `time` bus; rails come from Time Console

### Golden Patch Checkpoint
With dummy RenderTree: phase ring animating, pulse indicator ticking, no wrapping bugs.

---

## WP2: Bus-Aware Compiler Graph

### Goal
Make bus routing real and deterministic.

### Must-Haves
- Compiler graph includes: block outputs, bus value nodes, publisher/listener edges
- Deterministic publisher ordering (sortKey)
- Bus combination semantics: sum, average, max, min, last, layer
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
- Composites: BreathEnergy, PulseAccentEnergy, SlowPaletteDrift, BreathingDotsRenderer (NO AmbientLoopRoot - removed with CycleTimeRoot)

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
