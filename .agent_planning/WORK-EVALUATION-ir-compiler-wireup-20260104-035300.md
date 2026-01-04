# Work Evaluation - 2026-01-04 03:53:00
Scope: work/ir-compiler-to-rendering-wireup
Confidence: FRESH

## Goals Under Evaluation
From commit 07b526b:
1. Wire IR compiler pipeline (passes 0-8) to rendering
2. compileBusAwarePatch() delegates to compilePatch()
3. IR pipeline produces CompiledProgramIR
4. IRRuntimeAdapter creates Program<RenderTree>
5. Program is consumed by Player for rendering

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `just typecheck` | PASS | TypeScript compilation clean |
| `just test` | PASS | 117/117 (4 pre-existing PatchStore failures) |
| Dev server | PASS | App loads, UI renders |

## Manual Runtime Testing

### What I Tried
1. Started dev server (`pnpm dev`)
2. Navigated to http://localhost:5173
3. Captured screenshot of loaded app
4. Extracted console logs via Chrome remote debugging
5. Traced compiler execution path
6. Verified IR pipeline invocation
7. Checked PreviewPanel integration

### What Actually Happened
1. **App loads successfully** - UI renders with controls, preview panel, inspector
2. **Compiler executes** - Console shows `[CompilerService] compile() called with 6 blocks`
3. **IR pipeline runs** - No fatal errors during passes 0-8
4. **compilePatch() completes** - Returns CompileResult with `ok: true`
5. **CompiledProgramIR created** - buildCompiledProgram() produces IR schedule
6. **IRRuntimeAdapter instantiated** - Creates Program<RenderTree>
7. **BUG**: Program never reaches renderer - field name mismatch

## Data Flow Verification
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| compilePatch() | Sets `programIR` | Sets `ir` | ❌ |
| CompileResult | Has `programIR` field | Field exists but unused | ❌ |
| PreviewPanel checks | `result.programIR` | Field is undefined | ❌ |
| IRRuntimeAdapter | Gets programIR | Never instantiated | ❌ |
| Canvas rendering | Executes IR | Falls back to empty | ❌ |

## Break-It Testing
| Attack | Expected | Actual | Severity |
|--------|----------|--------|----------|
| Load default patch | Renders visible output | Renders blank canvas | HIGH |
| Check console logs | IR compilation success | Success but no render | HIGH |
| Verify programIR | Field populated | Field undefined | HIGH |

## Evidence

### Console Logs
```
[Transforms] Initialized 14 transforms (6 adapters, 8 lenses)
[CompilerService] compile() called with 6 blocks: Array(6)
⚠️ No provider block type for signal:phase, falling back to DSConstSignalFloat
⚠️ No provider block type for signal:signal<phase>, falling back to DSConstSignalFloat
⚠️ No provider block type for scalar:signal<string>, falling back to DSConstSignalFloat
```

### Screenshot
![App loads but no visible rendering](/Users/bmf/code/oscilla-animator_codex/screenshot-initial.png)

Shows:
- UI loaded (Connections, Palette, Patch, Controls panels visible)
- ERROR indicator in bottom right
- Canvas area is blank (no animation visible)
- CLOCK: Infinite, HEALTH: -- fps, PERFORMANCE: Scrub-safe, STABILITY: Scrub-safe

### Code Evidence

**compile.ts:219** (WRONG):
```typescript
return {
  ok: true,
  errors: [],
  program,
  timeModel,
  ir: options?.emitIR ? (compiledProgram as any) : undefined,
  //  ^^^ Sets 'ir' field
};
```

**PreviewPanel.tsx:193** (CHECKS programIR):
```typescript
if (result.programIR) {
  //         ^^^^^^^^^ Checks 'programIR' field (undefined!)
  const adapter = new IRRuntimeAdapter(result.programIR);
  irAdapterRef.current = adapter;
  setActiveRenderer('canvas');
  ...
}
```

**types.ts:517-519** (BOTH FIELDS DEFINED):
```typescript
export interface CompileResult {
  ...
  /** IR representation (NEW) */
  ir?: LinkedGraphIR;
  /** Compiled program IR (from Pass 9: Codegen) */
  programIR?: CompiledProgramIR;
  ...
}
```

## Assessment

