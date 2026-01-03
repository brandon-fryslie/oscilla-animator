# Status Report - SignalExpr Runtime (Phase 4)

**Timestamp**: 2025-12-25
**Scope**: phase/4-signalexpr-runtime
**Confidence**: FRESH (new evaluation)
**Git Commit**: 511f813

## Executive Summary

**Overall Completion**: 0% - NOT STARTED
**Phase 4 Status**: PROPOSED (no implementation exists)
**Blocking Issues**: Phase 1-3 not completed (all prerequisites missing)
**Critical Gap**: Entire SignalExpr IR architecture is missing

## Evaluation Reuse

**No previous evaluations exist for this scope.**

Referenced cached knowledge:
- `eval-cache/architecture.md` (RECENT, 2 days old) - Core architecture patterns
- `eval-cache/test-infrastructure.md` (RECENT, 2 days old) - Test framework
- `eval-cache/rendering-architecture.md` (RECENT, 1 day old) - Render pipeline

## Phase 4 Requirements (from ROADMAP.md)

Phase 4 has **6 topics**, all in PROPOSED state:

1. **signal-evaluator-core**: `SigEvaluator.sample(id, env)` with per-frame cache
2. **signal-evaluator-combine**: Bus combine for signals (sum, average, min, max, last)
3. **signal-evaluator-transforms**: Transform chain execution (adapters/lenses)
4. **signal-evaluator-stateful**: Stateful ops (integrate, delay, sampleHold, slew)
5. **signal-closure-bridge**: Fallback to legacy closures for unimplemented ops
6. **block-compilers-signal**: Migrate signal blocks to emit SignalExpr IR

**Test Strategy**: Each topic must produce same results as closure version.

## Current State Assessment

### What Exists (Closure-Based Implementation)

✅ **Signal Block Compilers** (9 blocks)
- Location: `src/editor/compiler/blocks/signal/`
- Pattern: All emit closure-based `Signal<T> = (t, ctx) => T` artifacts
- Examples:
  - `AddSignal.ts` - Adds two signals (59 lines)
  - `MulSignal.ts` - Multiplies signals (59 lines)
  - `Oscillator.ts` - Waveform generator (71 lines)
  - `Shaper.ts` - Apply easing curves
  - `ColorLFO.ts` - Color oscillator
  - `MinSignal.ts`, `MaxSignal.ts` - Min/max combiners
  - `ClampSignal.ts` - Clamp to range

✅ **Compiler Pipeline**
- `compileBusAware.ts` (1,013 lines) - Multi-pass compiler with bus resolution
- Supports wired AND bus connections
- **BUT**: Emits closures, NOT IR

✅ **Type System**
- `compiler/types.ts` (521 lines)
- Defines `Artifact`, `ValueKind`, `PortType`
- TimeModel types (Finite/Cyclic/Infinite)
- **BUT**: No IR types exist (no `SignalExprIR`, `SigNode`, etc.)

✅ **Runtime Player**
- `runtime/player.ts` - Executes `Program<RenderTree>` closures
- Frame loop, time management, hot swap
- **BUT**: Closure-driven, not IR/schedule-driven

### What's COMPLETELY Missing (Phase 4 Requirements)

❌ **SignalExpr IR Types** (§12-SignalExpr.md)
- No `SignalExprIR` union type
- No `SigExprId`, `SignalExprTable`
- No `StatefulSignalOp` types
- No node kinds: `const`, `timeAbsMs`, `inputSlot`, `map`, `zip`, `busCombine`, `stateful`

❌ **SignalRuntime Data Structures** (§13-SignalExpr-Evaluator.md)
- No `SignalRuntime` interface
- No `SigNode[]` dense array
- No `SigId` numeric indices
- No `ConstPool`, `PureFnTable`, `TransformTable`
- No `StateLayout` for stateful ops

❌ **SigEvaluator Interface**
- No `sample<T>(id, env)` method
- No evaluation algorithm
- No per-frame caching (`SigFrameCache`)
- No memoization strategy

