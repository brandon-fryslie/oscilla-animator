# Phase 7: Debug Infrastructure - Complete Handoff Document

**Mission:** Build power-user debugger with ring buffers, causal links, and trace storage.

**You are building visibility.** When this phase is complete, users can answer "why did this value change?" by tracing causality through the evaluation graph.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: DebugIndex Compilation](#topic-1-debugindex-compilation)
3. [Topic 2: TypeKey Encoding](#topic-2-typekey-encoding)
4. [Topic 3: SpanRing Buffer](#topic-3-spanring-buffer)
5. [Topic 4: ValueRecord Encoding](#topic-4-valuerecord-encoding)
6. [Topic 5: Causal Edge System](#topic-5-causal-edge-system)
7. [Topic 6: Instrumentation Hooks](#topic-6-instrumentation-hooks)
8. [Topic 7: TraceController](#topic-7-tracecontroller)
9. [Testing Strategy](#testing-strategy)
10. [Verification Checklist](#verification-checklist)

---

## Philosophy

### Zero-Allocation Hot Path

Debug infrastructure must not slow down production. This means:
- Ring buffers (pre-allocated, fixed size)
- Dense numeric indices (not strings)
- Typed arrays (not objects)
- No GC pressure in hot path

### Causality is the Killer Feature

The power of this debugger is answering "why?":
- Why did this bus value change?
- Which publishers contributed?
- What transform chain was applied?
- When did the value first appear?

---

## Topic 1: DebugIndex Compilation

### DebugIndex Structure

```typescript
interface DebugIndex {
  // String interning
  strings: string[];
  stringToId: Map<string, number>;

  // Entity mappings
  nodeNames: number[];        // nodeNames[nodeId] -> stringId
  portNames: number[][];      // portNames[nodeId][portIdx] -> stringId
  busNames: number[];         // busNames[busId] -> stringId

  // Provenance arrays
  sigNodeProv: ProvenanceEntry[];
  fieldNodeProv: ProvenanceEntry[];
  transformProv: ProvenanceEntry[];

  // Source mapping
  nodeToEditorBlock: Map<number, { blockId: string; kind: 'primitive' | 'compositeInternal' }>;
  portToEditorSlot: Map<string, { blockId: string; slotId: string }>;
}

interface ProvenanceEntry {
  nodeId: number;
  blockId: number;         // Editor block this came from
  portIndex: number;       // Which port
  compositeDepth: number;  // 0 = top-level, >0 = inside composite
  compositePath: number[]; // Path through composites
}
```

### String Interning

```typescript
class StringInterner {
  private strings: string[] = [];
  private map = new Map<string, number>();

  intern(s: string): number {
    const existing = this.map.get(s);
    if (existing !== undefined) return existing;

    const id = this.strings.length;
    this.strings.push(s);
    this.map.set(s, id);
    return id;
  }

  get(id: number): string {
    return this.strings[id];
  }

  getAll(): string[] {
    return this.strings;
  }
}
```

### Compilation Pass (Pass 11)

```typescript
function pass11DebugIndex(ir: LinkedGraphIR): DebugIndex {
  const interner = new StringInterner();
  const index: DebugIndex = {
    strings: [],
    stringToId: new Map(),
    nodeNames: [],
    portNames: [],
    busNames: [],
    sigNodeProv: [],
    fieldNodeProv: [],
    transformProv: [],
    nodeToEditorBlock: new Map(),
    portToEditorSlot: new Map()
  };

  // Intern node names
  for (const node of ir.nodes) {
    const nameId = interner.intern(node.debugName ?? `node_${node.id}`);
    index.nodeNames[node.id] = nameId;

    // Intern port names
    index.portNames[node.id] = node.ports.map(p =>
      interner.intern(p.label ?? `port_${p.index}`)
    );
  }

  // Intern bus names
  for (const bus of ir.buses) {
    const nameId = interner.intern(bus.name);
    index.busNames[bus.id] = nameId;
  }

  // Build provenance arrays
  for (let i = 0; i < ir.signalIR.nodes.length; i++) {
    index.sigNodeProv[i] = buildProvenanceEntry(ir, i, 'signal');
  }

  // Finalize
  index.strings = interner.getAll();
  for (let i = 0; i < index.strings.length; i++) {
    index.stringToId.set(index.strings[i], i);
  }

  return index;
}
```

---

## Topic 2: TypeKey Encoding

### TypeKeyId

Pack TypeDesc into a dense u16 for fast comparison and storage:

```typescript
// TypeKeyId is a 16-bit value encoding TypeDesc
type TypeKeyId = number;

// Encoding:
// Bits 0-3: world (4 bits, 16 values)
// Bits 4-9: domain (6 bits, 64 values)
// Bits 10-15: semantics hint (6 bits, 64 values)

const WORLD_BITS = 4;
const DOMAIN_BITS = 6;
const SEMANTICS_BITS = 6;

const WORLD_SHIFT = 0;
const DOMAIN_SHIFT = WORLD_BITS;
const SEMANTICS_SHIFT = WORLD_BITS + DOMAIN_BITS;
```

### Encoding/Decoding

```typescript
const WORLD_MAP: Record<TypeWorld, number> = {
  'signal': 0,
  'field': 1,
  'scalar': 2,
  'event': 3,
  'special': 4
};

const DOMAIN_MAP: Record<TypeDomain, number> = {
  'number': 0,
  'boolean': 1,
  'string': 2,
  'vec2': 3,
  'vec3': 4,
  'vec4': 5,
  'color': 6,
  'bounds': 7,
  'timeMs': 8,
  'phase01': 9,
  'unit01': 10,
  'trigger': 11,
  'domain': 12,
  'renderTree': 13,
  'renderCmds': 14,
  'unknown': 63
};

function encodeTypeKey(type: TypeDesc): TypeKeyId {
  const world = WORLD_MAP[type.world] ?? 0;
  const domain = DOMAIN_MAP[type.domain] ?? 63;
  const semantics = 0; // Could encode semantics hints

  return (world << WORLD_SHIFT)
       | (domain << DOMAIN_SHIFT)
       | (semantics << SEMANTICS_SHIFT);
}

function decodeTypeKey(key: TypeKeyId): TypeDesc {
  const world = (key >> WORLD_SHIFT) & ((1 << WORLD_BITS) - 1);
  const domain = (key >> DOMAIN_SHIFT) & ((1 << DOMAIN_BITS) - 1);

  return {
    world: WORLD_REVERSE[world],
    domain: DOMAIN_REVERSE[domain]
  };
}
```

---

## Topic 3: SpanRing Buffer

### SpanRecord Structure

```typescript
// 32 bytes per span record
interface SpanRecord {
  frame: number;        // 4 bytes: frame ID
  tMs: number;          // 4 bytes: time in ms (f32)
  kind: SpanKind;       // 1 byte: what kind of span
  subjectLo: number;    // 4 bytes: subject ID low bits
  subjectHi: number;    // 2 bytes: subject ID high bits
  parentIdx: number;    // 4 bytes: index of parent span (-1 if root)
  durationUs: number;   // 4 bytes: duration in microseconds
  flags: number;        // 1 byte: flags (cached, error, etc.)
  _pad: number;         // 8 bytes: padding/reserved
}

enum SpanKind {
  Frame = 0,
  NodeEval = 1,
  BusEval = 2,
  BusCombine = 3,
  TransformChain = 4,
  AdapterStep = 5,
  LensStep = 6,
  Materialize = 7,
  RenderSink = 8,
  StateRead = 9,
  StateWrite = 10
}
```

### SpanRing Implementation

```typescript
class SpanRing {
  private buffer: ArrayBuffer;
  private view: DataView;
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number = 65536) {
    this.capacity = capacity;
    this.buffer = new ArrayBuffer(capacity * 32); // 32 bytes per record
    this.view = new DataView(this.buffer);
  }

  push(record: SpanRecord): number {
    const idx = this.head;
    const offset = idx * 32;

    this.view.setUint32(offset + 0, record.frame, true);
    this.view.setFloat32(offset + 4, record.tMs, true);
    this.view.setUint8(offset + 8, record.kind);
    this.view.setUint32(offset + 9, record.subjectLo, true);
    this.view.setUint16(offset + 13, record.subjectHi, true);
    this.view.setInt32(offset + 15, record.parentIdx, true);
    this.view.setUint32(offset + 19, record.durationUs, true);
    this.view.setUint8(offset + 23, record.flags);
    // Bytes 24-31: reserved

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;

    return idx;
  }

  get(idx: number): SpanRecord | null {
    if (idx < 0 || idx >= this.count) return null;

    const offset = idx * 32;
    return {
      frame: this.view.getUint32(offset + 0, true),
      tMs: this.view.getFloat32(offset + 4, true),
      kind: this.view.getUint8(offset + 8),
      subjectLo: this.view.getUint32(offset + 9, true),
      subjectHi: this.view.getUint16(offset + 13, true),
      parentIdx: this.view.getInt32(offset + 15, true),
      durationUs: this.view.getUint32(offset + 19, true),
      flags: this.view.getUint8(offset + 23),
      _pad: 0
    };
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
```

---

## Topic 4: ValueRecord Encoding

### ValueRecord Structure

```typescript
// 32 bytes per value record
interface ValueRecord {
  spanIdx: number;       // 4 bytes: which span produced this
  typeKeyId: TypeKeyId;  // 2 bytes: type encoding
  flags: number;         // 2 bytes: flags (valid, nan, inf, etc.)

  // Payload (24 bytes) - interpretation depends on type
  payload: ValuePayload;
}

type ValuePayload =
  | { kind: 'scalar'; value: number }
  | { kind: 'vec2'; x: number; y: number }
  | { kind: 'vec3'; x: number; y: number; z: number }
  | { kind: 'color'; r: number; g: number; b: number; a: number }
  | { kind: 'fieldStats'; min: number; max: number; hash: number; count: number }
  | { kind: 'trigger'; fired: boolean; count: number };
```

### ValueRing Implementation

```typescript
class ValueRing {
  private buffer: ArrayBuffer;
  private view: DataView;
  private f64View: Float64Array;
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number = 65536) {
    this.capacity = capacity;
    this.buffer = new ArrayBuffer(capacity * 32);
    this.view = new DataView(this.buffer);
    this.f64View = new Float64Array(this.buffer);
  }

  pushScalar(spanIdx: number, typeKeyId: TypeKeyId, value: number): number {
    const idx = this.head;
    const offset = idx * 32;

    this.view.setUint32(offset + 0, spanIdx, true);
    this.view.setUint16(offset + 4, typeKeyId, true);
    this.view.setUint16(offset + 6, computeFlags(value), true);
    this.f64View[(offset + 8) / 8] = value;

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;

    return idx;
  }

  pushFieldStats(
    spanIdx: number,
    typeKeyId: TypeKeyId,
    min: number,
    max: number,
    hash: number,
    count: number
  ): number {
    const idx = this.head;
    const offset = idx * 32;

    this.view.setUint32(offset + 0, spanIdx, true);
    this.view.setUint16(offset + 4, typeKeyId, true);
    this.view.setUint16(offset + 6, 0x0001, true); // fieldStats flag
    this.view.setFloat32(offset + 8, min, true);
    this.view.setFloat32(offset + 12, max, true);
    this.view.setUint32(offset + 16, hash, true);
    this.view.setUint32(offset + 20, count, true);

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;

    return idx;
  }
}

function computeFlags(value: number): number {
  let flags = 0;
  if (Number.isNaN(value)) flags |= 0x0001;
  if (!Number.isFinite(value)) flags |= 0x0002;
  return flags;
}
```

---

## Topic 5: Causal Edge System

### EdgeRecord Structure

```typescript
// 16 bytes per edge
interface EdgeRecord {
  producedValueIdx: number;  // 4 bytes: ValueRing index of produced value
  inputValueIdx: number;     // 4 bytes: ValueRing index of input value
  relation: EdgeRelation;    // 2 bytes: how they're related
  weight: number;            // 2 bytes: contribution weight (for combines)
  _reserved: number;         // 4 bytes: padding
}

enum EdgeRelation {
  Wire = 0,           // Direct wire connection
  BusCombine = 1,     // Part of bus combine
  BusPublish = 2,     // Publisher to bus
  BusListen = 3,      // Bus to listener
  Adapter = 4,        // Adapter conversion
  Lens = 5,           // Lens transformation
  Sample = 6,         // Signal sampled for field
  Materialize = 7,    // Field materialized to buffer
  StateRead = 8,      // Read from state
  StateWrite = 9      // Write to state
}
```

### EdgeRing Implementation

```typescript
class EdgeRing {
  private buffer: ArrayBuffer;
  private view: DataView;
  private head: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number = 262144) {
    this.capacity = capacity;
    this.buffer = new ArrayBuffer(capacity * 16);
    this.view = new DataView(this.buffer);
  }

  push(edge: EdgeRecord): number {
    const idx = this.head;
    const offset = idx * 16;

    this.view.setUint32(offset + 0, edge.producedValueIdx, true);
    this.view.setUint32(offset + 4, edge.inputValueIdx, true);
    this.view.setUint16(offset + 8, edge.relation, true);
    this.view.setUint16(offset + 10, edge.weight, true);

    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;

    return idx;
  }

  // Find all edges where producedValueIdx matches
  findInputsTo(producedValueIdx: number): EdgeRecord[] {
    const results: EdgeRecord[] = [];
    for (let i = 0; i < this.count; i++) {
      const offset = i * 16;
      if (this.view.getUint32(offset + 0, true) === producedValueIdx) {
        results.push(this.get(i)!);
      }
    }
    return results;
  }
}
```

### Causal Graph Reconstruction

```typescript
interface CausalChain {
  value: ValueRecord;
  inputs: CausalChain[];
  relation: EdgeRelation;
}

function reconstructCausality(
  valueIdx: number,
  edges: EdgeRing,
  values: ValueRing,
  maxDepth: number = 10
): CausalChain {
  const value = values.get(valueIdx);
  if (!value || maxDepth <= 0) {
    return { value, inputs: [], relation: EdgeRelation.Wire };
  }

  const inputEdges = edges.findInputsTo(valueIdx);
  const inputs = inputEdges.map(edge => ({
    ...reconstructCausality(edge.inputValueIdx, edges, values, maxDepth - 1),
    relation: edge.relation
  }));

  return { value, inputs, relation: EdgeRelation.Wire };
}
```

---

## Topic 6: Instrumentation Hooks

### Instrumentation Points

```typescript
interface Instrumentation {
  // Frame level
  onFrameStart(frameId: number, tMs: number): void;
  onFrameEnd(frameId: number, durationUs: number): void;

  // Node evaluation
  onNodeEvalStart(nodeId: number): number; // returns spanIdx
  onNodeEvalEnd(spanIdx: number, outputs: ValueSlot[]): void;

  // Bus evaluation
  onBusEvalStart(busId: number): number;
  onBusCombineStart(busId: number, termCount: number): number;
  onBusCombineTerm(spanIdx: number, termIdx: number, value: number): void;
  onBusEvalEnd(spanIdx: number, result: number): void;

  // Transforms
  onTransformChainStart(chainId: number, input: number): number;
  onTransformStepEnd(spanIdx: number, stepIdx: number, output: number): void;
  onTransformChainEnd(spanIdx: number, output: number): void;

  // Materialization
  onMaterializeStart(fieldId: number, domainId: number): number;
  onMaterializeEnd(spanIdx: number, count: number, stats: FieldStats): void;

  // Render
  onRenderSinkStart(sinkId: number): number;
  onRenderSinkEnd(spanIdx: number): void;
}
```

### Low-Overhead Implementation

```typescript
class ProductionInstrumentation implements Instrumentation {
  private spanRing: SpanRing;
  private valueRing: ValueRing;
  private edgeRing: EdgeRing;
  private spanStack: number[] = [];

  onNodeEvalStart(nodeId: number): number {
    const spanIdx = this.spanRing.push({
      frame: this.currentFrame,
      tMs: this.currentTMs,
      kind: SpanKind.NodeEval,
      subjectLo: nodeId,
      subjectHi: 0,
      parentIdx: this.spanStack[this.spanStack.length - 1] ?? -1,
      durationUs: 0,
      flags: 0,
      _pad: 0
    });

    this.spanStack.push(spanIdx);
    return spanIdx;
  }

  onNodeEvalEnd(spanIdx: number, outputs: ValueSlot[]): void {
    const startTime = this.spanStartTimes[spanIdx];
    const duration = performance.now() - startTime;

    // Update duration (in-place modification of ring buffer)
    this.spanRing.updateDuration(spanIdx, Math.round(duration * 1000));

    // Record output values
    for (const slot of outputs) {
      const value = this.runtime.values.read(slot);
      const typeKeyId = this.getTypeKeyId(slot);
      this.valueRing.pushScalar(spanIdx, typeKeyId, value as number);
    }

    this.spanStack.pop();
  }
}
```

---

## Topic 7: TraceController

### Trace Modes

```typescript
enum TraceMode {
  OFF = 0,           // No tracing (production default)
  TIMING = 1,        // Only timing spans, no values
  FULL = 2,          // Full tracing with values and edges
  SAMPLING = 3       // Sample 1/N frames
}

interface TraceConfig {
  mode: TraceMode;
  spanCapacity: number;
  valueCapacity: number;
  edgeCapacity: number;
  sampleRate: number;        // For SAMPLING mode
  maxFramesStored: number;
}
```

### TraceController Implementation

```typescript
class TraceController {
  private mode: TraceMode = TraceMode.OFF;
  private config: TraceConfig;
  private instrumentation: Instrumentation;

  setMode(mode: TraceMode): void {
    this.mode = mode;
    this.updateInstrumentation();
  }

  private updateInstrumentation(): void {
    if (this.mode === TraceMode.OFF) {
      this.instrumentation = new NoOpInstrumentation();
    } else if (this.mode === TraceMode.TIMING) {
      this.instrumentation = new TimingOnlyInstrumentation(
        this.config.spanCapacity
      );
    } else {
      this.instrumentation = new FullInstrumentation(
        this.config.spanCapacity,
        this.config.valueCapacity,
        this.config.edgeCapacity
      );
    }
  }

  getInstrumentation(): Instrumentation {
    return this.instrumentation;
  }

  // Query interface
  getRecentSpans(count: number): SpanRecord[] {
    return this.instrumentation.getSpans(count);
  }

  getCausalityFor(valueIdx: number): CausalChain {
    return reconstructCausality(
      valueIdx,
      this.instrumentation.getEdges(),
      this.instrumentation.getValues()
    );
  }
}
```

### Performance Budget

```typescript
// Trace overhead targets
const OVERHEAD_TARGETS = {
  [TraceMode.OFF]: 0,           // 0% overhead
  [TraceMode.TIMING]: 0.01,     // 1% overhead
  [TraceMode.FULL]: 0.05,       // 5% overhead
  [TraceMode.SAMPLING]: 0.02    // 2% overhead
};

function measureOverhead(mode: TraceMode): number {
  const baselineMs = runWithoutTrace();
  const tracedMs = runWithTrace(mode);
  return (tracedMs - baselineMs) / baselineMs;
}
```

---

## Testing Strategy

### Ring Buffer Tests

```typescript
describe('SpanRing', () => {
  it('wraps around at capacity', () => {
    const ring = new SpanRing(4);

    for (let i = 0; i < 6; i++) {
      ring.push(createSpan(i));
    }

    // First two should be overwritten
    expect(ring.get(0)?.frame).toBe(4);
    expect(ring.get(1)?.frame).toBe(5);
  });

  it('maintains zero allocation in hot path', () => {
    const ring = new SpanRing(1000);
    const before = getGCCount();

    for (let i = 0; i < 10000; i++) {
      ring.push(createSpan(i));
    }

    const after = getGCCount();
    expect(after - before).toBe(0);
  });
});
```

### Causality Tests

```typescript
describe('Causality', () => {
  it('reconstructs signal chain', () => {
    // t -> sin(t) -> scale(sin(t))
    const edges = new EdgeRing();
    const values = new ValueRing();

    const tIdx = values.pushScalar(0, encodeTypeKey(numberType), 1000);
    const sinIdx = values.pushScalar(1, encodeTypeKey(numberType), 0.841);
    const scaleIdx = values.pushScalar(2, encodeTypeKey(numberType), 4.205);

    edges.push({ producedValueIdx: sinIdx, inputValueIdx: tIdx, relation: EdgeRelation.Wire, weight: 1, _reserved: 0 });
    edges.push({ producedValueIdx: scaleIdx, inputValueIdx: sinIdx, relation: EdgeRelation.Lens, weight: 1, _reserved: 0 });

    const chain = reconstructCausality(scaleIdx, edges, values);

    expect(chain.inputs.length).toBe(1);
    expect(chain.inputs[0].relation).toBe(EdgeRelation.Lens);
    expect(chain.inputs[0].inputs[0].relation).toBe(EdgeRelation.Wire);
  });
});
```

### Overhead Tests

```typescript
describe('Trace overhead', () => {
  it('OFF mode has zero overhead', () => {
    const overhead = measureOverhead(TraceMode.OFF);
    expect(overhead).toBe(0);
  });

  it('TIMING mode under 1% overhead', () => {
    const overhead = measureOverhead(TraceMode.TIMING);
    expect(overhead).toBeLessThan(0.01);
  });

  it('FULL mode under 5% overhead', () => {
    const overhead = measureOverhead(TraceMode.FULL);
    expect(overhead).toBeLessThan(0.05);
  });
});
```

---

## Verification Checklist

### DebugIndex
- [ ] All strings interned
- [ ] Node/port/bus names mapped
- [ ] Provenance arrays populated
- [ ] Source mapping works

### TypeKey Encoding
- [ ] Encode/decode roundtrip works
- [ ] All TypeDescs encodable
- [ ] u16 fits all combinations

### SpanRing
- [ ] Fixed capacity respected
- [ ] Wrap-around works
- [ ] Zero allocation in hot path
- [ ] All span kinds supported

### ValueRecord
- [ ] Scalar encoding works
- [ ] Field stats encoding works
- [ ] Flags capture NaN/Inf
- [ ] Type key included

### EdgeRing
- [ ] All relations supported
- [ ] Causality reconstruction works
- [ ] Efficient lookup

### Instrumentation
- [ ] All evaluation points covered
- [ ] Low overhead implementation
- [ ] Stack tracking works

### TraceController
- [ ] Mode switching works
- [ ] Performance budgets met
- [ ] Query interface functional

---

## Success Criteria

Phase 7 is complete when:

1. DebugIndex contains all debug info
2. Ring buffers are zero-allocation
3. Causality can be reconstructed
4. All evaluation points instrumented
5. Trace modes meet overhead targets
