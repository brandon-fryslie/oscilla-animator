# Blocks

## Block Structure

```typescript
interface BlockDefinition {
  type: string
  category: BlockCategory
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  params: ParamDefinition[]
  compile: (ctx: CompileContext) => CompiledBlock
}
```

## Categories

### Time Topology
Declare the time contract for the patch.

| Block | TimeModel | Outputs |
|-------|-----------|---------|
| **FiniteTimeRoot** | `finite` | time, progress |
| **InfiniteTimeRoot** | `infinite` | time |

**Constraints:**
- Exactly one TimeRoot per patch
- TimeRoot has no upstream dependencies
- No TimeRoot inside composites



### Domain Generators
Produce stable element identity.

| Block | Outputs |
|-------|---------|
| **GridDomain** | domain, pos0: Field<vec2> |
| **PathDomain** | domain, pos0: Field<vec2>, tangent: Field<vec2> |

### Field Transforms
Per-element operations.

| Block | Type |
|-------|------|
| **StableIdHash** | Domain → Field<number> |
| **FieldMap** | Field<A> → Field<B> |
| **FieldZip** | (Field<A>, Field<B>) → Field<C> |
| **Broadcast** | Signal<A> → Field<A> |

### Signal Generators
Time-varying values.

| Block | Outputs |
|-------|---------|
| **WaveShaper** | Signal<number> from phase |
| **ColorLFO** | Signal<color> from phase |
| **Envelope** | Signal<number> from event |

### Reducers
Collapse fields to signals.

| Block | Type |
|-------|------|
| **FieldSum** | Field<number> → Signal<number> |
| **FieldMean** | Field<number> → Signal<number> |
| **FieldMax** | Field<number> → Signal<number> |

### Render Sinks
Materialize fields and produce render output.

| Block | Inputs |
|-------|--------|
| **RenderInstances2D** | domain, position, radius, fill, opacity |
| **RenderPath2D** | domain, position, stroke, strokeWidth |

### Memory (Stateful)
Enable feedback loops.

| Block | Purpose |
|-------|---------|
| **DelayLine** | Sample delay |
| **SampleHold** | Latch on event |
| **Integrate** | Accumulation |

## Port Types

```typescript
interface PortDefinition {
  id: string
  type: TypeDesc
  direction: 'input' | 'output'
  defaultSource?: DefaultSourceSpec
}
```

## Default Sources

Inputs can declare default bus subscriptions:

```typescript
interface DefaultSourceSpec {
  busId: BusId
  adapters?: AdapterId[]
}
```

## Composites

Composites are reusable block graphs:

```typescript
interface CompositeDefinition {
  type: string
  blocks: BlockInstance[]
  connections: Connection[]
  exposedInputs: PortMapping[]
  exposedOutputs: PortMapping[]
}
```

**Constraints:**
- No TimeRoot inside composites
- Bus bindings preserved through expansion
- State keys derived from composite context

## Block Compiler Contract

```typescript
interface CompiledBlock {
  outputs: Map<PortId, Artifact>
  autoPublications?: AutoPublication[]
  stateRequirements?: StateRequirement[]
}
```
