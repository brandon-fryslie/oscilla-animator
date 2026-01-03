# Planning Documents Inconsistency Report

**Generated:** 2025-12-27
**Purpose:** Identify inconsistencies, ambiguities, and conflicts across all planning documents

---

## Table of Contents

1. [TimeRoot and TimeModel](#1-timeroot-and-timemodel)
2. [Rails vs Buses](#2-rails-vs-buses)
3. [Time Console and Player](#3-time-console-and-player)
4. [Canonical Bus Set](#4-canonical-bus-set)
5. [Auto-Publication Behavior](#5-auto-publication-behavior)
6. [Type System Representation](#6-type-system-representation)
7. [Document Authority and Version Confusion](#7-document-authority-and-version-confusion)
8. [Scrubbing Behavior](#8-scrubbing-behavior)
9. [Compilation and Runtime Model](#9-compilation-and-runtime-model)
10. [Block Naming Inconsistencies](#10-block-naming-inconsistencies)
11. [Field Semantics](#11-field-semantics)
12. [Terminology Drift](#12-terminology-drift)

---

## 1. TimeRoot and TimeModel



**Conflict:**

| Document | Position |
|----------|----------|

| `07-UI-Spec.md` | References CYCLE mode with TimeRoot picker showing "Cycle" option |









- Time topology is defined only by `FiniteTimeRoot` or `InfiniteTimeRoot`.
- Cycles are produced by the **Time Console** as **Global Rails** (see §2/§5). They are not blocks.

---

### Issue 1.2: TimeModel Variants

**Conflict:**

| Document | TimeModel Definition |
|----------|---------------------|
| `01-Vision.md` | `{ kind: 'finite' \| 'infinite' }` - TWO kinds only |
| `02-Time-Architecture.md` | `finite(durationMs)` or `infinite(windowMs)` - TWO kinds |

| `08-Export.md` | `ExportTimePlan` has `finite`, `cyclic`, `infinite` - THREE kinds |
| `10-Golden-Patch.md` | Uses `{ kind: 'cyclic', periodMs: 8000 }` |
| `claude_memory/03-time-architecture.md` | `finite`, `cyclic`, `infinite` - THREE kinds |

**Resolution Needed:** Is TimeModel a 2-variant or 3-variant enum?

**Answer:** TimeModel is **2 variants only**:
- `{ kind: 'finite', durationMs }`
- `{ kind: 'infinite' }`
No `cyclic` variant.

---

### Issue 1.3: TimeModel Determination

**Conflict:**

| Document | Rule |
|----------|------|
| `02-Time-Architecture.md` | "Patch topology is defined solely by the TimeRoot block" |
| `05-Compilation.md` | Infers `infinite` from feedback loops crossing memory blocks |

**Resolution Needed:** Can graph properties (like feedback loops) change the TimeModel, or is it purely determined by the TimeRoot?

**Answer:** TimeModel is determined **only** by the TimeRoot.
- Graph structure (feedback loops, buses, memory blocks) must never change time topology.
- If the graph violates time assumptions, it is a **compile error**, not an implicit time-mode change.

---

## 2. Rails vs Buses

### Issue 2.1: Are Rails Distinct from Buses?

**Conflict:**

| Document | Position |
|----------|----------|
| `02-Time-Architecture.md` | Rails are conceptually distinct from buses; optional bus mirroring |
| `02.2-Time-and-Rails.md` | Rails are fixed global channels, distinct from user buses |
| `03-Buses.md` | Treats phaseA/pulse/energy as canonical *buses*, no mention of rails |
| `04-Buses.md` (claude_memory) | Lists phaseA, pulse, energy, palette as *buses* |

**Resolution Needed:** Are rails a separate concept from buses, or are they just reserved buses with special behavior?

**Answer:** Rails are implemented as **reserved buses**.
- **Rails**: fixed, built-in channels (non-deletable, locked type, fixed combine semantics).
- **User buses**: user-created routing channels (fully configurable, deletable).

---

### Issue 2.2: pulse vs pulseA/pulseB

**Conflict:**

| Document | Pulse Naming |
|----------|-------------|
| `02-Time-Architecture.md` | `pulseA`, `pulseB` as distinct rails |
| `02.2-Time-and-Rails.md` | `pulseA`, `pulseB` rails |
| `03-Buses.md` | Single `pulse` bus |
| `10-Golden-Patch.md` | Single `pulse` bus |

**Resolution Needed:** Is there one `pulse` bus or two (`pulseA`/`pulseB`)?

**Answer:** One rail named `pulse`.
- `pulseA`/`pulseB` do not exist.
- If multiple pulse streams are needed later, use user buses or additional named rails explicitly added by spec.

Pulse: The canonical stream of time boundary crossings emitted by the TimeRoot.

It is the only thing allowed to cause discrete state changes in the patch.

Everything else is continuous math.

Why pulse is not redundant

If you remove pulse and rely on “frames”, you lose:
•	frame-rate independence
•	offline rendering correctness
•	deterministic replay
•	time-stretching
•	multi-client sync
•	debugging causality

If you remove pulse and rely on phase deltas, you lose:
•	exact wrap detection
•	event alignment
•	envelope triggering
•	quantization
•	beat locking

Pulse exists because events are not values.

They are edges in time.

###### How pulse is generated:

pulse is emitted by the TimeRoot as a function of sim time t (monotonic, never loops). It’s a discrete edge stream derived from one or more quantizers.

Canonical generator:
•	Maintain tPrev (last evaluated sim time) and tNow.
•	For each quantizer Q with step size ΔQ (seconds), compute integer step indices:

```
kPrev = floor(tPrev / ΔQ)
kNow  = floor(tNow  / ΔQ)
```

If kNow > kPrev, emit N pulses for each crossed boundary (for deterministic catch-up):

For i in (kPrev+1 .. kNow):
•	boundary time tb = i * ΔQ
•	emit pulse event with payload { time: tb, count: i, dt: tb - lastBoundaryTime }

---

### Issue 2.3: palette as Rail or Bus

**Conflict:**

| Document | Position |
|----------|----------|
| `02-Time-Architecture.md` | `palette` is a Global Rail |
| `02.2-Time-and-Rails.md` | `palette` is a Global Rail |
| `03-Buses.md` | Does NOT list `palette` in canonical bus set |
| `10-Golden-Patch.md` | Lists `palette` as canonical bus |

**Resolution Needed:** Is `palette` a canonical bus, a rail, or both?

**Answer:** `palette` is a **Rail** (reserved bus).
- It may be *mirrored* to a user bus only via an explicit binding (see §5), but it is not itself a user bus.

Rails ARE 'canonical buses'.  Bus = flexible, configurable, can go anywhere.  Rail = still moves stuff but fixed and you've got what you've got

---

## 3. Time Console and Player

### Issue 3.1: Scrubbing - Current or Deferred?

**Conflict:**

| Document | Position |
|----------|----------|
| `02.1-TimeConsole-UI.md` | "Scrubbing has been DEFERRED" |
| `02-Time-Architecture.md` | Specifies scrubbing behavior for all modes |
| `07-UI-Spec.md` | Specifies scrubbing interactions for all modes |

**Resolution Needed:** Is scrubbing implemented in v1 or deferred?

**Answer:** Scrubbing is **required** (not deferred).
- Finite: scrub in `[0..durationMs]`.
- Infinite: scrub controls **view window origin** (time offset) but does not redefine time topology.

---

### Issue 3.2: View Looping for Finite Patches

**Conflict:**

| Document | Position |
|----------|----------|
| `02.1-TimeConsole-UI.md` | Finite mode has playback policy: Once/Loop/Ping-pong |




**Answer:** Finite patches support **view looping** as a *transport policy*.
- Looping is a **player/view** behavior for finite time; it does not require any special block.


The player has a playback mode that allows finite animations to loop.  This does not require any changes to the patch or 
violate any time constraints.  This is ONLY available in finite mode and is identical to moving the play head to the first frame and playing the animation 
again (no feedback or other 'infinite' looping semantics).  This is a UX affordance.

---

## 4. Canonical Bus Set

### Issue 4.1: Complete List of Canonical Buses

**Conflict:**

| Document | Canonical Buses |
|----------|-----------------|
| `03-Buses.md` | phaseA, phaseB, pulse, energy, progress |
| `02-Time-Architecture.md` | phaseA, phaseB, pulseA, pulseB, energy, palette, time |
| `10-Golden-Patch.md` | phaseA, phaseB, pulse, energy, palette |
| `claude_memory/04-buses.md` | phaseA, pulse, energy, palette, progress |

**Resolution Needed:** What is the definitive canonical bus set?

**Answer:** Definitive **Global Rails** (reserved buses) are:
- `time` : `signal<time>` (monotonic time)
- `phaseA` : `signal<number>` in `[0..1)`
- `phaseB` : `signal<number>` in `[0..1)`
- `pulse` : `event<trigger>` (wrap/beat events)
- `energy` : `signal<number>` in `[0..1]`
- `palette` : `signal<number>` in `[0..1]` (palette index/position; palette asset chosen in Time Console)
No other canonical buses.

A global, time-derived, deterministic modulation signal that exists whether or not the patch references it.

---

### Issue 4.2: Reserved `time` Bus

**Conflict:**

| Document | Position |
|----------|----------|
| `02-Time-Architecture.md` | `time` is reserved, always present, published only by TimeRoot |
| `02.2-Time-and-Rails.md` | `time` is system-reserved, always present |
| `03-Buses.md` | No mention of reserved `time` bus |

**Resolution Needed:** Is there a reserved `time` bus that TimeRoot publishes to?

**Answer:** Yes — `time` is a **Rail** (reserved bus).
- It is always present.
- It is written only by the runtime transport / TimeRoot authority.

---

## 5. Auto-Publication Behavior

### Issue 5.1: What Does TimeRoot Auto-Publish?

**Conflict:**

| Document | TimeRoot Publishing |
|----------|---------------------|
| `02-Time-Architecture.md` | TimeRoot publishes only to reserved `time` bus |
| `03-Buses.md` | All TimeRoots auto-publish phase/pulse/energy (marked provisional) |


**Resolution Needed:** Does TimeRoot only publish `time`, or does it also publish phase/pulse/energy?

**Answer:** TimeRoot publishes only `time`.
- `phaseA/phaseB/pulse/energy/palette` are authored by the **Time Console** and evaluated as rails.
- Rails may optionally be **bound** from user buses (explicit mapping), but that does not change TimeRoot.

See @design-docs/final-System-Invariants/Rail-Modulation-and-Feedback.md

---

### Issue 5.2: InfiniteTimeRoot Outputs

**Conflict:**

| Document | InfiniteTimeRoot Outputs |
|----------|-------------------------|
| `02-Time-Architecture.md` | Only `systemTime`, no required inputs, no ambient phase/pulse/energy |
| `09-Blocks.md` | Has `periodMs` input, outputs phase/pulse/energy (all marked provisional) |



**Answer:** `InfiniteTimeRoot` is minimal.
- It establishes `TimeModel = { kind: 'infinite' }` and provides monotonic `time` only.
- Cycles/phase/pulse/energy are rail outputs from Time Console, not TimeRoot outputs.

---

## 6. Type System Representation

### Issue 6.1: Dual Type Systems

**Conflict:**

| Location | Type Representation |
|----------|---------------------|
| `src/editor/types.ts` | `TypeDesc { world, domain, category, busEligible }` |
| `src/editor/compiler/types.ts` | `ValueKind = 'Signal:number' \| 'Field:vec2' \| ...` string union |
| `HANDOFF-IR-COMPILER.md` | Notes this duplication as a problem to solve |

**Impact:** These two systems represent the same concepts differently, causing mapping issues.

**Resolution Needed:** Complete the type unification described in HANDOFF-IR-COMPILER.md

**Answer:** Unify types by making `TypeDesc` the single source of truth.
- Compiler IR uses canonical `TypeDesc` (world/domain/category/busEligible).
- Remove/stop extending the `ValueKind` string-union as an independent type system; keep it only as a transitional adapter if needed.
- All slot typing, bus typing, and IR validation must reference `TypeDesc` directly.

AUTHORITATIVE: Deprecate ValueKind and mark for removal.


---

## 7. Document Authority and Version Confusion

### Issue 7.1: Multiple Document Hierarchies

**Observation:**

| Directory | Description | Status |
|-----------|-------------|--------|
| `design-docs/1-Full-System-Design/` | Original design documents | Historical? |
| `design-docs/final-Synthesized-v2/` | "Authoritative" synthesized docs | Current? |
| `claude_memory/` | Quick reference memory files | Active |
| `CLAUDE.md` | Points to `design-docs/3-Synthesized/` (doesn't exist) | Outdated reference |

**Resolution Needed (Answered):**
- `design-docs/final-Synthesized-v2/` is the **authoritative** spec set.
- ALL others are **historical reference only** and must be labeled as such.
- `claude_memory/` is **non-authoritative notes** and must be regenerated from `final-Synthesized-v2` when changes land.
- Update `CLAUDE.md` to point to `design-docs/final-Synthesized-v2/` (the existing `design-docs/3-Synthesized/` path is invalid and must be removed).

---

### Issue 7.2: Provisional Markers

**Observation:** Many features in `03-Buses.md` and `09-Blocks.md` are marked "PROVISIONAL (2025-12-23)".

**Resolution Needed:** What is the process for promoting provisional items to authoritative?

**Answer:** Promotion process:
1) Spec change lands in `design-docs/final-Synthesized-v2/` with a clear decision statement.
2) Implementation lands behind feature flags only if needed for migration; otherwise ship directly.
3) Remove "PROVISIONAL" markers in the source doc and update this inconsistency report.
4) Add/adjust compiler/runtime constraints to enforce the decision.

---

## 8. Scrubbing Behavior

### Issue 8.1: Rail Reads - Same-Frame or Frame-Latched?

**Conflict:**

| Document | Position |
|----------|----------|
| `02.3-Rails-More.md` | Presents both options, recommends frame-latched (t-1) |
| Other documents | No definitive choice locked |

**Resolution Needed:** Lock down whether rail reads see current or previous frame values.

**Answer:** Rails are **frame-latched**.
- Within a rendered frame, all rail reads observe a single coherent snapshot.
- Updates become visible on the next frame.
This is required for determinism, cacheability, and stable debugging.

---

## 9. Compilation and Runtime Model

### Issue 9.1: Closure-Based vs IR-Based Compiler

**Current State:**
- Existing code uses closure-based compilation (`(t, ctx) => value`)
- `HANDOFF-IR-COMPILER.md` describes migration to data-driven IR
- Some documents assume old model, some assume new

**Resolution Needed:** Clarify which documents describe the current state vs target state.

**Answer:** Canonical target is **IR-based compilation + scheduled runtime**.
- Closure-based compiler/runtime docs are historical and must be labeled "Legacy/Archived".
- Any document describing closures as the runtime model must be moved to a historical section or updated.

---

## 10. Block Naming Inconsistencies

### Issue 10.1: PhaseClock vs PhaseFromTime

| Document | Name Used |
|----------|-----------|
| `02-Time-Architecture.md` | `PhaseFromTime` |
| `09-Blocks.md` | `PhaseClock` |
| `1-Full-System-Design/` docs | `PhaseClock` |

**Resolution Needed:** Standardize block naming.

**Answer:** `PhaseClock` is removed.
- Phase is produced by **Rails** (Time Console), not a topology block.
- Any remaining references must use rail terminology (e.g., `phaseA` rail) rather than a block name.

---

### Issue 10.2: Position Mapper Block Names

| Document | Name Used |
|----------|-----------|
| `CanonicalPrimitives-Set.md` | `PositionMapGrid`, `PositionMapCircle` |
| `09-Blocks.md` | `GridDomain` (combined domain + positions) |

**Resolution Needed:** Are domain and position mapping separate blocks or combined?

**Answer:** Separate concerns.
- Identity authority: `DomainN` (and other Domain producers).
- Mapping: separate operator/composite blocks such as `PositionMapGrid`, `PositionMapCircle`, etc.
- `GridDomain` may exist only as a **composite convenience**, not as a primitive authority.

---

## 11. Field Semantics

### Issue 11.1: Field Type Definition

| Document | Field Definition |
|----------|-----------------|
| `02-Core-Concepts.md` | `type Field<T> = FieldExpr<T>` - lazy expression |
| `claude_memory/02-type-system.md` | `type Field<T> = (seed, n, ctx) => readonly T[]` - function returning array |
| `1-Full-System-Design/05-Fields.md` | `(elementId, TimeCtx, EvalCtx) → Value` - per-element function |

**Resolution Needed:** Lock down canonical Field type signature.

**Answer:** Field is a lazy expression in IR:
- `Field<T> := FieldExpr<T>`
- Evaluated by materialization steps against a `Domain` into typed buffers (`Float32Array`, etc.).
No direct "function returns array" Field type in the canonical model.

---

## 12. Terminology Drift

### Issue 12.1: App Name

| Document | Name |
|----------|------|
| `1-Full-System-Design/` | "Loom" |
| `final-Synthesized-v2/` | "Oscilla" |
| `CLAUDE.md` | "Oscilla" |

**Resolution Needed:** Confirm app name is "Oscilla" and update all references.

**Answer:** App name is **Oscilla**.
- Update historical docs only if they are still used as references; otherwise label them historical.

---

### Issue 12.2: Combine Modes

| Document | Term |
|----------|------|
| `03-Buses.md` | `last`, `sum`, `or` |
| `02-Time-Architecture.md` | `last`, `sum`, `or`, `mix` |
| Various | Sometimes "combine rule", sometimes "combine mode" |

**Resolution Needed:** Standardize terminology and confirm whether `mix` is a valid combine mode.

**Answer:** Standardize on "combine mode".
- Allowed combine modes: `sum | average | max | min | last | layer`.
- `mix` and `or` are not valid modes in the canonical spec.

---

## Summary of Critical Decisions Needed

1. Rails vs Buses implementation details (constraints + binding UI)
2. Canonical rails type/semantics enforcement in compiler/runtime
3. Scrubbing UI specifics for finite vs infinite
4. Type-system unification execution plan (remove ValueKind drift)
5. Document authority hygiene (archiving + regeneration of notes)

---

## Recommended Next Steps

1. **User resolves the critical decisions above**
2. **Create a single canonical specification document** that addresses all resolved items
3. **Archive or clearly mark outdated documents**
4. **Update all memory files and CLAUDE.md** to reference the new canonical doc
5. **Remove provisional markers** once decisions are made

---

## Appendix: Document Index

### Primary Sources (appear most authoritative)
- `design-docs/final-Synthesized-v2/` - Topic-organized synthesized docs
- `design-docs/final-Synthesized-v2/01-Clarifying-Questions.md` - Lists 18 known inconsistencies

### Reference Memory Files
- `claude_memory/00-essentials.md` through `07-golden-patch.md`

### Historical/Foundational
- `design-docs/1-Full-System-Design/` - Original design vision

### Implementation Plans
- `HANDOFF-IR-COMPILER.md` - IR migration plan
- `design-docs/6-Transactions/` - Undo/redo system
- `design-docs/13-Renderer/` - Render IR specification
