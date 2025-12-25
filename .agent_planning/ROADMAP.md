# Project Roadmap

Last updated: 2025-12-24-000000

---

## Phase 0: IR Compiler Migration - Contracts & Types [COMPLETED]

**Goal:** Migrate from closure-based compiler to data-driven IR architecture (Phase 1 of IR spec)

> **Core insight:** The "program" becomes data, not JavaScript functions. This enables determinism, debuggability, hot-swap without jank, and future Rust/WASM runtime.

### Topics

#### type-unification [COMPLETED]
**Description:** Unify editor TypeDesc and compiler ValueKind into one canonical type system
**Epic:** None
**Dependencies:** None
**Labels:** ir, types, architecture
**Deliverables:**
- `src/editor/ir/types/TypeDesc.ts` - Unified TypeDesc with TypeWorld, TypeDomain
- `src/editor/ir/types/typeConversion.ts` - Bridge utilities (ValueKind→TypeDesc, SlotType→TypeDesc)
- `typeEquals()`, `isCompatible()`, `isBusEligible()`, `getTypeCategory()` helpers

#### dense-id-system [COMPLETED]
**Description:** Introduce dense numeric indices for runtime lookups, string keys become debug-only
**Epic:** None
**Dependencies:** None
**Labels:** ir, types, performance
**Deliverables:**
- `src/editor/ir/types/Indices.ts` - Branded types (NodeIndex, BusIndex, ValueSlot, etc.)
- `src/editor/ir/types/DebugIndex.ts` - String↔index mapping for debugging
- `DebugIndexBuilder` class for interning entities

#### ir-core-types [COMPLETED]
**Description:** Define core IR TypeScript interfaces - pure types, no implementation
**Epic:** None
**Dependencies:** type-unification, dense-id-system
**Labels:** ir, schema, architecture
**Deliverables:**
- `src/editor/ir/schema/CompiledProgramIR.ts` - Main IR schema
- NodeIR, BusIR, StepIR interfaces
- InputSourceIR, OpCode unions
- TransformChainIR, ScheduleIR, PhasePartitionIR

#### timemodel-ir [COMPLETED]
**Description:** Define TimeModelIR with canonical time signals (finite, cyclic, infinite)
**Epic:** None
**Dependencies:** ir-core-types
**Labels:** ir, time, architecture
**Deliverables:**
- FiniteTimeModelIR, CyclicTimeModelIR, InfiniteTimeModelIR variants
- `src/editor/ir/time/TimeDerivation.ts` - Time signal derivation
- `deriveTimeSignals()`, `validateTimeModel()`, `calculateTimeDerivedValues()`

---

## Phase 1: Core Editor UX [QUEUED]

**Goal:** Deliver essential editor interactions and usability improvements

### Topics

#### replace-block [PROPOSED]
**Description:** Add 'replace block' functionality - right-click a block to list compatible blocks and instantly swap while preserving wiring
**Epic:** None
**Dependencies:** None
**Labels:** ui, ux, editor

#### bus-semantics-module [COMPLETED]
**Description:** Create canonical busSemantics module to eliminate duplicate publisher ordering logic between BusStore and compiler
**Epic:** None
**Dependencies:** None
**Labels:** architecture, bus-system, deterministic

#### complete-time-authority [COMPLETED]
**Description:** Flip requireTimeRoot flag to enforce exactly one TimeRoot per patch rule
**Epic:** None
**Dependencies:** None
**Labels:** architecture, timeroot, validation

---

## Phase 2: Foundation Architecture [QUEUED]

**Goal:** Complete core architectural contracts and time system implementation

### Topics

#### wp0-lock-contracts [COMPLETED]
**Description:** WP0: Lock the Contracts - TypeDesc validation, reserved bus enforcement, TimeRoot dependency rules
**Epic:** None
**Dependencies:** complete-time-authority
**Labels:** architecture, validation, compiler

#### wp1-timeroot-compilers [PROPOSED]
**Description:** WP1: TimeRoot + TimeModel + Player Rewrite - implement TimeRoot compilers and player integration
**Epic:** None
**Dependencies:** wp0-lock-contracts, bus-semantics-module
**Labels:** architecture, timeroot, runtime, player

#### wp2-bus-aware-compiler [COMPLETED]
**Description:** WP2: Bus-Aware Compiler Graph - complete lens compilation and validation
**Epic:** None
**Dependencies:** wp1-timeroot-compilers
**Labels:** architecture, compiler, bus-system

