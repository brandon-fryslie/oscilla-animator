# Project Roadmap: IR Compiler Migration

Last updated: 2025-12-31-190000

> **Migration Strategy:** "Strangle Pattern" - New IR wraps existing closures, gradually replacing them while keeping the app running at every step.

---

## 🚨 Priority Override: Architecture Refactoring

**Source:** `compiler-final/ARCHITECTURE-RECOMMENDATIONS.md`

All other work is **ON HOLD** until these refactors are complete and the IR compiler is functional.

**Rationale:** The codebase has accumulated complexity from parallel V1 (closure-based) and V2 (IR-based) systems. Three unifications will dramatically simplify the new compiler by ensuring every input has exactly one resolution path: follow the edge.

---

## Phase 0: Architecture Refactoring [ACTIVE - TOP PRIORITY]

**Goal:** Unify redundant abstractions to simplify the IR compiler. Every input should have exactly one resolution path.

**Migration Safety:** Each refactor can be done incrementally with backward compatibility shims.

**Started:** 2025-12-31

### Topics (in recommended order)

#### unify-connections-edge [PROPOSED]
**Description:** Merge Connection, Publisher, Listener into single Edge type with discriminated union endpoints. Eliminates three-way handling in every compiler pass.

**Current state (problem):**
- Connection: port→port (direct wire)
- Publisher: port→bus
- Listener: bus→port
- Every compiler pass (2, 6, 7, 8) handles all three separately

**Target state:**
```typescript
type Endpoint =
  | { kind: 'port'; blockId: string; slotId: string }
  | { kind: 'bus'; busId: string };

interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly transforms?: TransformStep[];
  readonly enabled: boolean;
  readonly weight?: number;      // for bus publishers
  readonly sortKey?: number;     // for deterministic ordering
}
```

**Files to modify:**
- `src/editor/types.ts` - Add Edge, Endpoint types
- `src/editor/stores/PatchStore.ts` - Replace connections/publishers/listeners with edges
- `src/editor/compiler/passes/pass2-types.ts` - Unified edge type-checking
- `src/editor/compiler/passes/pass6-block-lowering.ts` - Unified input resolution
- `src/editor/compiler/passes/pass7-bus-lowering.ts` - Simplify to edge filtering
- `src/editor/compiler/passes/pass8-link-resolution.ts` - Unified wiring

**Spec:** `compiler-final/ARCHITECTURE-RECOMMENDATIONS.md` Part 1
**Dependencies:** None
**Labels:** architecture, refactor, connections, foundation
**Test Strategy:** Migration helpers (connectionToEdge, publisherToEdge, listenerToEdge) roundtrip correctly

---

#### unify-default-sources-blocks [PROPOSED]
**Description:** Make every unconnected input backed by a hidden provider block. Eliminates special-case input resolution - ALL inputs are connected via edges.

**Current state (problem):**
- DefaultSource metadata attached to input slots
- Three-way priority logic: wire > listener > default (implicit)
- Special handling in multiple compiler passes

**Target state:**
- When input has no explicit edge: create hidden DSConst* block, create edge from it
- ALL inputs connected via edges
- No special-case resolution needed

**Implementation:**
```typescript
function materializeDefaultSources(patch: Patch): Patch {
  // For each unconnected input:
  // 1. Create hidden DSConst* block with default value
  // 2. Create edge from provider to input
  // Result: all inputs connected via edges
}
```

**Files to modify:**
- `src/editor/types.ts` - Remove DefaultSourceState, DefaultSourceAttachment (or deprecate)
- `src/editor/compiler/passes/pass1-normalize.ts` - Add materializeDefaultSources()
- `src/editor/compiler/passes/pass6-block-lowering.ts` - Remove default source handling
- `src/editor/stores/PatchStore.ts` - Update to manage hidden blocks

**Spec:** `compiler-final/ARCHITECTURE-RECOMMENDATIONS.md` Part 2
**Dependencies:** unify-connections-edge
**Labels:** architecture, refactor, default-sources, foundation
**Test Strategy:** materializeDefaultSources creates hidden blocks for all unconnected inputs

---

#### v2-adapter-implementation [PROPOSED]
**Description:** Implement the V2 adapter stub to allow legacy bridge blocks to work with the new IR compiler. Key bridge between V1 closures and V2 IR.

**Current state:**
```typescript
// src/editor/compiler/v2adapter.ts - STUB
export function adaptV2Compiler(v2Compiler: BlockCompilerV2): BlockCompiler {
  return {
    compile(_compileArgs) {
      return { /* Error artifacts */ };
    }
  };
}
```

**Target state:**
- Create SignalExprBuilder for block
- Convert input Artifacts to SigExprId references
- Call v2Compiler.compileV2() to get output SigExprIds
- Wrap outputs as closures that call evalSig() at runtime

