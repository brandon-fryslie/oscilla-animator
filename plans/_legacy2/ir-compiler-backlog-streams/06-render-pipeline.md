# Workstream 6: Render Pipeline

**Goal:** Restore core rendering features (z-order, clipping, materials, postFX, curve flattening) in the IR-based runtime.

## Scope

- Proper z-order usage in render assembly and canvas renderer.
- Clipping/masking support in render pass headers.
- PostFX pass execution.
- Extended instance attributes (rotation, scale, custom).
- Curve flattening for path rendering.
- Expanded materials beyond flat shape2d.

## Dependencies

- Mostly independent, but benefits from streams 2–5 (richer data flow).

## Primary References

- `plans/SPEC-04-render-pipeline.md`
- `design-docs/3-Synthesized/07-UI-Spec.md`

## Key Files + Line Anchors

- `src/editor/runtime/executor/steps/executeRenderAssemble.ts:106-144` (Instances2D pass assembly, z=0)
- `src/editor/runtime/canvasRenderer.ts:217-255` (z-order sort, postFX unimplemented)
- `src/editor/runtime/renderPassExecutors.ts:164-213` (clipping + blend behavior)
- `src/editor/runtime/executor/steps/executeMaterializePath.ts:338-344` (curve flattening TODO)

## Plan

### 1) Z-order wiring

**Goal:** Use compiled z-order in render passes.

Steps:

1. Update IR render sink schema to include z-order (static + slot-based).
2. In `src/editor/runtime/executor/steps/executeRenderAssemble.ts:106-144`, set header.z from the descriptor, not always 0.
3. Confirm `src/editor/runtime/canvasRenderer.ts:217-223` sorts by header.z.

### 2) Clipping/masking

**Goal:** Support rect/path clipping.

Steps:

1. Extend RenderPassHeaderIR to carry clip spec (rect, path, circle).
2. In `src/editor/runtime/renderPassExecutors.ts:164-213`, implement path-based clipping (currently logs a warning).
3. Validate clip transform handling (coordinate space + view transforms).

### 3) PostFX passes

**Goal:** Execute post-processing passes in Canvas2D renderer.

Steps:

1. Define PostFX pass schema in IR (if not present).
2. In `src/editor/runtime/canvasRenderer.ts:242-255`, implement postFX dispatch (blur/bloom/color grade at minimum).
3. If needed, add offscreen canvas and compositing pipeline.

### 4) Extended instance attributes

**Goal:** Support per-instance rotation/scale/custom attributes.

Steps:

1. Update instance buffer assembly in `src/editor/runtime/executor/steps/executeRenderAssemble.ts:106-144` and `src/editor/runtime/executor/assembleInstanceBuffers.ts` to include optional attrs.
2. In `src/editor/runtime/renderPassExecutors.ts:281-360`, read and apply new attributes (rotation already handled, ensure scale and custom attrs are available).

### 5) Curve flattening in path materialization

**Goal:** Flatten Beziers to line segments when tolerance is set.

Steps:

1. Implement flattening in `src/editor/runtime/executor/steps/executeMaterializePath.ts:338-344`.
2. Use tolerance in pixels to drive subdivision.

### 6) Material system expansion

**Goal:** Support gradients/textures/procedural materials.

Steps:

1. Expand material schema in render IR.
2. In `src/editor/runtime/renderPassExecutors.ts:296-301`, add new material branches.
3. Add texture/gradient support to canvas rendering path.

## Deliverables

- z-order and clipping functional.
- PostFX passes render correctly.
- Extended instance attributes and materials are supported.
- Bezier path flattening works with tolerance.

## Validation (No Tests)

- Use Chrome DevTools MCP to:
  - Render overlapping elements and confirm z-order.
  - Apply clip rect and confirm bounds.
  - Enable blur postFX and verify visible effect.

