# Handoff: Oscilla v2 Clean Rewrite

**Created**: 2026-01-05
**Updated**: 2026-01-05 04:50 (Runtime layer COMPLETE)
**For**: Continuation of v2 clean rewrite implementation
**Status**: runtime-complete

---

## Objective

Create a clean rewrite of Oscilla at `~/code/oscilla-animator-v2` to escape legacy patterns that were causing AI agent churn - agents kept copying old patterns (outputs array, multiple compiler paths, closure-based evaluation) instead of new ones.

## Current State

### What's Been Done (COMPLETE)

**Project Setup**:
- Created `~/code/oscilla-animator-v2` with clean structure
- Package.json, tsconfig.json, vitest.config.ts configured
- ARCHITECTURE.md documenting clean patterns

**Core Types**:
- `src/types/index.ts` - TypeDesc, branded IDs (SigExprId, FieldExprId, etc.)
- Type hierarchy: Scalar → Signal → Field (with promotions)

**Graph Layer**:
- `src/graph/Patch.ts` - Block, Edge, Patch types
- `src/graph/normalize.ts` - Graph normalization with dense indices
- PatchBuilder for programmatic construction

**IR Types**:
- `src/compiler/ir/types.ts` - SigExpr, FieldExpr, EventExpr, Step, IRProgram
- `src/compiler/ir/builder.ts` - IRBuilder with clean API

**Block Registry**:
- `src/compiler/blocks/registry.ts` - ONE pattern: registerBlock() + lower()
- `src/compiler/blocks/time.ts` - InfiniteTimeRoot, FiniteTimeRoot
- `src/compiler/blocks/signal.ts` - ConstFloat, AddSignal, MulSignal, Oscillator
- `src/compiler/blocks/domain.ts` - GridDomain, DomainN, FieldBroadcast, FieldMap, FieldZipSig

**Compiler**:
- `src/compiler/compile.ts` - Main entry point
- Passes: Normalize → FindTimeRoot → BuildDepOrder → LowerBlocks
- 11 tests passing

**Architecture Docs** (COMPLETE):
- Copied `design-docs/final-System-Invariants/` from v1 to v2
- 18 reference files for system invariants

**Runtime Layer** (COMPLETE):
- `src/runtime/BufferPool.ts` - Typed array pool for field buffers
- `src/runtime/timeResolution.ts` - Time model resolution (finite/cyclic/infinite)
- `src/runtime/RuntimeState.ts` - ValueStore, FrameCache, TimeState (simplified, no hot-swap)
- `src/runtime/Materializer.ts` - Field → buffer (IR only, NO signalBridge)
- `src/runtime/ScheduleExecutor.ts` - Step-by-step frame execution
- 4 integration tests passing

**Renderer** (COMPLETE):
- `src/render/types.ts` - RenderFrameIR, RenderPassIR
- `src/render/Canvas2DRenderer.ts` - renderFrame() for 2D canvas (NO RenderTree path)

### Test Status

**All tests passing**: 15/15
- 11 compiler tests
- 4 runtime integration tests

Validation:
```bash
cd ~/code/oscilla-animator-v2
npm run typecheck  # ✓ PASS
npm test           # ✓ 15/15 tests passing
```

### What Remains

1. **UI Layer** - Rebuild UI components against clean runtime
2. **Additional Blocks** - Port more blocks from v1 as needed (following ONE pattern)
3. **Visual Testing** - Actual canvas rendering in browser
4. **Hot-swap** - Add hot-swap support if needed (currently simplified)
5. **Performance** - Profile and optimize hot paths

## Context & Background

### Why We're Doing This

The v1 codebase has accumulated legacy patterns over many sprints:
- `outputs` array vs `outputsById`
- Multiple compilers (legacy closure, IR, unified)
- `signalBridge` fallback in Materializer
- Tests that codify legacy behavior

AI agents kept copying old patterns instead of new ones, causing churn. With ~3000 tests in v1, individual triage was infeasible. A clean rewrite with ONE pattern eliminates confusion.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Rewrite vs incremental cleanup | Test suite codifies legacy, too large to triage | 2026-01-05 |
| Start with compiler + renderer | UI was written against legacy compiler, holding things back | 2026-01-05 |
| ONE block pattern | `outputsById` only, no `outputs` array | 2026-01-05 |
| Behavior tests only | Tests verify "3+4=7" not "uses sigZip with Add opcode" | 2026-01-05 |
| Skip legacy runtime | No signalBridge, no closure evaluation, no RenderTree | 2026-01-05 |
| Simplified runtime initially | No hot-swap complexity, add later if needed | 2026-01-05 |

