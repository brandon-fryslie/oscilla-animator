# Full System Design

This directory contains the complete architectural foundation for Loom's phase-driven, infinite animation system.
These documents are organized by topic and provide the verbatim source of truth for building implementation plans.

---

## Document Index

| File | Topic | Summary |
|------|-------|---------|
| `00-core-invariants.md` | Core Invariants | Non-negotiable system truths: TimeCtx, Signal vs Field, buses, state, domains |
| `01-time-and-phase.md` | Time & Phase | Phase clocks, derived vs stateful, multi-scale looping, the three time spaces |
| `02-signals.md` | Signals | Global temporal abstraction, evaluation model, phase as first-class domain |
| `03-fields.md` | Fields | Lazy evaluation, FieldExpr DAGs, element identity, domain rules |
| `05-lenses.md` | Lenses | Per-port perception stacks, lens steps library, compilation model |
| `06-compiler-runtime.md` | Compiler & Runtime | Evaluation pipeline, compilation responsibilities, composite expansion |
| `07-live-editing.md` | Live Editing | Jank prevention, state handling during swaps, crossfades |
| `08-ui-detail.md` | UI Detail | Bus Board, binding UI, transport modes, visual layout |
| `09-ux-philosophy.md` | UX Philosophy | How it feels, what makes it fun, the emotional loop |
| `10-canonical-primitives.md` | Primitives | Block registry: Domain, Field, Signal, Renderer primitives |
| `11-starter-composites.md` | Composites | Macro library: arrangements, variations, motion, colors, renderers |
| `12-risks-mitigations.md` | Risks | What can go wrong and structural countermeasures |
| `13-engineering-phases.md` | Engineering Phases | Build order, phase gates, explicit deferrals |

---

## Source Material

This content is reorganized from `feature_planning_docs/Full-System-Design/`:
- 01-Overview.md through 13-Engineering-Roadmap.md
- Lenses.md
- SourcePrimitives.md
- CanonicalPrimitives-*.md
- StarterCompositeLibrary.md
- Materialization-DefaultBuses.md

---

## How to Use These Documents

1. **For implementation planning**: Start with `00-core-invariants.md` to understand non-negotiables, then read the relevant topic document.

2. **For building a phase**: Consult `13-engineering-phases.md` for sequencing, then deep-dive into the topic documents that phase covers.

3. **For block implementation**: Use `10-canonical-primitives.md` for exact specifications and `11-starter-composites.md` for how primitives compose.

4. **For UI work**: Read `08-ui-detail.md` for structure and `09-ux-philosophy.md` for the guiding principles.

---

## The Core Insight

> **You are building a deterministic, infinite visual instrument.**

Everything in these documents serves that single truth.