**Key challenge:** Mix V1 closures with V2 IR via `closureNode` approach:
```typescript
case 'closure':  // V1 bridge leaf node
  return node.closureFn(ctx);
```

**Files to modify:**
- `src/editor/compiler/v2adapter.ts` - Full implementation
- `src/editor/compiler/ir/types.ts` - Add SignalExprClosure node type
- `src/editor/runtime/executor/evalSig.ts` - Handle closure nodes

**Spec:** `compiler-final/ARCHITECTURE-RECOMMENDATIONS.md` Part 4
**Dependencies:** unify-connections-edge, unify-default-sources-blocks
**Labels:** compiler, adapter, v2, bridge
**Test Strategy:** V2 block with V1 closure inputs produces correct output

---

#### unify-lenses-adapters [PROPOSED]
**Description:** Create unified TransformStep abstraction for lenses and adapters. Lower priority - can defer until after IR compiler is working.

**Current state (two registries):**
- LensRegistry: T→T transforms, user-editable params
- AdapterRegistry: T₁→T₂ conversions, auto-insert

**Target state:**
```typescript
interface TransformStep {
  readonly id: string;
  readonly kind: 'lens' | 'adapter';
  readonly params?: Record<string, unknown>;
}

interface TransformDef {
  id: string;
  kind: 'lens' | 'adapter';
  inputType: TypeDesc | 'same';
  outputType: TypeDesc | 'same';
  params?: Record<string, ParamSpec>;
  policy?: 'auto' | 'suggest' | 'explicit';
  cost?: number;
}
```

**Spec:** `compiler-final/ARCHITECTURE-RECOMMENDATIONS.md` Part 3
**Dependencies:** unify-connections-edge (uses transforms in Edge type)
**Labels:** architecture, refactor, transforms, polish
**Test Strategy:** Unified registry serves both lens and adapter queries

---

### Phase 0 Completion Gate

Before moving to Phase 6 completion or other work:
- [ ] All edges use unified Edge type
- [ ] All inputs connected via edges (no special default source handling)
- [ ] V2 adapter compiles legacy bridge blocks
- [ ] Golden patch compiles and runs with new structure

---

## Phase 0.5: Compatibility Cleanup [QUEUED]

**Goal:** Remove backward compatibility shims, deprecated types, and facades introduced during Phase 0 refactoring.

**Migration Safety:** Only proceed after Phase 0 is complete and all tests pass with new abstractions.

**Blocked By:** Phase 0 completion gate

### Topics

#### remove-connection-facades [PROPOSED]
**Description:** Remove deprecated Connection, Publisher, Listener types and migration helpers. All code should use Edge type directly.

**Work items:**
- Delete `connectionToEdge()`, `publisherToEdge()`, `listenerToEdge()` helpers
- Delete `edgeToConnection()`, `edgeToPublisher()`, `edgeToListener()` reverse helpers
- Remove deprecated type aliases (Connection, Publisher, Listener)
- Update any remaining code using old types
- Remove backward compatibility comments

**Files to modify:**
- `src/editor/types.ts` - Remove deprecated types
- `src/editor/stores/PatchStore.ts` - Remove computed getters for old types
- Test files - Update to use Edge directly

**Dependencies:** unify-connections-edge (Sprint 1)
**Labels:** cleanup, types, migration
**Test Strategy:** All tests pass with deprecated types removed

---

#### remove-default-source-facades [PROPOSED]
**Description:** Remove DefaultSourceState, DefaultSourceAttachment types and any shims for old default source handling.

**Work items:**
- Delete DefaultSourceState, DefaultSourceAttachment types
- Remove any `defaultSources` or `defaultSourceAttachments` fields from Patch
- Delete any compatibility code that reads old format
- Update serialization to only support new format

**Dependencies:** unify-default-sources-blocks (Sprint 2)
**Labels:** cleanup, types, migration
**Test Strategy:** All tests pass, old format not supported

---

#### remove-registry-facades [PROPOSED]
**Description:** If Sprint 4 was completed, remove old LensRegistry and AdapterRegistry facades. Keep unified TransformRegistry only.

**Work items:**
- Delete LensRegistry.ts (or convert to pure re-export)
- Delete AdapterRegistry.ts (or convert to pure re-export)
- Remove deprecation warnings
- Update all imports to use TransformRegistry

**Dependencies:** unify-lenses-adapters (Sprint 4, optional)
**Labels:** cleanup, transforms, registry
**Test Strategy:** All lens/adapter functionality works through unified registry

---

#### serialization-version-bump [PROPOSED]
**Description:** Bump patch serialization format version and remove support for pre-Phase-0 format.

**Work items:**
- Increment PATCH_FORMAT_VERSION
- Remove migration code for old formats
- Document breaking change in CHANGELOG
- Update any saved patches in tests/fixtures

