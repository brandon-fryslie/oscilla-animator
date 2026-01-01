# Compiler Architecture Recommendations

**Date**: 2025-12-31
**Status**: Fresh-eyes audit and recommendations
**Goal**: Get the new compiler functional with legacy bridge blocks

---

## Executive Summary

The oscilla-animator codebase is well-architected but has accumulated complexity from parallel V1 (closure-based) and V2 (IR-based) systems. Three refactors will dramatically simplify the new compiler:

1. **Unify Connections** - Merge Connection, Publisher, Listener into single Edge type
2. **Unify Default Sources with Blocks** - Make every input backed by a hidden block
3. **Unify Lenses and Adapters** - Single TransformStep abstraction

Recommended sequence: Connections → Default Sources → Lenses/Adapters → V2 Adapter

---

## Part 1: Unifying Connections/Edges

### Current State

Three separate types with overlapping structure:

```typescript
// src/editor/types.ts:576-594
interface Connection {
  readonly id: string;
  readonly from: PortRef;           // block output
  readonly to: PortRef;             // block input
  readonly lensStack?: LensInstance[];
  readonly adapterChain?: AdapterStep[];
  readonly enabled?: boolean;
}

// src/editor/types.ts:207-231
interface Publisher {
  readonly id: string;
  readonly busId: string;           // target bus
  readonly from: PortRef;           // block output
  readonly adapterChain?: AdapterStep[];
  readonly lensStack?: LensInstance[];
  readonly weight?: number;
  enabled: boolean;
  sortKey: number;
}

// src/editor/types.ts:236-254
interface Listener {
  readonly id: string;
  readonly busId: string;           // source bus
  readonly to: PortRef;             // block input
  readonly adapterChain?: AdapterStep[];
  readonly lensStack?: LensInstance[];
  enabled: boolean;
}
```

### The Problem

Every compiler pass (2, 6, 7, 8) has to handle three connection types separately:
- Pass 2 (Type Graph): Type-check wires, publishers, AND listeners
- Pass 6 (Block Lowering): Resolve inputs from wires OR listeners OR defaults
- Pass 7 (Bus Lowering): Handle publishers and listeners as special cases
- Pass 8 (Link Resolution): Connect fragments from all three sources

### Recommended Solution

Create a unified `Edge` type with a discriminated union for endpoints:

```typescript
// New unified type
type Endpoint =
  | { kind: 'port'; blockId: string; slotId: string }
  | { kind: 'bus'; busId: string };

interface Edge {
  readonly id: string;
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly transforms?: TransformStep[];  // unified lens+adapter
  readonly enabled: boolean;

  // Optional metadata
  readonly weight?: number;      // for bus publishers
  readonly sortKey?: number;     // for deterministic ordering
}

// Validation rules (enforced at creation):
// - port→port: direct wire
// - port→bus: publisher
// - bus→port: listener
// - bus→bus: INVALID (compile error)
```

### Implementation Steps

1. **Create Edge type** in `src/editor/types.ts`
2. **Add migration helpers**:
   ```typescript
   function connectionToEdge(c: Connection): Edge
   function publisherToEdge(p: Publisher): Edge
   function listenerToEdge(l: Listener): Edge
   function edgeToConnection(e: Edge): Connection | null
   function edgeToPublisher(e: Edge): Publisher | null
   function edgeToListener(e: Edge): Listener | null
   ```
3. **Update Patch type** to use `edges: Edge[]` instead of three arrays
4. **Update PatchStore** operations
5. **Update compiler passes** one at a time (pass 2 first, then 6, 7, 8)
6. **Update UI components** that render connections

### Files to Modify

