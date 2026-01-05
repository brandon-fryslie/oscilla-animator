# Plan: Steel Thread - Animated Particles

**Created**: 2026-01-05
**Supersedes**: Rainbow grid macro port
**Reference**: `~/code/oscilla-animator-v2/design-docs/RENDER-PIPELINE.md`

---

## Objective

Implement the minimal "steel thread" patch that exercises the entire pipeline:
**time → per-element field eval → materialize buffers → render assemble → Canvas draw**

This is NOT porting v1 macros. This is implementing the canonical v2 architecture from scratch.

---

## Implementation Steps

### Phase 1: Add Missing Blocks

The minimal patch needs these blocks (check what v2 already has):

| Block | Status | Notes |
|-------|--------|-------|
| InfiniteTimeRoot | DONE | Already in v2 |
| DomainN / GridDomain | DONE | Already in v2 (use for DomainPointsN) |
| FieldFromDomainId | NEEDED | Outputs id01 : field<number> |
| PositionSwirl | NEEDED | Per-element position from time + id |
| HueRainbow | NEEDED | Per-element color from phase + id |
| ConstSize | PARTIAL | ConstFloat exists, need field broadcast |
| RenderInstances2D | NEEDED | Sink that registers render pass |

### Phase 2: Compiler Support

Ensure compiler can:
1. Lower RenderInstances2D to StepRender in schedule
2. Handle field<color> type (vec4 or RGBA)
3. Wire domain through to render step

### Phase 3: Runtime Support

Ensure runtime can:
1. Materialize field<vec2> for positions
2. Materialize field<color> for colors
3. Assemble RenderFrameIR from materialized buffers

### Phase 4: Minimal HTML UI

Create `public/index.html` + `src/main.ts`:
- Canvas element
- Error log area
- Animation loop calling executeFrame + renderFrame

### Phase 5: Steel Thread Test

Programmatically build the minimal patch:
```typescript
const patch = buildPatch((b) => {
  const time = b.addBlock('InfiniteTimeRoot', { periodMs: 5000 });
  const domain = b.addBlock('DomainN', { n: 2000 });
  const id01 = b.addBlock('FieldFromDomainId', {});
  const pos = b.addBlock('PositionSwirl', { radius: 0.4, spin: 0.5 });
  const color = b.addBlock('HueRainbow', { sat: 1.0, val: 1.0 });
  const size = b.addBlock('ConstFloat', { value: 3 });
  const render = b.addBlock('RenderInstances2D', {});

  // Wire it up...
});
```

Compile, execute, render to canvas.

---

## Success Criteria

- [ ] 2000 particles swirling with rainbow colors
- [ ] Animation runs at 60fps
- [ ] No legacy patterns (signalBridge, closure eval, etc.)
- [ ] All tests pass
- [ ] Typecheck passes

---

## Out of Scope

- UI editor
- Saving/loading patches
- Multiple render sinks
- 3D rendering
