# IR Schema Investigation Report

**Date**: 2026-01-02
**Status**: Requires Architectural Decision
**Priority**: Blocking - Tests Cannot Pass

## Executive Summary

The codebase has **TWO INCOMPATIBLE IR SCHEMAS** that define `CompiledProgramIR`:

1. **New ADR-001 Schema**: `src/editor/compiler/ir/program.ts`
2. **Legacy Schema**: `src/editor/ir/schema/CompiledProgramIR.ts`

The runtime code imports from the NEW schema but expects properties from the LEGACY schema, causing widespread TypeScript errors.

---

## Issue 1: Dual Schema Problem (CRITICAL)

### Location A: New ADR-001 Schema
**File**: `src/editor/compiler/ir/program.ts`

```typescript
export interface CompiledProgramIR {
  readonly patchId: string;
  readonly compiledAt: number;
  readonly irVersion: string;          // string like "1.0.0"
  readonly seed: number;

  readonly timeModel: TimeModelIR;
  readonly types: TypeTable;

  readonly signalExprs: SignalExprTable;  // NEW naming
  readonly fieldExprs: FieldExprTable;    // NEW naming
  readonly eventExprs: EventExprTable;    // NEW naming

  readonly constants: ConstPool;          // json: unknown[]
  readonly stateLayout: StateLayout;
  readonly defaultSources: DefaultSourceTable;
  readonly slotMeta: SlotMetaEntry[];

  readonly render: RenderIR;
  readonly cameras: CameraTable;
  readonly meshes: MeshTable;
  readonly schedule: ScheduleIR;

  // NO nodes, NO buses, NO outputs
}
```

### Location B: Legacy Schema
**File**: `src/editor/ir/schema/CompiledProgramIR.ts`

```typescript
export interface CompiledProgramIR {
  readonly irVersion: 1;                  // number literal
  readonly patchId: string;
  readonly seed: number;

  readonly timeModel: TimeModelIR;
  readonly types: TypeTable;

  readonly nodes: NodeTable;              // OLD structure
  readonly buses: BusTable;               // OLD structure

  readonly constPool: ConstPool;          // entries: Map<string, TypedConst>
  readonly defaultSources: DefaultSourceTable;
  readonly transforms: TransformTable;

  readonly schedule: ScheduleIR;
  readonly outputs: readonly OutputSpec[]; // OLD structure

  readonly debugIndex: DebugIndex;
  readonly meta: ProgramMeta;
}
```

### Key Differences

| Property | ADR-001 Schema | Legacy Schema |
|----------|---------------|---------------|
| `irVersion` | `string` ("1.0.0") | `1` (number literal) |
| Signal data | `signalExprs: SignalExprTable` | `nodes: NodeTable` |
| Field data | `fieldExprs: FieldExprTable` | (via nodes) |
| Bus data | (removed) | `buses: BusTable` |
| Constants | `constants.json: unknown[]` | `constPool.entries: Map` |
| Outputs | `render: RenderIR` | `outputs: OutputSpec[]` |

### Questions Requiring Decision

1. **Which schema is authoritative?** The ADR says ADR-001, but legacy schema exists.
2. **Should legacy schema be deleted?** What code depends on it?
3. **Is there a transformation layer missing?** Builder → ADR-001 → Legacy?

---

## Issue 2: `program.nodes` (BREAKING)

### Where It's Used

**File**: `src/editor/runtime/executor/steps/executeNodeEval.ts:35`
```typescript
const node = program.nodes.nodes[step.nodeIndex];
```

**File**: `src/editor/stores/DebugStore.ts:717,734,771`
```typescript
const nodeCount = programIR.nodes?.nodes?.length ?? 0;
const nodes = programIR.nodes?.nodes ?? [];
const node = programIR.nodes.nodes.find((n) => n.id === nodeId);
```

### What It Expected

