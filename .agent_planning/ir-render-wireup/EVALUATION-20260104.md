# Evaluation: IR Compiler to Rendering Wireup
Timestamp: 2026-01-04-010000
Confidence: FRESH
Topic: ir-render-wireup

## Executive Summary

**Completion**: 0% - BLOCKED
**Critical Issues**: 1 (compiler stub returns errors)
**Workflow**: BLOCKED

The IR-based compiler pipeline (passes 0-8) exists and is complete, but it is **not wired to rendering**. The entry point (`compileBusAware.ts`) was intentionally stubbed out and now returns `NotImplemented` errors. The user requested wiring this to rendering, but the current state is that **compilation fails immediately**.

---

## What Exists

### ✅ Complete IR Compiler Pipeline (Passes 0-8)

**Location**: `src/editor/compiler/passes/`

All passes exist and are implemented:
- `pass1-normalize.ts` - Graph normalization (D3 integration complete per commit 052444b)
- `pass2-types.ts` - Type checking
- `pass3-time.ts` - Time topology
- `pass4-depgraph.ts` - Dependency graph
- `pass5-scc.ts` - Strongly connected components
- `pass6-block-lowering.ts` - Block → IR lowering
- `pass7-bus-lowering.ts` - Bus → IR lowering (note: now unified with pass6)
- `pass8-link-resolution.ts` - Final IR linking

**Evidence**:
```typescript
// src/editor/compiler/passes/index.ts:1-46
export { pass1Normalize } from "./pass1-normalize";
export { pass2TypeGraph } from "./pass2-types";
export { pass3TimeTopology } from "./pass3-time";
export { pass4DepGraph } from "./pass4-depgraph";
export { pass5CycleValidation } from "./pass5-scc";
export { pass6BlockLowering } from "./pass6-block-lowering";
export { pass8LinkResolution } from "./pass8-link-resolution";
```

### ✅ Schedule Builder

**Location**: `src/editor/compiler/ir/buildSchedule.ts:179-290`

Converts `BuilderProgramIR` to `CompiledProgramIR` with execution schedule. Includes:
- Time derivation steps
- Signal evaluation steps
- Field materialization steps
- 3D projection steps (instances3d)
- Render assembly steps

**Function signature**:
```typescript
export function buildCompiledProgram(
  builderIR: BuilderProgramIR,
  patchId: string,
  patchRevision: number,
  seed: number,
  debugConfig?: ScheduleDebugConfig,
): CompiledProgramIR
```

### ✅ Runtime Adapter

**Location**: `src/editor/runtime/executor/IRRuntimeAdapter.ts:1-196`

Bridges `CompiledProgramIR` to Player's `Program<RenderTree>` interface:
- `executeAndGetFrame(tMs)` - returns `RenderFrameIR`
- `createProgram()` - wraps as `Program<RenderTree>` for Player compatibility
- `swapProgram()` - hot-swap support

**Key methods**:
```typescript
class IRRuntimeAdapter {
  executeAndGetFrame(tMs: number): RenderFrameIR
  createProgram(): Program<RenderTree>
  swapProgram(newProgram: CompiledProgramIR): void
}
```

### ✅ Feature Flag System

**Location**: `src/editor/compiler/featureFlags.ts:36-47`

`emitIR` flag is **enabled by default**:
```typescript
const DEFAULT_FLAGS: CompilerFeatureFlags = {
  emitIR: true, // Enabled for steel thread testing
};
```

This flag is read by `integration.ts:950`:
```typescript
const result = compilePatch(patch, registry, seed, ctx, {
  emitIR: getFeatureFlags().emitIR
});
```

---

## What's Missing - THE CRITICAL GAP

### ❌ compileBusAware.ts is a Stub (BLOCKING)

**Location**: `src/editor/compiler/compileBusAware.ts:46-84`

**Status**: DEPRECATED and returns errors immediately