**Dependencies:** All Phase 0 sprints
**Labels:** cleanup, serialization, breaking-change
**Test Strategy:** Old format patches rejected with clear error message

---

### Phase 0.5 Completion Gate

Before moving to Phase 6:
- [ ] No deprecated types remain in codebase
- [ ] No migration helpers or facades remain
- [ ] Serialization format is clean (no backward compat)
- [ ] All tests pass with cleaned codebase
- [ ] CHANGELOG documents all breaking changes

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
**Description:** Define `TimeModelIR` (finite/infinite ONLY - no cyclic), canonical time signals (`tAbsMs`, `tModelMs`). Lock time topology contract. Note: Cycles are produced by Time Console rails, not TimeModel variants.
**Spec:** 02-IR-Schema (§4)
**Dependencies:** ir-core-types
**Labels:** architecture, time, foundation
**Test Strategy:** Unit tests for time model derivation
**Implementation:** `src/editor/compiler/ir/schedule.ts` - TimeModelIR, TimeModelFinite, TimeModelInfinite (TimeModelCyclic removed per spec alignment 2025-12-27)

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

## Phase 4: SignalExpr Runtime [COMPLETED]

**Goal:** Replace signal closures with SignalExpr DAG. Evaluator samples expressions, falling back to closures for unimplemented ops.

**Migration Safety:** SignalExpr evaluator can call legacy closures as leaf ops. Gradual migration per block type.

**Started:** 2025-12-25
**Completed:** 2025-12-26

### Topics

#### signal-evaluator-core [COMPLETED]
**Description:** Implement `SigEvaluator.sample(id, env)`. Per-frame cache (`sigValue`, `sigStamp`). Handle basic ops: const, timeAbsMs, add, mul, sin, etc.
**Spec:** 13-SignalExpr-Evaluator (§2-4)
**Dependencies:** signalexpr-schema, ir-validator
**Labels:** runtime, signals, evaluator
**Test Strategy:** Simple signal graphs evaluate correctly
**Implementation:** `src/editor/runtime/signal-expr/SigEvaluator.ts` (1200+ lines, 122+ tests)

#### signal-evaluator-combine [COMPLETED]
**Description:** Implement `busCombine` in signal evaluator: sum, average, min, max, last. Deterministic publisher ordering from IR.
**Spec:** 13-SignalExpr-Evaluator (§4.B)
**Dependencies:** signal-evaluator-core, bus-ir-schema
**Labels:** runtime, signals, buses
**Test Strategy:** Bus combine produces same results as closure version
**Implementation:** evalBusCombine() in SigEvaluator.ts with all combine modes

#### signal-evaluator-transforms [COMPLETED]
**Description:** Implement transform chain execution in signal evaluator. Execute adapter/lens steps from `TransformChain[]`.
**Spec:** 13-SignalExpr-Evaluator (§5)
**Dependencies:** signal-evaluator-core, transform-chain-ir
**Labels:** runtime, signals, transforms
**Test Strategy:** Transform chains match legacy behavior
**Implementation:** evalTransform() with scaleBias, normalize, quantize, ease, map, slew, cast

#### signal-evaluator-stateful [COMPLETED]
**Description:** Implement stateful signal ops: integrate, delayMs, delayFrames, sampleHold, slew. Explicit `StateBuffer` allocation and update.
**Spec:** 13-SignalExpr-Evaluator (§6), 12-SignalExpr (stateful ops)
**Dependencies:** signal-evaluator-core
**Labels:** runtime, signals, state
**Test Strategy:** Stateful ops maintain state correctly across frames
**Implementation:** SigStateful.ts with integrate, delayMs, delayFrames, sampleHold, slew, edgeDetectWrap, pulseDivider, envelopeAD (33+ tests)

#### signal-closure-bridge [COMPLETED]
**Description:** For SignalExpr nodes that reference unimplemented ops, fall back to calling legacy closure. Allows gradual migration per block type.
**Spec:** 01.1-CompilerMigration-Roadmap (Phase 5)
**Dependencies:** signal-evaluator-core
**Labels:** runtime, migration, bridge
**Test Strategy:** Mixed IR/closure execution produces correct results
**Implementation:** evalClosureBridge() in SigEvaluator.ts, ClosureRegistry.ts, SignalBridge.ts (23+ tests)

#### block-compilers-signal [COMPLETED]
**Description:** Migrate signal-producing block compilers to emit SignalExpr nodes via IRBuilder. Start with pure blocks (Add, Mul, Sin), then time blocks, then stateful.
**Spec:** 16-Block-Lowering
**Dependencies:** signal-closure-bridge, ir-builder-api
**Labels:** compiler, blocks, migration
**Test Strategy:** Each migrated block produces same output as before
**Implementation:** All 42 blocks migrated via registerBlockType() pattern, MIGRATED_BLOCKS set updated

