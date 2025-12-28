# Design Documentation

## Reading Guide

| Priority | Directory | Purpose |
|----------|-----------|---------|
| **1** | `spec/` | Canonical specification - the authoritative source |
| **2** | `ui/` | UI design and behavior |
| **3** | `reference/` | Examples, roadmap, catalogs |
| **4** | `implementation/` | Implementation details (for developers) |
| **5** | `future/` | Ideas not in v1 |
| **6** | `historical/` | Superseded documents (for context only) |

## spec/ - Canonical Specification

The single source of truth. If code conflicts with spec, spec is authoritative.

| File | Topic |
|------|-------|
| `00-invariants.md` | Core laws that cannot be violated |
| `01-type-system.md` | Signal, Field, Event, Domain, TypeDesc |
| `02-time.md` | TimeRoot, TimeModel, Time Console, rails |
| `03-buses.md` | Bus system, combine modes, frame latching |
| `04-compilation.md` | Compiler pipeline, validation, errors |
| `05-runtime.md` | Execution, hot swap, state preservation |
| `06-blocks.md` | Block taxonomy, categories, constraints |

## ui/ - UI Design

Behavior specification for user-facing interfaces.

| File | Topic |
|------|-------|
| `ui-spec.md` | Complete UI specification |

## reference/ - Reference Materials

Examples and catalogs.

| File | Topic |
|------|-------|
| `golden-patch.md` | "Breathing Constellation" canonical example |
| `roadmap.md` | Implementation roadmap (WP0-WP9) |
| `adapters.md` | Adapter/lens catalog |
| `export.md` | Export pipeline specification |

## implementation/ - Implementation Details

For developers working on internals.

| Directory | Topic |
|-----------|-------|
| `compiler/` | Compiler internals, passes, IR |
| `renderer/` | Renderer, materialization, 3D |
| `debugger/` | Diagnostics, tracing |

## future/ - Not v1

Ideas deferred to preserve integrity.

## historical/ - Superseded

Do NOT use for implementation. Reference for design evolution only.

---

## Key Decisions

These are resolved and final:

- **CycleTimeRoot**: REMOVED - Only FiniteTimeRoot and InfiniteTimeRoot exist
- **PhaseClock**: REMOVED - Phase comes from Time Console rails
- **TimeModel**: 2 variants only (`finite`, `infinite`)
- **Global Rails**: time, phaseA, phaseB, pulse, energy, palette
- **Combine modes**: sum, average, max, min, last, layer (NOT `or`, `mix`)
- **Scrubbing**: REQUIRED (not deferred)
- **Frame latching**: Rail reads see previous frame

See `.agent_planning/PLANNING-DOCS-INCONSISTENCY-REPORT.md` for resolution details.
