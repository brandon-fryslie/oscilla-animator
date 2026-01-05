# Handoff: Oscilla v2 Steel Thread

**Created**: 2026-01-05
**For**: Continuation of v2 implementation
**Status**: in-progress (steel thread working, needs architectural refinement)

---

## Objective

Complete the Oscilla v2 clean rewrite with a working steel thread that exercises the full pipeline: time → domain → per-element fields → materialize → render → canvas. The current implementation renders 2000 animated rainbow particles but needs architectural improvements.

## Current State

### What's Been Done

**Project Setup**:
- Created `~/code/oscilla-animator-v2` with clean structure
- Package.json, tsconfig.json, vitest.config.ts, vite.config.ts configured
- Design docs copied from v1

**Core Infrastructure (COMPLETE)**:
- `src/types/index.ts` - TypeDesc, branded IDs
- `src/graph/` - Patch, Edge, Block types, PatchBuilder
- `src/compiler/ir/` - SigExpr, FieldExpr, EventExpr, Step, IRProgram
- `src/compiler/blocks/registry.ts` - ONE pattern: registerBlock() + lower()

**Runtime (COMPLETE)**:
- `src/runtime/BufferPool.ts` - Typed array pooling
- `src/runtime/timeResolution.ts` - Time model resolution
- `src/runtime/RuntimeState.ts` - ValueStore, FrameCache
- `src/runtime/Materializer.ts` - Field → buffer
- `src/runtime/ScheduleExecutor.ts` - Frame execution

**Blocks Implemented**:
- Time: InfiniteTimeRoot, FiniteTimeRoot
- Signal: ConstFloat, AddSignal, MulSignal, Oscillator
- Domain: GridDomain, DomainN, FieldBroadcast, FieldMap, FieldZipSig
- Render: FieldFromDomainId, FieldPulse, PositionSwirl, HueRainbow, RenderInstances2D

**Steel Thread Demo**:
- `public/index.html` + `src/main.ts` - Working demo at localhost:5174
- 2000 rainbow particles with per-element pulsing
- 60 FPS rendering

### What's In Progress

**User Feedback to Address**:
1. **NO GOD BLOCKS** - Each block should be one composable behavior
2. **Renderer cannot be a giant switch statement** - Needs architectural refinement

### What Remains

1. **Break up PositionSwirl** - Currently does too much (golden spiral + sqrt distribution + spin)
2. **Break up HueRainbow** - Should be composable HSV→RGB transform
3. **Refactor Materializer** - Switch statement is growing; needs dispatch table or visitor pattern
4. **Refactor Canvas2DRenderer** - Same issue with switch statement

## Context & Background

### Why We're Doing This

The v1 codebase has accumulated legacy patterns that cause AI agent churn. Agents kept copying old patterns instead of new ones. A clean rewrite with ONE pattern per concept eliminates confusion.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Rewrite vs incremental | Test suite codifies legacy, too large to triage | 2026-01-05 |
| ONE block pattern | `outputsById` only, no `outputs` array | 2026-01-05 |
| IR-only path | No signalBridge, no closure evaluation, no RenderTree | 2026-01-05 |
| Phase for animation | Use 0..1 wrapping phase, not raw time | 2026-01-05 |

### Important Constraints

**NEW RULE: NO GOD BLOCKS**
- Each block should be one composable behavior
- If a block does multiple things, split it
- Blocks should be reusable across different contexts