#### phase4-default-sources [PROPOSED]
**Description:** Phase 4: Default Sources - eliminate block.params in favor of Default Sources per input (28 block compilers)
**Epic:** None
**Dependencies:** wp2-bus-aware-compiler
**Labels:** architecture, compiler, refactor

---

## Phase 3: Advanced Features [QUEUED]

**Goal:** Implement domain system, field expressions, and render pipeline

### Topics

#### wp3-domain-stable-identity [PROPOSED]
**Description:** WP3: Domain + Stable Element Identity - Domain types, GridDomain compiler, StableIdHash, deterministic ordering
**Epic:** None
**Dependencies:** wp2-bus-aware-compiler
**Labels:** architecture, domains, fields, deterministic

#### wp4-lazy-field-core [PROPOSED]
**Description:** WP4: Lazy FieldExpr Core - implement lazy field evaluation system
**Epic:** None
**Dependencies:** wp3-domain-stable-identity
**Labels:** architecture, fields, lazy-evaluation, compiler

#### wp5-render-sink-buffer [PROPOSED]
**Description:** WP5: Render Sink + Buffer Materialization - render output structures and buffer optimization
**Epic:** None
**Dependencies:** wp4-lazy-field-core
**Labels:** architecture, rendering, performance, buffers

---

## Phase 4: Polish & Optimization [QUEUED]

**Goal:** Complete hot-swap system, add composite library, and ensure export correctness

### Topics

#### wp6-hot-swap-scheduling [PROPOSED]
**Description:** WP6: No-Jank Hot Swap Scheduling - implement seamless live patching without performance impact
**Epic:** None
**Dependencies:** wp5-render-sink-buffer
**Labels:** architecture, runtime, performance, hot-swap

#### wp7-composite-library [PROPOSED]
**Description:** WP7: Composite Library - build comprehensive library of reusable composite blocks
**Epic:** None
**Dependencies:** wp6-hot-swap-scheduling
**Labels:** ux, library, composites, blocks

#### wp8-export-correctness [PROPOSED]
**Description:** WP8: Export Correctness - phase-driven sampling, loop closure, determinism guarantees
**Epic:** None
**Dependencies:** wp5-render-sink-buffer
**Labels:** architecture, export, determinism, correctness

#### wp9-feedback-readiness [PROPOSED]
**Description:** WP9: Feedback Readiness - prepare system for user feedback collection and analysis
**Epic:** None
**Dependencies:** wp8-export-correctness
**Labels:** ux, feedback, analytics

#### technical-debt-cleanup [PROPOSED]
**Description:** Address 200+ TODO comments, fix remaining test failures, resolve architecture questions
**Epic:** None
**Dependencies:** wp6-hot-swap-scheduling
**Labels:** maintenance, cleanup, technical-debt

---

## Format Reference

### Topic States
- `PROPOSED` - Idea captured, no planning started
- `PLANNING` - STATUS/PLAN/DOD files exist
- `IN PROGRESS` - Implementation underway
- `COMPLETED` - All acceptance criteria met
- `ARCHIVED` - No longer maintained

### Phase Statuses
- `ACTIVE` - Currently being worked on
- `QUEUED` - Planned but not started
- `COMPLETED` - All topics completed
- `ARCHIVED` - No longer relevant

---

## IR Compiler Migration Reference

**Handoff document:** `HANDOFF-IR-COMPILER.md`
**Design docs:** `design-docs/12-Compiler-Final/`

### File Structure to Create
```
src/editor/ir/
├── types/
│   ├── TypeDesc.ts           # Unified type descriptors
│   ├── Indices.ts            # Dense numeric indices
│   ├── DebugIndex.ts         # String↔index mapping
│   ├── typeConversion.ts     # Legacy type bridges
│   └── __tests__/
├── schema/
│   ├── CompiledProgramIR.ts  # Main IR schema
│   └── __tests__/
├── time/
│   ├── TimeDerivation.ts     # Time signal derivation
│   └── __tests__/
└── index.ts                  # Public exports
```

### Key Design Invariants
1. **Program is data** - No user-meaningful logic in closures
2. **Determinism** - Same inputs → identical outputs
3. **Lazy Fields** - Fields are expressions until forced by sink
4. **Stable identity** - All nodes/buses/steps have stable IDs for diffing
5. **Central value store** - All values in indexed ValueStore
6. **Instrumentation is structural** - Every runtime event maps to IR step