#### materializer-integration [COMPLETED]
**Description:** Integrate SigEvaluator into Materializer for field broadcast evaluation. IR evaluation preferred, SignalBridge fallback.
**Spec:** 13-SignalExpr-Evaluator (§7)
**Dependencies:** signal-evaluator-core, field-materializer
**Labels:** runtime, integration
**Test Strategy:** IR evaluation produces same results as closure evaluation
**Implementation:** Updated Materializer.ts SigEnv with irEnv/irNodes, evalSig prefers IR (3 integration tests)

---

## Phase 5: FieldExpr + Materialization [COMPLETED]

**Goal:** Replace field closures with FieldExpr DAG. Lazy evaluation with centralized materialization in render sinks.

**Migration Safety:** FieldExpr handles can call legacy field closures. Materialization is centralized but can use old arrays.

**Started:** 2025-12-25
**Completed:** 2025-12-26

### Topics

#### field-handle-system [COMPLETED]
**Description:** Implement `FieldHandle` as expression recipe (not array). `evalFieldHandle` returns handles, memoized per frame.
**Spec:** 17-Scheduler-Full (§5.1-5.2)
**Dependencies:** fieldexpr-schema
**Labels:** runtime, fields, lazy
**Test Strategy:** Field handles compose correctly
**Implementation:** `src/editor/runtime/field/FieldHandle.ts` - createFieldHandleCache, FieldHandleCache

#### field-materializer [COMPLETED]
**Description:** Implement central `materialize(req: MaterializationRequest)` that walks FieldExpr DAG, produces typed arrays. Buffer pool for reuse.
**Spec:** 17-Scheduler-Full (§5.3), 04-FieldExpr (§9.2)
**Dependencies:** field-handle-system
**Labels:** runtime, fields, materialization
**Test Strategy:** Materialization produces correct typed arrays
**Implementation:** `src/editor/runtime/field/Materializer.ts` - FieldMaterializer, MaterializerEnv (63+ tests)

#### field-broadcast-reduce [COMPLETED]
**Description:** Implement explicit bridge ops: `broadcastSigToField` (scalar→field), `reduceFieldToSig` (field→scalar). No implicit world switching.
**Spec:** 16-Block-Lowering (§5), 04-FieldExpr
**Dependencies:** field-handle-system, signal-evaluator-core
**Labels:** runtime, fields, signals
**Test Strategy:** Broadcast/reduce produce expected results
**Implementation:** `src/editor/runtime/field/Materializer.ts` - evalBroadcast, evalReduce functions

#### field-combine-nodes [COMPLETED]
**Description:** Implement field bus combine as FieldExpr node. Combines produce new FieldExpr (cheap), not arrays.
**Spec:** 04-FieldExpr (busCombine)
**Dependencies:** field-handle-system, bus-ir-schema
**Labels:** runtime, fields, buses
**Test Strategy:** Field bus combine matches legacy behavior
**Implementation:** `src/editor/runtime/field/Materializer.ts` - evalBusCombine with sum/average/min/max/last modes

#### render-sink-materialization [COMPLETED]
**Description:** Render sinks (RenderInstances2D) request field materialization via `MaterializationPlan`. Single point for all buffer production.
**Spec:** 14-Compiled-IR-Program-Contract (§5), 17-Scheduler-Full
**Dependencies:** field-materializer
**Labels:** runtime, rendering, materialization
**Test Strategy:** Render sinks get correct buffers
**Implementation:** RenderInstances2D IR lowering with renderSink in compiler/blocks/domain/RenderInstances2D.ts

#### block-compilers-field [COMPLETED]
**Description:** Migrate field-producing block compilers to emit FieldExpr nodes. GridDomain, field math blocks, etc.
**Spec:** 16-Block-Lowering
**Dependencies:** field-handle-system, block-compilers-signal
**Labels:** compiler, blocks, migration
**Test Strategy:** Field blocks produce same output as before
**Implementation:** 23 domain blocks migrated (DomainN, GridDomain, PositionMap*, Field*, etc.)

#### type-adapter-layer [COMPLETED]
**Description:** Convert compiler TypeDesc ↔ runtime TypeDesc for field materialization integration.
**Spec:** Integration requirement
**Dependencies:** type-unification
**Labels:** runtime, integration, types
**Test Strategy:** All common field domains convert correctly
**Implementation:** `src/editor/runtime/integration/typeAdapter.ts` (259 lines, 50+ tests)

#### signal-bridge [COMPLETED]
**Description:** Minimal signal evaluation bridge for broadcast nodes (temporary until Phase 4 SigEvaluator integration).
**Spec:** Integration requirement
**Dependencies:** signal-evaluator-core
**Labels:** runtime, integration, signals
**Test Strategy:** Broadcast field nodes materialize with real signal values
**Implementation:** `src/editor/runtime/integration/SignalBridge.ts` (179 lines, 38+ tests)