❌ **SigEnv (Evaluation Environment)**
- No `tAbsMs`, `tModelMs`, `phase01` time values
- No `SlotValueReader` for inputSlot resolution
- No `StateBuffer` typed arrays
- No `SigFrameCache` per-frame memo

❌ **Transform Chain Execution**
- No `TransformTable`, `TransformChain`, `TransformStep` IR
- Transforms currently inline in closures, not as IR steps

❌ **Stateful Signal Support**
- No `StateLayout` allocation
- No `StateBuffer` (typed arrays for state cells)
- No stateful ops: integrate, delayMs, delayFrames, sampleHold, slew
- State is currently hidden in closure scope (unobservable, non-deterministic)

❌ **Closure Bridge**
- No fallback mechanism to call legacy closures from IR
- Can't gradually migrate - it's all-or-nothing without this

❌ **IR-Emitting Block Compilers**
- All 9 signal blocks still emit closures
- No `IRBuilder` API exists
- No way to emit `SignalExpr` nodes

### Dependency Status (Phase 1-3)

Phase 4 **depends on Phase 3 (Bridge Compiler)**, which depends on Phase 2 and 1.

**Phase 1: Contracts & Type Unification** [NOT STARTED]
- ❌ `type-unification`: No unified TypeDesc/ValueKind
- ❌ `dense-id-system`: Still using string IDs everywhere (BlockId, PortRef)
- ❌ `ir-core-types`: No `CompiledProgramIR`, `NodeIR`, `BusIR`, `StepIR`
- ❌ `timemodel-ir`: TimeModel exists but not as IR

**Phase 2: IR Data Structures** [NOT STARTED]
- ❌ `signalexpr-schema`: Required for Phase 4, does not exist
- ❌ `fieldexpr-schema`: Does not exist
- ❌ `transform-chain-ir`: Does not exist
- ❌ `bus-ir-schema`: Does not exist
- ❌ `schedule-ir`: Does not exist
- ❌ All other Phase 2 topics: NOT STARTED

**Phase 3: Bridge Compiler** [NOT STARTED]
- ❌ `ir-builder-api`: Required for Phase 4 topic 6, does not exist
- ❌ `dual-emit-compiler`: Compiler only emits closures
- ❌ `ir-validator`: Does not exist
- ❌ All lowering passes: NOT STARTED

**Verdict**: Phase 4 **CANNOT START** until Phases 1-3 are complete.

## Runtime Check Results

**Persistent checks attempted**:

| Check Command | Status | Details |
|---------------|--------|---------|
| `just check` | FAIL | Dependencies not installed (initially) |
| `pnpm install` | PASS | 286 packages installed successfully |
| `just test` | FAIL | TypeScript compilation failed (killed) |

**Missing checks for Phase 4**:
1. **IR validation suite** - Validate SignalExpr DAG construction
2. **Evaluator correctness** - SignalExpr output matches closure output
3. **State determinism** - Stateful ops produce bitwise-identical results
4. **Cache correctness** - Per-frame memoization doesn't leak state
5. **Transform chain tests** - Adapter/lens execution matches legacy

**Cannot run runtime checks**: No IR implementation exists to test.

## Data Flow Verification

**Critical Signal Data Flows** (traced through CURRENT closure implementation):

| Flow | Input | Compile | Execute | Cache | Output |
|------|-------|---------|---------|-------|--------|
| TimeRoot → Signal | ✅ Patch | ✅ Closure | ✅ Player | ❌ No cache | ✅ Value |
| Signal math (Add/Mul) | ✅ Inputs | ✅ Closure tree | ✅ Per-frame | ❌ Re-evaluated | ✅ Value |
| Transform chain | ✅ Adapter/Lens | ⚠️ Inline in closure | ✅ Hidden | ❌ No introspection | ✅ Value |

**With SignalExpr IR** (PLANNED, not implemented):

| Flow | Input | IR Emit | Schedule | Evaluate | Cache | Output |
|------|-------|---------|----------|----------|-------|--------|
| TimeRoot → SignalExpr | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bus → busCombine node | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| SignalExpr DAG | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**All IR data flows**: NOT IMPLEMENTED

## Test Suite Assessment

**Test Quality Score**: N/A (Phase 4 has no tests)

