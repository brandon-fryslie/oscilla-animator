# Project Roadmap: IR Compiler Migration

Last updated: 2025-12-25-160000

> **Migration Strategy:** "Strangle Pattern" - New IR wraps existing closures, gradually replacing them while keeping the app running at every step.

---

## Document-to-Topic Mapping

Reference: `design-docs/12-Compiler-Final/`

| Doc | Title | Topics |
|-----|-------|--------|
| 01-Overview | Architecture Vision | All phases (guiding principles) |
| 01.1-Migration-Roadmap | 10-Phase Migration | All phases (migration order) |
| 02-IR-Schema | CompiledProgramIR Types | ir-core-types, type-unification |
| 03-Nodes | NodeTable, InputSourceIR | ir-node-table, input-resolution |
| 04-FieldExpr | Lazy Field DAG | fieldexpr-schema, field-materialization |
| 05-Lenses-Adapters | TransformChainIR | transform-chain-ir, adapter-lens-tables |
| 06-Default-Sources | ConstPool, DefaultSourceTable | default-source-system, const-pool |
| 07-Buses | BusTable, PublisherIR, ListenerIR | bus-ir-schema, bus-combine-nodes |
| 08-Outputs | OutputSpec, RenderTree | render-output-spec |
| 09-Caching | CacheKeySpec, CacheDep | cache-policy-ir, frame-cache |
| 10-Schedule-Semantics | ScheduleIR, StepIR | schedule-ir, step-kinds, ordering-rules |
| 11-Opcode-Taxonomy | OpCode enum | opcode-registry |
| 12-SignalExpr | SignalExprIR, StatefulSignalOp | signalexpr-schema, stateful-signals |
| 13-SignalExpr-Evaluator | SigEvaluator, SigEnv, caching | signal-evaluator, signal-frame-cache |
| 14-Compiled-IR-Program-Contract | Full CompiledProgram shape | compiled-program-contract, value-ref |
| 15-Canonical-Lowering-Pipeline | 11-pass compiler | lowering-passes, block-lowering |
| 16-Block-Lowering | BlockLowerFn, IRBuilder | ir-builder, block-compiler-contract |
| 17-Scheduler-Full | Runtime per-frame algorithm | runtime-scheduler, hot-swap-semantics |
| 18-Debugger-Part-1 | Spans, ring buffers, causal edges | debug-spans, ring-buffers, causal-graph |
| 19-Debugger-ValueKind | TypeKeyId, ValueRecord encoding | type-key-encoding, value-records |
| 20-TraceStorage | DebugIndex, trace storage | debug-index, trace-storage |

---

## Phase 1: Contracts & Type Unification [COMPLETED]

**Goal:** Lock foundational types and numeric ID system. No runtime changes yet.

**Migration Safety:** Pure type definitions - existing code unaffected.

**Completion Date:** 2025-12-25

### Topics

#### type-unification [COMPLETED]
**Description:** Unify editor `TypeDesc` and compiler `ValueKind` into one canonical `TypeDesc`. Create single `TypeWorld` ('signal' | 'field' | 'scalar' | 'special') and `TypeDomain` enum.
**Spec:** 02-IR-Schema (§1), 19-Debugger-ValueKind (§1)
**Dependencies:** None
**Labels:** architecture, types, foundation
**Test Strategy:** Unit tests for type equality, conversion, serialization
**Implementation:** `src/editor/compiler/ir/types.ts` - TypeDesc, TypeWorld, TypeDomain

#### dense-id-system [COMPLETED]
**Description:** Introduce dense numeric indices for all runtime lookups: `BlockIndex`, `PortIndex`, `SlotKey`, `BusIndex`. String keys become debug-only. Build `DebugIndex` for reverse mapping.
**Spec:** 02-IR-Schema (§2), 20-TraceStorage (§1)
**Dependencies:** type-unification
**Labels:** architecture, performance, foundation
**Test Strategy:** Property tests: id↔string roundtrip, no collisions
**Implementation:** `src/editor/compiler/ir/types.ts` - NodeIndex, PortIndex, BusIndex, ValueSlot, SigExprId, FieldExprId

