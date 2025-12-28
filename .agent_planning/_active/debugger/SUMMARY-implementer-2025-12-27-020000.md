# Phase 7 Debug Infrastructure - Sprint 1 Implementation Summary

**Date**: 2025-12-27
**Status**: ✅ All 3 Deliverables Completed
**Plan**: PLAN-2025-12-27-005641.md
**DoD**: DOD-2025-12-27-005641.md

---

## What Was Built

### 1. DebugIndex Population (P0)

The IRBuilderImpl already had tracking infrastructure in place. This sprint verified it's working and added comprehensive tests:

**Files Modified**:
- `src/editor/compiler/ir/__tests__/builder.test.ts` - Added 9 new debug index tests

**Tests Added**:
- `tracks sigExprSource when currentBlockId is set`
- `tracks fieldExprSource when currentBlockId is set`
- `tracks slotSource when currentBlockId and debugName are set`
- `does not track when currentBlockId is undefined`
- `given 3 blocks, debugIndex contains 3+ sigExpr mappings`
- `given field-using blocks, debugIndex.fieldExprSource is populated`
- `clearing currentBlockId stops tracking`
- `tracks all signal expression types`
- `tracks all field expression types`

### 2. executeDebugProbe Implementation (P0)

Connected the existing stub to TraceController ring buffers:

**Files Modified**:
- `src/editor/debug/TraceController.ts` - Added ValueRing/SpanRing integration
  - Added `valueRing` and `spanRing` readonly properties
  - Added `writeValue()` and `writeSpan()` methods with mode checks
  - Added `shouldEmitUIUpdate()` for 10Hz throttling
  - Added `clearBuffers()` method

- `src/editor/runtime/executor/steps/executeDebugProbe.ts` - Implemented value recording
  - Calls `controller.writeValue()` for each slot
  - Uses type-specific encoding via summaryToValueRecord()

**Tests Added in `src/editor/runtime/executor/__tests__/stepDispatch.test.ts`**:
- `no-ops when TraceController.mode is 'off'`
- `writes to ValueRing when mode is 'full'`
- `records values for multiple slots`

### 3. Schedule Probe Insertion (P1)

Added optional debug probe instrumentation to schedule building:

**Files Modified**:
- `src/editor/compiler/ir/buildSchedule.ts`
  - Added `ScheduleDebugConfig` interface
  - Updated `buildCompiledProgram()` to accept optional `debugConfig`
  - Added `maybeInsertProbe()` helper function
  - Inserts probes after time derive (basic + full)
  - Inserts probes after signal eval (basic + full)
  - Inserts probes after materialization (full only)

**Tests Added in `src/editor/compiler/ir/__tests__/buildSchedule.test.ts`**:
- `probeMode='off' does not insert any debugProbe steps`
- `includes timeDerive step`
- `probeMode='basic' inserts debugProbe step after time derive`
- `probe steps have unique IDs`
- `probe steps depend on their preceding step`
- `probe slots reference valid time output slots`
- `probeMode='full' inserts more probes than basic mode`

---

## Test Results

All tests pass:

```
src/editor/compiler/ir/__tests__/builder.test.ts      33 tests ✓
src/editor/compiler/ir/__tests__/buildSchedule.test.ts 7 tests ✓
src/editor/debug tests                                121 tests ✓
src/editor/runtime/executor/__tests__/stepDispatch.test.ts (debug probe tests) 4 tests ✓
```

---

## Roadmap Updated

Phase 7 in `.agent_planning/ROADMAP.md` was updated to reflect:
- Sprint 1 topics now IN PROGRESS
- Existing infrastructure marked COMPLETED (TypeKeyEncoding, SpanRing, ValueRing, TraceController)
- Future topics added from design-docs/11-Debugger/ (Debug HUD, Probe Mode, Debug Drawer, etc.)

---

## Remaining Work for Phase 7

1. **Integration tests**: Compile Golden Patch and verify debugIndex/ValueRing in browser
2. **Span recording**: For mode='trace', record span begin/end to SpanRing (deferred)
3. **Causal edge system** (Phase 7.2): Requires dependency analysis
4. **Debug UI**: HUD, probe mode, debug drawer (future phases)

---

## How to Use

### Enable Debug Probes at Compile Time

```typescript
import { buildCompiledProgram } from './ir/buildSchedule';

const compiledProgram = buildCompiledProgram(
  builderIR,
  patchId,
  patchRevision,
  seed,
  { probeMode: 'basic' }, // or 'full' for more probes
);
```

### Enable Debug Recording at Runtime

```typescript
import { TraceController } from '../debug/TraceController';

// Set mode before execution
TraceController.instance.setMode('full');

// Execute your schedule...

// Check recorded values
const valueCount = TraceController.instance.valueRing.getWritePtr();
console.log(`Recorded ${valueCount} values`);
```

---

## Files Changed Summary

| File | Change |
|------|--------|
| `src/editor/debug/TraceController.ts` | Added ring buffer integration |
| `src/editor/runtime/executor/steps/executeDebugProbe.ts` | Implemented value recording |
| `src/editor/compiler/ir/buildSchedule.ts` | Added debug probe insertion |
| `src/editor/compiler/ir/__tests__/builder.test.ts` | Added 9 debug index tests |
| `src/editor/compiler/ir/__tests__/buildSchedule.test.ts` | Created with 7 tests |
| `src/editor/runtime/executor/__tests__/stepDispatch.test.ts` | Added 3 debug probe tests |
| `.agent_planning/ROADMAP.md` | Updated Phase 7 topics |
| `.agent_planning/debugger/DOD-2025-12-27-005641.md` | Updated with completion status |