**Evidence**:
```typescript
// Lines 46-59
export function compileBusAware(
  _patch: CompilerPatch,
  _registry: import('./types').BlockRegistry
): CompileResult {
  const errors: CompileError[] = [{
    code: 'NotImplemented',
    message: 'compileBusAware() is deprecated and non-functional. Use the pass-based compiler pipeline (passes 0-8) instead.',
  }];

  return {
    ok: false,
    errors,
  };
}
```

**Impact**: Compilation **immediately fails** with `NotImplemented` error. Nothing renders.

**Call chain**:
```
integration.ts:950 (compilePatch)
  → compile.ts:38 (compilePatch)
    → compileBusAware.ts:68 (compileBusAwarePatch)
      → RETURNS ERROR ❌
```

### ❌ No Pass Pipeline Invocation

**What needs to happen**:
```typescript
// compileBusAware.ts should do this:
function compileBusAwarePatch(patch, registry, seed, ctx, options) {
  if (!options?.emitIR) {
    return { ok: false, errors: [/* legacy not supported */] };
  }

  // 1. Run passes 1-8
  const p1 = pass1Normalize(patch);
  if (!p1.ok) return p1;

  const p2 = pass2TypeGraph(p1.normalized);
  if (!p2.ok) return p2;

  const p3 = pass3TimeTopology(p2.typed);
  if (!p3.ok) return p3;

  const p4 = pass4DepGraph(p3.timeResolved);
  if (!p4.ok) return p4;

  const p5 = pass5CycleValidation(p4.depGraph);
  if (!p5.ok) return p5;

  const p6 = pass6BlockLowering(p5.acyclic, registry);
  if (!p6.ok) return p6;

  const p8 = pass8LinkResolution(p6.unlinked);
  if (!p8.ok) return p8;

  // 2. Build schedule
  const program = buildCompiledProgram(
    p8.linked.builderIR,
    patch.patchId,
    patch.patchRevision,
    seed
  );

  // 3. Create adapter
  const adapter = new IRRuntimeAdapter(program);

  // 4. Return as CompileResult with timeModel
  return {
    ok: true,
    program: adapter.createProgram(), // Legacy Program<RenderTree>
    timeModel: program.timeModel,
    errors: [],
  };
}
```

**Currently**: None of this exists. The stub just returns an error.

---

## What Needs Changes

### 1. Wire compileBusAware.ts to Passes (CRITICAL)

**File**: `src/editor/compiler/compileBusAware.ts`
**Lines**: 68-84 (replace stub)

**Changes**:
1. Import all passes (`pass1Normalize` through `pass8LinkResolution`)
2. Import `buildCompiledProgram` from `ir/buildSchedule`
3. Import `IRRuntimeAdapter` from `runtime/executor/IRRuntimeAdapter`
4. Replace stub with actual pass pipeline invocation
5. Thread errors from each pass correctly
6. Return `IRRuntimeAdapter.createProgram()` as `Program<RenderTree>`

**Complexity**: Medium (200-300 lines)

### 2. Hook CompilerService.getProgram() to Return IR

**File**: `src/editor/compiler/integration.ts`
**Lines**: 1061-1072

**Current**:
```typescript
getProgram(): CompiledProgram | null {
  const hasProgram = lastResult?.program != null || lastResult?.canvasProgram != null;
  if (!hasProgram || lastResult?.timeModel == null) {
    return null;
  }
  return {
    program: lastResult.program,
    canvasProgram: lastResult.canvasProgram,
    timeModel: lastResult.timeModel,
  };
}
```

**Needs**: Check if result has IR-based program and extract properly.

**Risk**: May already work if compileBusAware returns the right shape.

### 3. Fix Missing Block Definitions (MEDIUM PRIORITY)

**Status**: User mentioned "2-3 missing block definitions causing type inference failures"

**Evidence**: No TypeScript errors currently:
```bash
$ just typecheck
✓ tsc -b (clean)
```