| File | Changes |
|------|---------|
| `src/editor/types.ts` | Add Edge, Endpoint types |
| `src/editor/stores/PatchStore.ts` | Replace connections/publishers/listeners with edges |
| `src/editor/compiler/passes/pass2-types.ts` | Unified edge type-checking |
| `src/editor/compiler/passes/pass6-block-lowering.ts` | Unified input resolution |
| `src/editor/compiler/passes/pass7-bus-lowering.ts` | Simplify to just edge filtering |
| `src/editor/compiler/passes/pass8-link-resolution.ts` | Unified wiring |
| `src/ui/components/Canvas/WireRenderer.tsx` | (if exists) Update to use Edge |

### Backward Compatibility

Keep the old types as deprecated aliases during migration:
```typescript
/** @deprecated Use Edge instead */
type Connection = Edge & { from: { kind: 'port' }; to: { kind: 'port' } };
```

---

## Part 2: Unifying Default Sources with Blocks

### Current State

Default sources are metadata attached to input slots:

```typescript
// src/editor/types.ts:376-403
interface DefaultSource {
  readonly value: unknown;
  readonly uiHint?: UIControlHint;
  readonly world: SlotWorld;
  readonly defaultBus?: string;
}

// Stored separately in Patch
interface Patch {
  blocks: Block[];
  connections: Connection[];
  defaultSources: DefaultSourceState[];           // ← separate array
  defaultSourceAttachments: DefaultSourceAttachment[];  // ← links to providers
}
```

Input resolution has special-case logic:
```typescript
// Pseudocode from compiler
function resolveInput(blockId, slotId) {
  // Check 1: Direct wire?
  const wire = connections.find(c => c.to.blockId === blockId && c.to.slotId === slotId);
  if (wire) return resolveWire(wire);

  // Check 2: Bus listener?
  const listener = listeners.find(l => l.to.blockId === blockId && l.to.slotId === slotId);
  if (listener) return resolveBus(listener);

  // Check 3: Default source? ← SPECIAL CASE
  const ds = defaultSources.find(d => d.targetBlockId === blockId && d.targetSlotId === slotId);
  if (ds) return compileDefaultSource(ds);

  // Error: unconnected input
}
```

### The Problem

- Default sources require separate resolution path
- Three-way priority logic (wire > listener > default) is implicit
- Default source providers exist but aren't fully integrated
- Special handling in multiple compiler passes

### Recommended Solution

Make every unconnected input implicitly connected to a hidden provider block:

```typescript
// When an input has no explicit edge:
// 1. Create hidden DSConst* block with the default value
// 2. Create edge from that block's output to the input
// 3. Store UI hints on the hidden block's params

// Result: ALL inputs are connected via edges
// No special-case resolution needed
```

### Data Model Changes

```typescript
interface Patch {
  blocks: Block[];      // includes hidden DSConst* blocks
  edges: Edge[];        // ALL connections, including defaults
  buses: Bus[];

  // REMOVED: defaultSources, defaultSourceAttachments
  // UI hints now stored on hidden block params
}

// Hidden blocks tagged for filtering
interface Block {
  // ...existing fields
  readonly hidden?: boolean;        // Don't render on canvas
  readonly role?: 'defaultSourceProvider' | 'internal';
}
```

### Implementation Steps

1. **Create `materializeDefaultSources()` function**:
   ```typescript
   function materializeDefaultSources(patch: Patch): Patch {
     const newBlocks: Block[] = [];
     const newEdges: Edge[] = [];

     for (const block of patch.blocks) {
       for (const input of block.inputs) {
         if (!hasEdgeTo(patch, block.id, input.id)) {
           const provider = createProviderBlock(input.defaultSource);
           const edge = createEdge(provider.id, 'out', block.id, input.id);
           newBlocks.push(provider);
           newEdges.push(edge);
         }
       }
     }

     return { ...patch, blocks: [...patch.blocks, ...newBlocks], edges: [...patch.edges, ...newEdges] };
   }
   ```

2. **Call at start of compilation** (pass 0 or start of pass 1)

