# SignalExpr Runtime - Sprint Index

Generated: 2025-12-25
Phase: 4 (SignalExpr Runtime)
Source: HANDOFF.md

---

## Overview

This document indexes all sprint plans for Phase 4: SignalExpr Runtime. The goal is to replace signal closures with SignalExpr DAG evaluation, enabling inspectable, cacheable, and Rust-portable signals.

---

## Sprint Summary

| Sprint | Name | Focus | Key Deliverables | Status |
|--------|------|-------|------------------|--------|
| 1 | Core Evaluator | Foundation | Types, Cache, Env, evalSig | PLANNED |
| 2 | Select & InputSlot | Conditional + Inputs | select, inputSlot nodes | PLANNED |
| 3 | Bus Combine | Multi-publisher | busCombine, CombineMode | PLANNED |
| 4 | Transform | Adapters/Lenses | TransformChain, EasingCurves | PLANNED |
| 5 | Stateful Ops | State Management | StateBuffer, integrate/delay/slew | PLANNED |
| 6 | Closure Bridge | Migration Support | ClosureRegistry, fallback | PLANNED |
| 7 | Block Migration | Compiler Update | IRBuilder, 8 blocks migrated | PLANNED |

---

## Sprint Details

### Sprint 1: Core Signal Evaluator
**File:** `PLAN-20251225-190000.md`, `DOD-20251225-190000.md`

**Goal:** Deliver a working SignalExpr evaluator that can evaluate simple pure signal expressions (const, timeAbsMs, map, zip) with per-frame caching.

**Deliverables:**
- SignalExprIR types (const, timeAbsMs, map, zip)
- SigFrameCache with per-frame memoization
- SigEnv evaluation environment
- evalSig() core algorithm
- OpCode registry (Sin, Cos, Add, Mul, etc.)
- Comprehensive test suite

**Files Created:**
```
src/runtime/signal-expr/
├── types.ts
├── SigFrameCache.ts
├── SigEnv.ts
├── OpCodeRegistry.ts
├── SigEvaluator.ts
├── __tests__/SigEvaluator.test.ts
└── README.md
```

---

### Sprint 2: Select and InputSlot Nodes
**File:** `SPRINT-02-select-inputSlot.md`

**Goal:** Add conditional evaluation (select) and external input resolution (inputSlot).

**Deliverables:**
- SelectNode with short-circuit evaluation
- InputSlotNode for external values
- SlotValueReader interface
- SigEnv extended with slotValues

**Key Features:**
- Short-circuit: only evaluate taken branch
- Threshold 0.5 for boolean conversion
- NaN for missing slots

---

### Sprint 3: Bus Combine
**File:** `SPRINT-03-busCombine.md`

**Goal:** Implement bus combine evaluation for signals.

**Deliverables:**
- BusCombineNode type
- All 6 combine modes (sum, average, min, max, first, last)
- Empty bus default handling
- Optional DebugSink tracing

**Key Features:**
- Deterministic publisher ordering (from compiler)
- Empty bus returns default value
- All terms evaluated before combining

---

### Sprint 4: Transform Chain Execution
**File:** `SPRINT-04-transform.md`

**Goal:** Implement adapter/lens transform chain execution.

**Deliverables:**
- TransformNode type
- TransformChain and TransformStep types
- Pure steps: scaleBias, normalize, quantize, ease, map
- TransformTable in SigEnv
- Built-in easing curves (7 curves)

**Key Features:**
- Steps applied in pipeline order
- Slew step placeholder (Sprint 5)
- Easing curves clamp input to [0,1]

---

### Sprint 5: Stateful Signal Operations
**File:** `SPRINT-05-stateful.md`

**Goal:** Implement stateful signal operations with explicit state management.

**Deliverables:**
- StateBuffer with typed arrays (f64, f32, i32)
- StateLayout for allocation
- RuntimeCtx for frame timing
- Stateful ops: integrate, delayMs, delayFrames, sampleHold, slew
- Complete slew transform step

**Key Features:**
- State persists across frames
- Explicit state allocation (no hidden closure state)
- Euler integration for integrate
- Ring buffer for delay ops
- Rising edge detection for sampleHold

---

### Sprint 6: Closure Bridge
**File:** `SPRINT-06-closureBridge.md`

**Goal:** Enable gradual migration from closures to IR.

**Deliverables:**
- ClosureBridgeNode type (TEMPORARY)
- LegacyClosure and LegacyContext types
- ClosureRegistry for storing closures
- Migration tracking (MIGRATED_BLOCKS set)
- getMigrationStatus() reporting

**Key Features:**
- Allows IR to call legacy closures
- Block-by-block migration without breaking
- Results are cached like other nodes

---

### Sprint 7: Block Compiler Migration
**File:** `SPRINT-07-blockCompilerMigration.md`

**Goal:** Migrate signal block compilers to emit SignalExpr IR.