**Hypothesis**: Either already fixed OR errors are runtime (not compile-time).

**Action**: Need to run patch compilation test to verify.

---

## Dependencies and Risks

### Dependencies

1. **Block Registry** must have compilers for all block types
   - Location: `src/editor/blocks/registry.ts:112-114`
   - Validation runs on module load (lines 101-110)
   - All blocks validated against `KERNEL_PRIMITIVES`

2. **Pass compatibility** - each pass must accept output from previous
   - Evidence: Type chain exists (`NormalizedPatch` → `TypedPatch` → etc.)
   - Risk: LOW (passes already tested individually)

3. **IRBuilder completeness** - must emit all IR nodes for blocks
   - Location: `src/editor/compiler/ir/IRBuilderImpl.ts`
   - Risk: MEDIUM (may have gaps for uncommon blocks)

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pass pipeline fails on real patches | HIGH | Run test patches through pipeline |
| Missing block compilers | MEDIUM | Registry validation catches at load time |
| Schedule generation incomplete | MEDIUM | Test with simple patches first |
| Adapter doesn't match Player interface | LOW | IRRuntimeAdapter already implements Program<T> |
| Feature flag disabled accidentally | LOW | Default is `emitIR: true` |

### Test Coverage

**Existing tests**: Passes 3-5 have unit tests
- `pass3-time.test.ts` - Time topology
- `pass4-depgraph.test.ts` - Dependency graph
- `pass5-scc.test.ts` - SCC validation

**Missing tests**: No end-to-end pipeline test
- Need: `compileBusAware` → passes 1-8 → schedule → adapter → render

**Test quality**: Unit tests exist but integration test missing

---

## Ambiguities Found

### Ambiguity 1: Empty Patch Handling

**Question**: What should happen when patch has 0 blocks?

**Evidence**:
```typescript
// integration.ts:986-1003
const isEmptyPatch = result.errors.length === 1 &&
                     result.errors[0].code === 'EmptyPatch';

if (isEmptyPatch) {
  // Silently clear state - no error logging for empty patch
  lastDecorations = emptyDecorations();
  // Still emit CompileFinished event
}
```

**How it might be guessed**: Pass pipeline may not handle empty patches gracefully.

**Impact**: LOW (edge case)

### Ambiguity 2: IR vs Legacy Coexistence

**Question**: When `emitIR: false`, should compilation fail or fall back to legacy?

**Current**: Stub always fails regardless of flag.

**Options**:
- A: Fail with clear error "Legacy compiler removed"
- B: Silent fallback (but to what?)
- C: Feature flag controls entire behavior

**Impact**: MEDIUM (affects backward compatibility)

### Ambiguity 3: Missing Block Compiler Behavior

**Question**: If a block type has no compiler in Pass 6, what happens?

**Options**:
- A: Fail compilation with clear error
- B: Skip block (dangerous - silent failure)
- C: Use default/fallback compiler

**Current**: Unknown - need to trace pass6 code.

**Impact**: HIGH if option B (silent failure)

---

## Runtime Check Results

### Check: TypeScript Compilation

**Command**: `just typecheck`
**Status**: ✅ PASS
**Output**: Clean build, 0 errors

### Check: Test Suite

**Command**: `just test`
**Status**: ⚠️ PARTIAL
**Output**: Tests run but with unrelated muxer errors (VideoExporter)

**Relevant**: No compiler test failures observed in output sample.

### Check: Stub Behavior

**Command**: Manual inspection of compileBusAware.ts
**Status**: ❌ FAIL
**Evidence**: Stub returns `NotImplemented` error immediately

---

## Data Flow Verification

