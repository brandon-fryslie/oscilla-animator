# Compiler Context Prime Document

**Purpose**: Prime an agent for fixing compiler errors in Oscilla's patch-to-IR compilation pipeline.

---

## Compilation Pipeline Overview

The compiler transforms a visual patch graph into runnable IR through 8 passes:

```
Patch → Pass1 → Pass2 → Pass3 → Pass4 → Pass5 → Pass6 → Pass8 → Program
        Norm    Types   Time    DepGr   SCC     Lower   Link
```

**Pass 7 is removed** - buses are now BusBlocks handled in Pass 6.

---

## Error Handling Architecture

**CRITICAL**: All passes accumulate errors before throwing.

- **Passes 2, 3, 4**: Accumulate errors into array, throw all at end
- **Passes 5, 6, 8**: Accumulate errors in result object, returned to caller
- **compile.ts** wraps passes 2-4 in try-catch and converts thrown errors to CompileError

This ensures users see ALL problems at once, not one at a time.

---

## Pass 1: Normalize (`pass1-normalize.ts`)

**Input**: `Patch` (raw from editor)
**Output**: `NormalizedPatch`

**What it does**:
1. Freezes block IDs to dense numeric indices (`BlockIndex`)
2. Canonicalizes edges (filters enabled, sorts by sortKey)
3. Creates `blocks` Map keyed by block ID

**Key types**:
```typescript
interface NormalizedPatch {
  blockIndexMap: ReadonlyMap<string, BlockIndex>;  // blockId → dense index
  blocks: ReadonlyMap<string, unknown>;             // blockId → block data
  edges: readonly Edge[];                           // canonical edge array
}
```