Existing signal block tests:
- Location: `src/editor/compiler/blocks/signal/__tests__/`
- Found: 1 test file (`ColorLFO.test.ts`)
- Coverage: Limited (only 1 of 9 signal blocks has tests)

**Test reliability** (from cache):
> "Use Chrome DevTools MCP to verify rather than running the tests. The tests are NOT a good indication that the code is working"

**Phase 4 test requirements**:
1. SignalExpr DAG construction tests
2. Evaluator produces same output as closures (golden tests)
3. Stateful ops maintain state correctly
4. Cache hits/misses are correct
5. Transform chain execution matches legacy
6. Mixed IR/closure execution works (bridge tests)

**Current test gap**: 100% - no Phase 4 tests exist

## LLM Blind Spot Findings

**Checked against known issues**:

- ✅ **Empty inputs**: Current closures don't validate inputs thoroughly
- ⚠️ **Second run state**: Stateful signal ops use closure scope (hidden state, no reset)
- ⚠️ **Error messages**: Generic errors ("requires Signal<number>"), no context
- ⚠️ **Edge cases**: No validation for NaN, Infinity, division by zero in signal math

**Phase 4 will fix**:
- Explicit `StateBuffer` → state is visible, inspectable, resetable
- `SigEnv` → inputs validated at IR construction time
- Cache → avoids re-evaluation bugs

**Phase 4 introduces new risks**:
- IR construction bugs (malformed DAG)
- Cache invalidation bugs (stale values)
- State migration bugs (hot swap with incompatible state layout)

## Implementation Red Flags

**In existing closure-based code**:

🚩 **Hidden state in closures** (Stateful ops)
- State trapped in closure scope
- No way to inspect, dump, or migrate state
- Hot swap breaks stateful blocks (state lost)

🚩 **Re-evaluation waste**
- Same signal computed multiple times per frame
- Performance degrades with complex patches

🚩 **No determinism guarantee**
- Map/Set iteration in bus combine (non-deterministic)
- Closure evaluation order not guaranteed
- Same patch can produce different results

🚩 **Debug opacity**
- Can't inspect signal DAG
- Can't trace bus combine terms
- Can't see transform chain steps

🚩 **Rust/WASM blocker**
- Closures can't serialize to Rust
- Export relies on "replay closures" (fragile)
- No offline render path

**TODOs found**: 57 occurrences across 21 files
- 4 in `src/editor/blocks/signal.ts` (defaultSource migration)
- 16 in `src/editor/blocks/domain.ts`
- 5 in `src/editor/diagnostics/ActionExecutor.ts`

## Ambiguities Found

| Area | Question | Impact | Resolution Needed |
|------|----------|--------|-------------------|
| **Phase ordering** | Should Phase 4 start before Phase 1-3? | CRITICAL | ROADMAP says Phase 4 depends on Phase 3. Can't start. |
| **Migration strategy** | Gradual per-block or all-at-once? | HIGH | Spec says "gradual with closure fallback", but no bridge exists |
| **State migration** | How to preserve state during hot swap? | HIGH | StateLayout needs stable layout-hash matching (spec §13, §6) |
| **Cache key policy** | Per-frame vs. cross-frame caching? | MEDIUM | Spec has both, but optimizer pass not planned until later |
| **Transform execution** | Inline vs. separate step? | MEDIUM | Spec says separate TransformStep[], but current code inlines |
| **Event representation** | Event signal vs. separate stream? | MEDIUM | Spec recommends Signal<event>, not separate system |

**Most critical ambiguity**: Can Phase 4 start without Phase 1-3?

**Answer from spec review**:
- Phase 4 topic `signal-evaluator-core` depends on Phase 2 `signalexpr-schema`
- Phase 4 topic `signal-closure-bridge` depends on Phase 3 `ir-builder-api`
- Phase 4 topic `block-compilers-signal` depends on Phase 3 `ir-builder-api`

**Recommendation**: DO NOT start Phase 4 until Phase 1-3 are complete.

## Recommendations

### Highest Priority (Blockers)