| Flow Step | Input | Process | Store | Retrieve | Display |
|-----------|-------|---------|-------|----------|---------|
| Pass 1 (Normalize) | CompilerPatch | ✅ Exists | N/A | N/A | N/A |
| Pass 2 (Types) | NormalizedPatch | ✅ Exists | N/A | N/A | N/A |
| Pass 3 (Time) | TypedPatch | ✅ Exists | N/A | N/A | N/A |
| Pass 4 (DepGraph) | TimeResolvedPatch | ✅ Exists | N/A | N/A | N/A |
| Pass 5 (SCC) | DepGraph | ✅ Exists | N/A | N/A | N/A |
| Pass 6 (Block Lowering) | AcyclicGraph | ✅ Exists | BuilderIR | N/A | N/A |
| Pass 8 (Link) | UnlinkedIRFragments | ✅ Exists | LinkedGraphIR | N/A | N/A |
| Schedule Build | LinkedGraphIR | ✅ Exists | CompiledProgramIR | N/A | N/A |
| Runtime Adapter | CompiledProgramIR | ✅ Exists | ValueStore | ✅ | RenderFrameIR |
| **Pipeline Invocation** | CompilerPatch | ❌ STUB | - | - | - |

**Gap**: The pipeline exists but is never invoked. The stub at the entry point blocks all data flow.

---

## Recommendations

### Priority 1: Unwire the Stub (IMMEDIATE)

**Action**: Replace `compileBusAwarePatch()` stub with actual pass pipeline.

**Estimated effort**: 2-4 hours

**Deliverable**: Patch → CompiledProgramIR → IRRuntimeAdapter → Program<RenderTree>

**Test**: Simple patch with 1 TimeRoot + 1 Domain + 1 RenderInstances2D block

### Priority 2: Integration Test (NEXT)

**Action**: Write end-to-end test that compiles and renders a minimal patch.

**Estimated effort**: 1-2 hours

**Deliverable**: `src/editor/compiler/__tests__/ir-pipeline-integration.test.ts`

**Acceptance**: Patch compiles without errors and produces RenderFrameIR

### Priority 3: Missing Block Investigation (IF NEEDED)

**Action**: Run compilation on real patches and identify missing block compilers.

**Estimated effort**: 1-3 hours (depends on how many are missing)

**Trigger**: If integration test reveals missing compilers

---

## Verdict

**Workflow Recommendation**: ⛔ **BLOCKED**

**Reason**: The entry point is stubbed and returns errors. No rendering can occur until `compileBusAware.ts` is wired to the pass pipeline.

**Next Action**: Replace the stub in `compileBusAware.ts:68-84` with actual pass invocation.

**Blocker Severity**: CRITICAL - this is the **only** thing preventing the IR compiler from working.

**Estimated Time to Unblock**: 2-4 hours for basic wiring + testing.

---

## Relevant Files

**Must Modify**:
- `src/editor/compiler/compileBusAware.ts` (replace stub, 200-300 lines)

**Must Read**:
- `src/editor/compiler/passes/index.ts` (pass exports)
- `src/editor/compiler/ir/buildSchedule.ts` (schedule builder)
- `src/editor/runtime/executor/IRRuntimeAdapter.ts` (adapter interface)

**May Need**:
- `src/editor/compiler/integration.ts` (if getProgram needs changes)
- `src/editor/compiler/blocks/` (if missing compilers identified)

**Test References**:
- `src/editor/compiler/passes/__tests__/pass3-time.test.ts` (example pass test)
- `src/editor/compiler/passes/__tests__/pass4-depgraph.test.ts` (example pass test)
- `src/editor/compiler/passes/__tests__/pass5-scc.test.ts` (example pass test)

---

## Confidence Assessment

**Confidence**: FRESH (just evaluated)

**Evidence Quality**: HIGH
- Direct file inspection of all key components
- TypeScript compilation confirms no type errors
- Recent commits show active development on passes

**Ambiguity Level**: MEDIUM
- Empty patch handling unclear
- Missing block compiler behavior unknown
- Legacy fallback strategy undefined

**Risk Level**: MEDIUM-HIGH
- Stub removal is straightforward but untested
- Integration may reveal hidden issues
- No end-to-end test exists yet