### ❌ Not Working
- **IR-to-rendering wireup incomplete**: compilePatch() sets `ir` but PreviewPanel checks `programIR`
- **No visible output**: Canvas renders blank despite successful IR compilation
- **Silent failure**: No error messages, just missing rendering
- **Field name mismatch**: `ir` vs `programIR` - type system allows both but semantics differ

### ⚠️ Partially Working
- **IR compilation succeeds**: Passes 0-8 execute without fatal errors
- **CompiledProgramIR created**: buildCompiledProgram() produces valid IR
- **IRRuntimeAdapter exists**: Can instantiate adapter when given programIR
- **Canvas rendering infrastructure ready**: PreviewPanel has IR rendering path

### ✅ Working
- **TypeScript compilation**: No type errors
- **Tests passing**: 117/117 (modulo pre-existing failures)
- **App loads**: UI renders, compiler executes
- **Compiler pipeline**: All passes execute sequentially
- **Error handling**: Compilation errors properly formatted

## Root Cause Analysis

**Immediate cause**: Line 219 of `compile.ts` sets `ir` instead of `programIR`.

**Design inconsistency**: CompileResult has two IR-related fields:
- `ir?: LinkedGraphIR` - Pass 8 output (linked graph)
- `programIR?: CompiledProgramIR` - Pass 9 output (with schedule)

**What should happen**:
1. compile.ts should set `programIR` (not `ir`)
2. PreviewPanel should check `result.programIR` (already does)
3. IRRuntimeAdapter receives CompiledProgramIR (already expects)

**Why this wasn't caught**:
- TypeScript allows both fields (optional)
- No runtime error (undefined check passes silently)
- Tests don't verify end-to-end rendering
- Console shows compilation success but not rendering failure

## Missing Checks (implementer should create)

1. **E2E rendering test** (`tests/e2e/ir-rendering.test.ts`)
   - Compile simple patch
   - Verify `result.programIR` is defined
   - Verify canvas rendering produces non-blank output
   - Check that CompiledProgramIR has valid schedule

2. **Smoke test for IR pipeline** (`just smoke:ir`)
   - Load demo patch
   - Trigger compilation
   - Assert programIR populated
   - Assert canvas updates
   - Should complete in <5 seconds

3. **Type contract test** (`tests/compiler/compile-result-contract.test.ts`)
   - Verify compilePatch sets programIR when emitIR=true
   - Verify programIR contains CompiledProgramIR shape
   - Verify ir field remains undefined (or contains LinkedGraphIR if dual-emit)

## Verdict: INCOMPLETE

**Reason**: IR compilation succeeds but program never reaches renderer due to field name mismatch.

## What Needs to Change

1. **File: src/editor/compiler/compile.ts:219**
   - **What's wrong**: Sets `ir` instead of `programIR`
   - **What should happen**: Set `programIR: options?.emitIR ? compiledProgram : undefined`
   - **Impact**: Allows PreviewPanel to detect and use IR program for rendering

2. **File: src/editor/compiler/compile.ts:211-220** (optional cleanup)
   - **What's wrong**: Returns both `program` and `programIR`, unclear which is authoritative
   - **What should happen**: If emitIR is true, maybe skip legacy `program` creation?
   - **Impact**: Clarifies IR-only vs dual-emit compilation modes

3. **File: src/editor/PreviewPanel.tsx:193** (already correct, no change needed)
   - Already checks `result.programIR`
   - Already creates IRRuntimeAdapter
   - Will work once compile.ts fix is applied

## Expected Outcome After Fix

1. compilePatch() sets `programIR` field when emitIR=true
2. PreviewPanel detects `result.programIR`
3. IRRuntimeAdapter instantiated with CompiledProgramIR
4. Canvas renderer executes IR schedule
5. Visible animation renders on screen
6. Console shows "Hot swapped to IR program" message

## Test Plan

After implementing fix:
1. Start dev server
2. Load demo patch (Full Pipeline or Particles)
3. Check console for "Hot swapped to IR program" message
4. Verify canvas shows animated content (not blank)
5. Scrub timeline - animation updates
6. Change seed - new variation renders
7. Check that PERFORMANCE and STABILITY indicators update

## Notes

- The infrastructure is ~95% complete
- Only fix needed: change `ir:` to `programIR:` on one line
- This is a **LLM implementation shortcut** - code compiles but doesn't wire up correctly
- Silent failure mode: no errors, just missing behavior
- Good example of why runtime testing > passing tests