#### compiler-runtime-integration [COMPLETED]
**Description:** Wire compiler LinkedGraphIR to runtime Materializer. API: loadProgram, materializeField, dispose.
**Spec:** Integration requirement
**Dependencies:** type-adapter-layer, signal-bridge, field-materializer
**Labels:** runtime, integration, api
**Test Strategy:** End-to-end compilation → materialization
**Implementation:** `src/editor/runtime/integration/CompilerRuntime.ts` (336 lines, 13+ integration tests)

---

## Phase 6: Full Scheduled Runtime [ON HOLD - Pending Phase 0]

**Goal:** Complete IR-driven runtime with explicit schedule, ValueStore, state management, and hot-swap.

**Migration Safety:** Parallel execution - run both old and new runtime, compare results.

**Status:** ON HOLD until Phase 0 (Architecture Refactoring) is complete.

**Started:** 2025-12-26
**Sprint 1 Complete:** 2025-12-26
**Sprint 2 Complete:** 2025-12-26

### Topics

#### value-store [COMPLETED]
**Description:** Implement `ValueStore` with typed arrays for slots. Single-writer per slot per frame. Replace ad-hoc value passing.
**Spec:** 02-IR-Schema (§18.1), 17-Scheduler-Full (§1.2)
**Dependencies:** Phase 5 complete
**Labels:** runtime, storage, performance
**Test Strategy:** ValueStore respects single-writer invariant
**Implementation:** `src/editor/compiler/ir/stores.ts` - createValueStore() with typed array allocation, single-writer enforcement (31 tests)

#### state-buffer-system [COMPLETED]
**Description:** Implement `StateBuffer` (typed arrays for state cells), `StateLayout` allocation. Explicit state for all stateful ops.
**Spec:** 13-SignalExpr-Evaluator (§6), 16-Block-Lowering (§6)
**Dependencies:** value-store
**Labels:** runtime, state, determinism
**Test Strategy:** State persists correctly across frames
**Implementation:** `src/editor/compiler/ir/stores.ts` - createStateBuffer(), initializeState() (16 tests)

#### runtime-state-integration [COMPLETED]
**Description:** Wire real ValueStore and StateBuffer into createRuntimeState(). Placeholder slot metadata extraction from schedule.
**Spec:** Integration requirement
**Dependencies:** value-store, state-buffer-system
**Labels:** runtime, integration
**Test Strategy:** RuntimeState uses real stores, not stubs
**Implementation:** `src/editor/runtime/executor/RuntimeState.ts` - extractSlotMeta(), real store integration (17 tests)

#### schedule-executor [PARTIAL]
**Description:** Implement schedule execution: iterate `StepIR[]` in order, execute each step kind. Replace closure-tree traversal.
**Spec:** 17-Scheduler-Full (§3)
**Dependencies:** value-store, state-buffer-system
**Labels:** runtime, schedule, execution
**Test Strategy:** Scheduled execution matches closure execution
**Status:** Frame loop works, executeTimeDerive + executeBusEval + executeMaterialize implemented. Remaining: executeNodeEval, executeRenderAssemble (Sprint 3)

#### frame-cache-system [COMPLETED]
**Description:** Implement `FrameCache` with per-frame memo for signals/fields. Cache key validation from `CacheKeySpec`.
**Spec:** 17-Scheduler-Full (§8), 09-Caching
**Dependencies:** schedule-executor
**Labels:** runtime, caching, performance
**Test Strategy:** Cache hits/misses are correct
**Implementation:** `src/editor/runtime/executor/RuntimeState.ts` - createFrameCache() with stamp-based invalidation (41 tests)

#### execute-bus-eval [COMPLETED]
**Description:** Implement executeBusEval step executor with combine modes, silent values, publisher filtering.
**Spec:** 17-Scheduler-Full (§3.3)
**Dependencies:** frame-cache-system
**Labels:** runtime, buses, step-executor
**Test Strategy:** All combine modes (sum, avg, min, max, last, product) work correctly
**Implementation:** `src/editor/runtime/executor/steps/executeBusEval.ts` (10 tests)

#### execute-materialize [COMPLETED]
**Description:** Implement executeMaterialize step executor with FieldMaterializer integration, buffer caching.
**Spec:** 17-Scheduler-Full (§3.4)
**Dependencies:** frame-cache-system
**Labels:** runtime, materialization, step-executor
**Test Strategy:** Field buffers materialized correctly, buffer pool caching works
**Implementation:** `src/editor/runtime/executor/steps/executeMaterialize.ts` (20 tests)

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

## Phase 7: Debug Infrastructure [ON HOLD - Pending Phase 0]

**Goal:** Build power-user debugger with ring buffers, causal links, and trace storage.

**Migration Safety:** Debug infrastructure is additive - doesn't affect core execution.