#### ir-core-types [COMPLETED]
**Description:** Define core IR TypeScript interfaces: `CompiledProgramIR`, `NodeIR`, `BusIR`, `StepIR`, `ValueSlot`. These are pure types - no implementation yet.
**Spec:** 02-IR-Schema (§3-5), 03-Nodes, 10-Schedule-Semantics
**Dependencies:** type-unification, dense-id-system
**Labels:** architecture, ir, types
**Test Strategy:** Type-level tests (tsc), schema validation
**Implementation:** `src/editor/compiler/ir/program.ts`, `src/editor/compiler/ir/schedule.ts`

#### timemodel-ir [COMPLETED]
**Description:** Define `TimeModelIR` (finite/cyclic/infinite), canonical time signals (`tAbsMs`, `tModelMs`, `phase01`, `wrapEvent`). Lock time topology contract.
**Spec:** 02-IR-Schema (§4)
**Dependencies:** ir-core-types
**Labels:** architecture, time, foundation
**Test Strategy:** Unit tests for time model derivation
**Implementation:** `src/editor/compiler/ir/schedule.ts` - TimeModelIR, TimeModelFinite, TimeModelCyclic, TimeModelInfinite

---

## Phase 2: IR Data Structures [COMPLETED]

**Goal:** Define all IR table schemas. Compiler doesn't emit IR yet - these are the target structures.

**Migration Safety:** Pure type definitions - existing code unaffected.

**Completion Date:** 2025-12-25

### Topics

#### signalexpr-schema [COMPLETED]
**Description:** Define `SignalExprIR` node types: const, timeAbsMs, inputSlot, map, zip, select, transform, busCombine, stateful. Create `SignalExprTable`.
**Spec:** 12-SignalExpr
**Dependencies:** ir-core-types
**Labels:** ir, signals, schema
**Test Strategy:** Schema validation, example IR construction
**Implementation:** `src/editor/compiler/ir/signalExpr.ts` - 12 SignalExprIR variants

#### fieldexpr-schema [COMPLETED]
**Description:** Define `FieldExprIR` node types: const, inputSlot, map, zip, select, busCombine, transform, sampleSignal. Create `FieldExprTable` and `MaterializationIR`.
**Spec:** 04-FieldExpr
**Dependencies:** ir-core-types
**Labels:** ir, fields, schema
**Test Strategy:** Schema validation, example IR construction
**Implementation:** `src/editor/compiler/ir/fieldExpr.ts` - 7 FieldExprIR variants

#### transform-chain-ir [COMPLETED]
**Description:** Define `TransformChainIR`, `TransformStepIR` (adapter/lens steps), `AdapterTable`, `LensTable`. Unify adapter/lens under single transform representation.
**Spec:** 05-Lenses-Adapters
**Dependencies:** ir-core-types
**Labels:** ir, transforms, schema
**Test Strategy:** Chain composition tests, type validation
**Implementation:** `src/editor/compiler/ir/transforms.ts` - TransformChainIR, 7 TransformStepIR variants

#### bus-ir-schema [COMPLETED]
**Description:** Define `BusTable`, `BusIR`, `PublisherIR`, `ListenerIR`, `CombineSpec`, `SilentValueSpec`. Publishers sorted by sortKey with tie-breaks.
**Spec:** 07-Buses
**Dependencies:** ir-core-types, dense-id-system
**Labels:** ir, buses, schema
**Test Strategy:** Publisher ordering tests, combine mode validation
**Implementation:** `src/editor/compiler/ir/program.ts`, `src/editor/compiler/ir/schedule.ts`

#### schedule-ir [COMPLETED]
**Description:** Define `ScheduleIR`, all `StepIR` variants (timeDerive, nodeEval, busEval, materialize, renderAssemble, debugProbe), `DependencyIndexIR`, `DeterminismIR`.
**Spec:** 10-Schedule-Semantics
**Dependencies:** signalexpr-schema, fieldexpr-schema, bus-ir-schema
**Labels:** ir, schedule, schema
**Test Strategy:** Step ordering validation, dependency graph tests
**Implementation:** `src/editor/compiler/ir/schedule.ts` - 6 StepIR variants

#### opcode-registry [COMPLETED]
**Description:** Define `OpCode` union type covering: time, identity/domain, pure math, state, render, IO, transform ops. Create registry with metadata for each.
**Spec:** 11-Opcode-Taxonomy
**Dependencies:** ir-core-types
**Labels:** ir, opcodes, registry
**Test Strategy:** Exhaustive opcode coverage, dispatch tests
**Implementation:** `src/editor/compiler/ir/opcodes.ts` - 50+ OpCodes with OPCODE_REGISTRY

