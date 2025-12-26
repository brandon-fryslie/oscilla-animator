# Phase 2: IR Data Structures - Complete Handoff Document

**Mission:** Define all IR table schemas. These are the target structures the compiler will emit.

**You are defining the data model for "Program as Data."** No runtime changes yet - just pure TypeScript type definitions that will become the foundation for everything.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: SignalExpr Schema](#topic-1-signalexpr-schema)
3. [Topic 2: FieldExpr Schema](#topic-2-fieldexpr-schema)
4. [Topic 3: TransformChain IR](#topic-3-transformchain-ir)
5. [Topic 4: Bus IR Schema](#topic-4-bus-ir-schema)
6. [Topic 5: Schedule IR](#topic-5-schedule-ir)
7. [Topic 6: Opcode Registry](#topic-6-opcode-registry)
8. [Topic 7: ConstPool & Default Sources](#topic-7-constpool--default-sources)
9. [Topic 8: Cache Policy IR](#topic-8-cache-policy-ir)
10. [Testing Strategy](#testing-strategy)
11. [Verification Checklist](#verification-checklist)

---

## Philosophy

### Program is Data

The entire point of this phase is to represent programs as inspectable, serializable data structures instead of opaque closures.

**Before (closures):**
```typescript
// Can't inspect, can't serialize, can't port to Rust
const signal = (t: number) => Math.sin(t * 0.001 * Math.PI * 2);
```

**After (IR):**
```typescript
// Inspectable, serializable, portable
const signal: SignalExprIR = {
  kind: 'map',
  id: 'sig_1',
  type: { world: 'signal', domain: 'number' },
  src: 'sig_time',
  fn: { opcode: OpCode.Sin }
};
```

### Dense Numeric Indices

Performance depends on index-based addressing. Strings are for debugging only.

```typescript
// Runtime uses numbers
export type SigExprId = number;
export type FieldExprId = number;
export type BusIndex = number;
export type ValueSlot = number;

// Strings exist only in DebugIndex
export interface DebugIndex {
  nodeNames: string[];  // nodeNames[nodeId] = "PhaseClock_1"
}
```

---

## Topic 1: SignalExpr Schema

### The SignalExpr Table

```typescript
export type SigExprId = number;

export interface SignalExprTable {
  nodes: SignalExprIR[];  // Dense array, index = SigExprId
}
```

### SignalExpr Node Kinds

```typescript
export type SignalExprIR =
  // Constants
  | { kind: 'const'; type: TypeDesc; constId: number }

  // Canonical time signals (derived by timeDerive step)
  | { kind: 'timeAbsMs'; type: TypeDesc }
  | { kind: 'timeModelMs'; type: TypeDesc }
  | { kind: 'phase01'; type: TypeDesc }
  | { kind: 'wrapEvent'; type: TypeDesc }

  // Reference another node's output slot
  | { kind: 'inputSlot'; type: TypeDesc; slot: ValueSlot }

  // Pure combinators
  | { kind: 'map'; type: TypeDesc; src: SigExprId; fn: PureFnRef }
  | { kind: 'zip'; type: TypeDesc; a: SigExprId; b: SigExprId; fn: PureFnRef }
  | { kind: 'select'; type: TypeDesc; cond: SigExprId; t: SigExprId; f: SigExprId }

  // Transforms (adapters + lenses)
  | { kind: 'transform'; type: TypeDesc; src: SigExprId; chain: TransformChainId }

  // Bus combine
  | {
      kind: 'busCombine';
      type: TypeDesc;
      busIndex: BusIndex;
      terms: SigExprId[];
      combine: CombineSpec;
    }

  // Stateful operations (explicit state, NO closure memory)
  | {
      kind: 'stateful';
      type: TypeDesc;
      op: StatefulSignalOp;
      input?: SigExprId;
      stateId: StateId;
      params?: Record<string, number>;
    };
```

### Stateful Signal Operations

```typescript
export type StatefulSignalOp =
  | 'integrate'      // number/unit -> number (accumulator)
  | 'delayMs'        // any -> any (time-based delay)
  | 'delayFrames'    // any -> any (frame-based delay)
  | 'sampleHold'     // any + trigger -> any (hold on trigger)
  | 'slew'           // any -> any (smoothing)
  | 'edgeDetectWrap' // phase01 -> trigger (wrap detection)
  ;
```

### Key Invariants

1. **No closures** - Every operation is represented as data
2. **Explicit state** - Stateful ops reference a `stateId`, not hidden closure memory
3. **Type safety** - Every node carries its `TypeDesc`
4. **Deterministic ordering** - `terms` array in busCombine is already sorted

---

## Topic 2: FieldExpr Schema

### The FieldExpr Table

```typescript
export type FieldExprId = number;

export interface FieldExprTable {
  nodes: FieldExprIR[];  // Dense array, index = FieldExprId
}
```

### FieldExpr Node Kinds

```typescript
export type FieldExprIR =
  // Constants
  | { kind: 'const'; type: TypeDesc; constId: number }

  // Reference a node's output slot
  | { kind: 'inputSlot'; type: TypeDesc; slot: ValueSlot }

  // Pure combinators
  | { kind: 'map'; type: TypeDesc; src: FieldExprId; fn: PureFnRef }
  | { kind: 'zip'; type: TypeDesc; a: FieldExprId; b: FieldExprId; fn: PureFnRef }
  | { kind: 'select'; type: TypeDesc; cond: FieldExprId; t: FieldExprId; f: FieldExprId }

  // Bus combine in field world
  | {
      kind: 'busCombine';
      type: TypeDesc;
      busIndex: BusIndex;
      terms: FieldExprId[];
      combine: CombineSpec;
    }

  // Transforms
  | { kind: 'transform'; type: TypeDesc; src: FieldExprId; chain: TransformChainId }

  // Bridge: sample signal to create field
  | {
      kind: 'sampleSignal';
      type: TypeDesc;
      signalSlot: ValueSlot;
      strategy: SampleStrategy;
    };
```

### Sample Strategy

```typescript
export type SampleStrategy =
  | 'broadcast'     // Same scalar value for all elements
  | 'perElement'    // Sample per element (requires domain identity)
  ;
```

### Materialization Plan

Fields are lazy expressions until forced by a render sink:

```typescript
export interface MaterializationIR {
  id: number;
  expr: FieldExprId;
  domainSlot: ValueSlot;      // Domain handle (element count, IDs)
  outBufferSlot: ValueSlot;   // Where to write the buffer
  layout: BufferLayout;
  cacheKey: CacheKeySpec;
}

export type BufferLayout =
  | { kind: 'scalar'; elementType: 'f32' | 'u32' | 'i32' }
  | { kind: 'vec2'; elementType: 'f32' }
  | { kind: 'vec3'; elementType: 'f32' }
  | { kind: 'vec4'; elementType: 'f32' }
  | { kind: 'colorRGBA'; elementType: 'u8' | 'f32' }
  | { kind: 'custom'; desc: string };
```

---

## Topic 3: TransformChain IR

### Transform Tables

```typescript
export type TransformChainId = number;

export interface TransformTable {
  chains: TransformChainIR[];
}

export interface TransformChainIR {
  steps: TransformStepIR[];
  fromType: TypeDesc;
  toType: TypeDesc;
  cost: 'cheap' | 'normal' | 'heavy';
}
```

### Transform Step Kinds

```typescript
export type TransformStepIR =
  // Type casts (no allocation)
  | { kind: 'cast'; op: CastOp }

  // Pure function application
  | { kind: 'map'; fn: PureFnRef; paramsId?: number }

  // Common fast paths
  | { kind: 'scaleBias'; scale: number; bias: number }
  | { kind: 'normalize'; mode: '0..1' | '-1..1' }
  | { kind: 'quantize'; step: number }
  | { kind: 'ease'; curveId: number }

  // Stateful transform (explicit state)
  | { kind: 'slew'; stateOffset: number; rate: number }
  ;
```

### Adapter vs Lens

- **Adapter**: Type conversion (e.g., `number` -> `vec2`)
- **Lens**: Value transformation (e.g., scale, ease, quantize)

Both are represented uniformly as TransformStep entries.

---

## Topic 4: Bus IR Schema

### Bus Table

```typescript
export interface BusTable {
  buses: BusIR[];  // Dense array, index = BusIndex
}

export interface BusIR {
  id: BusIndex;
  name: string;              // For debugging
  world: 'signal' | 'field';
  type: TypeDesc;
  combine: CombineSpec;
  silentValue: SilentValueSpec;
  publishers: PublisherIR[];
  listeners: ListenerIR[];
}
```

### Publisher IR

```typescript
export interface PublisherIR {
  id: number;
  sourceBlockIndex: number;
  sourcePortIndex: number;
  sortKey: number;           // Determines combine order
  transformChain?: TransformChainId;
  enabled: boolean;
}
```

**Critical: Publisher Ordering**

Publishers are sorted by:
1. `sortKey` (primary)
2. `sourceBlockIndex` (tie-break)
3. `sourcePortIndex` (tie-break)
4. `id` (final tie-break)

This ordering is baked into the IR. Runtime never re-sorts.

### Listener IR

```typescript
export interface ListenerIR {
  id: number;
  targetBlockIndex: number;
  targetPortIndex: number;
  transformChain?: TransformChainId;
  enabled: boolean;
}
```

### Combine Specification

```typescript
export interface CombineSpec {
  mode: CombineMode;
  default?: number;  // For empty publisher list
}

export type CombineMode =
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'last'
  | 'first'
  ;
```

### Silent Value

```typescript
export interface SilentValueSpec {
  constId: number;  // Reference to ConstPool
}
```

---

## Topic 5: Schedule IR

### Schedule Structure

```typescript
export interface ScheduleIR {
  phases: SchedulePhase[];
  dependencies: DependencyIndexIR;
  determinism: DeterminismIR;
}

export interface SchedulePhase {
  name: string;
  steps: StepIR[];
}
```

### Phase Order (Fixed)

```typescript
const PHASE_ORDER = [
  'timeDerive',      // Compute time signals
  'timeConsole',     // Internal rail generators
  'preBusNodeEval',  // Nodes before bus combine
  'busEval',         // All buses in stable order
  'postBusNodeEval', // Nodes after bus combine
  'railResolve',     // Per-rail deterministic resolution
  'materialize',     // Field materialization
  'render',          // Render sink evaluation
  'renderAssemble',  // Final output assembly
] as const;
```

### Step IR Variants

```typescript
export type StepIR =
  | { kind: 'timeDerive'; outputs: ValueSlot[] }
  | {
      kind: 'nodeEval';
      nodeIndex: number;
      inputs: ValueSlot[];
      outputs: ValueSlot[];
      opcode: OpCode;
    }
  | {
      kind: 'busEval';
      busIndex: BusIndex;
      outputSlot: ValueSlot;
      combineMode: CombineMode;
      terms: ValueSlot[];
    }
  | {
      kind: 'materialize';
      fieldExprId: FieldExprId;
      domainSlot: ValueSlot;
      outputSlot: ValueSlot;
      layout: BufferLayout;
    }
  | {
      kind: 'renderSink';
      sinkIndex: number;
      inputs: ValueSlot[];
    }
  | {
      kind: 'debugProbe';
      targetSlot: ValueSlot;
      probeId: number;
    }
  ;
```

### Dependency Index

```typescript
export interface DependencyIndexIR {
  // For each step, which steps must complete first
  stepDeps: number[][];  // stepDeps[stepId] = [depStepId, ...]
}
```

### Determinism Rules

```typescript
export interface DeterminismIR {
  // Explicitly document determinism guarantees
  publisherOrdering: 'sortKey-then-blockIndex';
  tieBreakPolicy: 'stable-numeric';
  noMapIteration: true;
  seedSource: 'patchSeed-plus-nodeId';
}
```

---

## Topic 6: Opcode Registry

### OpCode Enum

```typescript
export enum OpCode {
  // Constants
  Const = 0,

  // Time
  TimeAbsMs = 10,
  TimeModelMs = 11,
  Phase01 = 12,
  TimeDelta = 13,

  // Pure Math (scalar)
  Add = 100,
  Sub = 101,
  Mul = 102,
  Div = 103,
  Mod = 104,
  Sin = 110,
  Cos = 111,
  Tan = 112,
  Abs = 120,
  Floor = 121,
  Ceil = 122,
  Round = 123,
  Min = 130,
  Max = 131,
  Clamp = 132,
  Lerp = 133,
  Step = 134,
  Smoothstep = 135,

  // Vec2
  Vec2Add = 200,
  Vec2Sub = 201,
  Vec2Mul = 202,
  Vec2Div = 203,
  Vec2Dot = 210,
  Vec2Length = 211,
  Vec2Normalize = 212,
  Vec2Rotate = 213,

  // Color
  ColorLerp = 300,
  ColorHSLToRGB = 301,
  ColorRGBToHSL = 302,
  ColorShiftHue = 303,

  // State
  Integrate = 400,
  DelayMs = 401,
  DelayFrames = 402,
  SampleHold = 403,
  Slew = 404,

  // Domain/Identity
  DomainN = 500,
  DomainFromSVG = 501,
  Hash01ById = 510,

  // Field
  FieldMap = 600,
  FieldZip = 601,
  FieldReduce = 602,
  FieldBroadcast = 603,

  // Render
  RenderInstances2D = 700,
  RenderPath = 701,

  // Transforms
  TransformScale = 800,
  TransformBias = 801,
  TransformEase = 802,
  TransformQuantize = 803,
}
```

### Opcode Metadata

```typescript
export interface OpCodeMeta {
  opcode: OpCode;
  name: string;
  category: 'time' | 'math' | 'vec' | 'color' | 'state' | 'domain' | 'field' | 'render' | 'transform';
  inputTypes: TypeDesc[];
  outputType: TypeDesc;
  purity: 'pure' | 'stateful' | 'io';
}

export const OPCODE_REGISTRY: Record<OpCode, OpCodeMeta> = {
  [OpCode.Sin]: {
    opcode: OpCode.Sin,
    name: 'sin',
    category: 'math',
    inputTypes: [{ world: 'signal', domain: 'number' }],
    outputType: { world: 'signal', domain: 'number' },
    purity: 'pure',
  },
  // ... all opcodes
};
```

---

## Topic 7: ConstPool & Default Sources

### Constant Pool

```typescript
export interface ConstPool {
  // Typed constant arrays
  f64: Float64Array;
  f32: Float32Array;
  i32: Int32Array;
  u32: Uint32Array;

  // JSON constants for complex values
  json: unknown[];

  // Index mapping
  constIndex: ConstIndexEntry[];
}

export interface ConstIndexEntry {
  id: number;
  type: 'f64' | 'f32' | 'i32' | 'u32' | 'json';
  offset: number;
  length: number;  // For arrays
}
```

### Default Source Table

```typescript
export interface DefaultSourceTable {
  sources: DefaultSourceIR[];
}

export interface DefaultSourceIR {
  id: number;
  targetBlockIndex: number;
  targetPortIndex: number;
  valueRef: ValueRef;  // Either constId or expression
}

export type ValueRef =
  | { kind: 'const'; constId: number }
  | { kind: 'expr'; exprId: SigExprId | FieldExprId }
  ;
```

---

## Topic 8: Cache Policy IR

### Cache Key Specification

```typescript
export interface CacheKeySpec {
  policy: CachePolicy;
  deps: CacheDep[];
}

export type CachePolicy =
  | 'none'              // Never cache
  | 'perFrame'          // Cache within frame only
  | 'untilInvalidated'  // Cache until deps change
  ;
```

### Cache Dependencies

```typescript
export type CacheDep =
  | { kind: 'time' }                    // Depends on tAbsMs
  | { kind: 'phase' }                   // Depends on phase01
  | { kind: 'slot'; slot: ValueSlot }   // Depends on slot value
  | { kind: 'domain'; domainSlot: ValueSlot }  // Depends on domain size
  | { kind: 'viewport' }                // Depends on viewport size
  | { kind: 'seed' }                    // Depends on patch seed
  ;
```

### Caching IR on Steps

```typescript
export interface StepCachingIR {
  stepId: number;
  cacheKey: CacheKeySpec;
  expectedHitRate: 'high' | 'medium' | 'low';
}
```

---

## Testing Strategy

### Schema Validation Tests

```typescript
describe('SignalExpr schema', () => {
  it('validates node kinds', () => {
    const valid: SignalExprIR = {
      kind: 'map',
      type: { world: 'signal', domain: 'number' },
      src: 0,
      fn: { opcode: OpCode.Sin }
    };
    expect(validateSignalExpr(valid)).toBe(true);
  });

  it('rejects invalid node kinds', () => {
    const invalid = { kind: 'unknown', type: {} };
    expect(validateSignalExpr(invalid)).toBe(false);
  });
});
```

### Example IR Construction Tests

```typescript
describe('IR construction', () => {
  it('builds a simple signal chain', () => {
    const table = new SignalExprTable();

    // t * 0.001
    const timeId = table.add({ kind: 'timeAbsMs', type: numberType });
    const constId = table.addConst(0.001);
    const scaledId = table.add({
      kind: 'zip',
      type: numberType,
      a: timeId,
      b: constId,
      fn: { opcode: OpCode.Mul }
    });

    // sin(t * 0.001)
    const sinId = table.add({
      kind: 'map',
      type: numberType,
      src: scaledId,
      fn: { opcode: OpCode.Sin }
    });

    expect(table.nodes.length).toBe(4);
    expect(table.nodes[sinId].kind).toBe('map');
  });
});
```

### Type Validation Tests

```typescript
describe('type compatibility', () => {
  it('validates bus type eligibility', () => {
    expect(isBusEligible({ world: 'signal', domain: 'number' })).toBe(true);
    expect(isBusEligible({ world: 'signal', domain: 'trigger' })).toBe(true);
    expect(isBusEligible({ world: 'special', domain: 'renderTree' })).toBe(false);
  });
});
```

---

## Verification Checklist

### SignalExpr Schema
- [ ] All node kinds defined with TypeDesc
- [ ] Stateful ops have explicit stateId
- [ ] No closure references anywhere
- [ ] Dense numeric indices for all references

### FieldExpr Schema
- [ ] All node kinds defined
- [ ] MaterializationIR complete
- [ ] BufferLayout covers all needed types

### TransformChain IR
- [ ] Adapter and lens steps unified
- [ ] Stateful transforms have explicit state
- [ ] Cost annotation for optimization hints

### Bus IR Schema
- [ ] Publisher ordering documented
- [ ] Combine modes complete
- [ ] Silent value system defined

### Schedule IR
- [ ] All phase kinds enumerated
- [ ] Step variants complete
- [ ] Dependency index structure defined

### Opcode Registry
- [ ] All operations have opcodes
- [ ] Metadata includes types and purity
- [ ] No "custom closure" escape hatch

### ConstPool & Default Sources
- [ ] Typed arrays for performance
- [ ] JSON fallback for complex values
- [ ] Default source resolution defined

### Cache Policy
- [ ] Cache key spec complete
- [ ] Dependency kinds enumerated
- [ ] Per-frame vs cross-frame distinguished

---

## Success Criteria

Phase 2 is complete when:

1. All type definitions compile without errors
2. Schema validation functions exist for all IR types
3. Example IR can be constructed programmatically
4. No closures or functions appear in any IR type
5. All indices are numeric (strings only in DebugIndex)
