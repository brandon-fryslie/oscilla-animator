# Core Concepts

## The Type Hierarchy

The system distinguishes between different "worlds" of computation:

| World | Description | Evaluation |
|-------|-------------|------------|
| **Scalar** | Compile-time constants | Once at compile |
| **Signal** | Time-indexed values | Once per frame |
| **Field** | Per-element lazy expressions | At render sinks |
| **Event** | Discrete triggers | Edge detection |

## Signals

A **Signal** is a continuous, time-indexed value.

```typescript
type Signal<A> = (t: Time, ctx: Context) => A
```

### Key Properties
- Evaluated once per frame (not per element)
- Receives unbounded `t` - signals never assume `t` wraps
- Phase generators map `t` to phase internally
- Multiple phase generators can coexist

### Common Signal Types
- `Signal<number>` - numerical values
- `Signal<phase>` - phase values in [0,1)
- `Signal<time>` - time in milliseconds
- `Signal<color>` - color values
- `Signal<vec2>` - 2D vectors

## Fields

A **Field** is a per-element value computed lazily from a Domain.

```typescript
type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[]
```

### Key Properties
- Lazy evaluation - computed only at render sinks
- Per-element identity via Domain
- No eager field buffers anywhere
- Performance proportional to render sinks only

### FieldExpr IR
Fields are represented as a lazy DAG:
- `const` - constant field
- `source` - source field (pos0, idRand)
- `broadcast` - Signal lifted to Field
- `mapUnary` - per-element transformation
- `zipBinary` - combine two fields
- `zipSignal` - combine field with signal

### Bulk Form Semantics
Fields use bulk form - they produce arrays of values for all elements at once, enabling efficient GPU-friendly evaluation.

## Domains

A **Domain** represents stable element identity.

### Properties
- Stable element IDs (survive edits)
- Deterministic ordering
- Deterministic element count
- Topology-aware (grid, path, etc.)

### Domain Contract
- Elements have stable IDs for state mapping
- Ordering is consistent across frames
- Identity derives from structure (row/col for grids)

## Programs

A **Program** is a complete animation with signal and events.

```typescript
interface Program<Out> {
  run: Signal<Out>
  events?: EventSpec[]
}
```

## TimeCtx

The evaluation context that contains:
- Current time `t` (unbounded, never wraps)
- Current seed
- Frame delta
- Run state

## Type Descriptors

Every port and bus has a TypeDesc:

```typescript
interface TypeDesc {
  world: 'scalar' | 'signal' | 'field' | 'special'
  domain: 'time' | 'phase' | 'number' | 'unit' | 'color' | 'vec2' | 'event' | ...
  semantics?: 'primary' | 'secondary' | 'energy' | 'progress' | ...
}
```

This enables:
- Type-safe connections
- Adapter inference
- UI customization per type

## Non-Negotiable Invariants

1. **No `Math.random()` at runtime** - Breaks scrubbing/replay
2. **All randomness seeded, evaluated at compile-time**
3. **Animations are time-indexed programs**
4. **Full separation**: compile-time -> run-time -> render-time
5. **Explicit state-only memory** - No hidden state
6. **World mismatches are compile errors**
7. **Domain mismatches are compile errors**