#### const-pool-default-sources [COMPLETED]
**Description:** Define `ConstPool`, `TypedConst`, `DefaultSourceTable`, `DefaultSourceIR`. Constants are interned; default sources replace params.
**Spec:** 06-Default-Sources
**Dependencies:** ir-core-types
**Labels:** ir, constants, params
**Test Strategy:** Constant interning tests, default source resolution
**Implementation:** `src/editor/compiler/ir/defaultSources.ts`, `src/editor/compiler/ir/program.ts`

#### cache-policy-ir [COMPLETED]
**Description:** Define `CachingIR`, `CacheKeySpec` (none/perFrame/untilInvalidated), `CacheDep` variants. Attach cache specs to steps and materializations.
**Spec:** 09-Caching
**Dependencies:** schedule-ir
**Labels:** ir, caching, schema
**Test Strategy:** Cache key computation tests
**Implementation:** `src/editor/compiler/ir/schedule.ts` - CachingIR, CacheKeySpec, CacheDep

---

## Phase 3: Bridge Compiler [COMPLETED]

**Goal:** Compiler emits IR alongside existing closures. IR is validated but not executed. Old runtime continues to work.

**Migration Safety:** Dual-emit mode - closures still execute, IR is for validation/debugging.

**Started:** 2025-12-25
**Completed:** 2025-12-26

### Topics

#### ir-builder-api [COMPLETED]
**Description:** Implement `IRBuilder` interface: constF64, constJSON, sigConst, sigOp, sigCombine, sigStateful, fieldConst, fieldOp, fieldZip, broadcastSigToField, reduceFieldToSig, domainFromN, renderSink, transformChain, allocState.
**Spec:** 16-Block-Lowering (§4)
**Dependencies:** All Phase 2 topics
**Labels:** compiler, ir-builder, implementation
**Test Strategy:** Builder emits valid IR for simple cases
**Implementation:** `src/editor/compiler/ir/IRBuilder.ts`, `src/editor/compiler/ir/IRBuilderImpl.ts` (24 tests)

#### lowering-pass-normalize [COMPLETED]
**Description:** Implement Pass 1 (Normalize Patch): freeze ID maps, ensure default sources, canonicalize publishers/listeners. Output: `NormalizedPatch`.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 1)
**Dependencies:** ir-builder-api, dense-id-system
**Labels:** compiler, lowering, normalization
**Test Strategy:** Golden patch normalizes correctly
**Implementation:** `src/editor/compiler/passes/pass1-normalize.ts` (12 tests)

#### lowering-pass-types [COMPLETED]
**Description:** Implement Pass 2 (Type Graph): convert SlotType→TypeDesc, validate bus eligibility, precompute adapter/lens conversion paths. Output: `TypedPatch`.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 2)
**Dependencies:** lowering-pass-normalize, type-unification
**Labels:** compiler, lowering, types
**Test Strategy:** Type validation catches mismatches
**Implementation:** `src/editor/compiler/passes/pass2-types.ts` (32 tests)

#### lowering-pass-time [COMPLETED]
**Description:** Implement Pass 3 (Time Topology): find single TimeRoot, validate constraints, generate canonical time signal nodes, produce `TimeModel`. Output: `TimeResolvedPatch`.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 3)
**Dependencies:** lowering-pass-types, timemodel-ir
**Labels:** compiler, lowering, time
**Test Strategy:** TimeRoot enforcement tests
**Implementation:** `src/editor/compiler/passes/pass3-time.ts` (20 tests)

#### lowering-pass-depgraph [COMPLETED]
**Description:** Implement Pass 4-5 (Dependency Graph + SCC): build unified dep graph over blocks/buses, validate cycles with state boundary rules. Output: `AcyclicOrLegalGraph`.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 4-5)
**Dependencies:** lowering-pass-time
**Labels:** compiler, lowering, cycles
**Test Strategy:** Cycle detection with/without state boundaries
**Implementation:** `src/editor/compiler/passes/pass4-depgraph.ts` (15 tests), `src/editor/compiler/passes/pass5-scc.ts` (21 tests)

#### block-lowering-pass [COMPLETED]
**Description:** Implement Pass 6 (Block Lowering): Lower block compilers to IR using IRBuilder. Creates IR representations from closure artifacts.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 6), 16-Block-Lowering
**Dependencies:** All previous passes
**Labels:** compiler, lowering, blocks
**Test Strategy:** Blocks produce valid IR alongside closures
**Implementation:** `src/editor/compiler/passes/pass6-block-lowering.ts` (13 tests)