1. **STOP Phase 4 work** - Cannot proceed without Phase 1-3
2. **Complete Phase 1** - Type unification and dense ID system
3. **Complete Phase 2** - SignalExpr schema and all IR data structures
4. **Complete Phase 3** - IR builder API and dual-emit compiler

### When Phase 1-3 are complete

1. **Start with signal-evaluator-core**
   - Implement basic `sample()` for const, timeAbsMs, map, zip nodes
   - Add per-frame `SigFrameCache` (Float64Array + NaN sentinel)
   - Test: Simple expressions evaluate correctly

2. **Add signal-closure-bridge**
   - Allow SignalExpr nodes to reference legacy closures as leaf ops
   - Enables gradual migration per block type
   - Test: Mixed IR/closure execution produces correct results

3. **Migrate pure signal blocks first**
   - AddSignal, MulSignal, MinSignal, MaxSignal (simple, no state)
   - Update block compilers to emit SignalExpr via IRBuilder
   - Test: Each migrated block matches closure output (golden tests)

4. **Add signal-evaluator-combine**
   - Implement busCombine node evaluation
   - Test: Bus combine produces same results as closure version

5. **Add signal-evaluator-transforms**
   - Implement TransformChain execution (adapters/lenses)
   - Test: Transform chains match legacy behavior

6. **Add signal-evaluator-stateful** (LAST)
   - Implement StateBuffer and StateLayout
   - Migrate stateful ops: integrate, delay, sampleHold, slew
   - Test: Stateful ops maintain state correctly across frames

### Missing Infrastructure (Create During Phase 4)

1. **Smoke test** (`scripts/smoke-phase4.sh`)
   - Compile golden patch with IR-enabled blocks
   - Run both closure and IR versions
   - Diff outputs (should be identical)

2. **IR validation suite**
   - Validate SignalExpr DAG: no cycles, valid refs, type compatibility
   - Should run after every compile in dev mode

3. **Performance benchmarks**
   - Measure evaluator overhead vs. closures
   - Track cache hit rates
   - Ensure no performance regression

## Codebase Metrics

- **Total TypeScript files**: 186
- **Signal block compilers**: 9 files (all closure-based)
- **Compiler core**: ~2,220 lines (types.ts + compileBusAware.ts + signal blocks)
- **Runtime**: 6 files in `src/editor/runtime/`
- **Tests**: 642 total (93.1% pass rate, but not reliable per maintainer)

## Workflow Recommendation

**⛔ PAUSE - Prerequisites Not Met**

Phase 4 **CANNOT START** until:
- ✅ Phase 1 complete (type-unification, dense-id-system, ir-core-types)
- ✅ Phase 2 complete (signalexpr-schema + all other IR schemas)
- ✅ Phase 3 complete (ir-builder-api, dual-emit-compiler, ir-validator)

**Current state**: Phase 1 is PROPOSED (not started).

**Recommended next action**:
1. Evaluate Phase 1 status (separate STATUS file)
2. If Phase 1 not started: Plan Phase 1 first
3. If Phase 1 started: Complete Phase 1, then Phase 2, then Phase 3
4. Only start Phase 4 after Phase 3 is fully validated

**If user wants to proceed anyway** (not recommended):
- Would need to implement all Phase 1-3 dependencies in parallel
- High risk of architectural mistakes (no validation layer)
- Migration path becomes unclear (no bridge)

---

## Detailed Implementation Gap Analysis

### Topic 1: signal-evaluator-core

**Status**: NOT STARTED (0%)

**Required** (from §13-SignalExpr-Evaluator.md):
- `SigEvaluator` interface with `sample<T>(id, env)` method
- `SigEnv` interface (tAbsMs, tModelMs, phase01, wrap, slotValues, state, cache)
- `SigFrameCache` (Float64Array for numbers, Int8Array for bools, validMask)
- Basic node evaluation: const, timeAbsMs, timeModelMs, phase01, inputSlot
- Pure combinators: map, zip, select
- Cache-first evaluation algorithm

**Missing**:
- All interfaces and types
- All evaluation logic
- All caching infrastructure

