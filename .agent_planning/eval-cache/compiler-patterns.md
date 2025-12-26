# Compiler Patterns Cache

**Cached**: 2025-12-25 00:30
**Source**: project-evaluator (Phase 4 evaluation)
**Confidence**: HIGH

## Current Compiler Architecture

**Pattern**: Closure-based compilation (pre-IR migration)

### Block Compiler Contract

All blocks implement `BlockCompiler` interface:
```typescript
interface BlockCompiler {
  type: string;
  inputs: readonly PortDef[];
  outputs: readonly PortDef[];
  compile(args: {
    id: BlockId;
    params: Record<string, unknown>;
    inputs: Record<string, Artifact>;
    ctx: CompileCtx;
  }): CompiledOutputs;
}
```

### Artifact Pattern (Current)

Signals are closures:
```typescript
type Signal<T> = (t: number, ctx: RuntimeCtx) => T;

// Example artifact
{ kind: 'Signal:number', value: (t, ctx) => someComputation(t, ctx) }
```

Fields are functions:
```typescript
type Field<T> = (seed: Seed, n: number, ctx: CompileCtx) => readonly T[];
```

### Signal Block Compiler Pattern

**Location**: `src/editor/compiler/blocks/signal/`

**Count**: 9 signal block compilers

**Common pattern**:
1. Extract input artifacts
2. Validate types (return Error artifact if mismatch)
3. Extract values as closures
4. Compose new closure from inputs
5. Return artifact with closure value

**Example** (AddSignal):
```typescript
compile({ inputs }) {
  const aSignal = inputs.a.value as Signal<number>;
  const bSignal = inputs.b.value as Signal<number>;

  const signal: Signal<number> = (t, ctx) => {
    return aSignal(t, ctx) + bSignal(t, ctx);
  };

  return { out: { kind: 'Signal:number', value: signal } };
}
```

### Compilation Pipeline

**Location**: `src/editor/compiler/compileBusAware.ts`

**Phases**:
1. Validate patch (blocks, connections, buses)
2. Topological sort (wire + bus dependencies)
3. Compile blocks in order (accumulate artifacts)
4. Resolve bus listeners (combine publishers)
5. Extract TimeModel
6. Assemble final Program<RenderTree>

**Output**: `CompiledProgram` with `program` and `timeModel`

### Runtime Execution

**Location**: `src/editor/runtime/player.ts`

**Pattern**:
1. Player owns time `tMs`
2. Call `program.signal(tMs, runtimeCtx)` per frame
3. Executes closure tree top-down
4. Produces `RenderTree`
5. Pass to renderer (SVG or Canvas)

**Performance characteristics**:
- No memoization (signals re-computed every use)
- No cache (bus listeners all re-evaluate)
- Closure allocation on every frame (GC pressure)
- No parallelization (single-threaded tree walk)

## Migration Target (IR-Based, Not Implemented)

### SignalExpr IR Pattern (Planned)

Signals become DAG nodes:
```typescript
type SigExprId = string;

type SignalExprIR =
  | { kind: 'const'; id: SigExprId; valueConstId: string }
  | { kind: 'timeAbsMs'; id: SigExprId; slot: ValueSlot }
  | { kind: 'map'; id: SigExprId; src: SigExprId; fn: PureFnRef }
  | { kind: 'busCombine'; id: SigExprId; terms: SigExprId[]; ... }
  | ...
```

### Evaluator Pattern (Planned)

Replace closure tree walk with schedule execution:
```typescript
interface SigEvaluator {
  sample<T>(id: SigId, env: SigEnv): T;
}

// Evaluation is cache-first:
// 1. Check cache[id]
// 2. If miss: compute, write cache, return
// 3. If hit: return cached
```

### Benefits of IR Pattern

- **Deterministic**: DAG is inspectable, reproducible
- **Cacheable**: Per-frame memo eliminates redundant work
- **Debuggable**: Can trace node-by-node evaluation
- **Portable**: IR serializes to Rust/WASM
- **Optimizable**: Can analyze DAG, fuse ops, dead-code eliminate

## Key File Locations

**Compiler**:
- `src/editor/compiler/types.ts` - Core types (521 lines)
- `src/editor/compiler/compileBusAware.ts` - Main compiler (1,013 lines)
- `src/editor/compiler/blocks/signal/*.ts` - Signal block compilers (9 files)
- `src/editor/compiler/blocks/domain/TimeRoot.ts` - TimeRoot compiler

**Runtime**:
- `src/editor/runtime/player.ts` - Player (200+ lines)
- `src/editor/runtime/renderTree.ts` - RenderTree types
- `src/editor/runtime/svgRenderer.ts` - SVG renderer
- `src/editor/runtime/canvasRenderer.ts` - Canvas renderer

**No IR directories exist yet** - all planned for Phases 1-4.