**Status:** ON HOLD until Phase 0 (Architecture Refactoring) and Phase 6 are complete.

**Started:** 2025-12-27
**Sprint 1 Focus:** DebugIndex population + executeDebugProbe implementation

### Sprint 1 Topics (Current)

#### debug-index-compile [IN PROGRESS]
**Description:** Emit `DebugIndex` during compilation: track blockId when allocating signal/field expressions and value slots. Populate sigExprSource, fieldExprSource, slotSource maps.
**Spec:** 20-TraceStorage (§1), 14-Compiled-IR-Program-Contract (§9), PLAN-2025-12-27-005641.md
**Dependencies:** lowering-passes
**Labels:** debug, compiler, indexing
**Test Strategy:** DebugIndex contains entries for all allocated nodes/slots after build()

#### execute-debug-probe [IN PROGRESS]
**Description:** Implement executeDebugProbe step executor: read TraceController.mode, sample values from slots, record to ValueRing with timestamp, throttle UI events to 10Hz.
**Spec:** 18-Debugger-Part-1 (§4), PLAN-2025-12-27-005641.md
**Dependencies:** debug-index-compile, trace-controller
**Labels:** debug, runtime, step-executor
**Test Strategy:** executeDebugProbe with mode='basic' records to ValueRing; mode='off' no-ops

#### schedule-probe-insertion [PROPOSED]
**Description:** Modify buildSchedule to insert StepDebugProbe steps at key boundaries (after bus eval, block signal eval, field materialization). Basic/full probe modes.
**Spec:** 18-Debugger-Part-1 (§4), PLAN-2025-12-27-005641.md
**Dependencies:** execute-debug-probe
**Labels:** debug, compiler, schedule
**Test Strategy:** Schedule contains debugProbe steps when probeMode='basic'

### Existing Infrastructure (Completed)

#### type-key-encoding [COMPLETED]
**Description:** Implement `TypeKeyId` encoding: TypeKey→dense u16, stable serialization. Map all TypeDesc to TypeKeyId.
**Spec:** 19-Debugger-ValueKind (§1)
**Dependencies:** type-unification
**Labels:** debug, types, encoding
**Test Strategy:** TypeKey roundtrip stable
**Implementation:** `src/editor/debug/TypeKeyEncoding.ts` - encodeTypeKey(), decodeTypeKey()

#### span-ring-buffer [COMPLETED]
**Description:** Implement `SpanRing` typed array buffer: frame, tMs, kind, subject, parent, duration, flags. Zero-allocation hot path.
**Spec:** 18-Debugger-Part-1 (§3.2), 20-TraceStorage (§2.2)
**Dependencies:** None
**Labels:** debug, tracing, performance
**Test Strategy:** Ring buffer wraps correctly, no GC
**Implementation:** `src/editor/debug/SpanRing.ts`

#### value-record-encoding [COMPLETED]
**Description:** Implement `ValueRecord` 32-byte encoding: tag, typeId, payload fields. Stats for fields (min/max/hash), samples for signals.
**Spec:** 19-Debugger-ValueKind (§2-3)
**Dependencies:** type-key-encoding
**Labels:** debug, values, encoding
**Test Strategy:** All value types encode/decode correctly
**Implementation:** `src/editor/debug/ValueRing.ts`

#### trace-controller [COMPLETED]
**Description:** Implement `TraceController`: mode switching (OFF/TIMING/FULL), sampling policies, buffer size limits, drop policy.
**Spec:** 18-Debugger-Part-1 (§8), 19-Debugger-ValueKind (§5)
**Dependencies:** None
**Labels:** debug, control, performance
**Test Strategy:** Trace modes have expected overhead
**Implementation:** `src/editor/debug/TraceController.ts`

### Future Topics (Phase 7.2+)

#### causal-edge-system [PROPOSED]
**Description:** Implement `EdgeRing` for causal links: producedValueId, inputValueId, relation (Wire/BusCombine/Adapter/Lens/Sample/Materialize). Enables "why" queries.
**Spec:** 18-Debugger-Part-1 (§3.2.3, §6)
**Dependencies:** execute-debug-probe, dependency-index-population
**Labels:** debug, causality, tracing
**Test Strategy:** Causal graph reconstructable from edges

#### instrumentation-hooks [PROPOSED]
**Description:** Add instrumentation at IR evaluation boundaries: BlockEval, BusEval, AdapterStep, LensStep, Materialize, RenderSink. Emit spans + edges.
**Spec:** 18-Debugger-Part-1 (§4)
**Dependencies:** schedule-executor, span-ring-buffer
**Labels:** debug, instrumentation, runtime
**Test Strategy:** All evaluation points emit spans

### Debug UI Topics (from design-docs/11-Debugger/)

