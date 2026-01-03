# Render Pipeline Status (Eval Cache)

**Last Updated**: 2025-12-31
**Source**: project-evaluator (render-pipeline evaluation)
**Confidence**: HIGH

## Scope

This cache captures stable knowledge about the render pipeline implementation that is unlikely to change frequently. Use this as a starting point for future evaluations.

## Architecture Overview

**Render Pipeline Location**: `src/editor/runtime/`

**Key Files**:
- `executor/steps/executeRenderAssemble.ts` - Assembles RenderFrameIR from batch descriptors
- `renderPassExecutors.ts` - Renders Instances2D and Paths2D passes
- `renderPostFX.ts` - Renders PostFX passes (blur, bloom, vignette)
- `executor/steps/executeMaterializePath.ts` - Converts path expressions to command/param buffers
- `executor/assembleInstanceBuffers.ts` - Assembles instance attribute buffers
- `canvasRenderer.ts` - Main Canvas2D renderer dispatcher

**IR Types**: `src/editor/compiler/ir/renderIR.ts`
- RenderFrameIR - Root frame structure
- RenderPassIR - Union: Instances2DPassIR | Paths2DPassIR | ClipGroupPassIR | PostFXPassIR
- InstanceMaterialIR - Material variants: shape2d, sprite, glyph
- GradientSpecIR - Linear/radial gradients with color stops
- ClipSpecIR - Clipping variants: rect, circle, path

## 6 Render Pipeline Gaps

**From**: `plans/ir-compiler-backlog-streams/06-render-pipeline.md`

| Gap | Description | Status (as of 2025-12-31) |
|-----|-------------|---------------------------|
| 1 | Z-Order Applied | ✅ COMPLETE (functional) |
| 2 | Curve Flattening Implemented | ✅ COMPLETE (functional) |
| 3 | Clipping/Masking Supported | ⚠️ PARTIAL (types complete, ClipGroup stubbed) |
| 4 | Extended Per-Instance Attributes | ✅ COMPLETE (functional) |
| 5 | PostFX Implemented | ⚠️ PARTIAL (3/4 effects, ColorGrade stubbed) |
| 6 | Material System Extended | ✅ COMPLETE (functional) |

## Implementation Details (Stable Knowledge)

### Gap 1: Z-Order

**Implementation**:
- Z-order stored in batch descriptors: `zOrder?: number`, `zOrderSlot?: number`
- Dynamic z-order (slot) takes precedence over static z-order
- Renderer sorts passes by `header.z` before rendering (back-to-front)

**Code Locations**:
- Batch descriptors: `schedule.ts` (Instance2DBatch, PathBatch)
- Reading z-order: `executeRenderAssemble.ts:122-129` (instances), `executeRenderAssemble.ts:299-306` (paths)
- Sorting: `canvasRenderer.ts:218-219`

---

### Gap 2: Curve Flattening

**Implementation**:
- De Casteljau recursive subdivision algorithm
- Flatness test: control point distance from baseline
- Tolerance parameter (default 0.5 pixels) controls segment density
- Max recursion depth 10 prevents infinite loops

**Code Locations**:
- Cubic bezier flattening: `executeMaterializePath.ts:169-228`
- Quadratic bezier flattening: `executeMaterializePath.ts:247-293`
- Applied during path encoding: `executeMaterializePath.ts:459-525`

---

### Gap 3: Clipping/Masking

**Implementation**:
- ClipSpecIR supports 3 variants: rect, circle, path
- Rect and circle clipping functional (via Canvas2D ctx.clip())
- Path-based clipping marked as "not implemented"
- **ClipGroup rendering stubbed** - logs warning, does not render children

**Code Locations**:
- IR types: `renderIR.ts:161-164` (ClipSpecIR), line 92 (ClipGroupPassIR)
- Applying clip: `renderPassExecutors.ts:178-206`
- ClipGroup stub: `canvasRenderer.ts:253-255`

**Known Limitation**: ClipGroup passes do not render. This is a conscious stub, not a bug.

---

### Gap 4: Per-Instance Attributes

**Implementation**:
- Rotation: already existed, now validated
- ScaleXY: added as optional vec2 buffer (interleaved xy pairs) or scalar broadcast
- Both support scalar broadcasts (all instances same value) or per-instance buffers

