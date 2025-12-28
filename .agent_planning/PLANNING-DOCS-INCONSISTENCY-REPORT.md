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

### Issue 1.1: Does CycleTimeRoot Exist?

**Conflict:**

| Document | Position |
|----------|----------|
| `02.1-TimeConsole-UI.md` | "There is no CycleTimeRoot" - only FiniteTimeRoot and InfiniteTimeRoot exist |
| `07-UI-Spec.md` | References CYCLE mode with TimeRoot picker showing "Cycle" option |
| `09-Blocks.md` | Defines `CycleTimeRoot` as a full block with inputs/outputs |
| `10-Golden-Patch.md` | Uses `CycleTimeRoot(period = 8.0s, mode = loop)` |
| `05-Compilation.md` | Uses `CycleTimeRoot` in TimeModel inference rules |
| `08-Export.md` | Expects `cyclic` TimeModel from CycleTimeRoot |
| `claude_memory/03-time-architecture.md` | Lists `CycleTimeRoot` as one of three TimeRoot types |

**Resolution Needed:** Is there a CycleTimeRoot block, or are cycles only derived via the Modulation Rack from Finite/Infinite roots?

CycleTimeRoot - Removed from spec.  Remove it entirely. Only two time modes, finite and infinite.

---

### Issue 1.2: TimeModel Variants

**Conflict:**

| Document | TimeModel Definition |
|----------|---------------------|
| `01-Vision.md` | `{ kind: 'finite' \| 'infinite' }` - TWO kinds only |
| `02-Time-Architecture.md` | `finite(durationMs)` or `infinite(windowMs)` - TWO kinds |
| `05-Compilation.md` | Includes `cyclic` as a third kind derived from CycleTimeRoot |
| `08-Export.md` | `ExportTimePlan` has `finite`, `cyclic`, `infinite` - THREE kinds |
| `10-Golden-Patch.md` | Uses `{ kind: 'cyclic', periodMs: 8000 }` |
| `claude_memory/03-time-architecture.md` | `finite`, `cyclic`, `infinite` - THREE kinds |

**Resolution Needed:** Is TimeModel a 2-variant or 3-variant enum?

2-variant, finite & infinite

---

### Issue 1.3: TimeModel Determination

**Conflict:**

| Document | Rule |
|----------|------|
| `02-Time-Architecture.md` | "Patch topology is defined solely by the TimeRoot block" |
| `05-Compilation.md` | Infers `infinite` from feedback loops crossing memory blocks |

**Resolution Needed:** Can graph properties (like feedback loops) change the TimeModel, or is it purely determined by the TimeRoot?

The TimeModel is determined only by the TimeRoot.
Graph structure is never allowed to redefine time.

If feedback loops, buses, or clever block wiring could change the TimeModel, then:
•	Two patches with identical TimeRoots could run at different speeds
•	A patch edit could retroactively change playback duration
•	Hot-swap would be impossible without visual jumps
•	Debug traces would lie
•	Transport (play, loop, scrub) would become nondeterministic

Time must have exactly one authority, TimeRoot.

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

---

### Issue 3.2: View Looping for Finite Patches

**Conflict:**

| Document | Position |
|----------|----------|
| `02.1-TimeConsole-UI.md` | Finite mode has playback policy: Once/Loop/Ping-pong |
| `07-UI-Spec.md` | "No 'Loop View' option - if user wants looping, use CycleTimeRoot" |

**Resolution Needed:** Can finite patches have view-looping modes, or must users switch to CycleTimeRoot for looping?

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

---

### Issue 4.2: Reserved `time` Bus

**Conflict:**

| Document | Position |
|----------|----------|
| `02-Time-Architecture.md` | `time` is reserved, always present, published only by TimeRoot |
| `02.2-Time-and-Rails.md` | `time` is system-reserved, always present |
| `03-Buses.md` | No mention of reserved `time` bus |

**Resolution Needed:** Is there a reserved `time` bus that TimeRoot publishes to?

---

## 5. Auto-Publication Behavior

### Issue 5.1: What Does TimeRoot Auto-Publish?

**Conflict:**

| Document | TimeRoot Publishing |
|----------|---------------------|
| `02-Time-Architecture.md` | TimeRoot publishes only to reserved `time` bus |
| `03-Buses.md` | All TimeRoots auto-publish phase/pulse/energy (marked provisional) |
| `09-Blocks.md` | CycleTimeRoot auto-publishes phase->phaseA, wrap->pulse, energy->energy |

**Resolution Needed:** Does TimeRoot only publish `time`, or does it also publish phase/pulse/energy?

---

### Issue 5.2: InfiniteTimeRoot Outputs

**Conflict:**

| Document | InfiniteTimeRoot Outputs |
|----------|-------------------------|
| `02-Time-Architecture.md` | Only `systemTime`, no required inputs, no ambient phase/pulse/energy |
| `09-Blocks.md` | Has `periodMs` input, outputs phase/pulse/energy (all marked provisional) |

**Resolution Needed:** Does InfiniteTimeRoot have minimal outputs or full outputs like CycleTimeRoot?

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

---

