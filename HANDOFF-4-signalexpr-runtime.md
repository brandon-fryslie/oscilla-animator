# Phase 4: SignalExpr Runtime - Complete Handoff Document

**Mission:** Replace signal closures with SignalExpr DAG evaluation. Gradual migration with closure fallback.

**You are building the signal evaluator.** When this phase is complete, signals are no longer opaque closures - they're inspectable DAGs that can be traced, cached, and ported to Rust.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: Core Signal Evaluator](#topic-1-core-signal-evaluator)
3. [Topic 2: Bus Combine](#topic-2-bus-combine)
4. [Topic 3: Transform Execution](#topic-3-transform-execution)
5. [Topic 4: Stateful Operations](#topic-4-stateful-operations)
6. [Topic 5: Closure Bridge](#topic-5-closure-bridge)
7. [Topic 6: Block Compilers Migration](#topic-6-block-compilers-migration)
8. [Testing Strategy](#testing-strategy)
9. [Verification Checklist](#verification-checklist)

---

## Philosophy

### Signals as Data, Not Closures

The evaluator interprets SignalExpr nodes to produce values. No JavaScript functions are called directly - everything goes through the evaluator.

```typescript
// Old: Closure (opaque)
const signal = (t: number) => Math.sin(t * 0.001);

// New: DAG (inspectable)
const dag = [
  { kind: 'timeAbsMs', type: numberType },      // id: 0
  { kind: 'const', type: numberType, constId: 0 }, // id: 1, value: 0.001
  { kind: 'zip', type: numberType, a: 0, b: 1, fn: { opcode: OpCode.Mul } }, // id: 2
  { kind: 'map', type: numberType, src: 2, fn: { opcode: OpCode.Sin } }      // id: 3
];
```

### Per-Frame Caching

Every signal is evaluated at most once per frame. The cache is the key to performance:

```typescript
// Cache hit: O(1) array lookup
if (cache.stamp[sigId] === frameId) {
  return cache.value[sigId];
}
```

---

## Topic 1: Core Signal Evaluator

### The Evaluator Interface

```typescript
interface SigEvaluator {
  /** Sample a signal at current time. Returns the scalar value. */
  sample(id: SigExprId, env: SigEnv): number;

  /** Sample into a pre-allocated buffer (for vec2/vec3/etc). */
  sampleInto(id: SigExprId, env: SigEnv, out: Float32Array): void;

  /** Invalidate per-frame cache. Call at frame start. */
  newFrame(frameId: number): void;
}
```

### The Evaluation Environment

```typescript
interface SigEnv {
  // Time
  readonly tAbsMs: number;      // Monotonic player time
  readonly tModelMs: number;    // Time after TimeModel mapping
  readonly phase01: number;     // Phase for cyclic models

  // External context
  readonly runtimeCtx: RuntimeCtx;

  // Slot values (for inputSlot nodes)
  readonly slotValues: SlotValueReader;

  // Persistent state (for stateful ops)
  readonly state: StateBuffer;

  // Per-frame cache
  readonly cache: SigFrameCache;

  // Optional debug sink
  readonly debug?: DebugSink;
}
```

### Per-Frame Cache Structure

```typescript
interface SigFrameCache {
  frameId: number;

  // Fast path for numbers (most signals)
  value: Float64Array;     // value[sigId] = result
  stamp: Uint32Array;      // stamp[sigId] = frameId when computed

  // For non-number types
  vec2?: Float32Array;     // Packed: [x0, y0, x1, y1, ...]
  color?: Uint32Array;     // Packed RGBA
  validMask: Uint8Array;   // 0 = unset, 1 = valid
}
```

### Core Evaluation Algorithm

```typescript
function evalSig(sigId: SigExprId, env: SigEnv, nodes: SignalExprIR[]): number {
  // 1. Check cache
  if (env.cache.stamp[sigId] === env.cache.frameId) {
    return env.cache.value[sigId];
  }

  // 2. Get node
  const node = nodes[sigId];
  let result: number;

  // 3. Evaluate based on kind
  switch (node.kind) {
    case 'const':
      result = getConstNumber(node.constId);
      break;

    case 'timeAbsMs':
      result = env.tAbsMs;
      break;

    case 'timeModelMs':
      result = env.tModelMs;
      break;

    case 'phase01':
      result = env.phase01;
      break;

    case 'inputSlot':
      result = env.slotValues.readNumber(node.slot);
      break;

    case 'map':
      result = evalMap(node, env, nodes);
      break;

    case 'zip':
      result = evalZip(node, env, nodes);
      break;

    case 'select':
      result = evalSelect(node, env, nodes);
      break;

    case 'transform':
      result = evalTransform(node, env, nodes);
      break;

    case 'busCombine':
      result = evalBusCombine(node, env, nodes);
      break;

    case 'stateful':
      result = evalStateful(node, env, nodes);
      break;

    default:
      throw new Error(`Unknown signal kind: ${(node as any).kind}`);
  }

  // 4. Write cache
  env.cache.value[sigId] = result;
  env.cache.stamp[sigId] = env.cache.frameId;

  // 5. Debug trace (optional)
  if (env.debug) {
    env.debug.traceSignal(sigId, result);
  }

  return result;
}
```

### Map Evaluation

```typescript
function evalMap(node: MapNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const src = evalSig(node.src, env, nodes);
  return applyPureFn(node.fn, src);
}

function applyPureFn(fn: PureFnRef, input: number): number {
  switch (fn.opcode) {
    case OpCode.Sin: return Math.sin(input);
    case OpCode.Cos: return Math.cos(input);
    case OpCode.Abs: return Math.abs(input);
    case OpCode.Floor: return Math.floor(input);
    case OpCode.Ceil: return Math.ceil(input);
    // ... all pure ops
    default:
      throw new Error(`Unknown opcode: ${fn.opcode}`);
  }
}
```

### Zip Evaluation

```typescript
function evalZip(node: ZipNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const a = evalSig(node.a, env, nodes);
  const b = evalSig(node.b, env, nodes);
  return applyBinaryFn(node.fn, a, b);
}

function applyBinaryFn(fn: PureFnRef, a: number, b: number): number {
  switch (fn.opcode) {
    case OpCode.Add: return a + b;
    case OpCode.Sub: return a - b;
    case OpCode.Mul: return a * b;
    case OpCode.Div: return b !== 0 ? a / b : 0;
    case OpCode.Min: return Math.min(a, b);
    case OpCode.Max: return Math.max(a, b);
    case OpCode.Lerp: return a + (b - a) * 0.5; // Needs third arg for full lerp
    // ... all binary ops
    default:
      throw new Error(`Unknown binary opcode: ${fn.opcode}`);
  }
}
```

---

## Topic 2: Bus Combine

### Bus Combine Evaluation

Bus combine is just another node kind. The terms are already sorted by the compiler.

```typescript
function evalBusCombine(node: BusCombineNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const { terms, combine } = node;

  // Empty bus: return silent value
  if (terms.length === 0) {
    return combine.default ?? 0;
  }

  // Single term: no combine needed
  if (terms.length === 1) {
    return evalSig(terms[0], env, nodes);
  }

  // Evaluate all terms (order is deterministic from compiler)
  const values = terms.map(t => evalSig(t, env, nodes));

  // Combine
  switch (combine.mode) {
    case 'sum':
      return values.reduce((acc, v) => acc + v, 0);

    case 'average':
      return values.reduce((acc, v) => acc + v, 0) / values.length;

    case 'min':
      return Math.min(...values);

    case 'max':
      return Math.max(...values);

    case 'last':
      return values[values.length - 1];

    case 'first':
      return values[0];

    default:
      throw new Error(`Unknown combine mode: ${combine.mode}`);
  }
}
```

### Debug Tracing for Combine

```typescript
if (env.debug) {
  env.debug.traceBusCombine({
    busIndex: node.busIndex,
    termValues: terms.map((t, i) => ({
      termId: t,
      value: values[i]
    })),
    result,
    mode: combine.mode
  });
}
```

---

## Topic 3: Transform Execution

### Transform Chain Evaluation

```typescript
function evalTransform(node: TransformNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const src = evalSig(node.src, env, nodes);
  const chain = env.transformTable.chains[node.chain];

  let value = src;
  for (const step of chain.steps) {
    value = applyTransformStep(step, value, env);
  }

  return value;
}
```

### Transform Step Application

```typescript
function applyTransformStep(step: TransformStepIR, value: number, env: SigEnv): number {
  switch (step.kind) {
    case 'scaleBias':
      return value * step.scale + step.bias;

    case 'normalize':
      if (step.mode === '0..1') {
        return Math.max(0, Math.min(1, value));
      } else {
        return Math.max(-1, Math.min(1, value));
      }

    case 'quantize':
      return Math.round(value / step.step) * step.step;

    case 'ease':
      return applyEasing(step.curveId, value);

    case 'map':
      return applyPureFn(step.fn, value);

    case 'slew':
      return applySlewStep(step, value, env);

    default:
      throw new Error(`Unknown transform step: ${(step as any).kind}`);
  }
}
```

### Stateful Transform (Slew)

```typescript
function applySlewStep(step: SlewStep, target: number, env: SigEnv): number {
  const current = env.state.f64[step.stateOffset];
  const rate = step.rate;
  const dt = env.runtimeCtx.deltaSec;

  // Exponential approach
  const alpha = 1 - Math.exp(-rate * dt);
  const next = current + (target - current) * alpha;

  // Update state
  env.state.f64[step.stateOffset] = next;

  return next;
}
```

---

## Topic 4: Stateful Operations

### State Buffer Structure

```typescript
interface StateBuffer {
  f64: Float64Array;   // For numbers
  f32: Float32Array;   // For floats
  i32: Int32Array;     // For integers
}
```

### Integrate Operation

```typescript
function evalIntegrate(node: StatefulNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;
  const current = env.state.f64[node.stateOffset];
  const dt = env.runtimeCtx.deltaSec;

  // Euler integration
  const next = current + input * dt;

  // Update state
  env.state.f64[node.stateOffset] = next;

  return next;
}
```

### Delay Operation

```typescript
function evalDelayMs(node: StatefulNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;
  const delayMs = node.params?.delayMs ?? 100;

  // Ring buffer implementation
  const bufferOffset = node.stateOffset;
  const bufferSize = node.params?.bufferSize ?? 64;

  // Read from delay buffer
  const readIdx = (env.state.i32[bufferOffset] + bufferSize - 1) % bufferSize;
  const result = env.state.f64[bufferOffset + 1 + readIdx];

  // Write current value to buffer
  const writeIdx = env.state.i32[bufferOffset];
  env.state.f64[bufferOffset + 1 + writeIdx] = input;
  env.state.i32[bufferOffset] = (writeIdx + 1) % bufferSize;

  return result;
}
```

### Sample-Hold Operation

```typescript
function evalSampleHold(node: StatefulNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const input = node.input !== undefined ? evalSig(node.input, env, nodes) : 0;
  const trigger = evalSig(node.params!.trigger as SigExprId, env, nodes);

  const held = env.state.f64[node.stateOffset];
  const lastTrigger = env.state.f64[node.stateOffset + 1];

  // Detect rising edge
  if (trigger > 0.5 && lastTrigger <= 0.5) {
    env.state.f64[node.stateOffset] = input;
    env.state.f64[node.stateOffset + 1] = trigger;
    return input;
  }

  env.state.f64[node.stateOffset + 1] = trigger;
  return held;
}
```

---

## Topic 5: Closure Bridge

### Fallback for Unimplemented Ops

During migration, some blocks may not have IR compilers yet. The closure bridge allows gradual migration:

```typescript
function evalClosureBridge(node: ClosureBridgeNode, env: SigEnv): number {
  // TEMPORARY: Call legacy closure
  // This will be removed once all blocks are migrated
  const closure = env.closureRegistry.get(node.closureId);
  if (!closure) {
    throw new Error(`Missing closure: ${node.closureId}`);
  }

  return closure(env.tAbsMs, env.runtimeCtx);
}
```

### Node Kind for Bridge

```typescript
// Add to SignalExprIR union (TEMPORARY)
| {
    kind: 'closureBridge';
    type: TypeDesc;
    closureId: string;
    inputSlots: ValueSlot[];
  }
```

### Migration Tracking

```typescript
const MIGRATED_BLOCKS = new Set([
  'Add', 'Sub', 'Mul', 'Div',
  'Sin', 'Cos', 'Tan',
  'Abs', 'Floor', 'Ceil',
  // Add as you migrate
]);

function shouldUseIR(blockType: string): boolean {
  return MIGRATED_BLOCKS.has(blockType);
}
```

---

## Topic 6: Block Compilers Migration

### Migration Order

1. **Pure math blocks** (Add, Mul, Sin, etc.) - No state, no complexity
2. **Time blocks** (PhaseClock, etc.) - Use canonical time signals
3. **Stateful blocks** (Integrate, Delay, Slew) - Explicit state

### Example: PhaseClock Migration

```typescript
// Before: Closure
const PhaseClockCompilerOld = {
  compile(block, inputs, env) {
    const period = block.params.period;
    return {
      phase: (t: number) => (t / period) % 1
    };
  }
};

// After: IR
const PhaseClockCompilerNew: BlockCompiler = {
  compile(block, inputs, builder) {
    const periodConst = builder.sigConst(block.params.period);
    const t = builder.sigTimeAbsMs();

    // t / period
    const divided = builder.sigZip(t, periodConst, { opcode: OpCode.Div });

    // mod 1 (using fract)
    const phase = builder.sigMap(divided, { opcode: OpCode.Fract });

    return {
      outputs: [phase]
    };
  }
};
```

### Validation During Migration

```typescript
function validateMigration(blockType: string, closureResult: number, irResult: number): void {
  const epsilon = 1e-10;
  if (Math.abs(closureResult - irResult) > epsilon) {
    console.error(
      `Migration mismatch for ${blockType}: closure=${closureResult}, ir=${irResult}`
    );
  }
}
```

---

## Testing Strategy

### Unit Tests for Evaluator

```typescript
describe('SigEvaluator', () => {
  it('evaluates const correctly', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 }
    ];
    const env = createTestEnv({ consts: [42] });

    expect(evalSig(0, env, nodes)).toBe(42);
  });

  it('evaluates sin(t) correctly', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'timeAbsMs', type: numberType },
      { kind: 'map', type: numberType, src: 0, fn: { opcode: OpCode.Sin } }
    ];
    const env = createTestEnv({ tAbsMs: Math.PI / 2 * 1000 });

    expect(evalSig(1, env, nodes)).toBeCloseTo(1, 5);
  });

  it('caches results within frame', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'timeAbsMs', type: numberType }
    ];
    const env = createTestEnv({ tAbsMs: 1000 });

    evalSig(0, env, nodes);
    env.tAbsMs = 2000; // Change time (but cache should hold)

    expect(evalSig(0, env, nodes)).toBe(1000);
  });
});
```

### Bus Combine Tests

```typescript
describe('Bus combine', () => {
  it('sums terms correctly', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 }, // value: 1
      { kind: 'const', type: numberType, constId: 1 }, // value: 2
      { kind: 'const', type: numberType, constId: 2 }, // value: 3
      {
        kind: 'busCombine',
        type: numberType,
        busIndex: 0,
        terms: [0, 1, 2],
        combine: { mode: 'sum' }
      }
    ];
    const env = createTestEnv({ consts: [1, 2, 3] });

    expect(evalSig(3, env, nodes)).toBe(6);
  });
});
```

### Stateful Op Tests

```typescript
describe('Stateful ops', () => {
  it('integrate accumulates over time', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 }, // value: 1
      {
        kind: 'stateful',
        type: numberType,
        op: 'integrate',
        input: 0,
        stateOffset: 0
      }
    ];

    const state = { f64: new Float64Array([0]) };
    const env1 = createTestEnv({ consts: [1], state, deltaSec: 0.1 });

    expect(evalSig(1, env1, nodes)).toBeCloseTo(0.1, 5);

    env1.cache.frameId++; // New frame
    expect(evalSig(1, env1, nodes)).toBeCloseTo(0.2, 5);
  });
});
```

### Migration Comparison Tests

```typescript
describe('Migration validation', () => {
  it('IR matches closure for Add block', () => {
    const patch = createPatchWith('Add', { a: 1, b: 2 });

    const closureResult = runClosureCompiler(patch);
    const irResult = runIRCompiler(patch);

    expect(irResult).toBeCloseTo(closureResult, 10);
  });
});
```

---

## Verification Checklist

### Core Evaluator
- [ ] All node kinds handled
- [ ] Cache works (same frame = same result)
- [ ] Cache invalidates on new frame
- [ ] Debug tracing optional and low-overhead

### Bus Combine
- [ ] All combine modes work (sum, avg, min, max, last, first)
- [ ] Empty bus returns default
- [ ] Term order is deterministic

### Transform Execution
- [ ] All transform steps work
- [ ] Stateful transforms (slew) use StateBuffer
- [ ] Chains compose correctly

### Stateful Ops
- [ ] integrate accumulates
- [ ] delay uses ring buffer
- [ ] sampleHold detects edges
- [ ] slew smooths

### Closure Bridge
- [ ] Fallback works for unmigrated blocks
- [ ] Migration tracking accurate
- [ ] Comparison tests pass

### Block Migration
- [ ] Pure math blocks migrated
- [ ] Time blocks migrated
- [ ] Stateful blocks migrated
- [ ] Each migration validated

---

## Success Criteria

Phase 4 is complete when:

1. SignalExpr evaluator handles all node kinds
2. Per-frame caching works correctly
3. All stateful ops use explicit StateBuffer
4. Closure bridge allows gradual migration
5. At least pure math blocks are fully migrated
6. Migration comparison tests pass