#### bus-lowering-pass [COMPLETED]
**Description:** Implement Pass 7 (Bus Lowering): Lower buses to sigCombine/fieldCombine nodes with transform chains.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 7)
**Dependencies:** block-lowering-pass
**Labels:** compiler, lowering, buses
**Test Strategy:** Bus combines produce valid IR
**Implementation:** `src/editor/compiler/passes/pass7-bus-lowering.ts` (13 tests)

#### link-resolution-pass [COMPLETED]
**Description:** Implement Pass 8 (Link Resolution): Resolve all ValueRefs into concrete BlockInputRootIR and BlockOutputRootIR tables.
**Spec:** 15-Canonical-Lowering-Pipeline (Pass 8)
**Dependencies:** bus-lowering-pass
**Labels:** compiler, lowering, linking
**Test Strategy:** All ports have resolved value sources
**Implementation:** `src/editor/compiler/passes/pass8-link-resolution.ts` (6 tests)

#### dual-emit-compiler [COMPLETED]
**Description:** Modify `compileBusAware` to emit both closures (existing) AND IR fragments. IR is attached to `CompileResult` for validation. Closures still execute at runtime.
**Spec:** 01.1-CompilerMigration-Roadmap (Phase 2)
**Dependencies:** All lowering passes
**Labels:** compiler, migration, dual-emit
**Test Strategy:** Golden patch produces valid IR + working closures
**Implementation:** `src/editor/compiler/compileBusAware.ts` attachIR() function, `emitIR` option

#### ir-validator [COMPLETED]
**Description:** Validate emitted IR: no missing refs, types match, schedule is topologically valid, determinism rules satisfied. Runs after every compile in dev mode.
**Spec:** 14-Compiled-IR-Program-Contract
**Dependencies:** dual-emit-compiler
**Labels:** compiler, validation, testing
**Test Strategy:** Validator catches intentionally broken IR
**Implementation:** Integrated into dual-emit pipeline

#### block-compiler-migration [COMPLETED]
**Description:** Migrate block compilers to emit IR using registerBlockType() and BlockLowerFn pattern while maintaining legacy closure exports for dual-emit mode.
**Spec:** 16-Block-Lowering
**Dependencies:** ir-builder-api
**Labels:** compiler, blocks, migration
**Test Strategy:** Migrated blocks work in both closure and IR modes
**Implementation:** All domain, signal, rhythm, render blocks migrated in `src/editor/compiler/blocks/`

---

## Phase 4: SignalExpr Runtime [QUEUED]

**Goal:** Replace signal closures with SignalExpr DAG. Evaluator samples expressions, falling back to closures for unimplemented ops.

**Migration Safety:** SignalExpr evaluator can call legacy closures as leaf ops. Gradual migration per block type.

### Topics

#### signal-evaluator-core [PROPOSED]
**Description:** Implement `SigEvaluator.sample(id, env)`. Per-frame cache (`sigValue`, `sigStamp`). Handle basic ops: const, timeAbsMs, add, mul, sin, etc.
**Spec:** 13-SignalExpr-Evaluator (§2-4)
**Dependencies:** signalexpr-schema, ir-validator
**Labels:** runtime, signals, evaluator
**Test Strategy:** Simple signal graphs evaluate correctly

#### signal-evaluator-combine [PROPOSED]
**Description:** Implement `busCombine` in signal evaluator: sum, average, min, max, last. Deterministic publisher ordering from IR.
**Spec:** 13-SignalExpr-Evaluator (§4.B)
**Dependencies:** signal-evaluator-core, bus-ir-schema
**Labels:** runtime, signals, buses
**Test Strategy:** Bus combine produces same results as closure version

#### signal-evaluator-transforms [PROPOSED]
**Description:** Implement transform chain execution in signal evaluator. Execute adapter/lens steps from `TransformChain[]`.
**Spec:** 13-SignalExpr-Evaluator (§5)
**Dependencies:** signal-evaluator-core, transform-chain-ir
**Labels:** runtime, signals, transforms
**Test Strategy:** Transform chains match legacy behavior

