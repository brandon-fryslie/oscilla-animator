# Deep Audit Report: Roadmap vs. Actual Codebase State

**Date:** 2025-12-31
**Auditor:** Claude (comprehensive code review)
**Scope:** All phases in ROADMAP.md checked against actual implementation

---

## Executive Summary

The roadmap significantly **overstates completion**. Many items marked `COMPLETED` contain placeholder implementations, stubs, or fallback mechanisms that indicate partial work. The IR compilation pipeline exists structurally but **does not execute independently** - it relies heavily on `closureBridge` fallbacks to legacy closures.

---

## Phase 1: Contracts & Type Unification [COMPLETED] - VERIFIED COMPLETE

**Status: Genuinely complete**

- `TypeDesc`, `TypeWorld`, `TypeDomain` properly defined
- Dense ID types (`NodeIndex`, `ValueSlot`, etc.) implemented
- Tests pass

**No changes needed.**

---

## Phase 2: IR Data Structures [COMPLETED] - VERIFIED COMPLETE

**Status: Genuinely complete**

- All IR schemas defined: `SignalExprIR` (12 variants), `FieldExprIR` (7 variants), `ScheduleIR`, `StepIR` variants
- `OpCode` registry with 50+ opcodes
- Tests pass

**No changes needed.**

---

## Phase 3: Bridge Compiler [COMPLETED] - OVERSTATED

**Should be marked: PARTIAL or add incomplete sub-items**

### Issues Found:

| File | Line | Problem |
|------|------|---------|
| `pass6-block-lowering.ts` | 138-140 | Signal/Field artifacts → "placeholder signal/field nodes (identity-like)" |
| `pass6-block-lowering.ts` | 164, 173, 179-195 | vec2/color/signals create placeholder time signals, not real IR |
| `v2adapter.ts` | 70-89 | **Entire adapter is STUB** - returns `Error` artifacts |
| `IRBuilderImpl.ts` | 577-578 | Uses `closureBridge` as TEMPORARY for `reduceFieldToSig` |

### Reality
Compiler emits IR **structurally** but the IR nodes are often placeholders that don't represent actual computations. The closures still do the real work.

### Suggested New Topics to Add:
- `native-block-ir-emission` [PROPOSED]: Replace placeholder IR nodes with real computational IR for all block types
- `v2adapter-implementation` [PROPOSED]: Complete the V2 adapter or remove it if superseded

---

## Phase 4: SignalExpr Runtime [COMPLETED] - OVERSTATED

**Should be marked: PARTIAL or add incomplete sub-items**

### Issues Found:

| File | Line | Problem |
|------|------|---------|
| `SigEvaluator.ts` | 541-553 | `evalClosureBridge` marked TEMPORARY (32 files still use it) |
| `SigEvaluator.ts` | 1090, 1147 | `cast` operation: "PLACEHOLDER - throws error (future)" |
| `ClosureRegistry.ts` | 5 | "TEMPORARY infrastructure for migration" |
| `LegacyClosure.ts` | 5 | "TEMPORARY infrastructure for migration" |
| `MigrationTracking.ts` | 7 | "TEMPORARY infrastructure" |

### Reality
The `SigEvaluator` works, but many blocks use `closureBridge` to fall back to legacy closures. The evaluator isn't self-sufficient.

### Suggested New Topics to Add:
- `closure-bridge-elimination` [PROPOSED]: Migrate remaining blocks off closureBridge, then remove it
- `signal-cast-implementation` [PROPOSED]: Implement type cast operations in SigEvaluator

---

## Phase 5: FieldExpr + Materialization [COMPLETED] - OVERSTATED

**Should be marked: PARTIAL - has critical gaps**

### Critical Issues Found:

| File | Line | Problem |
|------|------|---------|
| `Materializer.ts` | 1406-1419 | `fillBufferTransform` **THROWS ERROR**: "transform chain evaluation not implemented" |
| `RenderSinkMaterializer.ts` | 107-115 | `evalSig()` is **STUB returning 1.0** always |
| `SignalBridge.ts` | 2, 8, 65-67 | Entire file marked "TEMPORARY Phase 5 workaround" |
| `Materializer.ts` | 39, 44 | Signal/transform chain structs are "stub for now" |

### Reality
Field materialization works for simple cases but transform chains throw errors. Signal evaluation in render sinks uses stubs.

### Suggested New Topics to Add:
- `transform-chain-evaluation` [PROPOSED]: Implement actual transform chain evaluation in Materializer (currently throws)
- `render-sink-signal-eval` [PROPOSED]: Wire real SigEvaluator into RenderSinkMaterializer (currently returns 1.0)
- `signal-bridge-removal` [PROPOSED]: Remove SignalBridge.ts after proper integration

---

