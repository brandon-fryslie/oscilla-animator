# Phase 5: FieldExpr + Materialization - Complete Handoff Document

**Mission:** Replace field closures with FieldExpr DAG and implement lazy materialization.

**You are building the field system.** Fields are arrays of values - one per element in a domain. Unlike signals (one value per frame), fields need efficient buffer management.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: FieldHandle System](#topic-1-fieldhandle-system)
3. [Topic 2: Field Materializer](#topic-2-field-materializer)
4. [Topic 3: Broadcast/Reduce Bridge](#topic-3-broadcastreduce-bridge)
5. [Topic 4: Field Bus Combine](#topic-4-field-bus-combine)
6. [Topic 5: Render Sink Materialization](#topic-5-render-sink-materialization)
7. [Topic 6: Block Compilers for Fields](#topic-6-block-compilers-for-fields)
8. [Testing Strategy](#testing-strategy)
9. [Verification Checklist](#verification-checklist)

---

## Philosophy

### Fields Are Lazy

Fields are NOT arrays. They are **recipes for producing arrays**:

```typescript
// WRONG: Field is an array
const positions: Float32Array = computePositions();

// RIGHT: Field is a handle (recipe)
const positions: FieldHandle = {
  kind: 'Op',
  op: FieldOp.GridPositions,
  args: [domainFieldId],
  type: vec2Type
};

// Arrays only exist after materialization
const positionBuffer: Float32Array = materialize(positions, domain);
```

### Materialization is Centralized

All array production happens in ONE place: the Materializer. This enables:
- Buffer pooling (reuse allocations)
- Fusion (combine multiple ops into one loop)
- Debug tracing (know exactly when arrays are produced)

---

## Topic 1: FieldHandle System

### FieldHandle Type

```typescript
export type FieldHandle =
  // Constant value broadcast to all elements
  | { kind: 'Const'; constId: number; type: TypeDesc }

  // Result of an operation
  | { kind: 'Op'; op: FieldOp; args: readonly FieldExprId[]; type: TypeDesc }

  // Zip two fields element-wise
  | { kind: 'Zip'; op: FieldZipOp; a: FieldExprId; b: FieldExprId; type: TypeDesc }

  // Broadcast a signal to all elements
  | { kind: 'Broadcast'; sigId: SigExprId; domainId: number; type: TypeDesc }

  // Combine multiple fields (from bus)
  | { kind: 'Combine'; mode: CombineMode; terms: readonly FieldExprId[]; type: TypeDesc }

  // Source field from domain
  | { kind: 'Source'; sourceTag: string; domainId: number; type: TypeDesc };
```

### Field Evaluation (Returns Handle, Not Array)

```typescript
function evalFieldHandle(
  fieldId: FieldExprId,
  env: FieldEnv,
  nodes: FieldExprIR[]
): FieldHandle {
  // Check cache
  if (env.cache.stamp[fieldId] === env.cache.frameId) {
    return env.cache.handles[fieldId];
  }

  const node = nodes[fieldId];
  let handle: FieldHandle;

  switch (node.kind) {
    case 'const':
      handle = { kind: 'Const', constId: node.constId, type: node.type };
      break;

    case 'map':
      handle = {
        kind: 'Op',
        op: fnRefToFieldOp(node.fn),
        args: [node.src],
        type: node.type
      };
      break;

    case 'zip':
      handle = {
        kind: 'Zip',
        op: fnRefToFieldZipOp(node.fn),
        a: node.a,
        b: node.b,
        type: node.type
      };
      break;

    case 'sampleSignal':
      handle = {
        kind: 'Broadcast',
        sigId: node.signalSlot,
        domainId: node.domainId,
        type: node.type
      };
      break;

    case 'busCombine':
      handle = {
        kind: 'Combine',
        mode: node.combine.mode,
        terms: node.terms,
        type: node.type
      };
      break;

    case 'inputSlot':
      handle = env.slotHandles.read(node.slot);
      break;

    default:
      throw new Error(`Unknown field kind: ${(node as any).kind}`);
  }

  // Cache
  env.cache.handles[fieldId] = handle;
  env.cache.stamp[fieldId] = env.cache.frameId;

  return handle;
}
```

---

## Topic 2: Field Materializer

### Materializer Interface

```typescript
interface FieldMaterializer {
  /**
   * Materialize a field to a typed array.
   * Uses buffer pool for allocation.
   */
  materialize(request: MaterializationRequest): ArrayBufferView;

  /**
   * Release buffers back to pool at frame end.
   */
  releaseFrame(): void;
}

interface MaterializationRequest {
  fieldId: FieldExprId;
  domainId: number;
  format: BufferFormat;
  layout: BufferLayout;
  usageTag: string;  // For debugging: 'pos', 'radius', etc.
}

type BufferFormat =
  | 'f32'
  | 'f64'
  | 'i32'
  | 'u32'
  | 'u8'
  | 'vec2f32'
  | 'vec3f32'
  | 'vec4f32'
  | 'rgba8';
```

### Buffer Pool

```typescript
class FieldBufferPool {
  private pools: Map<string, ArrayBufferView[]> = new Map();
  private inUse: Map<string, ArrayBufferView[]> = new Map();

  alloc(format: BufferFormat, count: number): ArrayBufferView {
    const key = `${format}:${count}`;
    const pool = this.pools.get(key) ?? [];

    if (pool.length > 0) {
      const buffer = pool.pop()!;
      this.trackInUse(key, buffer);
      return buffer;
    }

    // Allocate new
    const buffer = allocateBuffer(format, count);
    this.trackInUse(key, buffer);
    return buffer;
  }

  releaseAll(): void {
    for (const [key, buffers] of this.inUse) {
      const pool = this.pools.get(key) ?? [];
      pool.push(...buffers);
      this.pools.set(key, pool);
    }
    this.inUse.clear();
  }

  private trackInUse(key: string, buffer: ArrayBufferView): void {
    const list = this.inUse.get(key) ?? [];
    list.push(buffer);
    this.inUse.set(key, list);
  }
}
```

### Materialization Algorithm

```typescript
function materialize(
  request: MaterializationRequest,
  env: MaterializerEnv
): ArrayBufferView {
  // 1. Check cache
  const cacheKey = `${request.fieldId}:${request.domainId}:${request.format}`;
  const cached = env.cache.get(cacheKey);
  if (cached) return cached;

  // 2. Get handle
  const handle = evalFieldHandle(request.fieldId, env.fieldEnv, env.fieldNodes);

  // 3. Get domain count
  const N = getDomainCount(env, request.domainId);

  // 4. Allocate buffer
  const out = env.pool.alloc(request.format, N);

  // 5. Fill buffer based on handle kind
  fillBuffer(handle, out, N, env);

  // 6. Cache
  env.cache.set(cacheKey, out);

  // 7. Debug trace
  if (env.debug) {
    env.debug.traceMaterialization({
      fieldId: request.fieldId,
      domainId: request.domainId,
      count: N,
      format: request.format,
      usage: request.usageTag
    });
  }

  return out;
}
```

### Fill Buffer Implementation

```typescript
function fillBuffer(
  handle: FieldHandle,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  switch (handle.kind) {
    case 'Const': {
      const value = getConstNumber(handle.constId);
      const arr = out as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = value;
      }
      break;
    }

    case 'Broadcast': {
      const value = evalSig(handle.sigId, env.sigEnv, env.sigNodes);
      const arr = out as Float32Array;
      for (let i = 0; i < N; i++) {
        arr[i] = value;
      }
      break;
    }

    case 'Op': {
      fillBufferOp(handle, out, N, env);
      break;
    }

    case 'Zip': {
      fillBufferZip(handle, out, N, env);
      break;
    }

    case 'Combine': {
      fillBufferCombine(handle, out, N, env);
      break;
    }

    case 'Source': {
      fillBufferSource(handle, out, N, env);
      break;
    }
  }
}
```

---

## Topic 3: Broadcast/Reduce Bridge

### Broadcast: Signal -> Field

```typescript
// In field evaluation
case 'sampleSignal': {
  // Create a Broadcast handle - actual sampling happens at materialization
  handle = {
    kind: 'Broadcast',
    sigId: node.signalSlot,
    domainId: env.domainId,
    type: node.type
  };
  break;
}

// At materialization time
case 'Broadcast': {
  const signalValue = evalSig(handle.sigId, env.sigEnv, env.sigNodes);
  const arr = out as Float32Array;
  // Same value for all elements
  for (let i = 0; i < N; i++) {
    arr[i] = signalValue;
  }
  break;
}
```

### Reduce: Field -> Signal

```typescript
// This is a signal operation that depends on a field
function evalReduceFieldToSig(
  node: ReduceNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // Materialize the field first
  const fieldBuffer = materialize({
    fieldId: node.fieldId,
    domainId: node.domainId,
    format: 'f32',
    layout: 'scalar',
    usageTag: 'reduce'
  }, env.materializerEnv);

  const arr = fieldBuffer as Float32Array;
  const N = arr.length;

  // Apply reduction
  switch (node.reduceFn) {
    case 'sum': {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += arr[i];
      return sum;
    }
    case 'average': {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += arr[i];
      return N > 0 ? sum / N : 0;
    }
    case 'min': {
      let min = Infinity;
      for (let i = 0; i < N; i++) if (arr[i] < min) min = arr[i];
      return min;
    }
    case 'max': {
      let max = -Infinity;
      for (let i = 0; i < N; i++) if (arr[i] > max) max = arr[i];
      return max;
    }
  }
}
```

### Key Rule: Explicit World Switching

There is NO implicit conversion between signals and fields:
- `broadcastSigToField` is explicit in the IR
- `reduceFieldToSig` is explicit in the IR

The compiler must emit these operations. The runtime enforces that worlds don't mix.

---

## Topic 4: Field Bus Combine

### Field Combine is Cheap

Field bus combine produces a new FieldHandle, NOT arrays. Arrays are only produced at materialization.

```typescript
case 'busCombine': {
  // Just create a handle - no work done yet
  handle = {
    kind: 'Combine',
    mode: node.combine.mode,
    terms: node.terms,
    type: node.type
  };
  break;
}
```

### Combine at Materialization

```typescript
function fillBufferCombine(
  handle: CombineHandle,
  out: ArrayBufferView,
  N: number,
  env: MaterializerEnv
): void {
  const arr = out as Float32Array;
  const { terms, mode } = handle;

  // Materialize each term
  const termBuffers = terms.map(t =>
    materialize({
      fieldId: t,
      domainId: env.domainId,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'combine-term'
    }, env) as Float32Array
  );

  // Combine element-wise
  for (let i = 0; i < N; i++) {
    switch (mode) {
      case 'sum':
        arr[i] = termBuffers.reduce((acc, b) => acc + b[i], 0);
        break;
      case 'average':
        arr[i] = termBuffers.reduce((acc, b) => acc + b[i], 0) / terms.length;
        break;
      case 'min':
        arr[i] = Math.min(...termBuffers.map(b => b[i]));
        break;
      case 'max':
        arr[i] = Math.max(...termBuffers.map(b => b[i]));
        break;
      case 'last':
        arr[i] = termBuffers[termBuffers.length - 1][i];
        break;
    }
  }
}
```

---

## Topic 5: Render Sink Materialization

### Render Sink Requests

Render sinks declare what buffers they need:

```typescript
interface RenderSinkInputs {
  domain: ValueSlot;          // Domain handle
  pos: FieldExprId;           // Position field
  size?: FieldExprId;         // Size field (optional)
  fill?: FieldExprId;         // Color field (optional)
  opacity?: SigExprId;        // Opacity signal (optional)
}

interface RenderSinkMaterializationPlan {
  sinkId: number;
  requests: MaterializationRequest[];
}
```

### Materialization Plan Execution

```typescript
function executeRenderSink(
  sink: RenderSinkIR,
  plan: RenderSinkMaterializationPlan,
  env: RenderEnv
): RenderOutput {
  // 1. Materialize all required buffers
  const buffers: Record<string, ArrayBufferView> = {};

  for (const req of plan.requests) {
    buffers[req.usageTag] = materialize(req, env.materializerEnv);
  }

  // 2. Evaluate any signal uniforms
  const uniforms: Record<string, number> = {};
  for (const [name, sigId] of Object.entries(sink.signalUniforms)) {
    uniforms[name] = evalSig(sigId, env.sigEnv, env.sigNodes);
  }

  // 3. Build render output
  return {
    kind: sink.sinkType,
    instanceCount: getDomainCount(env, sink.domainId),
    buffers,
    uniforms
  };
}
```

### Example: RenderInstances2D

```typescript
const renderInstances2DPlan: RenderSinkMaterializationPlan = {
  sinkId: 0,
  requests: [
    { fieldId: posFieldId, domainId: 0, format: 'vec2f32', layout: 'vec2', usageTag: 'pos' },
    { fieldId: sizeFieldId, domainId: 0, format: 'f32', layout: 'scalar', usageTag: 'size' },
    { fieldId: fillFieldId, domainId: 0, format: 'rgba8', layout: 'color', usageTag: 'fill' }
  ]
};
```

---

## Topic 6: Block Compilers for Fields

### Domain Block Compiler

```typescript
const GridDomainCompiler: BlockCompiler = {
  compile(block, inputs, builder) {
    const rows = block.params.rows;
    const cols = block.params.cols;
    const n = rows * cols;

    // Create domain
    const domainSlot = builder.domainFromN(n);

    // Create position field from domain
    const posFieldId = builder.fieldSource('gridPositions', domainSlot);

    return {
      outputs: [domainSlot, posFieldId]
    };
  }
};
```

### Field Math Block Compiler

```typescript
const FieldAddCompiler: BlockCompiler = {
  compile(block, inputs, builder) {
    const a = builder.fieldFromSlot(inputs[0]);
    const b = builder.fieldFromSlot(inputs[1]);

    const result = builder.fieldZip(a, b, { opcode: OpCode.Add });

    return {
      outputs: [result]
    };
  }
};
```

### Hash Field Compiler

```typescript
const FieldHash01Compiler: BlockCompiler = {
  compile(block, inputs, builder) {
    const domain = builder.domainFromSlot(inputs[0]);
    const seed = block.params.seed;

    // Hash by element ID
    const hashField = builder.fieldSource('hash01ById', domain, { seed });

    return {
      outputs: [hashField]
    };
  }
};
```

---

## Testing Strategy

### FieldHandle Tests

```typescript
describe('FieldHandle', () => {
  it('creates const handle', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 }
    ];
    const env = createFieldEnv();

    const handle = evalFieldHandle(0, env, nodes);
    expect(handle.kind).toBe('Const');
    expect(handle.constId).toBe(0);
  });

  it('creates zip handle (no array yet)', () => {
    const nodes: FieldExprIR[] = [
      { kind: 'const', type: numberType, constId: 0 },
      { kind: 'const', type: numberType, constId: 1 },
      { kind: 'zip', type: numberType, a: 0, b: 1, fn: { opcode: OpCode.Add } }
    ];
    const env = createFieldEnv();

    const handle = evalFieldHandle(2, env, nodes);
    expect(handle.kind).toBe('Zip');
  });
});
```

### Materialization Tests

```typescript
describe('Materializer', () => {
  it('materializes const to uniform array', () => {
    const handle: FieldHandle = { kind: 'Const', constId: 0, type: numberType };
    const env = createMaterializerEnv({ consts: [42], domainCount: 5 });

    const buffer = materialize({
      fieldId: 0,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test'
    }, env) as Float32Array;

    expect(buffer.length).toBe(5);
    expect(buffer[0]).toBe(42);
    expect(buffer[4]).toBe(42);
  });

  it('materializes zip element-wise', () => {
    // Field A: [1, 2, 3]
    // Field B: [10, 20, 30]
    // Result:  [11, 22, 33]
    const env = createMaterializerEnv({
      handles: [
        { kind: 'Source', sourceTag: 'testA', domainId: 0, type: numberType },
        { kind: 'Source', sourceTag: 'testB', domainId: 0, type: numberType },
        { kind: 'Zip', op: 'Add', a: 0, b: 1, type: numberType }
      ],
      sources: {
        testA: new Float32Array([1, 2, 3]),
        testB: new Float32Array([10, 20, 30])
      },
      domainCount: 3
    });

    const buffer = materialize({
      fieldId: 2,
      domainId: 0,
      format: 'f32',
      layout: 'scalar',
      usageTag: 'test'
    }, env) as Float32Array;

    expect(Array.from(buffer)).toEqual([11, 22, 33]);
  });
});
```

### Buffer Pool Tests

```typescript
describe('BufferPool', () => {
  it('reuses buffers', () => {
    const pool = new FieldBufferPool();

    const buf1 = pool.alloc('f32', 100);
    pool.releaseAll();
    const buf2 = pool.alloc('f32', 100);

    expect(buf1).toBe(buf2); // Same buffer reused
  });
});
```

---

## Verification Checklist

### FieldHandle System
- [ ] All handle kinds defined
- [ ] Handle evaluation returns handle (not array)
- [ ] Per-frame handle caching works

### Materializer
- [ ] All handle kinds materialize correctly
- [ ] Buffer pool allocates and reuses
- [ ] Per-frame buffer cache works
- [ ] Debug tracing for materializations

### Broadcast/Reduce
- [ ] broadcastSigToField works
- [ ] reduceFieldToSig works (sum, avg, min, max)
- [ ] Explicit world switching enforced

### Field Bus Combine
- [ ] Combine creates handle (cheap)
- [ ] Combine materializes correctly
- [ ] Deterministic term ordering

### Render Sink Materialization
- [ ] Materialization plans generated
- [ ] Plans execute correctly
- [ ] Buffers passed to renderer

### Block Compilers
- [ ] Domain blocks migrated
- [ ] Field math blocks migrated
- [ ] Hash/random blocks migrated

---

## Success Criteria

Phase 5 is complete when:

1. Fields are represented as FieldHandle (not arrays)
2. Materialization is centralized with buffer pooling
3. Broadcast/reduce bridge ops work
4. Render sinks get correct buffers
5. Key field blocks are migrated
