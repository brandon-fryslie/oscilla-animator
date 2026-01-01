# Runtime Knowledge: V2 Adapter Implementation

**Scope**: V2 adapter bridging V1 closures with V2 IR
**Confidence**: HIGH (verified via code review and test runs)
**Last Updated**: 2026-01-01

## Implementation Status: COMPLETE ✅

The V2 adapter is **fully implemented** and **replaces the stub** from Phase 4, Sprint 8.

### Core Components

1. **SignalExprClosure IR Node**
   - Location: `src/editor/compiler/ir/signalExpr.ts:253-261`
   - Contains: closureFn (V1 closure), type (TypeDesc)
   - Signature: `(tAbsMs: number, ctx: LegacyClosureContext) => number`
   - Added to SignalExprIR union at line 106

2. **SignalExprBuilder.closureNode()**
   - Location: `src/editor/runtime/signal-expr/SignalExprBuilder.ts:226-234`
   - Creates closure nodes in IR builder
   - Returns SigExprId for use in V2 compilers

3. **artifactToSigExprId()**
   - Location: `src/editor/compiler/v2adapter.ts:63-122`
   - Converts V1 Artifact to SigExprId
   - Validates Signal artifacts (rejects Field/Event)
   - Wraps V1 closures as closure nodes
   - Handles domain mapping (float, int, rate)

4. **adaptV2Compiler()**
   - Location: `src/editor/compiler/v2adapter.ts:189-276`
   - Main adapter function
   - Flow: Artifacts → SigExprIds → V2 compile → IR → Closures
   - Creates fresh SignalExprBuilder per block
   - Error handling for conversion and compilation failures

5. **sigExprIdToArtifact()**
   - Location: `src/editor/compiler/v2adapter.ts:136-172`
   - Converts SigExprId back to V1 Artifact
   - Wraps IR evaluation in closure
   - Creates fresh SigFrameCache per invocation

6. **evalSig() closure case**
   - Location: `src/editor/runtime/signal-expr/SigEvaluator.ts:147-150`
   - Handles closure node evaluation
   - Invokes closureFn with createLegacyContext(env)
   - Result cached like any other node

### Data Flow

```
V1 Artifact (closure) 
  → artifactToSigExprId() 
  → SigExprId (closure node) 
  → V2 compiler input 
  → V2 compiler output (SigExprId) 
  → sigExprIdToArtifact() 
  → V1 Artifact (closure wrapping evalSig)
```

### Runtime Behavior

**At Compile Time:**
1. V1 block outputs are Artifacts with closures
2. adaptV2Compiler() wraps those closures as closure nodes
3. V2 compiler receives SigExprIds (including closure nodes)
4. V2 compiler emits IR (SigExprIds)
5. Adapter wraps IR evaluation in closures

**At Runtime:**
1. V1 closure artifact invoked: `(t, ctx) => evalSig(...)`
2. evalSig() encounters closure node
3. Closure node's closureFn invoked: original V1 closure
4. Result cached and returned

### Known Limitations

1. **Field/Event Not Supported**
   - Only Signal world artifacts supported
   - artifactToSigExprId() throws error for Field/Event
   - Clear error message: "only supports signal/scalar artifacts"

2. **Hardcoded Signal:float Output**
   - Line 268 in v2adapter.ts: `artifactKind = 'Signal:float'`
   - TODO comment indicates future type information support
   - Non-blocking: type system is lenient for Signal operations

3. **Dummy Viewport in RuntimeCtx**
   - Lines 114-117: `viewport: { w: 1920, h: 1080, dpr: 1 }`
   - Safe for Signal operations (Fields would need real viewport)
   - Comment confirms this is acceptable limitation

### Test Coverage

- **Unit tests**: 2798 passing (Sprint 3 added no new tests)
- **Pre-existing failures**: 16 (transaction validation, unrelated to V2 adapter)
- **Regression**: NONE (0 new failures)

### Performance Notes

- **Fresh cache per closure invocation** (sigExprIdToArtifact)
  - Uses constant frameId = 1
  - No cross-invocation caching
  - Intentional design: each V2 block's IR is independent

- **Closure node overhead**
  - Not yet profiled
  - Target: < 5% overhead vs native V2 (from PLAN)
  - Future sprint: performance profiling

### Migration Path

**Current State:**
- V1 blocks: Return closures directly
- V2 blocks: Use adaptV2Compiler(), emit IR wrapped as closures
- Mixed patches: V1 → V2 → V1 chains work correctly

**Future State (Phase 6+):**
- All blocks migrated to V2
- Adapter removed
- Closure nodes removed from IR
- Pure IR-based compilation

### References

- PLAN: `.agent_planning/phase0-architecture-refactoring/PLAN-2025-12-31-170000-sprint3-v2-adapter.md`
- Spec: `compiler-final/ARCHITECTURE-RECOMMENDATIONS.md` lines 407-484
- Evaluation: `.agent_planning/phase0-architecture-refactoring/WORK-EVALUATION-sprint3-2026-01-01-032834.md`

## Reuse Guidance

**When to reference this:**
- Evaluating V2 block implementations
- Debugging mixed V1/V2 compilation
- Understanding closure node semantics
- Checking V2 adapter status

**What to verify:**
- Tests still pass with same pre-existing failures (16)
- No new Field/Event support added (still Signal-only)
- Closure nodes still present in IR (not removed yet)
