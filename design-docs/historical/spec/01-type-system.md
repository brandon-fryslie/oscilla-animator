# Type System

## World Hierarchy

The system distinguishes four computational "worlds":

| World | Description | Evaluation | Example |
|-------|-------------|------------|---------|
| **Scalar** | Compile-time constants | Once at compile | `periodMs: 8000` |
| **Signal** | Time-indexed values | Once per frame | `phase: Signal<phase>` |
| **Field** | Per-element expressions | At render sinks | `radius: Field<number>` |
| **Event** | Discrete triggers | Edge detection | `pulse: Event` |

## Signals

A Signal is a continuous, time-indexed value:

```typescript
type Signal<A> = (t: Time, ctx: Context) => A
```

**Properties:**
- Evaluated once per frame (not per element)
- Receives unbounded `t` — signals never assume wrapping
- Phase generators map `t` to phase internally

**Common types:**
- `Signal<number>` — numerical values
- `Signal<phase>` — phase in [0,1)
- `Signal<time>` — time in milliseconds
- `Signal<color>` — color values
- `Signal<vec2>` — 2D vectors

## Fields

A Field is a per-element value computed lazily from a Domain:

```typescript
type Field<T> = FieldExpr<T>
```

**Properties:**
- Lazy evaluation — computed only when a sink requests elements
- Supports partial evaluation (subset of elements)
- Materialization is an optimization, not the contract
- Deterministic via stable Domain identity

**FieldExpr IR nodes:**
- `const` — constant field
- `source` — source field (pos0, idRand)
- `broadcast` — Signal lifted to Field
- `mapUnary` — per-element transform
- `zipBinary` — combine two fields
- `zipSignal` — combine field with signal

**Materialization:**
Render sinks *may* materialize fields into buffers (Float32Array) for GPU upload.
This is a backend decision; the semantic contract is `get(i)` for each element.

## Domains

A Domain represents stable element identity:

```typescript
interface Domain {
  count: number
  getId(index: number): ElementId
}
```

**Properties:**
- Stable element IDs (survive edits)
- Deterministic ordering
- Topology-aware (grid, path, etc.)

**Contract:**
- Elements have stable IDs for state mapping
- Ordering is consistent across frames
- Identity is opaque (e0…eN-1)
- Structural semantics (row/col, u/v) are derived Fields

## Events

An Event is a discrete trigger:

```typescript
type Event = { fired: boolean; value?: any }
```

**Properties:**
- Edge-detected (rising edge triggers listeners)
- Frame-latched (reads see previous frame)
- Deterministic ordering via sortKey

## TypeDesc

Every port and bus has a type descriptor:

```typescript
interface TypeDesc {
  world: 'scalar' | 'signal' | 'field' | 'special'
  domain: 'time' | 'phase' | 'number' | 'unit' | 'color' | 'vec2' | 'event' | ...
  semantics?: 'primary' | 'secondary' | 'energy' | 'progress' | ...
}
```

**Enables:**
- Type-safe connections
- Adapter inference
- UI customization per type

## Type Compatibility

### World Lifting
Values can be lifted to higher worlds:
- Scalar → Signal (via `constSignal`)
- Signal → Field (via `broadcast`)
- Scalar → Field (via `constField`)

### World Reduction
Reduction requires explicit operations:
- Field → Signal (via `fieldSum`, `fieldMean`, `fieldMax`)

### Domain Compatibility
- `phase` is a subtype of `number` (unwrap via `phaseToNumber`)
- `unit` is a subtype of `number` (unwrap via `unitToNumber`)
- `number` → `phase` requires explicit wrapping

## Programs

A complete animation program:

```typescript
interface Program<Out> {
  run: Signal<Out>
  events?: EventSpec[]
}
```

## CompiledProgram

The compiler output:

```typescript
interface CompiledProgram {
  program: Program<RenderTree>
  timeModel: TimeModel
}
```