**Files that need creation**:
- `src/runtime/signal-expr/SigEvaluator.ts`
- `src/runtime/signal-expr/SigEnv.ts`
- `src/runtime/signal-expr/SigFrameCache.ts`
- `src/runtime/signal-expr/types.ts`

### Topic 2: signal-evaluator-combine

**Status**: NOT STARTED (0%)

**Required**:
- `busCombine` node evaluation
- Combine modes: sum, average, min, max, last

**Missing**:
- All combine mode implementations
- BusIndex resolution
- Integration with SigEvaluator

**Depends on**: Topic 1, Phase 2 `bus-ir-schema`

### Topic 3: signal-evaluator-transforms

**Status**: NOT STARTED (0%)

**Required**:
- `transform` node evaluation
- TransformChain step execution
- Step kinds: cast, map, normalize, scaleBias, ease, quantize, slew
- Stateful transforms (slew) access StateBuffer

**Missing**:
- TransformChain iterator
- All transform step implementations
- Integration with SigEvaluator

**Depends on**: Topic 1, Phase 2 `transform-chain-ir`

### Topic 4: signal-evaluator-stateful

**Status**: NOT STARTED (0%)

**Required**:
- `stateful` node evaluation
- StateLayout allocation (f64, f32, i32 buffers)
- StateBuffer typed arrays
- Stateful ops: integrate, delayMs, delayFrames, sampleHold, slew
- State cell read/write per frame

**Missing**:
- StateLayout design
- StateBuffer implementation
- All stateful op kernels
- State hot-swap logic

**Depends on**: Topic 1, Phase 2 `signalexpr-schema` (stateful node kind)

### Topic 5: signal-closure-bridge

**Status**: NOT STARTED (0%)

**Required**:
- SignalExpr node kind `closureRef`
- Wrapper to call legacy `(t, ctx) => T` closures
- Gradual migration support (some blocks IR, some closures)
- Performance: minimize wrapper overhead

**Missing**:
- Bridge node type in SignalExprIR
- Bridge evaluation in SigEvaluator
- Migration strategy per block

**Depends on**: Topic 1, Phase 3 `ir-builder-api`

### Topic 6: block-compilers-signal

**Status**: NOT STARTED (0%)

**Required**:
- Update 9 signal block compilers to emit SignalExpr via IRBuilder
- Migration order: pure blocks first (Add, Mul), then time blocks, then stateful
- Each migrated block must match closure output (golden tests)

**Missing**:
- IRBuilder API (Phase 3)
- Updated block compilers (all 9 still emit closures)
- Golden tests (closure vs. IR output comparison)

**Depends on**: Topics 1, 5, Phase 3 `ir-builder-api`

---

## Appendix: Design Doc Cross-References

**Primary specs for Phase 4**:
- `12-SignalExpr.md` - SignalExprIR schema
- `13-SignalExpr-Evaluator.md` - SigEvaluator design
- `01.1-CompilerMigration-Roadmap.md` - Phase ordering
- `16-Block-Lowering.md` - Block compiler contract

**Related specs**:
- `02-IR-Schema.md` - Core IR types (Phase 1)
- `09-Caching.md` - Cache policy IR (Phase 2)
- `11-Opcode-Taxonomy.md` - OpCode registry (Phase 2)
- `17-Scheduler-Full.md` - Full runtime (Phase 6)

**Test strategy sources**:
- ROADMAP.md Phase 4 topics
- 01.1-CompilerMigration-Roadmap.md Phase 5 (validation)

---

## Summary

Phase 4 (SignalExpr Runtime) is **0% complete** and **CANNOT START** until Phases 1-3 are finished.

**Key findings**:
- ❌ All 6 Phase 4 topics are NOT STARTED
- ❌ No SignalExpr IR types exist
- ❌ No SigEvaluator implementation
- ❌ All signal blocks still emit closures (no IR)
- ❌ Phase 1-3 are also NOT STARTED (blocking dependencies)
- ✅ Closure-based implementation works (9 signal blocks functional)
- ⚠️ 57 TODOs in codebase (technical debt)

**Recommendation**: **PAUSE Phase 4. Start with Phase 1 evaluation.**
