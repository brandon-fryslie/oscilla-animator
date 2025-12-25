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

## TypeDesc (src/editor/types.ts)

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