3. **Update UI** to:
   - Hide provider blocks from canvas
   - Show inline editors for provider block params (the "default value" UI)
   - Allow user to "promote" a default to a visible block

4. **Remove special-case code** from passes 2, 6, 7, 8

### Files to Modify

| File | Changes |
|------|---------|
| `src/editor/types.ts` | Remove DefaultSourceState, DefaultSourceAttachment |
| `src/editor/compiler/passes/pass1-normalize.ts` | Add materializeDefaultSources() |
| `src/editor/compiler/passes/pass6-block-lowering.ts` | Remove default source handling |
| `src/editor/stores/PatchStore.ts` | Update to manage hidden blocks |
| `src/ui/components/Inspector/` | Update default value editors |

### Migration Path

1. Keep old types during transition
2. Add `materializeDefaultSources()` at compilation start
3. Gradually remove special-case code
4. Update serialization format (version bump)

---

## Part 3: Unifying Lenses and Adapters

### Current State

Two separate registries with similar structure:

```typescript
// src/editor/lenses/LensRegistry.ts
interface LensDef {
  id: string;
  label: string;
  domain: CoreDomain;
  params: Record<string, LensParamSpec>;
  apply?: (value, params) => value;
  compileToIR?: (input, params, ctx) => ValueRefPacked;
}

// src/editor/adapters/AdapterRegistry.ts
interface AdapterDef {
  id: string;
  label: string;
  from: TypeDesc;
  to: TypeDesc;
  policy: AdapterPolicy;
  cost: AdapterCost;
  apply?: (artifact, params, ctx) => Artifact;
  compileToIR?: (input, ctx) => ValueRefPacked;
}
```

### Key Differences

| Aspect | Lenses | Adapters |
|--------|--------|----------|
| Type signature | `T → T` | `T₁ → T₂` |
| Parameters | Yes (user-editable) | No |
| Stateful | Sometimes | Never |
| Auto-insert | No | Yes (based on policy) |

### The Insight

Both are "transform steps" applied to values flowing through edges. The differences are:
1. **Type preservation** (lens) vs **type conversion** (adapter)
2. **User-configurable** (lens) vs **automatic** (adapter)

### Recommended Solution

Create unified `TransformStep` abstraction:

```typescript
interface TransformStep {
  readonly id: string;
  readonly kind: 'lens' | 'adapter';
  readonly params?: Record<string, unknown>;  // only for lenses
}

// Registry lookup determines behavior
interface TransformDef {
  id: string;
  label: string;
  kind: 'lens' | 'adapter';

  // Type info
  inputType: TypeDesc | 'same';   // 'same' means preserves type
  outputType: TypeDesc | 'same';

  // Lens-specific
  params?: Record<string, ParamSpec>;

  // Adapter-specific
  policy?: 'auto' | 'suggest' | 'explicit';
  cost?: number;

  // Shared
  apply?: (value, params, ctx) => value;
  compileToIR?: (input, params, ctx) => ValueRefPacked;
}
```

### Implementation Steps

1. **Create TransformStep type** in `src/editor/types.ts`
2. **Create unified TransformRegistry**:
   ```typescript
   class TransformRegistry {
     private transforms: Map<string, TransformDef>;

     registerLens(def: LensDef): void;
     registerAdapter(def: AdapterDef): void;

     findTransform(id: string): TransformDef;
     findAdapters(from: TypeDesc, to: TypeDesc): TransformDef[];
     getLensesForDomain(domain: CoreDomain): TransformDef[];
   }
   ```
3. **Update Edge type** to use `transforms: TransformStep[]`
4. **Update compiler** to apply transforms uniformly
5. **Keep old registries** as facades during migration

### Priority

This refactor is **lower priority** than the first two. It's a nice cleanup but doesn't block the new compiler as directly. Consider doing it after V2 adapter is working.

---

## Part 4: V2 Adapter Implementation

### Current State

The V2 adapter is a stub:

```typescript
// src/editor/compiler/v2adapter.ts
export function adaptV2Compiler(v2Compiler: BlockCompilerV2): BlockCompiler {
  return {
    compile(_compileArgs) {
      // STUB: Full implementation will...
      return { /* Error artifacts */ };
    }
  };
}
```

### What's Needed

The adapter must:
1. Create a `SignalExprBuilder` for the block
2. Convert input `Artifact` values to `SigExprId` references
3. Call `v2Compiler.compileV2()` to get output `SigExprId`s
4. Wrap outputs as closures that call `evalSig()` at runtime

### Implementation

```typescript
export function adaptV2Compiler(v2Compiler: BlockCompilerV2): BlockCompiler {
  return {
    compile(args: BlockCompileArgs): Record<string, Artifact> {
      const { id, params, inputs, ctx } = args;

      // 1. Create builder
      const builder = new SignalExprBuilder();

      // 2. Convert inputs to SigExprIds
      const inputIds: Record<string, SigExprId> = {};
      for (const [name, artifact] of Object.entries(inputs)) {
        inputIds[name] = artifactToSigExprId(artifact, builder, ctx);
      }

      // 3. Compile block
      const outputIds = v2Compiler.compileV2({
        id,
        params,
        inputs: inputIds,
        builder,
      });

      // 4. Build IR and create closures
      const ir = builder.build();
      const outputs: Record<string, Artifact> = {};

      for (const [name, sigExprId] of Object.entries(outputIds)) {
        outputs[name] = {
          world: 'signal',
          value: (frameCtx: FrameContext) => {
            return evalSig(ir, sigExprId, frameCtx);
          }
        };
      }

      return outputs;
    }
  };
}

function artifactToSigExprId(
  artifact: Artifact,
  builder: SignalExprBuilder,
  ctx: CompileCtx
): SigExprId {
  if (typeof artifact.value === 'function') {
    // V1 closure - wrap in a "closure" node
    return builder.closureNode(artifact.value, artifact.type);
  } else {
    // Constant - emit const node
    return builder.sigConst(artifact.value, artifact.type);
  }
}
```

### Key Challenge

The tricky part is mixing V1 closures with V2 IR. The `closureNode` approach embeds a V1 closure as a leaf in the V2 expression tree. At runtime:

```typescript
function evalSig(ir: SignalIR, id: SigExprId, ctx: FrameContext): number {
  const node = ir.nodes[id];

  switch (node.kind) {
    case 'const':
      return ir.constPool[node.constId];

    case 'closure':  // V1 bridge
      return node.closureFn(ctx);

    case 'map':
      const src = evalSig(ir, node.src, ctx);
      return applyKernel(node.fn, src);

    // ... other cases
  }
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/editor/compiler/v2adapter.ts` | Full implementation |
| `src/editor/compiler/ir/types.ts` | Add `SignalExprClosure` node type |
| `src/editor/runtime/executor/evalSig.ts` | Handle closure nodes |

---

## Implementation Sequence

### Phase 1: Foundation (Do First)

1. **Unify Connections → Edge type**
   - Estimated effort: 2-3 days
   - Unblocks: Simpler compiler passes
   - Risk: Low (mostly type changes)

2. **Unify Default Sources with Blocks**
   - Estimated effort: 2-3 days
   - Unblocks: No special-case input resolution
   - Risk: Medium (affects serialization)

### Phase 2: Compiler Completion

3. **Implement V2 Adapter**
   - Estimated effort: 3-5 days
   - Unblocks: Legacy blocks in new runtime
   - Risk: Medium (runtime integration)

4. **Test with legacy bridge blocks**
   - Estimated effort: 1-2 days
   - Verify all block types compile and run

### Phase 3: Polish (Can Defer)

5. **Unify Lenses and Adapters**
   - Estimated effort: 2-3 days
   - Nice cleanup but not blocking
   - Risk: Low

---

## Testing Strategy