From legacy schema (`src/editor/ir/schema/CompiledProgramIR.ts`):
```typescript
interface NodeTable {
  readonly nodes: readonly NodeIR[];
  readonly nodeIdToIndex: ReadonlyMap<NodeId, NodeIndex>;
}

interface NodeIR {
  readonly id: NodeId;
  readonly index: NodeIndex;
  readonly capability: NodeCapability;
  readonly op: OpCode;
  readonly inputs: readonly InputPortIR[];
  readonly outputs: readonly OutputPortIR[];
  readonly consts?: ConstPoolRef;
  readonly state?: readonly StateBindingIR[];
  readonly meta?: NodeMeta;
}
```

### What ADR-001 Provides Instead

The ADR-001 schema removes `nodes` entirely. The execution model changed:
- **Old**: Execute `NodeIR` by looking up opcode and running it
- **New**: Execute `SignalExprIR` nodes via `SignalExprTable.nodes`

### Options

**Option A: Remove executeNodeEval entirely**
- The new SignalExpr-based architecture doesn't use NodeIR
- `StepNodeEval` might be obsolete
- **Risk**: What functionality depends on this?

**Option B: Add nodes back to ADR-001 schema**
- Merge legacy NodeTable into new schema
- **Risk**: Duplicates SignalExpr functionality?

**Option C: Map NodeEval steps to SignalExpr evaluation**
- `step.nodeIndex` could reference `signalExprs.nodes[index]`
- **Risk**: Different semantics - NodeIR has opcodes, SignalExprIR has kinds

---

## Issue 3: `program.buses` (BREAKING)

### Where It's Used

**File**: `src/editor/stores/DebugStore.ts:718,749`
```typescript
const busCount = programIR.buses?.buses?.length ?? 0;
const buses = programIR.buses?.buses ?? [];
```

### What It Expected

From legacy schema:
```typescript
interface BusTable {
  readonly buses: readonly BusIR[];
  readonly busIdToIndex: ReadonlyMap<BusId, BusIndex>;
}

interface BusIR {
  readonly id: BusId;
  readonly type: TypeDesc;
  readonly combineMode: BusCombineMode;
  readonly outputSlot: ValueSlot;
}
```

### What Happened

Recent commits show bus unification work:
```
ce68320 refactor(compiler/ir): remove bus-specific types and step definitions
5cf7262 refactor(compiler): remove BusIndex from combine operations
435b080 refactor(compiler): remove Pass 7 and bus-specific infrastructure
```

Buses were **intentionally removed** as part of bus unification. Bus semantics are now handled via `SignalExprBusCombine` nodes in `signalExprs`.

### Options

**Option A: Remove bus debugging from DebugStore**
- Buses no longer exist as first-class entities
- Debug "IR buses" command becomes obsolete
- **Pro**: Aligns with architecture
- **Con**: Reduces debugging visibility

**Option B: Synthesize bus info from SignalExprBusCombine**
- Scan `signalExprs.nodes` for `kind: "busCombine"` entries
- Present them as "buses" in debug UI
- **Pro**: Preserves debugging capability
- **Con**: Semantic mismatch (combine != bus)

---

## Issue 4: `program.outputs` (BREAKING)

### Where It's Used

**File**: `src/editor/runtime/executor/ScheduleExecutor.ts:281,291`
```typescript
if (program.outputs === undefined || program.outputs.length === 0) {
  return { version: 1, clear: { mode: "none" }, passes: [] };
}
const outputSpec = program.outputs[0];
const value = runtime.values.read(outputSpec.slot);
```

### What It Expected

From legacy schema:
```typescript
interface OutputSpec {
  readonly kind: 'renderTree' | 'renderCommands';
  readonly sourceSlot: ValueSlot;
}
```

### What ADR-001 Provides

```typescript
readonly render: RenderIR;

interface RenderIR {
  readonly sinks: RenderSinkIR[];
}

interface RenderSinkIR {
  readonly sinkType: string;
  readonly inputs: Record<string, ValueSlot>;
}
```

### Options

