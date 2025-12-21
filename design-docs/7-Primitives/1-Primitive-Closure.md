# Primitive Closure Specification

> **Status**: Canonical
> **Decision Date**: 2024-12-21
> **Scope**: Defines the closed set of kernel primitives and the rules that prevent expansion.

---

## The Closure Rule

A block is allowed to be a **kernel primitive** only if it implements one of these capabilities:

| Capability | Authority | Description |
|------------|-----------|-------------|
| `time` | Time Authority | Defines topology of time for the patch |
| `identity` | Identity Authority | Creates or re-identifies element identity (Domain) |
| `state` | State Authority | Introduces memory across frames |
| `render` | Render Authority | Materializes into RenderTree / RenderTreeProgram |
| `io` | External IO Authority | Imports external assets into the patch world |

If a proposed block does not implement one of these capabilities, it **must** have `capability: 'pure'` and cannot:
- Introduce a new world
- Allocate runtime memory
- Emit RenderTree/Program
- Reference external assets

**This is how the primitive set remains permanently closed.**

---

## Canonical Primitive Set (Locked)

### Time Authority Primitives

Exactly one TimeRoot must be active per patch.

| Block | Emits | TimeModel |
|-------|-------|-----------|
| `FiniteTimeRoot` | `Signal<time>`, `Signal<number>` (progress) | `{ kind: 'finite', durationMs }` |
| `CycleTimeRoot` | `Signal<time>`, `Signal<phase>` | `{ kind: 'cyclic', periodMs }` |
| `InfiniteTimeRoot` | `Signal<time>` | `{ kind: 'infinite', windowMs }` |

**Hard rule**: No other block may "own time topology."

---

### Identity Authority Primitives

These are the **only** blocks allowed to create elements (Domain).

| Block | Creates | Notes |
|-------|---------|-------|
| `DomainN` | N stable opaque IDs (`e0`...`eN-1`) | Pure identity, no geometry |
| `SVGSampleDomain` | Stable IDs + positions from SVG asset | Identity + External IO |

**Hard rules**:
- Domain IDs are **opaque** (`e0`, `e1`, ...). No custom ID generators.
- Row/col semantics are modeled as `Field<number>`, not as ID strings.
- Arrangement blocks (Grid, Circle, Spiral layouts) are **composites**, not primitives.

---

### State Authority Primitives

These blocks require persistent runtime storage.

| Block | Purpose | Basis |
|-------|---------|-------|
| `IntegrateBlock` | Continuous accumulation over time | General "continuous state" primitive |
| `HistoryBlock` | N-frame delay / bounded history | General "discrete memory" primitive |

**Hard rule**: These two form the complete orthogonal basis for state.

Everything else stateful must be a composite:
- `DelayBlock` → composite of `HistoryBlock` + time-to-samples
- `EnvelopeAD` → composite of `IntegrateBlock` + shaping
- `PulseDivider` → composite of `IntegrateBlock` + floor/mod
- `TriggerOnWrap` → composite of `HistoryBlock` + edge detection

---

### Render Authority Primitives

These blocks materialize Domain + Fields into RenderTree.

| Block | Purpose | Status |
|-------|---------|--------|
| `RenderInstances` | Instance-based shapes (2D/3D) | Active |
| `RenderStrokes` | Stroke/path rendering | Future slot |
| `RenderProgramStack` | Program composition/layering | Future slot |

**Hard rules**:
- Do not proliferate render sinks per shape type.
- Shape variation is params/specs within a sink, not separate sinks.
- Renderers are dimension-agnostic (accept vec2 or vec3 positions).

---

### External IO Authority Primitives

These cross the boundary into assets/data not derivable from patch math.

| Block | Purpose | Status |
|-------|---------|--------|
| `SVGSampleDomain` | SVG path → Domain + positions | Active (also Identity) |
| `TextSource` | String/font asset → geometry | Future slot |
| `ImageSource` | Image/texture asset → field/signal | Future slot |

**Hard rule**: External IO blocks produce either:
- Domain + Fields (geometry/positions), or
- RenderSpec for a render sink to materialize

They do not directly render.

---

## What Is NOT Primitive

### Pure Operator Blocks (`capability: 'pure'`)

All math/transform blocks are operator primitives, not kernel primitives:

- Arithmetic: `Add`, `Mul`, `Sub`, `Div`, `Min`, `Max`
- Unary: `Sin`, `Cos`, `Tanh`, `Abs`, `Neg`, `Sqrt`
- Clamping: `Clamp`, `Saturate`, `Deadzone`
- Easing: `Ease`, `Smoothstep`
- Phase: `PhaseClock`, `PhaseOffset`, `PhaseWarp`
- Noise: `Hash01`, `Perlin` (deterministic, seedable)
- Color: `HSLToRGB`, `Blend`
- Vector: `Normalize`, `Dot`, `Cross`, `Length`

