# Rendering Architecture

**Cached**: 2025-12-24 16:00
**Source**: project-evaluator (canvas-renderer topic evaluation)
**Confidence**: HIGH

## Rendering Pipeline Overview

```
Block Graph → Compiler → Program<RenderTree> → Player → Renderer → DOM
                                   ↓              ↓         ↓
                              Signal-based    RAF loop   SvgRenderer
                              time-indexed               (keyed recon)
```

## Core Abstractions

### RenderTree (IR)

**Location**: `src/editor/runtime/renderTree.ts`

**Purpose**: Universal intermediate representation for all visual output

**Type Hierarchy**:
```typescript
type DrawNode = GroupNode | ShapeNode | EffectNode

interface GroupNode {
  kind: 'group'
  id: string
  children: readonly DrawNode[]
}

interface ShapeNode {
  kind: 'shape'
  id: string
  geom: Geometry  // circle | rect | svgPath
  style?: Style
}

interface EffectNode {
  kind: 'effect'
  id: string
  effect: Effect  // opacityMul | transform2d | transform3d | filter | clip | deform
  child: DrawNode
}
```

**Key Properties**:
- `node.id` must be stable across frames (enables keyed reconciliation)
- Effects compose: opacity multiplies, transforms concatenate
- Renderer-agnostic: semantic description, not draw commands

### Player

**Location**: `src/editor/runtime/player.ts`

**Responsibilities**:
- RAF loop: `tick()` advances time, calls `renderOnce()`
- Program lifecycle: `setFactory()`, hot swap
- Time control: `play()`, `pause()`, `scrubTo(tMs)`
- Frame callback: `onFrame(tree: RenderTree, tMs: number)`

**Key Invariants**:
- Time is unbounded, never wraps (looping is in signals)
- Program can be swapped without resetting time
- Scrubbing works independently of RAF

**Frame Loop**:
```typescript
private tick = (): void => {
  const dt = (now - lastFrameMs) * speed;
  this.tMs += dt;
  this.renderOnce();  // Calls program.signal(tMs, ctx) → RenderTree
  this.onFrame(tree, tMs);  // → Renderer
  requestAnimationFrame(this.tick);
}
```

### SvgRenderer (Current Backend)

**Location**: `src/editor/runtime/svgRenderer.ts`

**Interface**:
```typescript
class SvgRenderer {
  constructor(svg: SVGSVGElement)
  render(tree: RenderTree): void
  clear(): void
  getSvg(): SVGSVGElement
}
```

**Implementation Strategy**: Keyed reconciliation
- `nodeMap: Map<string, SVGElement>` - stable id → DOM mapping
- Incremental updates: only changed nodes modified
- Groups/effects → `<g>` wrappers
- Geometry types → `<circle>`, `<rect>`, `<path>` elements

**Performance Characteristics**:
- Good: Minimal DOM thrash with stable IDs
- Bad: DOM updates expensive at scale (>1000 elements)
- Bad: SVG transform/filter overhead

## Integration Points

### PreviewPanel

**Location**: `src/editor/PreviewPanel.tsx`

**Renderer Creation** (lines 104-131):
```typescript
const svg = svgRef.current;
const renderer = new SvgRenderer(svg);

const player = createPlayer(
  (tree: RenderTree, _tMs: number) => {
    renderer.render(tree);  // onFrame callback
  },
  { width, height, onStateChange, ... }
);

player.setScene(DEFAULT_SCENE);
player.setFactory(() => program);
player.play();
```

**Hot Swap** (lines 187-202):
Polls compiler service for changes, calls `player.setFactory()` on new program

**DOM Structure**:
```tsx
<svg
  ref={svgRef}
  width={width}
  height={height}
  viewBox={`${panOffset.x} ${panOffset.y} ${width/zoom} ${height/zoom}`}
/>
```

## Render Block: RenderInstances2D

### Block Definition

**Location**: `src/editor/blocks/domain.ts:212-263`

**Inputs**:
- `domain: Domain` (required) - element identity
- `positions: Field<vec2>` (required) - per-element positions
- `radius: Field<number> | Signal<number>` (required) - radii or broadcast
- `color: Field<color>` (required) - per-element colors

**Output**:
- `render: Program<RenderTree>` (LaneKind: 'Program')

### Compiler

**Location**: `src/editor/compiler/blocks/domain/RenderInstances2D.ts`

