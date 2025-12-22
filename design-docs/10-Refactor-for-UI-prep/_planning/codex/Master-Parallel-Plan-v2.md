# Master Parallel Plan (v2)

**Goal:** Execute five parallel workstreams informed by the refactor docs, then integrate via explicit gates.

## Parallel Workstreams
- Workstream 01: Lenses & Adapters End-to-End
- Workstream 02: Semantics Kernel + Port Identity
- Workstream 03: Default Sources + No-Params Migration
- Workstream 04: Layout as Projection
- Workstream 05: Legacy Cleanup + Complexity Reduction

## Integration Gates
- Gate A: Canonical PortKey + SemanticGraph APIs stable.
- Gate B: Adapter registry + auto-adapter algorithm available to UI + compiler.
- Gate C: Lens registry + lens param binding evaluation wired in compiler/runtime.
- Gate D: Default Source store + inputs-only model usable in UI.
- Gate E: ViewState + layout projection functional (lanes may remain).
- Gate F: Legacy code removed once gates A–E are complete.

## Parallelism Notes
- Workstream 01 can proceed once adapter registry interfaces exist (Gate B).
- Workstream 02 can proceed independently and should land Gate A early.
- Workstream 03 can proceed once Default Source data model is agreed.
- Workstream 04 can proceed in parallel using SemanticGraph as an input.
- Workstream 05 starts with inventory and can remove legacy bits once upstream gates are done.

## Critical Path
- Workstream 02 is the highest priority to unblock all other streams.
- Gate A is the earliest hard dependency for most parallel efforts.

## Definition of "Stable"
- Implemented, reviewed, and merged.
- Covered by targeted tests or validation scripts.
- Consumed by at least one dependent stream without local forks.

## Gate Deliverables (Quick Summary)
- Gate A delivers: PortKey/PortRef, SemanticGraph indices, validation API.
- Gate B delivers: Adapter registry + auto-adapter pathfinder with policy rules.
- Gate C delivers: Lens registry + LensInstance + compiler/runtime application.
- Gate D delivers: Default Source store + inputs-only port schema + fallback rules.
- Gate E delivers: ViewState model + projection layout consuming SemanticGraph.

## Risks (High-Level)
- Architectural blockers (PortKey/composite mapping) may delay dependent streams.
- Performance regressions if SemanticGraph/layout become too expensive.
- Migration complexity for block params → inputs (even without saved patches).

## Progress Tracking
- Weekly gate check-ins with simple status: not-started / in-progress / landed.
- Integration branch for each gate to reduce merge conflicts.

## Context: "No-Params" Migration
- Workstream 03 converts block parameters into inputs with Default Sources to unify semantics.