**Option A: Update extractRenderOutput to use render.sinks**
```typescript
private extractRenderOutput(program: CompiledProgramIR, runtime: RuntimeState): RenderFrameIR {
  if (!program.render?.sinks?.length) {
    return { version: 1, clear: { mode: "none" }, passes: [] };
  }

  const sink = program.render.sinks[0];
  const slot = sink.inputs['frame'] ?? sink.inputs['output'];
  if (slot === undefined) {
    return { version: 1, clear: { mode: "none" }, passes: [] };
  }

  const value = runtime.values.read(slot);
  // ... validate and return
}
```

**Option B: Add outputs back as compatibility layer**
- Keep `outputs` property in ADR-001 schema
- Populate it during compilation from `render.sinks`

---

## Issue 5: `constPool.constIndex` vs `constPool.json`

### Where It's Used

**File**: `src/editor/runtime/executor/evaluators/OpCodeEvaluator.ts:116-140`
```typescript
// OLD CODE - expects constIndex
if (constPool.constIndex !== undefined && constId < constPool.constIndex.length) {
  const entry = constPool.constIndex[constId];
  switch (entry.k) {
    case "f64": return [constPool.f64[entry.idx]];
    case "f32": return [constPool.f32[entry.idx]];
    case "i32": return [constPool.i32[entry.idx]];
    case "json": return [constPool.json[entry.idx]];
  }
}
```

### Legacy Schema Expected

```typescript
interface ConstPool {
  readonly entries: ReadonlyMap<string, TypedConst>;
}
// OR with constIndex array:
constIndex: Array<{ k: 'f64' | 'f32' | 'i32' | 'json', idx: number }>
```

### ADR-001 Provides

```typescript
interface ConstPool {
  readonly json: readonly unknown[];
  readonly f64?: Float64Array;
  readonly f32?: Float32Array;
  readonly i32?: Int32Array;
}
```

No `constIndex` - constants are accessed directly by ID into `json` array.

### Resolution

**Clear**: Update OpCodeEvaluator to use new schema:
```typescript
case OpCode.Const: {
  if (!program?.constants?.json) {
    console.warn("OpCode.Const: no constant pool available");
    return [0];
  }

  const constId = node.compilerTag ?? 0;
  const value = program.constants.json[constId];
  return [value ?? 0];
}
```

**Question**: Are numeric constants stored in `json` or in typed arrays? If typed arrays are used, how does the runtime know which array to use?

---

## Issue 6: `SlotMeta` vs `SlotMetaEntry`

### Definitions

**SlotMeta** (runtime expects) - `src/editor/compiler/ir/stores.ts:126`:
```typescript
interface SlotMeta {
  slot: ValueSlot;
  storage: "f64" | "f32" | "i32" | "u32" | "object";
  offset: number;  // <-- HAS THIS
  type: TypeDesc;
  debugName?: string;
}
```

**SlotMetaEntry** (program provides) - `src/editor/compiler/ir/program.ts:163`:
```typescript
interface SlotMetaEntry {
  slot: ValueSlot;
  storage: "f64" | "f32" | "i32" | "u32" | "object";
  // NO offset
  type: TypeDesc;
  debugName?: string;
}
```

### Where It Fails

**File**: `src/editor/runtime/executor/RuntimeState.ts:341,350`
```typescript
bySlot.set(meta.slot, meta);  // meta is SlotMetaEntry, Map expects SlotMeta
return compilerMeta;          // returns SlotMetaEntry[], expected SlotMeta[]
```

### Options

**Option A: Add offset to SlotMetaEntry**
- Compiler emits offset during slot allocation
- **Pro**: Runtime gets pre-computed offsets
- **Con**: More compiler work

**Option B: Compute offset in RuntimeState**
- Runtime computes offset from slot index and storage type
- **Pro**: Simpler schema
- **Con**: Runtime overhead

**Option C: Remove offset requirement from SlotMeta**
- Change `SlotMeta` to not require `offset`
- Compute when needed
- **Pro**: Simpler, aligns schemas
- **Con**: Requires updating all SlotMeta usages

---

## Issue 7: ScheduleExecutor Missing Case Labels (BUG)