## Phase 6: Full Scheduled Runtime [IN PROGRESS] - PARTIALLY CORRECT

**Status is accurate but gaps are more severe than implied**

### What Works:
- Step executors exist: `executeTimeDerive`, `executeNodeEval`, `executeBusEval`, `executeMaterialize`, `executeRenderAssemble`, `executeDebugProbe`
- `ScheduleExecutor` frame loop dispatches all step kinds correctly

### Critical Issues in OpCodeEvaluator.ts:

| OpCode | Lines | Problem |
|--------|-------|---------|
| `TimeAbsMs` | 45-94 | `return [0]` - **Placeholder, no real time** |
| `Phase01` | 96-98 | `return [0]` - **Placeholder** |
| `Integrate` | 304-307 | Pass-through stub - "TODO: Needs state binding" |
| `DelayMs` | 309-311 | Pass-through stub - "TODO: Needs state binding" |
| `default` | 317-319 | Unknown opcodes `return [0]` with warning |

### Reality
Schedule execution framework is complete, but **stateful operations don't work**. Time-based operations return constant 0.

### Suggested New Topics to Add (or update existing):
- `opcode-time-wiring` [PROPOSED]: Wire tAbsMs from TimeDerive step into OpCodeEvaluator context
- `opcode-state-binding` [PROPOSED]: Implement state bindings for Integrate, DelayMs, and other stateful ops
- Update `schedule-executor` from PARTIAL to specify what remains

---

## Phase 7: Debug Infrastructure [IN PROGRESS] - ACCURATELY STATED

**Status is correct**

### What's Complete:
- `SpanRing`, `ValueRing` implemented
- `TraceController` with mode switching
- `executeDebugProbe` step executor (reads values, encodes, writes to ring)
- Type key encoding

### What's In Progress (as stated):
- `debug-index-compile` - DebugIndex population during compilation
- `schedule-probe-insertion` - Inserting probe steps at key boundaries

**No changes needed to status, topics are correctly marked.**

---

## Summary Table

| Phase | Roadmap Status | Actual Status | Gap Severity | Recommended Action |
|-------|---------------|---------------|--------------|-------------------|
| 1 | COMPLETED | Complete | None | None |
| 2 | COMPLETED | Complete | None | None |
| 3 | COMPLETED | Structural only | **Medium** | Mark PARTIAL or add sub-items |
| 4 | COMPLETED | Uses fallbacks | **Medium** | Mark PARTIAL or add sub-items |
| 5 | COMPLETED | Partial | **High** | Mark PARTIAL, add critical items |
| 6 | IN PROGRESS | Partial | **High** | Add specific gap items |
| 7 | IN PROGRESS | Accurate | None | None |

---

## Critical Gaps Requiring Fix (Priority Order)

1. **`fillBufferTransform` throws** (`Materializer.ts:1419`) - Transform chains cannot execute
2. **`evalSig` stub returns 1.0** (`RenderSinkMaterializer.ts:114`) - Render sink signals always return 1
3. **`TimeAbsMs`/`Phase01` return 0** (`OpCodeEvaluator.ts:94,98`) - Time-based animations don't work in IR mode
4. **`Integrate`/`DelayMs` pass-through** (`OpCodeEvaluator.ts:307,311`) - Stateful operations don't accumulate
5. **`closureBridge` dependency** - 32 files still use the "temporary" bridge

---

## Recommended Roadmap Updates

### Option A: Mark Phases as PARTIAL
Change Phase 3, 4, 5 status from `[COMPLETED]` to `[PARTIAL]` with notes about what remains.

### Option B: Add Missing Topics
Keep status but add explicit topics for the gaps:

**Phase 3 additions:**
- `native-block-ir-emission` - Replace placeholder IR with real computational nodes
- `v2adapter-completion` - Complete or remove v2adapter.ts

**Phase 4 additions:**
- `closure-bridge-elimination` - Remove closureBridge dependency
- `signal-cast-ops` - Implement cast operations

**Phase 5 additions:**
- `transform-chain-eval` - Implement transform chain evaluation (CRITICAL)
- `render-sink-signal-integration` - Wire SigEvaluator into RenderSinkMaterializer

**Phase 6 additions:**
- `opcode-time-context` - Wire time from TimeDerive into OpCode evaluation
- `opcode-state-bindings` - Implement persistent state for Integrate/DelayMs

### Option C: Combined
Mark Phase 5 as PARTIAL (most severe gaps) and add topics for other phases.

---

## Files with TODO/PLACEHOLDER Counts

| Directory | TODO/FIXME/STUB/PLACEHOLDER Count |
|-----------|-----------------------------------|
| `src/editor/compiler/` | 47 instances |
| `src/editor/runtime/` | 52 instances |

Many of these are in "COMPLETED" phase code.