#### debug-hud [PROPOSED]
**Description:** Minimal always-visible debug strip: Clock (Finite/Cyclic/Infinite), Health (OK/Warning/Error), Performance (FPS + heavy fields), Stability (scrub-safe indicator).
**Spec:** design-docs/11-Debugger/1-NonTech-Overview.md (§Debug HUD)
**Dependencies:** trace-controller
**Labels:** debug, ui, hud
**Test Strategy:** HUD reflects actual runtime state

#### probe-mode [PROPOSED]
**Description:** Cursor-based inspection mode. Hover anything (bus, block, port, lens) to see probe card with live value, source chain, and common fixes.
**Spec:** design-docs/11-Debugger/1-NonTech-Overview.md (§Probe Mode)
**Dependencies:** debug-index-compile, execute-debug-probe
**Labels:** debug, ui, inspection
**Test Strategy:** Probe card shows correct source chain

#### debug-drawer [PROPOSED]
**Description:** Slide-up diagnostics panel with tabs: Overview, Buses, Time, Output, Performance, Changes. Structured searchable debug interface.
**Spec:** design-docs/11-Debugger/1-NonTech-Overview.md (§Debug Drawer)
**Dependencies:** probe-mode
**Labels:** debug, ui, panel
**Test Strategy:** All tabs display correct information

#### value-summary-display [PROPOSED]
**Description:** Visualizations for debug values: sparkline history, meter bars, contribution lists for bus combines, lens chain visualization.
**Spec:** design-docs/11-Debugger/10-PowerUser-Overview.md (§DebugSnapshot)
**Dependencies:** value-record-encoding
**Labels:** debug, ui, visualization
**Test Strategy:** All value types render correctly

#### issue-detection [PROPOSED]
**Description:** Rules engine for detecting common problems: silent buses, constant values, conflicting layers, heavy field materialization. Plain-language issue descriptions with one-click fixes.
**Spec:** design-docs/11-Debugger/5-NonTech-RulesEngine.md
**Dependencies:** execute-debug-probe
**Labels:** debug, rules, diagnostics
**Test Strategy:** Known problem patterns detected and reported

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

## Phase 9: Path-Focused Composition [QUEUED]

**Goal:** Replace graph-based patch editing with linear path-focused composition. Users think in signal chains, not node graphs.

**Philosophy:** The current "here's all your blocks, arrange them yourself" model creates cognitive overhead. The new model: "here's one path from TimeRoot → Canvas, compose it step by step."

**Migration Safety:** This is a fundamental UX shift but doesn't affect compilation or runtime.

### Foundation (do first)

#### undo-redo [PLANNING]
**Description:** Transaction-based undo/redo system. Every patch mutation flows through runTx(), generating forward and inverse ops. Full branching history with revision tree.

**Architecture:**
- Op-based transactions: Add, Remove, Update, SetTimeRoot, Many (compound)
- TxBuilder with runTx() as single mutation entry point
- HistoryStore with revision tree (branching, never truncates)
- Cascade helpers: removeBlockCascade(), removeBusCascade()
- Deep clone for proper inverse computation

**Phases Planned:**
| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ COMPLETE | Op types, TxBuilder, HistoryStore, basic UI (87 tests) |
| Phase 2 | ✅ COMPLETE | PatchStore + BusStore migration |
| Phase 3 | PLANNED | replaceBlock, lens operations, suppressGraphCommitted removal |
| Phase 4A | PLANNED | IndexedDB persistence |
| Phase 4B | PLANNED | History UI polish (variations, bookmarks) |
| Phase 4C | PLANNED | Gesture buffer + block position undo |
| Phase 4D | SKIPPED | expandMacro undo (LOW value, VERY HIGH complexity) |

**Planning Directory:** `.agent_planning/undo-redo/`

**Dependencies:** None
**Labels:** ux, editor, foundation, reliability
**Test Strategy:** Any sequence of edits can be fully undone and redone

### Core Topics

#### path-focus-mode [PROPOSED]
**Description:** Primary composition mode showing one signal path at a time. This is THE way to build patches, not a secondary view.

**Core behavior:**
- Focus on a render sink (auto-selects first one, or user clicks)
- Walk dependency graph backwards to find all contributing blocks
- Display as linear chain: TimeRoot → processing → Render
- Everything outside this path fades/hides completely
- Next/Prev navigation between different render paths
- Full editing capability: add blocks, make connections, adjust params
- Buses shown as clean join points (only relevant publishers visible)

**Why this works:**
- Patches ARE linear signal flows, we just display them as messy graphs
- Users naturally think "time → oscillator → shape → color → render"
- Eliminates "where do I put this block" anxiety
- Buses handle cross-path sharing implicitly

**Dependencies:** None (can prototype with existing infrastructure)
**Labels:** ux, editor, core-workflow, composition
**Test Strategy:** User can build complete animation without ever seeing full graph view