**Compilation Strategy**:
```typescript
compile({ params, inputs }) {
  const domain = inputs.domain.value;
  const positionField = inputs.positions.value;
  const radiusField = inputs.radius.value;
  const colorField = inputs.color.value;

  // Return a closure that evaluates fields at render time
  const renderFn = (tMs: number, ctx: RuntimeCtx): DrawNode => {
    const n = domain.elements.length;

    // Materialize fields
    const positions = positionField(seed, n, ctx);
    const radii = radiusField(seed, n, ctx);
    const colors = colorField(seed, n, ctx);

    // Build RenderTree
    const circles = positions.map((pos, i) => ({
      kind: 'shape',
      id: `circle-${domain.elements[i]}`,
      geom: { kind: 'circle', cx: pos.x, cy: pos.y, r: radii[i] },
      style: { fill: colors[i] }
    }));

    return { kind: 'group', id: 'instances', children: circles };
  };

  return { render: { kind: 'RenderTree', value: renderFn } };
}
```

**Critical Detail**: Fields are NOT materialized at compile time
- `renderFn` is a closure returned by compiler
- Fields evaluated every frame with current `tMs`
- This is CORRECT per architecture (lazy field evaluation)

## Extension Points for Canvas

### Option A: Renderer-Level Swap

**Contract**: `render(tree: RenderTree): void`

**Hypothetical CanvasRenderer**:
```typescript
class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement)

  render(tree: RenderTree): void {
    this.ctx.clearRect(0, 0, w, h);
    this.traverseAndDraw(tree, defaultCtx);
  }

  private traverseAndDraw(node: DrawNode, ctx: RenderCtx): void {
    if (node.kind === 'shape' && node.geom.kind === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(geom.cx, geom.cy, geom.r, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (node.kind === 'group') {
      node.children.forEach(c => this.traverseAndDraw(c, ctx));
    } else if (node.kind === 'effect') {
      const nextCtx = this.applyEffect(node.effect, ctx);
      this.traverseAndDraw(node.child, nextCtx);
    }
  }
}
```

**Changes Required**:
- New file: `src/editor/runtime/canvasRenderer.ts`
- PreviewPanel: conditionally create CanvasRenderer vs SvgRenderer
- Export from runtime/index.ts

**Changes NOT Required**:
- RenderTree structure (unchanged)
- Block definitions (unchanged)
- Compilers (unchanged)
- Player (unchanged)

### Option B: Block-Level Alternative

**Would Require**:
- New artifact type: `CanvasCommands` (parallel to RenderTree)
- New block: `RenderInstances2DCanvas`
- New compiler: emit canvas-specific draw ops
- Player modification: handle multiple output types
- PreviewPanel: renderer routing logic

**Breaks Universality**: RenderTree is no longer the universal IR

## Known Constraints

### RenderTree Semantic Limitations

**Designed for retained-mode** (scene graph, SVG):
- Stable node IDs enable diffing
- Keyed reconciliation amortizes updates

**Canvas is immediate-mode**:
- No retained structures
- Full redraw every frame
- Tree traversal overhead with no reconciliation benefit

**Implication**: For high element counts, traversing RenderTree to draw Canvas adds overhead without benefit. Consider flat draw ops if performance critical.

### Effect Parity Challenges

**RenderTree effects that don't map cleanly to Canvas**:

| Effect | SVG | Canvas 2D |
|--------|-----|-----------|
| Opacity | `<g opacity="0.5">` | `ctx.globalAlpha = 0.5` ✓ |
| 2D Transform | `<g transform="...">` | `ctx.save(); ctx.transform(...); ... ctx.restore()` ✓ |
| 3D Transform | CSS `transform: perspective(...)` | ❌ (2D only) |
| CSS Filter | `<g style="filter: blur(...)">` | `ctx.filter = "blur(...)"` ⚠️ (limited) |
| Clip Path | `<clipPath>` | `ctx.clip()` ✓ (different API) |
| Deform | Semantic only, no impl | Would need custom ❌ |

**Recommendation**: Canvas "fast path" supports shapes + basic effects. Complex effects fall back to SVG or skip.

## Runtime Exports

**Location**: `src/editor/runtime/index.ts`

**Public API**:
```typescript
// Types
export type { RenderTree, DrawNode, Geometry, Style, Effect, ... }

// Helpers
export { group, path, circle, withOpacity, withTransform2D, ... }

// Player
export { Player, createPlayer, type PlayState, ... }

// Renderer (currently SVG only)
export { SvgRenderer, createSvgRenderer, ... }
```