**Architectural Rules**:
- ONE pattern per concept - No feature flags, no dual modes
- Port by understanding - Read v1, implement fresh (don't copy code blocks)
- No switch statements in hot paths - Use dispatch tables or polymorphism
- Renderer should not know about specific block types

## Acceptance Criteria

- [ ] PositionSwirl split into composable parts (Angle, Radius, Polar→Cartesian)
- [ ] HueRainbow split into composable parts (HSV→RGB as separate block)
- [ ] Materializer uses dispatch table, not switch statement
- [ ] Canvas2DRenderer uses dispatch table or visitor, not switch statement
- [ ] All tests pass
- [ ] Steel thread still renders correctly after refactor

## Scope

### Files to Refactor

**Blocks needing split** (`src/compiler/blocks/render.ts`):
- `PositionSwirl` - Does: golden angle spread + sqrt radius distribution + spin
  - Split into: `FieldGoldenAngle`, `FieldSqrt`, `FieldPolar`, `FieldSpin` or similar
- `HueRainbow` - Does: phase offset + HSV to RGB
  - Split into: `FieldHSV`, `HSVToRGB` (maybe a kernel, not a block?)

**Files with switch statements**:
- `src/runtime/Materializer.ts` - `fillBuffer` switch on expr.kind
- `src/runtime/ScheduleExecutor.ts` - `executeFrame` switch on step.kind
- `src/render/Canvas2DRenderer.ts` - `renderPass` switch on pass.kind

### Out of Scope

- UI components
- Editor integration
- Additional block types beyond steel thread needs
- 3D rendering

## Implementation Approach

### Recommended Steps

1. **Create dispatch tables for runtime**
   - Replace switch statements with Map<kind, handler>
   - Makes adding new types O(1) instead of modifying central switch

2. **Break up PositionSwirl**
   - `FieldGoldenSpiral` - Outputs angle based on id01 * golden_angle * turns
   - `FieldRadialDistribution` - sqrt(id01) for even area distribution
   - `FieldPolarToCartesian` - Takes angle + radius, outputs vec2
   - `FieldRotate` - Adds time-based rotation

3. **Break up HueRainbow**
   - Keep HSV→RGB as a kernel function (it's a pure transform)
   - Create `FieldHue` that outputs hue based on phase + offset
   - Wire: FieldHue → HSVToRGB kernel → color output

4. **Verify steel thread still works**
   - Update main.ts to use new composable blocks
   - Should produce same visual result

### Patterns to Follow

**Dispatch table pattern**:
```typescript
// Instead of switch statement
const handlers = new Map<string, Handler>([
  ['const', handleConst],
  ['broadcast', handleBroadcast],
  // ...
]);

const handler = handlers.get(expr.kind);
if (!handler) throw new Error(`Unknown kind: ${expr.kind}`);
handler(expr, ...);
```

**Composable blocks**:
```typescript
// Each block does ONE thing
registerBlock({
  type: 'FieldSqrt',
  inputs: [{ portId: portId('x'), type: fieldType('float') }],
  outputs: [{ portId: portId('y'), type: fieldType('float') }],
  lower: ({ b, inputsById }) => {
    const x = inputsById.x;
    const y = b.fieldMap(x.id, { kind: 'kernel', name: 'sqrt' }, fieldType('float'));
    return { y: { kind: 'field', id: y, type: fieldType('float') } };
  },
});
```

### Known Gotchas

- PositionSwirl's "inner particles spin faster" behavior is desirable - preserve it when splitting
- FieldPulse already exists and is composable - use it as a reference
- HSV→RGB conversion is already a kernel in Materializer - just need to expose it properly

## Reference Materials

### Planning Documents
- `design-docs/RENDER-PIPELINE.md` - Canonical render pipeline architecture
- `.agent_planning/v2-rewrite/PLAN-steel-thread-2026-01-05.md` - Original steel thread plan

### Codebase References
- `src/compiler/blocks/render.ts` - Current block implementations
- `src/runtime/Materializer.ts` - Field materialization (has switch to refactor)
- `src/main.ts` - Steel thread patch wiring

## Questions & Blockers

### Open Questions

- [ ] Should HSV→RGB stay as a kernel or become a block?
- [ ] How granular should blocks be? (e.g., separate `FieldAdd`, `FieldMul` or combined `FieldBinOp`?)

### Need User Input On

- How composable is "composable enough"? Current FieldPulse takes 5 inputs - is that too many?
- Should we split based on mathematical operations or semantic meaning?

## Testing Strategy

### Existing Tests
- `src/compiler/__tests__/compile.test.ts` - 11 tests
- `src/runtime/__tests__/integration.test.ts` - 4 tests
- `src/compiler/__tests__/steel-thread.test.ts` - 1 test

### Manual Testing
- `npm run dev` → open localhost:5174
- Should see 2000 rainbow particles swirling with per-element pulsing

## Success Metrics

- All 16 tests pass
- Steel thread renders same visual result
- No switch statements > 5 cases in hot paths
- Each block does exactly ONE composable thing

---

## Next Steps for Agent

**Immediate actions**:
1. Read this handoff + RENDER-PIPELINE.md for full context
2. Start with Materializer dispatch table refactor (safest, most mechanical)
3. Then split PositionSwirl into composable parts
4. Update main.ts to use new blocks
5. Verify visual result unchanged

**Before starting implementation**:
- [ ] Run `npm test` to verify baseline
- [ ] Run `npm run dev` to see current visual

**When complete**:
- [ ] Update this handoff with results
- [ ] All tests pass
- [ ] Visual demo unchanged
