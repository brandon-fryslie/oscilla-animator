# SignalExpr Runtime

Core runtime evaluator for Oscilla's SignalExpr intermediate representation.

## Overview

The SignalExpr runtime evaluates signal expression DAGs (directed acyclic graphs) that represent time-varying values. Unlike the legacy closure-based signal system, this runtime provides:

- **Inspectability**: All signal nodes are explicit data structures
- **Cacheability**: Per-frame memoization for efficient re-evaluation
- **Debuggability**: Every node can be traced and inspected
- **Serializability**: No closures - pure data representation

## Architecture

### Core Components

1. **SigEvaluator** - Core evaluation engine
   - Cache-first algorithm for O(1) lookups
   - Recursive DAG traversal
   - Short-circuit semantics for conditional nodes
   - Support for: `const`, `timeAbsMs`, `map`, `zip`, `select`, `inputSlot`, `busCombine` nodes

2. **SigFrameCache** - Per-frame memoization
   - Stamp-based invalidation (no array clearing)
   - O(1) cache hits
   - Automatic handling of diamond dependencies

3. **SigEnv** - Evaluation environment
   - Time values (`tAbsMs`)
   - Const pool access
   - Cache reference
   - Slot value reader (external inputs)
   - Optional debug sink (tracing)

4. **SlotValueReader** - External input resolution
   - Read values from wired connections
   - Read values from bus subscriptions
   - NaN for missing slots (detectable unconnected inputs)

5. **OpCodeRegistry** - Pure function execution
   - Unary opcodes (sin, cos, abs, floor, etc.)
   - Binary opcodes (add, sub, mul, div, min, max, etc.)
   - Safe defaults (division by zero → 0)

6. **DebugSink** - Optional debug tracing
   - Zero overhead when disabled
   - Trace bus combine operations
   - Future: trace all node evaluations

## Usage Examples

### Basic Evaluation

```typescript
import {
  evalSig,
  createSigEnv,
  createConstPool,
  createSigFrameCache,
  newFrame,
} from "./runtime/signal-expr";
import { OpCode } from "../compiler/ir/opcodes";
import type { SignalExprIR } from "../compiler/ir/signalExpr";

// 1. Create const pool
const constPool = createConstPool([0.001, 2.0, Math.PI]);

// 2. Create per-frame cache
const cache = createSigFrameCache(1024);

// 3. Build signal DAG: sin(t * 0.001) * 2
const nodes: SignalExprIR[] = [
  { kind: "timeAbsMs", type: { world: "signal", domain: "timeMs" } }, // 0: t
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 1: 0.001
  { kind: "zip", type: { world: "signal", domain: "float" }, a: 0, b: 1, fn: { kind: "opcode", opcode: OpCode.Mul } }, // 2: t * 0.001
  { kind: "map", type: { world: "signal", domain: "float" }, src: 2, fn: { kind: "opcode", opcode: OpCode.Sin } }, // 3: sin(t * 0.001)
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 1 }, // 4: 2.0
  { kind: "zip", type: { world: "signal", domain: "float" }, a: 3, b: 4, fn: { kind: "opcode", opcode: OpCode.Mul } }, // 5: sin(t * 0.001) * 2
];

// 4. Evaluate per frame
function renderFrame(tAbsMs: number): number {
  const env = createSigEnv({ tAbsMs, constPool, cache });
  const result = evalSig(5, env, nodes); // Evaluate root node
  newFrame(cache, cache.frameId + 1); // Advance to next frame
  return result;
}

// 5. Render multiple frames
console.log(renderFrame(0)); // ~0
console.log(renderFrame(Math.PI / 2 * 1000)); // ~2
console.log(renderFrame(Math.PI * 1000)); // ~0
```

### Conditional Evaluation (select)

```typescript
import { createArraySlotReader } from "./SlotValueReader";

// select(x > 0, 1/x, 0) - safe division with short-circuit
const nodes: SignalExprIR[] = [
  { kind: "inputSlot", type: { world: "signal", domain: "float" }, slot: 0 }, // 0: x
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 1: 0
  {
    kind: "zip",
    type: { world: "signal", domain: "float" },
    a: 0,
    b: 1,
    fn: { kind: "opcode", opcode: OpCode.Sub },
  }, // 2: x - 0 (cond > 0.5 means x > 0)
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 1 }, // 3: 1
  {
    kind: "zip",
    type: { world: "signal", domain: "float" },
    a: 3,
    b: 0,
    fn: { kind: "opcode", opcode: OpCode.Div },
  }, // 4: 1/x (only evaluated if x > 0)
  {
    kind: "select",
    type: { world: "signal", domain: "float" },
    cond: 2,
    t: 4,
    f: 1,
  }, // 5: select(x>0, 1/x, 0)
];

// Create slot reader with x = 2.0
const slots = createArraySlotReader(new Map([[0, 2.0]]));
const env = createSigEnv({ tAbsMs: 0, constPool, cache, slotValues: slots });

const result = evalSig(5, env, nodes); // 0.5 (1/2)
```

