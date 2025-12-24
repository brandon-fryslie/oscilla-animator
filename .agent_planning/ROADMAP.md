# Project Roadmap

Last updated: 2025-12-21-141500

## Phase 1: Core Editor UX [ACTIVE]

**Goal:** Deliver essential editor interactions and usability improvements

### Topics

#### replace-block [PROPOSED]
**Description:** Add 'replace block' functionality - right-click a block to list compatible blocks and instantly swap while preserving wiring
**Epic:** None
**Dependencies:** None
**Labels:** ui, ux, editor

#### bus-semantics-module [COMPLETED]
**Description:** Create canonical busSemantics module to eliminate duplicate publisher ordering logic between BusStore and compiler (3-5 hours)
**Epic:** None
**Dependencies:** None
**Labels:** architecture, bus-system, deterministic

#### complete-time-authority [COMPLETED]
**Description:** Flip requireTimeRoot flag to enforce exactly one TimeRoot per patch rule (1-2 hours)
**Epic:** None
**Dependencies:** None
**Labels:** architecture, timeroot, validation

---

## Phase 2: Foundation Architecture [QUEUED]

**Goal:** Complete core architectural contracts and time system implementation

### Topics

#### wp0-lock-contracts [PROPOSED]
**Description:** WP0: Lock the Contracts - TypeDesc validation, reserved bus enforcement, TimeRoot dependency rules
**Epic:** None
**Dependencies:** complete-time-authority
**Labels:** architecture, validation, compiler

#### wp1-timeroot-compilers [PROPOSED]
**Description:** WP1: TimeRoot + TimeModel + Player Rewrite - implement TimeRoot compilers and player integration
**Epic:** None
**Dependencies:** wp0-lock-contracts, bus-semantics-module
**Labels:** architecture, timeroot, runtime, player

#### wp2-bus-aware-compiler [PROPOSED]
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

## Phase 5: Debugger [QUEUED]

**Goal:** Build a non-technical debug system that feels like instrument diagnostics - "what's feeding this?", "why is it flat?", "what changed?"

### Topics

#### debug-hud [PROPOSED]
**Description:** Always-visible health bar with Clock/Health/Performance/Stability lights. Clicking any light opens corresponding panel pre-filtered.
**Epic:** None
**Dependencies:** wp5-render-sink-buffer
**Labels:** ui, debug, observability
**Spec:** `design-docs/11-Debugger/1-NonTech-Overview.md` (§A)

#### debug-graph-compile-time [PROPOSED]
**Description:** Compiler emits DebugGraph alongside Program - structure of buses/publishers/listeners, pipelines, byPort index. Foundation for all debug features.
**Epic:** None
**Dependencies:** wp2-bus-aware-compiler
**Labels:** architecture, debug, compiler
**Spec:** `design-docs/11-Debugger/2-NonTech-Arch.md` (§2)

#### debug-snapshot-runtime [PROPOSED]
**Description:** Runtime emits DebugSnapshot at 10-15Hz with bus values, binding values (TRACE), perf counters, health stats. Ring buffers for sparklines.
**Epic:** None
**Dependencies:** debug-graph-compile-time
**Labels:** runtime, debug, observability
**Spec:** `design-docs/11-Debugger/2-NonTech-Arch.md` (§3)

#### debug-tap-instrumentation [PROPOSED]
**Description:** Add DebugTap interface to compiler/runtime. Tap points: bus combine, listener boundary, field materialization, adapter/lens invocation.
**Epic:** None
**Dependencies:** debug-snapshot-runtime
**Labels:** architecture, debug, instrumentation
**Spec:** `design-docs/11-Debugger/3-NonTech-LowLevel.md`

#### probe-mode-ui [PROPOSED]
**Description:** Probe toggle button + ProbeCard component. Hover any debuggable surface to see live value, source chain, and fix suggestions.
**Epic:** None
**Dependencies:** debug-tap-instrumentation
**Labels:** ui, debug, ux
**Spec:** `design-docs/11-Debugger/4-NonTech-UI-Spec.md` (§1-3)