#### signal-evaluator-stateful [PROPOSED]
**Description:** Implement stateful signal ops: integrate, delayMs, delayFrames, sampleHold, slew. Explicit `StateBuffer` allocation and update.
**Spec:** 13-SignalExpr-Evaluator (§6), 12-SignalExpr (stateful ops)
**Dependencies:** signal-evaluator-core
**Labels:** runtime, signals, state
**Test Strategy:** Stateful ops maintain state correctly across frames

#### signal-closure-bridge [PROPOSED]
**Description:** For SignalExpr nodes that reference unimplemented ops, fall back to calling legacy closure. Allows gradual migration per block type.
**Spec:** 01.1-CompilerMigration-Roadmap (Phase 5)
**Dependencies:** signal-evaluator-core
**Labels:** runtime, migration, bridge
**Test Strategy:** Mixed IR/closure execution produces correct results

#### block-compilers-signal [PROPOSED]
**Description:** Migrate signal-producing block compilers to emit SignalExpr nodes via IRBuilder. Start with pure blocks (Add, Mul, Sin), then time blocks, then stateful.
**Spec:** 16-Block-Lowering
**Dependencies:** signal-closure-bridge, ir-builder-api
**Labels:** compiler, blocks, migration
**Test Strategy:** Each migrated block produces same output as before

---

## Phase 5: FieldExpr + Materialization [QUEUED]

**Goal:** Replace field closures with FieldExpr DAG. Lazy evaluation with centralized materialization in render sinks.

**Migration Safety:** FieldExpr handles can call legacy field closures. Materialization is centralized but can use old arrays.

### Topics

#### field-handle-system [PROPOSED]
**Description:** Implement `FieldHandle` as expression recipe (not array). `evalFieldHandle` returns handles, memoized per frame.
**Spec:** 17-Scheduler-Full (§5.1-5.2)
**Dependencies:** fieldexpr-schema
**Labels:** runtime, fields, lazy
**Test Strategy:** Field handles compose correctly

#### field-materializer [PROPOSED]
**Description:** Implement central `materialize(req: MaterializationRequest)` that walks FieldExpr DAG, produces typed arrays. Buffer pool for reuse.
**Spec:** 17-Scheduler-Full (§5.3), 04-FieldExpr (§9.2)
**Dependencies:** field-handle-system
**Labels:** runtime, fields, materialization
**Test Strategy:** Materialization produces correct typed arrays

#### field-broadcast-reduce [PROPOSED]
**Description:** Implement explicit bridge ops: `broadcastSigToField` (scalar→field), `reduceFieldToSig` (field→scalar). No implicit world switching.
**Spec:** 16-Block-Lowering (§5), 04-FieldExpr
**Dependencies:** field-handle-system, signal-evaluator-core
**Labels:** runtime, fields, signals
**Test Strategy:** Broadcast/reduce produce expected results

#### field-combine-nodes [PROPOSED]
**Description:** Implement field bus combine as FieldExpr node. Combines produce new FieldExpr (cheap), not arrays.
**Spec:** 04-FieldExpr (busCombine)
**Dependencies:** field-handle-system, bus-ir-schema
**Labels:** runtime, fields, buses
**Test Strategy:** Field bus combine matches legacy behavior

#### render-sink-materialization [PROPOSED]
**Description:** Render sinks (RenderInstances2D) request field materialization via `MaterializationPlan`. Single point for all buffer production.
**Spec:** 14-Compiled-IR-Program-Contract (§5), 17-Scheduler-Full
**Dependencies:** field-materializer
**Labels:** runtime, rendering, materialization
**Test Strategy:** Render sinks get correct buffers

#### block-compilers-field [PROPOSED]
**Description:** Migrate field-producing block compilers to emit FieldExpr nodes. GridDomain, field math blocks, etc.
**Spec:** 16-Block-Lowering
**Dependencies:** field-handle-system, block-compilers-signal
**Labels:** compiler, blocks, migration
**Test Strategy:** Field blocks produce same output as before

---

## Phase 6: Full Scheduled Runtime [QUEUED]

**Goal:** Complete IR-driven runtime with explicit schedule, ValueStore, state management, and hot-swap.

**Migration Safety:** Parallel execution - run both old and new runtime, compare results.

### Topics

#### value-store [PROPOSED]
**Description:** Implement `ValueStore` with typed arrays for slots. Single-writer per slot per frame. Replace ad-hoc value passing.
**Spec:** 02-IR-Schema (§18.1), 17-Scheduler-Full (§1.2)
**Dependencies:** Phase 5 complete
**Labels:** runtime, storage, performance
**Test Strategy:** ValueStore respects single-writer invariant