### Location

**File**: `src/editor/runtime/executor/ScheduleExecutor.ts:196-204`

```typescript
case "nodeEval":
  executeNodeEval(step, program, runtime);
  break;

  executeBusEval(step, program, runtime);  // NO CASE LABEL!
  break;

  executeEventBusEval(step, program, runtime);  // NO CASE LABEL!
  break;
```

### Analysis

This is **DEAD CODE** - the `executeBusEval` and `executeEventBusEval` calls are unreachable because they have no `case` labels. This happened during bus removal but the cleanup was incomplete.

### Resolution

**Clear**: Remove the dead code:
```typescript
case "nodeEval":
  executeNodeEval(step, program, runtime);
  break;

// REMOVED: executeBusEval and executeEventBusEval (no longer used)
```

Or if these steps should exist, add proper case labels.

---

## Summary of Architectural Questions

| # | Question | Options |
|---|----------|---------|
| 1 | Which IR schema is authoritative? | A) ADR-001 only, delete legacy B) Both for different purposes |
| 2 | What replaces `program.nodes` in runtime? | A) Remove executeNodeEval B) Add nodes to ADR-001 C) Map to signalExprs |
| 3 | How to handle bus debugging? | A) Remove B) Synthesize from busCombine |
| 4 | What replaces `program.outputs`? | A) Use render.sinks B) Add outputs property |
| 5 | How are numeric constants accessed? | A) All in json array B) Type-specific arrays |
| 6 | SlotMeta offset handling? | A) Compiler emits B) Runtime computes C) Remove requirement |

---

## Recommended Next Steps

1. **Decide on schema authority** - Is ADR-001 the ONLY schema, or do both coexist?
2. **Delete legacy schema if obsolete** - `src/editor/ir/schema/` appears to be dead code
3. **Remove dead bus/node code** - If SignalExpr replaces NodeIR, remove executeNodeEval
4. **Fix ScheduleExecutor dead code** - Remove orphaned executeBusEval calls
5. **Align SlotMeta interfaces** - Pick one definition

---

## Code Samples for Reference

### executeSignalEval expects `signalTable.nodes`
```typescript
// src/editor/runtime/executor/steps/executeSignalEval.ts:42,54
if (program.signalTable === undefined || program.signalTable.nodes === undefined) {
  // ...
}
const signalTable = program.signalTable.nodes;
```

But ADR-001 has `signalExprs.nodes`:
```typescript
// FIX:
if (program.signalExprs === undefined || program.signalExprs.nodes === undefined) {
  // ...
}
const signalTable = program.signalExprs.nodes;
```

### executeMaterialize expects `fields.nodes`
```typescript
// src/editor/runtime/executor/steps/executeMaterialize.ts:284
const fieldNodes = convertFieldNodes(program.fields.nodes);
```

ADR-001 has `fieldExprs.nodes`:
```typescript
// FIX:
const fieldNodes = convertFieldNodes(program.fieldExprs.nodes);
```

---

## Files Affected

**Runtime (need schema alignment)**:
- `src/editor/runtime/executor/steps/executeSignalEval.ts`
- `src/editor/runtime/executor/steps/executeMaterialize.ts`
- `src/editor/runtime/executor/steps/executeMaterializePath.ts`
- `src/editor/runtime/executor/steps/executeNodeEval.ts`
- `src/editor/runtime/executor/ScheduleExecutor.ts`
- `src/editor/runtime/executor/RuntimeState.ts`
- `src/editor/runtime/executor/evaluators/OpCodeEvaluator.ts`

**Stores (need schema alignment)**:
- `src/editor/stores/DebugStore.ts`

**Tests (need fixture updates)**:
- Multiple test files with old schema fixtures

**Potentially Dead Code**:
- `src/editor/ir/schema/CompiledProgramIR.ts` (entire legacy schema?)
- `src/editor/runtime/executor/steps/executeBusEval.ts`
- `src/editor/runtime/executor/steps/executeEventBusEval.ts`