#### path-discovery [PROPOSED]
**Description:** Algorithm to extract linear paths from patch graph. Given a render sink, produce ordered list of blocks from TimeRoot to sink. Handle bus joins, multiple publishers, diamond dependencies.
**Dependencies:** None
**Labels:** algorithm, graph, core
**Test Strategy:** Golden patch produces correct path ordering

#### path-layout-engine [PROPOSED]
**Description:** Layout engine for path-focus mode. Linear left-to-right (or top-to-bottom) arrangement. Automatic spacing, no user positioning needed. Buses shown as compact join nodes.
**Dependencies:** path-discovery
**Labels:** ux, layout, rendering
**Test Strategy:** Any path renders cleanly without overlap

#### live-port-preview [PROPOSED]
**Description:** When composing in path mode, hovering over a potential connection target shows live preview of what would render. Ghosted/transparent overlay on canvas. Essential for "what if I connect this?" workflow.
**Dependencies:** Phase 6 complete (efficient recompilation)
**Labels:** ux, editor, preview
**Test Strategy:** Hover over valid target → canvas shows preview of connected result

#### smart-defaults [PROPOSED]
**Description:** Expand defaultSource coverage so blocks render something immediately when added to path. No "blank canvas" state - every block contributes visible output with sensible defaults.
**Dependencies:** None
**Labels:** ux, defaults, blocks
**Test Strategy:** Add block to path → immediate visible change on canvas

#### path-block-insertion [PROPOSED]
**Description:** Add blocks directly into path at cursor position. "Insert Oscillator here" → block appears in chain with auto-wired connections. No drag-and-drop, no manual wiring for common cases.
**Dependencies:** path-focus-mode, path-layout-engine
**Labels:** ux, editor, workflow
**Test Strategy:** Insert block into path → auto-connected, path remains valid

#### quick-swap [PROPOSED]
**Description:** Replace one block with another compatible block, preserving all connections. Right-click block → "Replace with..." → shows compatible alternatives. Wiring transfers automatically.

**Use cases:**
- Swap Oscillator for different wave shape
- Replace one layout (Grid → Circle → Line)
- Upgrade simple block to more configurable version

**Implementation:**
- Detect compatible replacements (same/compatible input/output types)
- Transfer connections to matching ports by name or type
- Undo-able as single operation

**Dependencies:** undo-redo
**Labels:** ux, editor, workflow
**Test Strategy:** Replace block → all valid connections preserved

#### auto-connect [PROPOSED]
**Description:** When adding a block, automatically connect it to the most sensible available ports. No manual wiring for obvious cases.

**Heuristics:**
- Match by type: Domain output → Domain input
- Match by common patterns: TimeRoot.phase → Oscillator.phase
- Prefer unconnected ports over already-connected ones
- If ambiguous, don't auto-connect (let user choose)

**Dependencies:** undo-redo
**Labels:** ux, editor, connections
**Test Strategy:** Add block near compatible block → auto-connected correctly

#### auto-layout-graph [PROPOSED]
**Description:** Automatic positioning of blocks in graph view. Dagre/ELK-style layout algorithm. Users never manually position blocks - the system arranges them based on connection topology.

**Features:**
- Left-to-right flow (TimeRoot on left, Render on right)
- Minimize edge crossings
- Group related blocks
- Re-layout on any topology change
- Smooth animated transitions

**Dependencies:** None
**Labels:** ux, layout, graph
**Test Strategy:** Any patch auto-layouts without overlaps

### Deprioritized (may not be needed with path-focus)

#### auto-wire-on-drop [PROPOSED]
**Description:** When you drop a block near another, auto-connect compatible ports. May be superseded by path-block-insertion.
**Dependencies:** None
**Labels:** ux, editor, connections
**Test Strategy:** Drop near compatible block → connection created

#### auto-layout [PROPOSED]
**Description:** Smart positioning for graph view. Lower priority since path-focus-mode handles layout automatically.
**Dependencies:** None
**Labels:** ux, editor, layout
**Test Strategy:** Blocks positioned reasonably in graph view

#### connect-to-menu [PROPOSED]
**Description:** Right-click → "Connect to..." menu. Still useful for edge cases in path mode.
**Dependencies:** type-unification
**Labels:** ux, editor, connections
**Test Strategy:** Right-click port → menu shows only compatible targets

#### fix-this-button [PROPOSED]
**Description:** One-click solutions for missing required inputs. Less critical if path-focus prevents invalid states.
**Dependencies:** None
**Labels:** ux, editor, validation
**Test Strategy:** Missing required input shows actionable fix button

---

## Incremental Migration Strategy

### Test-at-Every-Step Approach

Each topic includes a **Test Strategy** that must pass before the topic is complete.

**Phase 0 (Architecture Refactoring):**
- Each unification can be done incrementally
- Backward compatibility shims during transition
- Tests validate both old and new code paths

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
- `ON HOLD` - Blocked by higher-priority work