## 7. Document Authority and Version Confusion

### Issue 7.1: Multiple Document Hierarchies

**Observation:**

| Directory | Description | Status |
|-----------|-------------|--------|
| `design-docs/1-Full-System-Design/` | Original design documents | Historical? |
| `design-docs/3-Synthesized-v2/` | "Authoritative" synthesized docs | Current? |
| `claude_memory/` | Quick reference memory files | Active |
| `CLAUDE.md` | Points to `design-docs/3-Synthesized/` (doesn't exist) | Outdated reference |

**Resolution Needed:**
- Is `3-Synthesized-v2` the current authoritative source?
- The path `design-docs/3-Synthesized/` referenced in multiple places doesn't exist
- What is the status of `1-Full-System-Design` docs?

---

### Issue 7.2: Provisional Markers

**Observation:** Many features in `03-Buses.md` and `09-Blocks.md` are marked "PROVISIONAL (2025-12-23)".

**Resolution Needed:** What is the process for promoting provisional items to authoritative?

---

## 8. Scrubbing Behavior

### Issue 8.1: Rail Reads - Same-Frame or Frame-Latched?

**Conflict:**

| Document | Position |
|----------|----------|
| `02.3-Rails-More.md` | Presents both options, recommends frame-latched (t-1) |
| Other documents | No definitive choice locked |

**Resolution Needed:** Lock down whether rail reads see current or previous frame values.

---

## 9. Compilation and Runtime Model

### Issue 9.1: Closure-Based vs IR-Based Compiler

**Current State:**
- Existing code uses closure-based compilation (`(t, ctx) => value`)
- `HANDOFF-IR-COMPILER.md` describes migration to data-driven IR
- Some documents assume old model, some assume new

**Resolution Needed:** Clarify which documents describe the current state vs target state.

---

## 10. Block Naming Inconsistencies

### Issue 10.1: PhaseClock vs PhaseFromTime

| Document | Name Used |
|----------|-----------|
| `02-Time-Architecture.md` | `PhaseFromTime` |
| `09-Blocks.md` | `PhaseClock` |
| `1-Full-System-Design/` docs | `PhaseClock` |

**Resolution Needed:** Standardize block naming.

---

### Issue 10.2: Position Mapper Block Names

| Document | Name Used |
|----------|-----------|
| `CanonicalPrimitives-Set.md` | `PositionMapGrid`, `PositionMapCircle` |
| `09-Blocks.md` | `GridDomain` (combined domain + positions) |

**Resolution Needed:** Are domain and position mapping separate blocks or combined?

---

## 11. Field Semantics

### Issue 11.1: Field Type Definition

| Document | Field Definition |
|----------|-----------------|
| `02-Core-Concepts.md` | `type Field<T> = FieldExpr<T>` - lazy expression |
| `claude_memory/02-type-system.md` | `type Field<T> = (seed, n, ctx) => readonly T[]` - function returning array |
| `1-Full-System-Design/05-Fields.md` | `(elementId, TimeCtx, EvalCtx) → Value` - per-element function |

**Resolution Needed:** Lock down canonical Field type signature.

---

## 12. Terminology Drift

### Issue 12.1: App Name

| Document | Name |
|----------|------|
| `1-Full-System-Design/` | "Loom" |
| `3-Synthesized-v2/` | "Oscilla" |
| `CLAUDE.md` | "Oscilla" |

**Resolution Needed:** Confirm app name is "Oscilla" and update all references.

---

### Issue 12.2: Combine Modes

| Document | Term |
|----------|------|
| `03-Buses.md` | `last`, `sum`, `or` |
| `02-Time-Architecture.md` | `last`, `sum`, `or`, `mix` |
| Various | Sometimes "combine rule", sometimes "combine mode" |

**Resolution Needed:** Standardize terminology and confirm whether `mix` is a valid combine mode.

---

## Summary of Critical Decisions Needed

1. **CycleTimeRoot existence** - Does this block exist, or are cycles only derived?
2. **TimeModel variants** - 2 or 3 kinds?
3. **Rails vs Buses** - Separate concepts or merged?
4. **Canonical bus set** - Definitive list needed
5. **TimeRoot auto-publication** - What exactly gets auto-published?
6. **Scrubbing status** - Implemented or deferred?
7. **View looping for finite** - Allowed or must use CycleTimeRoot?
8. **Rail read timing** - Same-frame or frame-latched?
9. **Document authority** - Which docs are current?
10. **Block naming** - PhaseClock vs PhaseFromTime, etc.

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
- `design-docs/3-Synthesized-v2/` - Topic-organized synthesized docs
- `design-docs/3-Synthesized-v2/01-Clarifying-Questions.md` - Lists 18 known inconsistencies

### Reference Memory Files
- `claude_memory/00-essentials.md` through `07-golden-patch.md`

### Historical/Foundational
- `design-docs/1-Full-System-Design/` - Original design vision

### Implementation Plans
- `HANDOFF-IR-COMPILER.md` - IR migration plan
- `design-docs/6-Transactions/` - Undo/redo system
- `design-docs/13-Renderer/` - Render IR specification