#### trace-view-panel [PROPOSED]
**Description:** Expanded pipeline view: Sources → Combine → Transform → Destination. Reorderable lens stack, combine mode selector, live value ladder.
**Epic:** None
**Dependencies:** probe-mode-ui
**Labels:** ui, debug, ux
**Spec:** `design-docs/11-Debugger/4-NonTech-UI-Spec.md` (§4)

#### diagnostics-rules-engine [PROPOSED]
**Description:** Deterministic rules engine for diagnostics: NaN/Inf, silent bus, conflicts, flatline, jitter, clipping, performance. Hysteresis to prevent flicker.
**Epic:** None
**Dependencies:** debug-snapshot-runtime
**Labels:** architecture, debug, diagnostics
**Spec:** `design-docs/11-Debugger/5-NonTech-RulesEngine.md`

#### fix-action-system [PROPOSED]
**Description:** Canonical fix actions (EnablePublisher, AddLens, SetCombineMode, etc.) that map FixActionSpec to undoable transactions.
**Epic:** None
**Dependencies:** diagnostics-rules-engine
**Labels:** architecture, debug, transactions
**Spec:** `design-docs/11-Debugger/5-NonTech-RulesEngine.md` (§5-6)

#### diagnostics-drawer [PROPOSED]
**Description:** Diagnostics panel with Overview/Buses/Performance tabs. Shows actionable list of issues with Fix buttons. No logs or stack traces.
**Epic:** None
**Dependencies:** fix-action-system, probe-mode-ui
**Labels:** ui, debug, ux
**Spec:** `design-docs/11-Debugger/1-NonTech-Overview.md` (§C)

#### main-ui-debug-affordances [PROPOSED]
**Description:** Always-on debug hints: bus row meters/badges, port binding chips, block activity halos, Focus Mode for tracing connections.
**Epic:** None
**Dependencies:** debug-snapshot-runtime
**Labels:** ui, debug, ux
**Spec:** `design-docs/11-Debugger/6-NonTech-MainUI.md`

#### mini-viz-primitives [PROPOSED]
**Description:** Reusable visualization components: Meter, Sparkline, PhaseRing, Swatch, PulseStrip, XYDot. Type-specific value displays.
**Epic:** None
**Dependencies:** None
**Labels:** ui, components, debug
**Spec:** `design-docs/11-Debugger/4-NonTech-UI-Spec.md` (§7)

---

## Phase 6: Power-User Debug [QUEUED]

**Goal:** Technical debugger for power users - exact evaluation order, deterministic causality, deep inspection

### Topics

#### trace-events-system [PROPOSED]
**Description:** TraceEvents ring buffer with scoped recording. Events: BusEvalStart, PublisherEval, AdapterApplied, LensApplied, CombineStep, FieldMaterialize.
**Epic:** None
**Dependencies:** debug-tap-instrumentation
**Labels:** architecture, debug, tracing
**Spec:** `design-docs/11-Debugger/10-PowerUser-Overview.md` (§1.3)

#### technical-debug-panel [PROPOSED]
**Description:** Power-user panel with Graph/Buses/Bindings/Trace/Diff tabs. Full structural truth, deterministic ordering, type path visualization.
**Epic:** None
**Dependencies:** trace-events-system
**Labels:** ui, debug, power-user
**Spec:** `design-docs/11-Debugger/10-PowerUser-Overview.md` (§3)

#### diff-tab-jank-detection [PROPOSED]
**Description:** Diff tab showing what changed after edit, jank risk classification (SAFE/RISKY/BREAKING), suggested mitigations.
**Epic:** None
**Dependencies:** technical-debug-panel
**Labels:** ui, debug, hot-swap
**Spec:** `design-docs/11-Debugger/10-PowerUser-Overview.md` (§3.5)

#### field-plan-explain [PROPOSED]
**Description:** FieldExpr.explain() returns FieldPlan with cost estimate and dependencies. Enables "why is this field being rematerialized?" answers.
**Epic:** None
**Dependencies:** wp4-lazy-field-core
**Labels:** architecture, debug, fields
**Spec:** `design-docs/11-Debugger/10-PowerUser-Overview.md` (§4.3)

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