**Common errors**: None (this pass doesn't validate, just normalizes)

---

## Pass 2: Type Graph (`pass2-types.ts`)

**Input**: `NormalizedPatch`
**Output**: `TypedPatch`

**What it does**:
1. Builds bus type map from BusBlocks
2. Validates bus eligibility (only signal/event/scalar-domain fields can be buses)
3. Validates reserved bus constraints (phaseA, pulse, energy, palette)
4. Builds block output types map
5. Validates type compatibility for all edges

**Key error types**:
- `PortTypeUnknown`: Cannot parse slot type
- `BusIneligibleType`: Non-bus-eligible type used as bus
- `ReservedBusTypeViolation`: Reserved bus has wrong type
- `NoConversionPath`: Type mismatch on edge connection

**Type compatibility rules**:
- Exact match (same world + domain)
- Scalar → Signal promotion (same domain)
- Signal → Field broadcast (same domain)
- Scalar → Field via implicit signal promotion

---

## Pass 3: Time Topology (`pass3-time.ts`)

**Input**: `TypedPatch`
**Output**: `TimeResolvedPatch`

**What it does**:
1. Finds TimeRoot block (exactly one required)
2. Extracts TimeModel from TimeRoot params
3. Generates canonical time signals

**CRITICAL - TimeRoot blocks**:
- TimeRoot blocks are SPECIAL - they are the SOURCE of time
- TimeRoot blocks have NO inputs - they cannot receive wired connections
- Configuration (periodMs, durationMs) comes from `block.params`, not inputs
- Accepted types: `FiniteTimeRoot`, `InfiniteTimeRoot`, legacy `TimeRoot`

**TimeModel kinds**:
```typescript
type TimeModelIR =
  | { kind: 'finite'; durationMs: number }
  | { kind: 'cyclic'; periodMs: number; mode: 'loop' | 'pingpong'; phaseDomain: '0..1' }
  | { kind: 'infinite'; windowMs: number }
```

**Common errors**:
- "No TimeRoot block found"
- "Multiple TimeRoot blocks found"
- "Invalid TimeRoot duration/period" (must be > 0)

---

## Pass 4: Dependency Graph (`pass4-depgraph.ts`)

**Input**: `TimeResolvedPatch`
**Output**: `DepGraphWithTimeModel`

**What it does**:
1. Creates `BlockEval` nodes for all blocks (including BusBlocks)
2. Creates edges from the unified Edge array
3. Threads timeModel through for later passes

**Key types**:
```typescript
type DepNode = { kind: 'BlockEval'; blockIndex: BlockIndex };
interface DepEdge { from: DepNode; to: DepNode }
interface DepGraph { nodes: readonly DepNode[]; edges: readonly DepEdge[] }
```

**Common errors**:
- `DanglingConnection`: Edge references non-existent block

---

## Pass 5: Cycle Validation (`pass5-scc.ts`)

**Input**: `DepGraphWithTimeModel`
**Output**: `AcyclicOrLegalGraph`

**What it does**:
1. Runs Tarjan's SCC algorithm to find strongly connected components
2. Validates non-trivial cycles have state boundaries

**State boundary blocks** (can break cycles):
- Blocks with type containing: Delay, Integrator, Feedback, State, Sample, Hold

**Key types**:
```typescript
interface SCC { nodes: readonly DepNode[]; hasStateBoundary: boolean }
interface IllegalCycleError { kind: 'IllegalCycle'; nodes: readonly BlockIndex[] }
```

**Common errors**:
- `IllegalCycle`: Cycle without state boundary block

---

## Pass 6: Block Lowering (`pass6-block-lowering.ts`)

**Input**: `AcyclicOrLegalGraph` + blocks + edges
**Output**: `UnlinkedIRFragments`

This is the **most complex pass** and where most errors occur.

**What it does**:
1. For each block in dependency order:
   - Resolve inputs using `resolveInputsWithMultiInput()`
   - Get block's registered lowering function via `getBlockType()`
   - Call lowering function with ctx, inputs, inputsById, config
   - Store outputs in `blockOutputs` map

**CRITICAL - Block Lowering Contract**:
```typescript
// All blocks MUST:
// 1. Be registered via registerBlockType()
// 2. Use outputsById pattern (NOT legacy outputs array)
// 3. Return outputs keyed by portId matching the registration

// Example lowering function:
const lowerAddSignal: BlockLowerFn = ({ ctx, inputs, inputsById }) => {
  const a = inputsById?.a ?? inputs[0];
  const b = inputsById?.b ?? inputs[1];

  const sigId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Add }, outType);
  const slot = ctx.b.allocValueSlot(outType);

  return {
    outputs: [],  // MUST be empty for migrated blocks
    outputsById: { out: { k: 'sig', id: sigId, slot } }  // Key MUST match portId
  };
};

// Registration:
registerBlockType({
  type: 'AddSignal',
  capability: 'pure',
  inputs: [
    { portId: 'a', ... },  // portId used as key in inputsById
    { portId: 'b', ... },
  ],
  outputs: [
    { portId: 'out', ... },  // portId used as key in outputsById
  ],
  lower: lowerAddSignal,
});
```

**ValueRefPacked** - How values are represented:
```typescript
type ValueRefPacked =
  | { k: 'sig'; id: SigExprId; slot: ValueSlot }      // Signal expression
  | { k: 'field'; id: FieldExprId; slot: ValueSlot }  // Field expression
  | { k: 'event'; id: EventExprId; slot: ValueSlot }  // Event expression
  | { k: 'scalarConst'; constId: number }             // Compile-time constant
  | { k: 'special'; tag: string; id: number }         // Domain, RenderTree, etc.
```

**VERIFIED_IR_BLOCKS** - All 63 registered blocks that must have IR lowering.

**strictIR mode** (default: true):
- Blocks in VERIFIED_IR_BLOCKS MUST have working IR lowering
- No fallback to legacy artifact-based compilation

**Common errors**:
- `NotImplemented`: Block has no registered IR lowering
- `NotImplemented`: Unresolved input (multi-input resolution failed)
- `IRValidationFailed`: Port contract mismatch (editor vs IR port IDs)
- `IRValidationFailed`: Block must use outputsById pattern
- `IRValidationFailed`: outputsById missing port

**Multi-input resolution** (`resolveInputsWithMultiInput`):
- Enumerates all writers (wires, defaults) for each input
- If N=1: Direct bind
- If N>1: Creates combine node (sum, average, max, min, last)
- Validates combine policies

---

## Pass 8: Link Resolution (`pass8-link-resolution.ts`)

**Input**: `UnlinkedIRFragments` + blocks + edges
**Output**: `LinkedGraphIR`

**What it does**:
1. Builds BlockOutputRootIR from Pass 6 results
2. Validates output slot registrations
3. Builds BlockInputRootIR by resolving edges
4. Applies transforms (adapters, lenses) on edges
5. Handles Camera lowering (special case)

**Transform application**:
- Edges can have `transforms: TransformStep[]`
- Each step is either adapter or lens
- Transforms are applied in order via `applyTransformsIR()`

**Common errors**:
- `DanglingConnection`: Edge from unknown block
- `MissingInput`: Required input has no source
- `MissingOutputRegistration`: Block output not registered (compiler bug)
- `UnsupportedAdapterInIRMode`: Adapter not implemented for IR
- `UnsupportedLensInIRMode`: Lens not implemented for IR

---

## Debugging Compiler Errors

### Error: "Unresolved input X for block Y"

**Cause**: Input port was not resolved by multi-input resolution.

**Check**:
1. Does the block definition declare this input?
2. Is there an edge connecting to this input?
3. If input uses `defaultSource`, was a DSConst block materialized?
4. Is the input's portId in the IR registration matching the editor definition?

### Error: "Block type X has no registered IR lowering"

**Cause**: Block not registered via `registerBlockType()`.

**Fix**:
1. Create lowering function in `src/editor/compiler/blocks/<category>/<BlockName>.ts`
2. Call `registerBlockType({ type: '...', lower: ... })`
3. Import file in category's `index.ts`

### Error: "outputsById missing port X"

**Cause**: Lowering function returns outputsById but key doesn't match registered portId.

**Fix**: Ensure outputsById keys exactly match the `portId` values in `registerBlockType({ outputs: [...] })`.

### Error: "Port contract mismatch"

**Cause**: Editor block definition ports don't match IR registration ports.

**Check**:
1. Editor definition in `src/editor/blocks/<type>.ts`
2. IR registration in `src/editor/compiler/blocks/<category>/<Type>.ts`
3. Port IDs and order must match exactly

### Error: "No TimeRoot block found"

**Cause**: Patch is missing a TimeRoot block.

**Fix**: Ensure patch has exactly one `FiniteTimeRoot` or `InfiniteTimeRoot` block.

---

## Key Files

| File | Purpose |
|------|---------|
| `compile.ts` | Main entry point, orchestrates all passes |
| `passes/pass1-normalize.ts` | Freezes block indices, canonicalizes edges |
| `passes/pass2-types.ts` | Type validation, bus eligibility |
| `passes/pass3-time.ts` | TimeRoot finding, TimeModel extraction |
| `passes/pass4-depgraph.ts` | Dependency graph construction |
| `passes/pass5-scc.ts` | Cycle validation (Tarjan's algorithm) |
| `passes/pass6-block-lowering.ts` | Block lowering to IR |
| `passes/pass8-link-resolution.ts` | Final linking, transform application |
| `ir/lowerTypes.ts` | BlockLowerFn, ValueRefPacked, registerBlockType |
| `ir/IRBuilder.ts` | Interface for emitting IR nodes |
| `ir/IRBuilderImpl.ts` | IRBuilder implementation |

---

## Block Registration Pattern

Every block needs TWO registrations:

1. **Editor definition** (`src/editor/blocks/<type>.ts`):
```typescript
export const MyBlock = createBlock({
  type: 'MyBlock',
  inputs: [input('a', 'Input A', parseTypeDesc('Signal:float'))],
  outputs: [output('out', 'Output', parseTypeDesc('Signal:float'))],
});
```

2. **IR lowering** (`src/editor/compiler/blocks/<category>/<Type>.ts`):
```typescript
registerBlockType({
  type: 'MyBlock',
  capability: 'pure',
  inputs: [{ portId: 'a', ... }],   // portId MUST match editor 'a'
  outputs: [{ portId: 'out', ... }], // portId MUST match editor 'out'
  lower: ({ ctx, inputsById }) => ({
    outputs: [],
    outputsById: { out: ... }  // Key MUST be 'out'
  }),
});
```

---

## Common Patterns

### Reading config from block.params

```typescript
const lowerMyBlock: BlockLowerFn = ({ ctx, config }) => {
  const configData = (config != null && typeof config === 'object') ? config : {};
  const myParam = 'myParam' in configData ? Number(configData.myParam) : defaultValue;
  // ...
};
```

### Creating signal expressions

```typescript
const sigId = ctx.b.sigConst(value, type);
const slot = ctx.b.allocValueSlot(type);
ctx.b.registerSigSlot(sigId, slot);
return { k: 'sig', id: sigId, slot };
```

### Creating field expressions

```typescript
const fieldId = ctx.b.fieldConst(value, type);
const slot = ctx.b.allocValueSlot(type);
ctx.b.registerFieldSlot(fieldId, slot);
return { k: 'field', id: fieldId, slot };
```

### Signal operations

```typescript
// Add two signals
const sumId = ctx.b.sigZip(a.id, b.id, { kind: 'opcode', opcode: OpCode.Add }, outType);

// Map a signal
const mappedId = ctx.b.sigMap(src.id, { kind: 'opcode', opcode: OpCode.Sin }, outType);
```

---

## Invariants

1. **Exactly one TimeRoot per patch** - Pass 3 enforces this
2. **TimeRoot has NO inputs** - Configuration comes from block.params only
3. **All blocks must use outputsById** - Legacy outputs array is deprecated
4. **Port IDs must match** - Editor definition ↔ IR registration
5. **strictIR = true by default** - No fallback to closure compilation
6. **Errors accumulate before throwing** - Users see all errors at once