**Short-circuit semantics**: Only the taken branch is evaluated. In the example above, when `x <= 0`, the division `1/x` is never computed, avoiding a division-by-zero error.

### External Inputs (inputSlot)

```typescript
import { createArraySlotReader } from "./SlotValueReader";

// Read external values from slots
const slots = createArraySlotReader(
  new Map([
    [0, 42],    // slot 0 = 42
    [1, 3.14],  // slot 1 = 3.14
  ])
);

const env = createSigEnv({
  tAbsMs: 0,
  constPool: createConstPool([]),
  cache,
  slotValues: slots,
});

const nodes: SignalExprIR[] = [
  { kind: "inputSlot", type: { world: "signal", domain: "float" }, slot: 0 }, // 0: slot[0]
  { kind: "inputSlot", type: { world: "signal", domain: "float" }, slot: 1 }, // 1: slot[1]
  {
    kind: "zip",
    type: { world: "signal", domain: "float" },
    a: 0,
    b: 1,
    fn: { kind: "opcode", opcode: OpCode.Add },
  }, // 2: slot[0] + slot[1]
];

const result = evalSig(2, env, nodes); // 45.14
```

**Missing slots return NaN**: If a slot is not connected, `readNumber()` returns `NaN`. This allows detection of unconnected inputs and propagates through downstream calculations.

```typescript
const emptySlots = createArraySlotReader(new Map()); // No slots
const env = createSigEnv({ tAbsMs: 0, constPool, cache, slotValues: emptySlots });

const nodes: SignalExprIR[] = [
  { kind: "inputSlot", type: { world: "signal", domain: "float" }, slot: 99 }, // Missing slot
];

const result = evalSig(0, env, nodes); // NaN
```

### Bus Combine (busCombine)

```typescript
// Sum of multiple publishers on a bus
const nodes: SignalExprIR[] = [
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 0 }, // 10
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 1 }, // 20
  { kind: "const", type: { world: "signal", domain: "float" }, constId: 2 }, // 30
  {
    kind: "busCombine",
    type: { world: "signal", domain: "float" },
    busIndex: 0,
    terms: [0, 1, 2], // Pre-sorted by compiler
    combine: { mode: "sum" }, // Sum all terms
  },
];

const env = createSigEnv({ tAbsMs: 0, constPool: createConstPool([10, 20, 30]), cache });
const result = evalSig(3, env, nodes); // 60
```

**Combine modes**:
- `sum`: Add all terms (Σ terms)
- `average`: Mean of all terms ((Σ terms) / count)
- `min`: Minimum value across all terms
- `max`: Maximum value across all terms
- `first`: First term in sorted order
- `last`: Last term in sorted order

**Key semantics**:
- Empty bus (no terms) returns `default` value (or 0)
- Single term returns that term directly (no combine needed)
- All terms evaluated before combining (no short-circuit)
- Terms array is pre-sorted by compiler (runtime never re-sorts)

**Custom default value**:
```typescript
{
  kind: "busCombine",
  type: { world: "signal", domain: "float" },
  busIndex: 0,
  terms: [],
  combine: { mode: "sum", default: 100 }, // Return 100 when empty
}
```

### Debug Tracing

```typescript
import type { DebugSink } from "./DebugSink";

// Create debug sink to trace bus combine operations
const debug: DebugSink = {
  traceBusCombine: (info) => {
    console.log(`Bus ${info.busIndex}: ${info.mode}(${info.termValues}) = ${info.result}`);
  },
};

const env = createSigEnv({ tAbsMs: 0, constPool, cache, debug });

// Evaluating a busCombine node will now log:
// "Bus 0: sum([10, 20, 30]) = 60"
```

**Zero overhead when disabled**: Debug tracing has no performance impact when `debug` is undefined or when specific trace methods are not provided.

## Cache Behavior

The cache uses a stamp-based invalidation strategy:

```typescript
// Cache structure:
interface SigFrameCache {
  frameId: number; // Current frame ID (starts at 1)
  value: Float64Array; // Cached values
  stamp: Uint32Array; // Frame stamps (when each value was computed)
  validMask: Uint8Array; // Future: for non-number types
}

// Cache hit detection:
if (stamp[sigId] === frameId) {
  return value[sigId]; // O(1) cache hit
}

// Cache miss: evaluate and write
value[sigId] = evaluateNode(node);
stamp[sigId] = frameId;
```

**Key properties:**
- Cache hits are O(1) array lookups
- No array clearing on new frame (just increment frameId)
- Shared subexpressions automatically cached (diamond dependencies)
- Frame IDs start at 1 to avoid collision with initial Uint32Array values (0)

## Performance Characteristics

- **Cache hit**: <10ns (single array lookup)
- **Cache miss**: O(1) + recursive evaluation of dependencies
- **DAG evaluation**: O(N) where N = number of nodes (each evaluated at most once per frame)
- **Memory**: O(N) for node storage + O(N) for cache
- **Short-circuit**: Only taken branch evaluated (performance + safety)

