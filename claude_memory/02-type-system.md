# Oscilla Animator - Type System

## The Type Hierarchy

| World | Description | Evaluation |
|-------|-------------|------------|
| **Scalar** | Compile-time constants | Once at compile |
| **Signal** | Time-indexed values | Once per frame |
| **Field** | Per-element lazy expressions | At render sinks only |
| **Event** | Discrete triggers | Edge detection |

## Key Types (src/core/types.ts)

```typescript
// Signal: continuous time-indexed value
type Signal<A> = (t: Time, ctx: Context) => A

// Field: per-element lazy values (BULK FORM)
type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[]

// Program: complete animation
type Program<Out, Ev> = {
  signal: Signal<Out>
  event: EventFn<Ev>
}
```

## TypeDesc (src/editor/ir/types/TypeDesc.ts)

Every port and bus has a TypeDesc:

```typescript
interface TypeDesc {
  world: 'signal' | 'field'
  domain: CoreDomain | InternalDomain
  category: 'core' | 'internal'
  busEligible: boolean
  semantics?: string
}
```

## Authoring vs Storage Types

**Critical Distinction:**

- **TypeDesc** (authoring): What does this value mean? (semantic, creative context)
- **BufferDesc** (storage): How is this value stored? (physical, runtime encoding)

This separation prevents semantic types from leaking into physical storage, ensures deterministic caching, and enables Rust/WASM portability.

### Examples

| Authoring (TypeDesc) | Storage (BufferDesc) | Use Case |
|---------------------|---------------------|----------|
| `field<color>` | `linear_premul_rgba8` (u8x4) | Canvas2D rendering |
| `field<color>` | `f32x4` | HDR export |
| `field<vec2>` | `f32x2 LE` | Position buffers |
| `signal<number>` | `f64 LE` | Timeline values |

The same TypeDesc may materialize to different BufferDescs depending on context (rendering vs export).

## Storage Encodings (src/editor/ir/types/BufferDesc.ts)

### ColorBufferDesc

Canonical color encoding for all render outputs:

```typescript
interface ColorBufferDesc {
  kind: 'u8x4'                          // 4 unsigned bytes
  encoding: 'linear_premul_rgba8'       // ONLY valid encoding
  channelOrder: 'RGBA'                  // Fixed order
  strideBytes: 4                        // Fixed stride
}
```

**Properties:**
- **Premultiplied**: Alpha applied to RGB before quantization (required for correct blending)
- **Linear**: Not sRGB (allows correct color math, Canvas2D handles conversion)
- **u8x4**: Compact and cache-friendly (4 bytes per color)
- **Deterministic**: Same input always produces same output

**Quantization Algorithm** (see `src/editor/runtime/kernels/ColorQuantize.ts`):
1. Clamp input RGBA to [0, 1]
2. Premultiply RGB by alpha: `(r*a, g*a, b*a, a)`
3. Scale to [0, 255]: `channel * 255`
4. Round to nearest integer: `Math.round()` (deterministic)
5. Pack into Uint8Array

### PathCommandStreamDesc

Path command encoding for 2D geometry:

```typescript
interface PathCommandStreamDesc {
  opcodeWidth: 16        // u16 opcodes (65,536 opcode space)
  endianness: 'LE'       // Little-endian byte order
}
```

**Properties:**
- **u16 opcodes**: Sufficient for 2D + 3D + future extensions
- **LE byte order**: Matches JS typed arrays, Rust default, WASM standard
- **Separate streams**: Commands reference point indices (not inline)

### FlattenPolicy

Controls curve-to-polyline conversion for paths:

```typescript
type FlattenPolicy =
  | { kind: 'off' }                              // Keep curves (default)
  | { kind: 'on'; tolerancePx: 0.75 }           // Canonical tolerance only

const CANONICAL_FLATTEN_TOL_PX = 0.75;  // Screen pixels, perceptually invisible
```

**Why one canonical tolerance:**
- Prevents cache fragmentation (fewer unique cache keys)
- Simplifies debugging (known, consistent behavior)
- Reduces decision fatigue (no arbitrary tolerance tuning)

**Cache key impact:** Flattening is view-dependent (screen pixels), so cache keys must include viewport/DPR when enabled.

## References

- Design Docs:
  - `design-docs/13-Renderer/03-Decisions-Color-PathFlattening-Basic3d.md` - Color/path encoding decisions
  - `design-docs/13-Renderer/04-Decision-to-IR.md` - BufferDesc specifications
  - `design-docs/13-Renderer/05-Decisions-Upstream-Impacts.md` - Type system split rationale
- Code:
  - `src/editor/ir/types/TypeDesc.ts` - Authoring-time type semantics
  - `src/editor/ir/types/BufferDesc.ts` - Storage-time encodings
  - `src/editor/runtime/kernels/ColorQuantize.ts` - Color quantization kernel