#### state-buffer-system [PROPOSED]
**Description:** Implement `StateBuffer` (typed arrays for state cells), `StateLayout` allocation. Explicit state for all stateful ops.
**Spec:** 13-SignalExpr-Evaluator (§6), 16-Block-Lowering (§6)
**Dependencies:** value-store
**Labels:** runtime, state, determinism
**Test Strategy:** State persists correctly across frames

#### schedule-executor [PROPOSED]
**Description:** Implement schedule execution: iterate `StepIR[]` in order, execute each step kind. Replace closure-tree traversal.
**Spec:** 17-Scheduler-Full (§3)
**Dependencies:** value-store, state-buffer-system
**Labels:** runtime, schedule, execution
**Test Strategy:** Scheduled execution matches closure execution

#### frame-cache-system [PROPOSED]
**Description:** Implement `FrameCache` with per-frame memo for signals/fields. Cache key validation from `CacheKeySpec`.
**Spec:** 17-Scheduler-Full (§8), 09-Caching
**Dependencies:** schedule-executor
**Labels:** runtime, caching, performance
**Test Strategy:** Cache hits/misses are correct

#### hot-swap-semantics [PROPOSED]
**Description:** Implement no-jank hot swap: state preservation via layout-hash matching, cache discard policy, time continuity.
**Spec:** 17-Scheduler-Full (§9), 02-IR-Schema (§22)
**Dependencies:** state-buffer-system, frame-cache-system
**Labels:** runtime, hot-swap, live-editing
**Test Strategy:** Hot swap preserves compatible state

#### determinism-enforcement [PROPOSED]
**Description:** Enforce determinism: stable topo sort, explicit tie-breaks, no Map/Set iteration, publisher ordering from IR.
**Spec:** 02-IR-Schema (§21, determinism), 10-Schedule-Semantics (§12.3)
**Dependencies:** schedule-executor
**Labels:** runtime, determinism, correctness
**Test Strategy:** Same inputs → bitwise-identical outputs

#### legacy-runtime-removal [PROPOSED]
**Description:** Remove closure-based runtime after IR runtime is validated. Clean up dual-emit code paths.
**Spec:** 01.1-CompilerMigration-Roadmap (Phase 10)
**Dependencies:** All Phase 6 topics
**Labels:** cleanup, migration, final
**Test Strategy:** All tests pass with IR-only runtime

---

## Phase 7: Debug Infrastructure [QUEUED]

**Goal:** Build power-user debugger with ring buffers, causal links, and trace storage.

**Migration Safety:** Debug infrastructure is additive - doesn't affect core execution.

### Topics

#### debug-index-compile [PROPOSED]
**Description:** Emit `DebugIndex` during compilation: string interning, portKeyToId, busIdToId, node provenance arrays.
**Spec:** 20-TraceStorage (§1), 14-Compiled-IR-Program-Contract (§9)
**Dependencies:** lowering-passes
**Labels:** debug, compiler, indexing
**Test Strategy:** DebugIndex contains all entities

#### type-key-encoding [PROPOSED]
**Description:** Implement `TypeKeyId` encoding: TypeKey→dense u16, stable serialization. Map all TypeDesc to TypeKeyId.
**Spec:** 19-Debugger-ValueKind (§1)
**Dependencies:** type-unification, debug-index-compile
**Labels:** debug, types, encoding
**Test Strategy:** TypeKey roundtrip stable

#### span-ring-buffer [PROPOSED]
**Description:** Implement `SpanRing` typed array buffer: frame, tMs, kind, subject, parent, duration, flags. Zero-allocation hot path.
**Spec:** 18-Debugger-Part-1 (§3.2), 20-TraceStorage (§2.2)
**Dependencies:** debug-index-compile
**Labels:** debug, tracing, performance
**Test Strategy:** Ring buffer wraps correctly, no GC

#### value-record-encoding [PROPOSED]
**Description:** Implement `ValueRecord` 32-byte encoding: tag, typeId, payload fields. Stats for fields (min/max/hash), samples for signals.
**Spec:** 19-Debugger-ValueKind (§2-3)
**Dependencies:** type-key-encoding
**Labels:** debug, values, encoding
**Test Strategy:** All value types encode/decode correctly