**For Canvas**: Would add `CanvasRenderer, createCanvasRenderer`

## Rendering Performance Notes

**Player tracks frame times** (Player.ts:366-374):
```typescript
private frameTimes: number[] = [];  // Rolling window of 60 frames

private calculateFPS(): number {
  const avgFrameMs = sum(frameTimes) / frameTimes.length;
  return 1000 / avgFrameMs;
}
```

**Runtime Health Events** (Player.ts:390-423):
- Emits `RuntimeHealthSnapshot` every 250ms
- Includes: fpsEstimate, avgFrameMs, worstFrameMs
- Can monitor performance degradation

**Current Monitoring**: No element-count-based thresholds or automatic fallback

## Canvas Renderer Spec Analysis (2025-12-24)

### Design Specs

**Location**: `design-docs/3-Synthesized/`
- `12-CanvasBackend.md` - Renderer contract, responsibilities
- `13-CanvasRendererCode.md` - Pseudocode for Render2dCanvas block
- `14-CanvasClosureIRAdatper.md` - Empty (not written yet)

### Spec Architecture Assumptions

**Spec describes IR/VM system**:
- NodeIR, OpCode, ValueSlot types
- VM execution engine with `exec_Render2DCanvas` kernel
- ValueStore, RenderCmdsStore
- Materialized buffers (typed arrays) vs lazy FieldExpr

**Reality**: None of this exists in codebase
- No IR types found
- No VM found
- Fields are closures: `(seed, n, ctx) => T[]`
- All blocks use closure pattern

**Implication**: Spec describes **future architecture**, not current state.

### Spec vs Current Ambiguities

| Spec Claim | Current Reality | Gap |
|------------|-----------------|-----|
| "Program IR (no closures)" | All blocks return closures | IR system doesn't exist |
| RenderCmds artifact type | Only RenderTree exists | New type would break universality |
| "Materialize fields into buffers" | Fields are compute functions | No materialization API |
| Radius as input | User complaint: "shouldn't be input" | Design disagreement |

### Canvas Renderer Requirements (from spec)

**Must Do**:
- Own HTMLCanvasElement, handle resize/DPR
- Execute draw commands deterministically
- Resource cache (Path2D, gradients by stable keys)
- Command vocab: BeginFrame, SetTransform, DrawInstances2D, SetBlendMode

**Must NOT Do**:
- Time logic, graph evaluation, adapter chains
- Domain semantics (doesn't know "elements")
- Sorting heuristics
- Field evaluation (consumes buffers only)

**Effect Parity Challenges**:
- Transform2D: ✅ ctx.transform()
- Opacity: ✅ ctx.globalAlpha
- Transform3D: ❌ No 2D Canvas support (need projection or skip)
- CSS Filters: ⚠️ ctx.filter limited
- Clip: ✅ ctx.clip()

### Implementation Paths

**Path 1: Renderer Swap (Works Today)**
- Canvas2DRenderer consumes RenderTree (same as SVG)
- ~200 lines for renderer class
- ~50 lines PreviewPanel changes
- No new blocks needed
- Effort: 1-2 days

**Path 2: IR-Based (Spec-Compliant)**
- Build IR/VM system: 2-4 weeks
- New Render2dCanvas block: 2-3 days
- RenderCmds artifact type: 1 day
- Breaks RenderTree universality

**Path 3: Hybrid Optimization**
- Canvas2DRenderer + RenderTree meta hints
- Optimization without breaking universality
- Effort: 1 week

**Recommendation**: Path 1 first (immediate value), defer IR decision to separate design phase.

## Summary

**Current State**:
- Single renderer: SvgRenderer (keyed reconciliation)
- Universal IR: RenderTree (semantic scene graph)
- Clean separation: Compiler → IR → Player → Renderer → DOM

**Canvas Extension Options**:
- **Option A** (renderer swap): Drop-in replacement, RenderTree unchanged
- **Option B** (new block): Parallel rendering path, breaks universality

**Canvas Spec Status**: Describes future IR/VM architecture not yet implemented. Can implement Canvas renderer with current closure-based architecture (Option A) or wait for IR system.

**Recommendation**: Option A for simplicity, Option B only if Canvas needs fundamentally different data structures (e.g., batched draw calls, compute shaders)