**Code Locations**:
- Buffer assembly: `assembleInstanceBuffers.ts:184-211` (scaleXY)
- Reading attributes: `renderPassExecutors.ts:336-337` (rot, scaleXY)
- Applying transforms: `renderPassExecutors.ts:370-385`

---

### Gap 5: PostFX

**Implementation**:
- Blur: Canvas2D `filter` property (line 106-128)
- Bloom: Multi-pass (copy to temp canvas, blur, composite with 'lighter') (line 130-156)
- Vignette: Radial gradient multiply (line 158-178)
- **ColorGrade: Stubbed** - logs warning, requires ImageData pixel manipulation (line 180-188)

**Code Locations**:
- PostFX pass rendering: `renderPostFX.ts:70-104`
- Effect implementations: `renderPostFX.ts:106-188`
- Dispatcher: `canvasRenderer.ts:257-259`

**Known Limitation**: ColorGrade effect does not work. Requires pixel-level color matrix transformation.

---

### Gap 6: Material System (Gradients)

**Implementation**:
- Linear gradients: defined by start (x,y) and end (x,y) points
- Radial gradients: defined by center (x,y) and radius
- Color stops: offset (0-1) and packed RGBA u32 color
- Default coords: horizontal linear (-0.5,0 to 0.5,0) or centered radial (0,0 radius 0.5)

**Code Locations**:
- IR types: `renderIR.ts:235-256` (GradientSpecIR, GradientStopIR)
- Gradient creation: `renderPassExecutors.ts:397-425`
- Linear: line 401-412 | Radial: line 413-424

---

## Test Infrastructure

**Current State** (as of 2025-12-31):
- **No persistent tests exist** for any of the 6 render gaps
- Type errors in `state-offset-resolution.test.ts` block test execution
- DOD acceptance criteria include unchecked box: "Manual verification in dev server (TBD)"

**Recommended Persistent Tests** (not yet implemented):
1. Z-order rendering (overlapping elements)
2. Bezier curve smoothness (visual inspection)
3. Clipping region (rect/circle bounds)
4. Per-instance transforms (rotation/scale independence)
5. PostFX visual effects (blur/bloom/vignette)
6. Gradient materials (color transitions)

**Validation Status**: Code inspection only, no runtime verification.

---

## Known Ambiguities

**From 2025-12-31 Evaluation**:

1. **What does "COMPLETE" mean for stubbed features?**
   - ClipGroup rendering stubbed (logs warning, no-op)
   - ColorGrade effect stubbed (logs warning, no-op)
   - Both marked COMPLETE in DOD with notes about stubs

2. **Is runtime verification required for "COMPLETE"?**
   - All gaps marked COMPLETE based on code inspection only
   - No tests run (type errors block execution)
   - No manual verification performed (no VM running)

3. **Should type errors be fixed before declaring render pipeline complete?**
   - Type errors in unrelated test files prevent validation
   - Render pipeline code compiles, but tests cannot run

---

## Invalidation Triggers

**Re-evaluate this cache if**:
- ClipGroup rendering is implemented (check canvasRenderer.ts:253-255)
- ColorGrade effect is implemented (check renderPostFX.ts:180-188)
- Test suite is created for render features
- IR types in renderIR.ts are modified (breaking changes)
- Render pass executors are refactored (renderPassExecutors.ts, renderPostFX.ts)

**Stable Knowledge** (unlikely to change):
- 6 gap structure from plan document
- Key file locations
- Algorithm choices (De Casteljau, Canvas2D APIs)
- IR type architecture

**Volatile Knowledge** (not cached here):
- Specific commit hashes (implementation details)
- Line numbers (code changes)
- Verdict/recommendations (evaluation-specific)
- Current bugs/issues (tracked in STATUS files)

---

## Usage Guidelines

**For Future Evaluators**:
1. Start with this cache to understand render pipeline structure
2. Check invalidation triggers to determine if cache is stale
3. Focus fresh evaluation on:
   - Stubbed features (ClipGroup, ColorGrade) - have they been implemented?
   - Test coverage - do persistent tests exist now?
   - Type errors - have they been fixed?
4. Update this cache if stable knowledge changes

**For Implementers**:
1. This cache documents what "should" exist, not bugs
2. Known limitations (stubs) are documented, not hidden
3. Use "Recommended Persistent Tests" section for test planning