**No allocations in hot path** - all data structures are pre-allocated typed arrays.

## Supported Node Kinds

### Implemented (Sprint 1-3)

- **const**: Read from const pool
- **timeAbsMs**: Absolute player time (milliseconds)
- **map**: Apply unary function (sin, cos, abs, floor, etc.)
- **zip**: Apply binary function (add, sub, mul, div, min, max, etc.)
- **select**: Conditional branching with short-circuit semantics (Sprint 2)
- **inputSlot**: Reference external values from slots (Sprint 2)
- **busCombine**: Aggregate bus publishers with combine modes (Sprint 3)

### Future Sprints

- **timeModelMs**: Model time after transformation (Sprint 4)
- **phase01**: Phase 0..1 for cyclic time models (Sprint 4)
- **wrapEvent**: Wrap event trigger for cyclic time (Sprint 4)
- **transform**: Adapter/lens chains (Sprint 5)
- **stateful**: integrate, delay, sampleHold (Sprint 6)
- **closureBridge**: Gradual migration fallback (Sprint 7)

## Adding New Node Kinds

To add support for a new node kind:

1. **Define IR type** in `src/editor/compiler/ir/signalExpr.ts`:
   ```typescript
   export interface SignalExprMyNode {
     kind: "myNode";
     type: TypeDesc;
     // ... node-specific fields
   }
   ```

2. **Add to union type**:
   ```typescript
   export type SignalExprIR =
     | SignalExprConst
     | ... existing kinds ...
     | SignalExprMyNode; // Add here
   ```

3. **Implement evaluator** in `SigEvaluator.ts`:
   ```typescript
   case "myNode":
     result = evalMyNode(node, env, nodes);
     break;
   ```

4. **Add tests** in `__tests__/SigEvaluator.test.ts`:
   ```typescript
   describe("evalSig - myNode nodes", () => {
     it("evaluates myNode correctly", () => {
       // ... test implementation
     });
   });
   ```

## Error Handling

The evaluator throws clear errors for:

- **Invalid sigId**: `"Invalid sigId: 99 (nodes length: 10)"`
- **Out-of-bounds constId**: `"Invalid constId: 5 (pool has 3 numbers)"`
- **Unknown node kind**: `"Unknown signal node kind: foo"`
- **Unsupported node kind**: `"Signal node kind 'busCombine' not yet implemented (future sprint)"`

All errors are synchronous and should be caught at the caller site.

## Integration with Compiler

The runtime consumes IR emitted by the compiler:

```
Block (user code)
  ↓ (compile)
SignalExpr IR (DAG of nodes)
  ↓ (evaluate)
Runtime values
```

**Current status**:
- IR types: ✅ Defined in `src/editor/compiler/ir/signalExpr.ts`
- Runtime: ✅ Sprint 1-3 complete (core evaluator + select/inputSlot/busCombine)
- Compiler: ⏳ Sprint 6+ (block migration to IR emission)

## References

- **Sprint 1 Plan**: `.agent_planning/signalexpr-runtime/PLAN-20251225-190000.md`
- **Sprint 2 Plan**: `.agent_planning/signalexpr-runtime/SPRINT-02-select-inputSlot.md`
- **Sprint 3 Plan**: `.agent_planning/signalexpr-runtime/SPRINT-03-busCombine.md`
- **Definition of Done**: `.agent_planning/signalexpr-runtime/DOD-20251225-190000.md`
- **IR Schema**: `design-docs/12-Compiler-Final/02-IR-Schema.md`
- **SignalExpr Spec**: `design-docs/12-Compiler-Final/12-SignalExpr.md`

## Testing

Run tests:
```bash
pnpm test src/editor/runtime/signal-expr
```

Coverage target: ≥80% for all evaluator, cache, and opcode files.

**Test coverage (Sprint 3)**:
- 79 tests passing
- Cache infrastructure (creation, hits, misses, frame advancement)
- Node evaluation (const, timeAbsMs, map, zip, select, inputSlot, busCombine)
- Cache behavior (memoization, invalidation, shared subexpressions)
- Short-circuit semantics (verify untaken branches not evaluated)
- External input resolution (present/missing slots, NaN propagation)
- Bus combine modes (sum, average, min, max, first, last)
- Debug tracing (enabled/disabled, zero overhead)
- DAG composition (nested nodes, diamond dependencies)
- Error handling (invalid sigId, unknown node kinds)

## Next Steps

- **Sprint 4**: Add `timeModelMs`, `phase01`, `wrapEvent` nodes (time model support)
- **Sprint 5**: Add `transform` nodes (adapter/lens execution)
- **Sprint 6**: Add `stateful` nodes (integrate, delay, sampleHold)
- **Sprint 7+**: Migrate block compilers to emit IR

---

**Status**: Sprint 3 Complete (BusCombine Nodes)
**Date**: 2025-12-26
