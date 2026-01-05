# Definition of Done: Steel Thread - Animated Particles

**Created**: 2026-01-05
**Status**: USER APPROVED ("the plan is approved, just keep it aligned with the vision")

---

## Acceptance Criteria

### 1. New Blocks Implemented

- [ ] `FieldFromDomainId` - outputs `id01 : field<number>` (normalized 0..1)
- [ ] `PositionSwirl` - per-element position from time + id + center/radius/spin
- [ ] `HueRainbow` - per-element color from phase + id + sat/val
- [ ] `RenderInstances2D` - sink block that emits StepRender in schedule

### 2. Compiler Produces Correct IR

- [ ] RenderInstances2D lowers to StepRender with domain, position, color, size
- [ ] field<color> type supported (vec4 or separate RGBA)
- [ ] All blocks compile without errors

### 3. Runtime Executes Correctly

- [ ] StepRender materializes position field to Float32Array
- [ ] StepRender materializes color field to Uint8ClampedArray (RGBA)
- [ ] RenderFrameIR assembled with correct buffers

### 4. Minimal HTML UI

- [ ] `public/index.html` exists with canvas + error area
- [ ] `src/main.ts` bootstraps animation loop
- [ ] Errors displayed in log area (not just console)

### 5. Steel Thread Runs

- [ ] 2000 particles visible on canvas
- [ ] Particles swirl around center
- [ ] Rainbow colors cycle with phase
- [ ] Animation runs smoothly (target 60fps)

### 6. Tests Pass

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] No legacy patterns (signalBridge, closure eval, etc.)

---

## Validation

```bash
cd ~/code/oscilla-animator-v2
npm run typecheck
npm test
npm run dev  # Open browser, see swirling rainbow particles
```

---

## Reference Documents

- Architecture: `~/code/oscilla-animator-v2/design-docs/RENDER-PIPELINE.md`
- Plan: `.agent_planning/v2-rewrite/PLAN-steel-thread-2026-01-05.md`
