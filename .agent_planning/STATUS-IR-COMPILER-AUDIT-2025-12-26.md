# IR Compiler Migration - ACCURATE Audit
Generated: 2025-12-26

---

## THE REAL SITUATION

**Block compilers still emit CLOSURES, not IR.**

The design docs specify:
```typescript
// DESIGN (16-Block-Lowering.md)
export type BlockLowerFn = (args: {
  ctx: LowerCtx;                      // Has IRBuilder
  inputs: readonly ValueRefPacked[];  // IR references
}) => LowerResult;                    // Returns ValueRefPacked[]
```

What's actually implemented:
```typescript
// ACTUAL (src/editor/compiler/types.ts)
export interface BlockCompiler {
  compile(args: {
    inputs: Record<string, Artifact>;  // CLOSURES
    ctx: CompileCtx;                   // NO IRBuilder
  }): CompiledOutputs;                 // Returns CLOSURES
}
```

Example from AddSignal.ts:
```typescript
compile({ inputs }) {
  const aSignal = aArtifact.value;  // closure: (t, ctx) => number
  const bSignal = bArtifact.value;  // closure: (t, ctx) => number

  // CREATES A CLOSURE, NOT IR
  const signal = (t, ctx) => aSignal(t, ctx) + bSignal(t, ctx);

  return { out: { kind: 'Signal:number', value: signal } };  // CLOSURE
}
```

---

## Phase-by-Phase ACCURATE Status

### Phase 0-2: IR Types & Data Structures
**Status: ✅ COMPLETE**

These are genuinely done:
- TypeDesc, TypeWorld, TypeDomain
- SignalExprIR (13 node kinds)
- FieldExprIR (7 node kinds)
- TransformChainIR, ScheduleIR, OpCodes
- Dense numeric indices
- IRBuilder interface

### Phase 3: Bridge Compiler
**Status: ⚠️ STRUCTURAL COMPLETE, SEMANTIC INCOMPLETE**

What exists:
- 8-pass pipeline structure (passes 1-8)
- Pass 6 creates PLACEHOLDER IR from closure artifacts

What's MISSING:
- **Block compilers don't call IRBuilder** - they return closures
- **Pass 6 is a BRIDGE** - it infers "skeleton" IR from Artifact kinds, NOT from actual block semantics
- **No `LowerCtx` with IRBuilder** - blocks have no way to emit real IR

From pass6-block-lowering.ts line 7-9:
```
Key insight: Block compilers still emit Artifacts (closures). This pass
infers IR structure from those Artifacts rather than modifying block compilers.
```

### Phase 4: SignalExpr Runtime
**Status: ✅ EVALUATOR COMPLETE, ❌ NOT WIRED TO REAL IR**

The SigEvaluator is complete and can evaluate all node kinds. BUT:
- It evaluates **placeholder IR** created by Pass 6, not real IR
- The `closureBridge` node exists specifically because blocks emit closures
- Real block IR doesn't exist for it to evaluate

### Phase 5: FieldExpr + Materialization
**Status: ⚠️ RUNTIME COMPLETE, ❌ BLOCKED ON PHASE 3**

Materializer, BufferPool, etc. are implemented. BUT:
- They can't consume real FieldExprIR because blocks don't emit it
- The integration layer has type errors (17 build errors)

### Phase 6: Block Compiler Migration
**Status: ❌ NOT STARTED**

This is the critical missing piece. Need to:
1. Change BlockCompiler signature to `BlockLowerFn`
2. Add `LowerCtx` with IRBuilder access
3. Migrate ALL ~50 block compilers from closures to IR
4. Pass 6 becomes real lowering, not placeholder generation

---

## REMAINING WORK BY PHASE

### Phase 3: Complete Block Lowering (LARGE)

| Work Item | Scope | Files |
|-----------|-------|-------|
| Create `LowerCtx` interface with IRBuilder | Small | New file |
| Create `BlockLowerFn` type | Small | types.ts |
| Create `LowerResult` type | Small | types.ts |
| **Migrate ~50 block compilers** | **LARGE** | All files in `compiler/blocks/` |
| Update Pass 6 to call real lowering | Medium | pass6-block-lowering.ts |

Block compilers to migrate (from grep results):
- Signal: AddSignal, SubSignal, MulSignal, DivSignal, MinSignal, MaxSignal, ClampSignal, Oscillator, Shaper, ColorLFO
- Domain: DomainN, GridDomain, SVGSampleDomain, TimeRoot, PositionMap*, FieldMap*, FieldZip*, FieldReduce, FieldHash01, FieldOpacity, FieldColorize, FieldFromSignalBroadcast, FieldFromExpression, FieldStringToColor, FieldHueGradient, FieldConstNumber, FieldConstColor, FieldAddVec2, JitterFieldVec2, StableIdHash, TriggerOnWrap, ViewportInfo, PhaseClock
- Render: RenderInstances2D, Render2dCanvas
- Rhythm: EnvelopeAD, PulseDivider
- Debug: DebugDisplay

**Estimated: ~50 block compilers need rewriting**

### Phase 4: Wire Evaluator to Real IR (MEDIUM)

| Work Item | Scope |
|-----------|-------|
| Remove `closureBridge` dependency | Medium |
| Ensure evaluator receives real IR from Pass 6 | Medium |
| Integration tests with real IR | Medium |

### Phase 5: Fix Integration Layer (SMALL)

| Work Item | Scope |
|-----------|-------|
| Fix 17 TypeScript build errors | Small |
| Wire CompilerRuntime to real IR | Small |

### Phase 6+: Render, Debug, Hot-Swap (NOT STARTED)

Blocked on Phase 3 completion.

---

## BUILD ERRORS (17)

```
src/editor/runtime/integration/typeAdapter.ts - enum syntax (5 errors)
src/editor/runtime/integration/SignalBridge.ts - enum syntax
src/editor/runtime/integration/CompilerRuntime.ts - unused imports
src/editor/runtime/field/__tests__/*.ts - missing SigEnv.time prop (3 errors)
src/editor/runtime/signal-expr/__tests__/*.ts - unused vars, type inference
src/editor/PatchBay.tsx - unused variable
```

---

## SUMMARY

| Phase | Status | Blocking Issue |
|-------|--------|----------------|
| 0-2 | ✅ COMPLETE | - |
| 3 | ⚠️ STRUCTURE ONLY | Block compilers emit closures, not IR |
| 4 | ⚠️ EVALUATOR DONE | No real IR to evaluate |
| 5 | ⚠️ RUNTIME DONE | No real IR + 17 type errors |
| 6+ | ❌ NOT STARTED | Blocked on Phase 3 |

**The #1 blocker is: Block compilers need to be migrated from closure-returning to IR-emitting.**

This is ~50 files of work where each block compiler needs to:
1. Take `LowerCtx` with IRBuilder instead of `CompileCtx`
2. Take `ValueRefPacked[]` inputs instead of `Artifact` closures
3. Return `LowerResult` with IR node IDs instead of closures