These are first-class blocks in the registry but compile to a known operator AST subset.

### Composites (`form: 'composite'`)

Built from primitives, appear as single blocks in UI:

| Composite | Decomposes To |
|-----------|---------------|
| `GridDomain` | `DomainN` + `PositionMapGrid` |
| `CircleDomain` | `DomainN` + `PositionMapCircle` |
| `LineDomain` | `DomainN` + `PositionMapLine` |
| `EnvelopeAD` | `IntegrateBlock` + shaping ops |
| `DelayBlock` | `HistoryBlock` + time mapping |
| `PulseDivider` | `IntegrateBlock` + floor/mod |
| `TriggerOnWrap` | `HistoryBlock` + edge detect |

### Effects / Compositors

These are specs and middleware, not primitives:

- `DeformCompositor` → `Spec:DeformCompositor`
- `Transform3DCompositor` → `Spec:Transform3DCompositor`
- `ProgramStack` → `Spec:ProgramStack`

### Deprecated / Removed

| Block | Reason | Action |
|-------|--------|--------|
| `PhaseClockLegacy` | Owns time (violates TimeRoot authority) | Delete |

---

## Bus Combine Semantics

Bus combine is a **kernel primitive internal to the compiler**, not a user-visible block.

```
BusValue(busId) = Combine(mode, typedPublishers[])
```

| Aspect | Decision |
|--------|----------|
| Visibility | Compiler graph node, not placeable block |
| Configuration | Bus Board UI (combineMode, ordering, default) |
| Why not a block | Prevents routing/stacking "combine blocks"; bus is a channel, not a patch node |

Combine exists even if no one explicitly "adds" it; it's implied by publisher multiplicity.

---

## Domain Filtering Model

**Decision**: Filtering is **NOT** Domain→Domain.

Filtering is Field-level masking consumed by the renderer.

| Approach | What Happens |
|----------|--------------|
| Domain stays fixed | 100 elements remain 100 identities |
| Produce mask | `Field<boolean>` or `Field<Unit>` |
| Renderer drops masked | At draw-time, not identity-time |
| Combiners respect mask | Masked values = "no contribution" |

**Why**:
- Domain→Domain transforms explode complexity (remapping, caching, selection)
- Masking preserves stable identity and keeps everything alignable
- "Render only some" works with no new identity authority

If compacted domains are ever needed, that's a **new kernel capability** added deliberately.

---

## Enforcement Mechanism

### Registry Gating

```typescript
interface BlockDefinition {
  type: string;
  capability: 'time' | 'identity' | 'state' | 'render' | 'io' | 'pure';
  form: 'primitive' | 'composite' | 'macro';
  // ... other fields
}
```

### Allowed Kernel Primitives (Exhaustive)

```typescript
const KERNEL_PRIMITIVES: Record<string, KernelCapability> = {
  // Time Authority
  'FiniteTimeRoot': 'time',
  'CycleTimeRoot': 'time',
  'InfiniteTimeRoot': 'time',

  // Identity Authority
  'DomainN': 'identity',
  'SVGSampleDomain': 'identity', // also 'io'

  // State Authority
  'IntegrateBlock': 'state',
  'HistoryBlock': 'state',

  // Render Authority
  'RenderInstances': 'render',
  'RenderStrokes': 'render',
  'RenderProgramStack': 'render',

  // External IO Authority
  'TextSource': 'io',
  'ImageSource': 'io',
};
```

### CI Rules

1. **Only listed blocks may claim `capability !== 'pure'`**
2. **New blocks default to `capability: 'pure'`**
3. **PRs adding new capability values are rejected**
4. **PRs adding non-pure capability to unlisted blocks are rejected**

### Pure Block Constraints

Blocks with `capability: 'pure'` must:
- Compile to operator AST (map/zip/unary/binary)
- Have no runtime memory allocation
- Have no external asset references
- Produce no RenderTree directly
- Create no Domain (identity)

---

## Summary

The primitive set is **closed**. No new kernel primitives may be added unless you add a new kernel capability, and capability addition requires explicit architectural decision.

| Capability | Count | Frozen |
|------------|-------|--------|
| `time` | 3 | Yes |
| `identity` | 2 | Yes |
| `state` | 2 | Yes |
| `render` | 3 | Yes (1 active, 2 slots) |
| `io` | 3 | Yes (1 active, 2 slots) |
| `pure` | Unlimited | N/A (not kernel) |