**Deliverables:**
- Minimal IRBuilder (sigConst, sigTimeAbsMs, sigMap, sigZip)
- 7 pure blocks migrated (Add, Sub, Mul, Div, Min, Max, Clamp)
- Oscillator block migrated (sine waveform)
- New opcodes (Sign, Fract, Mod)
- Golden test framework
- Compiler adapter layer

**Migration Order:**
1. Pure math: AddSignal, SubSignal, MulSignal, DivSignal
2. MinMax: MinSignal, MaxSignal, ClampSignal
3. Time-based: Oscillator (sine)

---

## Node Kinds by Sprint

| Node Kind | Sprint | Description |
|-----------|--------|-------------|
| const | 1 | Constant value from pool |
| timeAbsMs | 1 | Monotonic player time |
| map | 1 | Unary pure function |
| zip | 1 | Binary pure function |
| select | 2 | Conditional (short-circuit) |
| inputSlot | 2 | External value reference |
| busCombine | 3 | Multi-publisher combine |
| transform | 4 | Transform chain |
| stateful | 5 | Stateful operations |
| closureBridge | 6 | Legacy closure fallback |

---

## Dependencies Graph

```
Sprint 1 (Core)
    ↓
Sprint 2 (Select/InputSlot)
    ↓
Sprint 3 (BusCombine)
    ↓
Sprint 4 (Transform)
    ↓
Sprint 5 (Stateful)
    ↓
Sprint 6 (ClosureBridge)
    ↓
Sprint 7 (BlockMigration)
```

Each sprint depends on all previous sprints being complete.

---

## Acceptance Criteria Summary

| Sprint | P0 Criteria | P1 Criteria | P2 Criteria | Total |
|--------|-------------|-------------|-------------|-------|
| 1 | 31 | 26 | 7 | 64 |
| 2 | 28 | 11 | 6 | 45 |
| 3 | 18 | 19 | 5 | 42 |
| 4 | 23 | 24 | 7 | 54 |
| 5 | 32 | 17 | 6 | 55 |
| 6 | 24 | 14 | 8 | 46 |
| 7 | 18 | 21 | 9 | 48 |
| **Total** | **174** | **132** | **48** | **354** |

---

## Files Created Across All Sprints

```
src/runtime/signal-expr/
├── types.ts                    (Sprint 1, extended in 2-6)
├── SigFrameCache.ts            (Sprint 1)
├── SigEnv.ts                   (Sprint 1, extended in 2-6)
├── SigEvaluator.ts             (Sprint 1, extended in 2-7)
├── OpCodeRegistry.ts           (Sprint 1, extended in 7)
├── SlotValueReader.ts          (Sprint 2)
├── DebugSink.ts                (Sprint 3, extended in 4-6)
├── TransformTable.ts           (Sprint 4)
├── EasingCurves.ts             (Sprint 4)
├── StateBuffer.ts              (Sprint 5)
├── RuntimeCtx.ts               (Sprint 5)
├── LegacyClosure.ts            (Sprint 6)
├── ClosureRegistry.ts          (Sprint 6)
├── MigrationTracking.ts        (Sprint 6)
├── IRBuilder.ts                (Sprint 7)
├── __tests__/
│   ├── SigEvaluator.test.ts    (Sprint 1, extended in 2-6)
│   └── goldenTests.test.ts     (Sprint 7)
└── README.md                   (Sprint 1, updated each sprint)
```

---

## Key Design Decisions

1. **Dense numeric IDs** - SigExprId is number, not string (performance)
2. **Per-frame caching** - Cache hit is O(1) array lookup with stamp comparison
3. **Typed arrays for state** - Float64Array, Uint32Array for performance
4. **Short-circuit select** - Only evaluate taken branch
5. **Deterministic ordering** - Publisher order set by compiler, not runtime
6. **Gradual migration** - Closure bridge enables block-by-block migration
7. **Constant deduplication** - Same values share pool slots

---

## Success Criteria

Phase 4 is complete when:

1. ✓ SignalExpr evaluator handles all node kinds
2. ✓ Per-frame caching works correctly
3. ✓ All stateful ops use explicit StateBuffer
4. ✓ Closure bridge allows gradual migration
5. ✓ At least pure math blocks are fully migrated
6. ✓ Migration comparison tests (golden tests) pass

---

## How to Use This Index

1. **Starting work:** Begin with Sprint 1
2. **Checking prerequisites:** Each sprint file lists dependencies
3. **Understanding scope:** Check "In Scope" and "Out of Scope" sections
4. **Tracking progress:** Use acceptance criteria checkboxes
5. **Verifying completion:** Run `just check` after each sprint

---

## Notes

- All times removed per project conventions
- Focus on correctness first, optimization second
- Use Chrome DevTools MCP to verify behavior (per CLAUDE.md)
- Tests are NOT sole indicator of correctness