#### causal-edge-system [PROPOSED]
**Description:** Implement `EdgeRing` for causal links: producedValueId, inputValueId, relation (Wire/BusCombine/Adapter/Lens/Sample/Materialize).
**Spec:** 18-Debugger-Part-1 (§3.2.3, §6)
**Dependencies:** span-ring-buffer
**Labels:** debug, causality, tracing
**Test Strategy:** Causal graph reconstructable from edges

#### instrumentation-hooks [PROPOSED]
**Description:** Add instrumentation at IR evaluation boundaries: BlockEval, BusEval, AdapterStep, LensStep, Materialize, RenderSink. Emit spans + edges.
**Spec:** 18-Debugger-Part-1 (§4)
**Dependencies:** schedule-executor, span-ring-buffer
**Labels:** debug, instrumentation, runtime
**Test Strategy:** All evaluation points emit spans

#### trace-controller [PROPOSED]
**Description:** Implement `TraceController`: mode switching (OFF/TIMING/FULL), sampling policies, buffer size limits, drop policy.
**Spec:** 18-Debugger-Part-1 (§8), 19-Debugger-ValueKind (§5)
**Dependencies:** instrumentation-hooks
**Labels:** debug, control, performance
**Test Strategy:** Trace modes have expected overhead

---

## Phase 8: Polish & Composites [QUEUED]

**Goal:** Complete the system with composite library, export correctness, and cleanup.

**Migration Safety:** These are additive features on the complete IR runtime.

### Topics

#### export-determinism [PROPOSED]
**Description:** Ensure export produces identical output: phase-driven sampling, deterministic field materialization, loop closure for finite/cyclic.
**Spec:** 12-SignalExpr (export semantics)
**Dependencies:** determinism-enforcement
**Labels:** export, determinism, correctness
**Test Strategy:** Export same animation twice → identical files

#### composite-library [PROPOSED]
**Description:** Build library of reusable composite blocks using the IR system. Composites lower to IR fragments.
**Spec:** 16-Block-Lowering (composites)
**Dependencies:** legacy-runtime-removal
**Labels:** library, composites, ux
**Test Strategy:** Composites work correctly in various patches

#### replace-block-ui [PROPOSED]
**Description:** Right-click block → list compatible replacements → swap preserving wiring. Uses type compatibility from IR.
**Spec:** (UX feature, uses type-unification)
**Dependencies:** type-unification
**Labels:** ui, ux, editor
**Test Strategy:** Block replacement preserves valid connections

#### technical-debt-cleanup [PROPOSED]
**Description:** Address remaining TODO comments, remove legacy code paths, fix remaining test failures.
**Spec:** (Maintenance)
**Dependencies:** legacy-runtime-removal
**Labels:** cleanup, maintenance
**Test Strategy:** All tests pass, no TODOs in critical paths

#### rust-wasm-prep [PROPOSED]
**Description:** Validate IR is Rust-portable: no closures, all ops are opcodes, typed buffers only. Document serialization format.
**Spec:** 02-IR-Schema (§23), 01-Overview (Rust path)
**Dependencies:** legacy-runtime-removal
**Labels:** architecture, rust, future
**Test Strategy:** IR serializes/deserializes cleanly

---

## Incremental Migration Strategy

### Test-at-Every-Step Approach

Each topic includes a **Test Strategy** that must pass before the topic is complete.

**Phase 1-2 (Types):** Pure TypeScript types - compile-time validation only.

**Phase 3 (Bridge Compiler):**
- `dual-emit-compiler` produces BOTH closures AND IR
- Closures execute (existing behavior)
- IR is validated but not executed
- Tests compare: closure output vs expected output

**Phase 4-5 (Evaluators):**
- SignalExpr/FieldExpr evaluators have fallback to closures
- For each block type migrated:
  1. Run existing closure version
  2. Run new IR version
  3. Compare outputs
  4. If match, remove closure fallback for that block
- Golden patch tests validate full system

**Phase 6 (Full Runtime):**
- Run both runtimes in parallel during transition
- `diff(closureOutput, irOutput)` on every frame in tests
- Gradually disable closure runtime as confidence grows

**Phase 7-8 (Polish):**
- Debug infrastructure is additive
- Export determinism validated by hash comparison
- Composites tested like any other block

### Rollback Safety

At any point, the system can roll back by:
1. Disabling IR emission in compiler
2. Using closure-only runtime
3. No data migration needed (IR is derived, not stored)

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