### For Connection Unification

```typescript
describe('Edge type', () => {
  it('converts Connection to Edge', () => {
    const conn: Connection = { id: '1', from: portRef('a', 'out'), to: portRef('b', 'in') };
    const edge = connectionToEdge(conn);
    expect(edge.from).toEqual({ kind: 'port', blockId: 'a', slotId: 'out' });
    expect(edge.to).toEqual({ kind: 'port', blockId: 'b', slotId: 'in' });
  });

  it('converts Publisher to Edge', () => {
    const pub: Publisher = { id: '1', from: portRef('a', 'out'), busId: 'mybus' };
    const edge = publisherToEdge(pub);
    expect(edge.from).toEqual({ kind: 'port', blockId: 'a', slotId: 'out' });
    expect(edge.to).toEqual({ kind: 'bus', busId: 'mybus' });
  });
});
```

### For Default Source Unification

```typescript
describe('materializeDefaultSources', () => {
  it('creates hidden blocks for unconnected inputs', () => {
    const patch = createPatch([
      block('osc', 'Oscillator', { frequency: defaultSource(440) })
    ]);

    const materialized = materializeDefaultSources(patch);

    expect(materialized.blocks).toHaveLength(2);  // osc + hidden provider
    expect(materialized.edges).toHaveLength(1);   // provider → osc.frequency

    const provider = materialized.blocks.find(b => b.hidden);
    expect(provider.type).toBe('DSConstSignalFloat');
  });
});
```

### For V2 Adapter

```typescript
describe('V2 Adapter', () => {
  it('compiles V2 block with V1 inputs', () => {
    const v2Block = createV2Block('add', {
      compileV2({ inputs, builder }) {
        const sum = builder.sigZip(inputs.a, inputs.b, { kind: 'kernel', kernelId: 'add' });
        return { out: sum };
      }
    });

    const adapted = adaptV2Compiler(v2Block);
    const result = adapted.compile({
      id: 'add1',
      inputs: {
        a: { world: 'signal', value: (ctx) => 10 },  // V1 closure
        b: { world: 'signal', value: (ctx) => 20 },  // V1 closure
      }
    });

    expect(result.out.value({ t: 0 })).toBe(30);
  });
});
```

---

## Appendix: File Reference

### Core Types
- `src/core/types.ts` - Canonical TypeDesc (DO NOT DUPLICATE)
- `src/editor/types.ts` - Editor types, re-exports TypeDesc

### Connections (to unify)
- `src/editor/types.ts:576-594` - Connection
- `src/editor/types.ts:207-231` - Publisher
- `src/editor/types.ts:236-254` - Listener

### Default Sources (to unify)
- `src/editor/types.ts:376-403` - DefaultSource
- `src/editor/defaultSources/types.ts` - DefaultSourceAttachment
- `src/editor/blocks/default-source-providers.ts` - DSConst* blocks

### Lenses and Adapters (to unify)
- `src/editor/lenses/LensRegistry.ts` - Lens definitions
- `src/editor/adapters/AdapterRegistry.ts` - Adapter definitions

### Compiler
- `src/editor/compiler/compile.ts` - Entry point
- `src/editor/compiler/passes/` - 8-pass pipeline
- `src/editor/compiler/v2adapter.ts` - V2 bridge (stub)
- `src/editor/compiler/ir/` - IR types and builders

### Block Registry
- `src/editor/blocks/registry.ts` - Single source of truth

---

## Summary

The three unifications (connections, default sources, lenses/adapters) will eliminate special-case code throughout the compiler. The recommended sequence is:

1. **Connections → Edge** (simplifies all passes)
2. **Default Sources → Blocks** (uniform input resolution)
3. **V2 Adapter** (legacy bridge working)
4. **Lenses/Adapters** (optional cleanup)

After these changes, the new compiler will be dramatically simpler because every input has exactly one resolution path: follow the edge.