### Important Constraints

- **ONE pattern per concept** - No feature flags, no dual modes, no fallbacks
- **Port by understanding, not copying** - Read v1 to understand, implement fresh
- **No legacy patterns** - If unsure whether something is legacy, ask
- **Keep v1 as reference only** - Don't import from v1, don't copy code blocks

## Acceptance Criteria

- [x] Typecheck passes (`npm run typecheck`)
- [x] Tests pass (`npm test`)
- [x] Can compile a simple patch with TimeRoot, Signal, Domain
- [x] Can execute compiled program to produce RenderFrameIR
- [ ] Can render RenderFrameIR to canvas (visual test needed)
- [ ] UI layer rebuilt

## Implementation Patterns Established

### Block Registration (v2 Pattern)
```typescript
registerBlock({
  type: 'BlockName',
  inputs: [{ portId: portId('in'), type: sigType('float') }],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: ({ b, inputsById }) => ({
    out: { kind: 'sig', id: b.sigConst(0, ...), type: ... }
  })
});
```

### NO Legacy Patterns
```typescript
// BAD - v1 pattern
if (env.irEnv !== undefined) { ... } else if (env.signalBridge !== undefined) { ... }

// GOOD - v2 pattern
// Only IR path exists, no fallback
const value = evaluateSigExpr(expr, program, state);
```

### Stamp-Based Caching
```typescript
// Check cache validity
const cached = state.cache.sigValues[sigId];
const cachedStamp = state.cache.sigStamps[sigId];
if (cachedStamp === state.cache.frameId) {
  return cached;  // Valid
}
// ... compute and cache with current frameId
```

## Reference Materials

### V2 Project

- `~/code/oscilla-animator-v2/ARCHITECTURE.md` - Clean architecture doc
- `~/code/oscilla-animator-v2/src/compiler/__tests__/compile.test.ts` - Behavior test examples
- `~/code/oscilla-animator-v2/src/runtime/__tests__/integration.test.ts` - Integration test examples

### V1 Reference (read-only)

- `design-docs/final-System-Invariants/` - Core invariants (now copied to v2)
- `src/editor/runtime/executor/ScheduleExecutor.ts` - Clean runtime example
- `src/editor/runtime/canvasRenderer.ts` - Renderer reference

## Questions & Blockers

### Current Blockers

None - runtime layer complete and tested

### Need User Input On

- Should we add hot-swap now or wait until UI is ready?
- Which blocks should be ported next?
- Visual testing strategy (browser-based or headless)?

## Testing Strategy

### Existing Tests (v2)

All passing (15/15):
- `src/compiler/__tests__/compile.test.ts` - 11 tests
- `src/runtime/__tests__/integration.test.ts` - 4 tests

Tests verify **behavior**:
- TimeRoot validation
- Signal compilation and evaluation
- Domain compilation
- Time model resolution (finite/cyclic/infinite)
- Frame execution and caching

### Manual Testing Needed

- [ ] Visual test: Render to actual canvas element
- [ ] Performance test: Measure frame execution time
- [ ] Memory test: Check buffer pool behavior over time

## Success Metrics

- [x] All tests pass
- [x] No legacy patterns in codebase
- [ ] Can render a simple animation (grid of oscillating circles) - UI needed
- [ ] Agents can work on codebase without confusion - validated by next sprint

---

## Next Steps for Agent

**Immediate actions (if continuing v2 work)**:
1. Build simple UI demo to test renderer visually
2. Add more blocks as needed (Oscillator + Domain + Render pipeline)
3. Profile performance and optimize hot paths

**Before UI work**:
- [ ] Read v1 UI components to understand interaction patterns
- [ ] Design v2 UI architecture (React hooks? MobX? Zustand?)
- [ ] Decide on Player/Editor separation

**When complete**:
- [ ] Visual demo working
- [ ] Performance acceptable (<16ms per frame for 1000 elements)
- [ ] UI feels responsive
