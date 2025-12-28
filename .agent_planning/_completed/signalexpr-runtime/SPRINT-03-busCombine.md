# Sprint 3: Bus Combine Nodes

Generated: 2025-12-25
Depends on: Sprint 2 (Select, InputSlot)
Source: HANDOFF.md §2, design-docs/12-Compiler-Final/07-Buses.md

---

## Sprint Goal

**Implement bus combine evaluation for signals, enabling multiple publishers to contribute to a shared signal bus.**

When complete, the evaluator can:
- Combine multiple signal terms into one output
- Support all combine modes: sum, average, min, max, first, last
- Handle empty buses with default/silent values
- Maintain deterministic publisher ordering

---

## Prerequisites

Sprint 2 must be complete:
- [ ] Select node evaluation working
- [ ] InputSlot node evaluation working
- [ ] SlotValueReader integrated into SigEnv

---

## Scope

### In Scope (This Sprint)

1. **BusCombine Node Evaluation**
   - Evaluate all term signals
   - Apply combine function (sum, avg, min, max, first, last)
   - Handle empty bus case (return default)

2. **Combine Mode Implementations**
   - Sum: accumulate all terms
   - Average: sum / count
   - Min: minimum of all terms
   - Max: maximum of all terms
   - First: first term in ordered list
   - Last: last term in ordered list

3. **Debug Tracing (Optional)**
   - Trace bus combine operations for debugging
   - Log term values and final result

### Out of Scope

- Bus IR schema definition (Phase 2 topic)
- Publisher sorting (compiler responsibility)
- Bus subscription resolution (compiler responsibility)
- Transform nodes (Sprint 4)

---

## Work Items

### P0: Add BusCombine Node Type

**Description:**
Extend SignalExprIR union with `busCombine` node kind.

```typescript
interface BusCombineNode {
  kind: 'busCombine';
  type: TypeDesc;
  busIndex: number;           // For debug tracing
  terms: SigExprId[];         // Already sorted by compiler
  combine: CombineSpec;
}

interface CombineSpec {
  mode: CombineMode;
  default?: number;           // Value when no publishers (default: 0)
}

type CombineMode = 'sum' | 'average' | 'min' | 'max' | 'first' | 'last';
```

**Acceptance Criteria:**
- [ ] `BusCombineNode` interface added to SignalExprIR union
- [ ] `CombineSpec` interface defined with mode and default
- [ ] `CombineMode` type defined with all 6 modes
- [ ] Node includes `terms` array (already sorted by compiler)
- [ ] Node includes `busIndex` for debug identification
- [ ] Type includes JSDoc explaining combine semantics
- [ ] Type exports updated

**Technical Notes:**
- Terms array is already sorted by the compiler (by sortKey)
- Evaluator does not sort - it trusts compiler ordering
- BusIndex is for debug/tracing only, not functional

---

### P0: Implement BusCombine Evaluation

**Description:**
Add busCombine evaluation to the evaluator following HANDOFF.md specification.

```typescript
function evalBusCombine(
  node: BusCombineNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const { terms, combine } = node;

  // Empty bus: return default value
  if (terms.length === 0) {
    return combine.default ?? 0;
  }

  // Single term: no combine needed
  if (terms.length === 1) {
    return evalSig(terms[0], env, nodes);
  }

  // Evaluate all terms (order is deterministic from compiler)
  const values = terms.map(t => evalSig(t, env, nodes));

  // Apply combine function
  return applyCombine(combine.mode, values, combine.default ?? 0);
}
```

**Acceptance Criteria:**
- [ ] `evalBusCombine()` function implemented
- [ ] Evaluator switch includes `case 'busCombine'`
- [ ] Empty bus returns `combine.default` (or 0 if unspecified)
- [ ] Single term returns that term's value directly
- [ ] Multiple terms evaluated in array order
- [ ] All 6 combine modes work correctly
- [ ] Result is cached after evaluation
- [ ] Unit tests for each combine mode
- [ ] Unit test for empty bus
- [ ] Unit test for single-term bus

**Technical Notes:**
- Evaluate all terms before combining (no short-circuit)
- Terms array order is deterministic (set by compiler)
- Cache individual term results (via recursive evalSig calls)

---

### P0: Implement Combine Mode Functions

**Description:**
Implement all combine mode calculations.

```typescript
function applyCombine(
  mode: CombineMode,
  values: number[],
  defaultValue: number
): number {
  switch (mode) {
    case 'sum':
      return values.reduce((acc, v) => acc + v, 0);

    case 'average':
      return values.reduce((acc, v) => acc + v, 0) / values.length;

    case 'min':
      return Math.min(...values);

    case 'max':
      return Math.max(...values);

    case 'first':
      return values[0];

    case 'last':
      return values[values.length - 1];

    default:
      throw new Error(`Unknown combine mode: ${mode}`);
  }
}
```

**Acceptance Criteria:**
- [ ] `applyCombine()` function handles all 6 modes
- [ ] Sum: adds all values starting from 0
- [ ] Average: sum divided by count
- [ ] Min: Math.min of all values
- [ ] Max: Math.max of all values
- [ ] First: returns values[0]
- [ ] Last: returns values[values.length - 1]
- [ ] Unknown mode throws clear error
- [ ] Unit tests for each mode with multiple values
- [ ] Edge case tests: negative values, zeros, single value

**Technical Notes:**
- Average divides by length (not by default for empty - empty handled earlier)
- Min/Max use Math.min/max spread (efficient for small arrays)
- First/Last are O(1) array access

---

### P1: Add Optional Debug Tracing

**Description:**
Add optional debug tracing for bus combine operations.

```typescript
interface DebugSink {
  traceBusCombine?(info: BusCombineTraceInfo): void;
}

interface BusCombineTraceInfo {
  busIndex: number;
  termIds: SigExprId[];
  termValues: number[];
  mode: CombineMode;
  result: number;
}

// In evalBusCombine, after computing result:
if (env.debug?.traceBusCombine) {
  env.debug.traceBusCombine({
    busIndex: node.busIndex,
    termIds: terms,
    termValues: values,
    mode: combine.mode,
    result
  });
}
```

**Acceptance Criteria:**
- [ ] `DebugSink` interface defined with optional trace methods
- [ ] `BusCombineTraceInfo` interface defined
- [ ] SigEnv extended with optional `debug?: DebugSink` field
- [ ] Trace called after successful evaluation
- [ ] Trace is no-op when debug is undefined
- [ ] No performance impact when debug is disabled
- [ ] Unit test verifies trace is called with correct info

**Technical Notes:**
- Debug is optional - check before calling
- Trace info is created only when debug is enabled (avoid allocation)
- Debug sink can be used for visualization, logging, time-travel debugging

---

### P1: Extend SigEnv with Debug Sink

**Description:**
Add optional debug field to SigEnv.

```typescript
interface SigEnv {
  readonly tAbsMs: number;
  readonly constPool: ConstPool;
  readonly cache: SigFrameCache;
  readonly slotValues: SlotValueReader;
  readonly debug?: DebugSink;  // NEW (optional)
}
```

**Acceptance Criteria:**
- [ ] `SigEnv` interface includes optional `debug?: DebugSink`
- [ ] `createSigEnv()` accepts optional `debug` parameter
- [ ] Existing tests continue to work without debug
- [ ] Type is readonly
- [ ] JSDoc explains debug purpose

**Technical Notes:**
- Optional field - no breaking change to existing code
- Debug sink is frame-scoped (can change between frames)

---

### P1: Comprehensive Test Suite for BusCombine

**Description:**
Full test coverage for bus combine evaluation.

**Acceptance Criteria:**
- [ ] Test empty bus returns default (0)
- [ ] Test empty bus returns custom default
- [ ] Test single-term bus returns term value
- [ ] Test sum mode with 2 terms
- [ ] Test sum mode with 5 terms
- [ ] Test average mode
- [ ] Test min mode with positive values
- [ ] Test min mode with negative values
- [ ] Test max mode
- [ ] Test first mode
- [ ] Test last mode
- [ ] Test combine result is cached
- [ ] Test term results are individually cached
- [ ] Test debug trace is called when enabled
- [ ] All tests pass with `just test`

**Test Examples:**

```typescript
describe('busCombine nodes', () => {
  describe('empty bus', () => {
    it('returns 0 when no default specified', () => {
      const nodes: SignalExprIR[] = [
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [],
          combine: { mode: 'sum' }
        }
      ];
      const env = createTestEnv({});
      expect(evalSig(0, env, nodes)).toBe(0);
    });

    it('returns custom default when specified', () => {
      const nodes: SignalExprIR[] = [
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [],
          combine: { mode: 'sum', default: 100 }
        }
      ];
      const env = createTestEnv({});
      expect(evalSig(0, env, nodes)).toBe(100);
    });
  });

  describe('sum mode', () => {
    it('sums all terms', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 10
        { kind: 'const', type: numType, constId: 1 }, // 20
        { kind: 'const', type: numType, constId: 2 }, // 30
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: 'sum' }
        }
      ];
      const env = createTestEnv({ consts: [10, 20, 30] });
      expect(evalSig(3, env, nodes)).toBe(60);
    });
  });

  describe('average mode', () => {
    it('averages all terms', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 10
        { kind: 'const', type: numType, constId: 1 }, // 20
        { kind: 'const', type: numType, constId: 2 }, // 30
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: 'average' }
        }
      ];
      const env = createTestEnv({ consts: [10, 20, 30] });
      expect(evalSig(3, env, nodes)).toBe(20);
    });
  });

  describe('min/max modes', () => {
    it('finds minimum', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 50
        { kind: 'const', type: numType, constId: 1 }, // 10
        { kind: 'const', type: numType, constId: 2 }, // 30
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: 'min' }
        }
      ];
      const env = createTestEnv({ consts: [50, 10, 30] });
      expect(evalSig(3, env, nodes)).toBe(10);
    });

    it('finds maximum', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 50
        { kind: 'const', type: numType, constId: 1 }, // 10
        { kind: 'const', type: numType, constId: 2 }, // 30
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: 'max' }
        }
      ];
      const env = createTestEnv({ consts: [50, 10, 30] });
      expect(evalSig(3, env, nodes)).toBe(50);
    });
  });

  describe('first/last modes', () => {
    it('returns first term', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 100
        { kind: 'const', type: numType, constId: 1 }, // 200
        { kind: 'const', type: numType, constId: 2 }, // 300
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: 'first' }
        }
      ];
      const env = createTestEnv({ consts: [100, 200, 300] });
      expect(evalSig(3, env, nodes)).toBe(100);
    });

    it('returns last term', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 100
        { kind: 'const', type: numType, constId: 1 }, // 200
        { kind: 'const', type: numType, constId: 2 }, // 300
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1, 2],
          combine: { mode: 'last' }
        }
      ];
      const env = createTestEnv({ consts: [100, 200, 300] });
      expect(evalSig(3, env, nodes)).toBe(300);
    });
  });

  describe('caching', () => {
    it('caches combine result', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 },
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0],
          combine: { mode: 'sum' }
        }
      ];
      const env = createTestEnv({ consts: [42] });

      evalSig(1, env, nodes);
      expect(env.cache.stamp[1]).toBe(env.cache.frameId);
    });

    it('caches term results individually', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 },
        { kind: 'const', type: numType, constId: 1 },
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 0,
          terms: [0, 1],
          combine: { mode: 'sum' }
        }
      ];
      const env = createTestEnv({ consts: [10, 20] });

      evalSig(2, env, nodes);
      // Both terms should be cached
      expect(env.cache.stamp[0]).toBe(env.cache.frameId);
      expect(env.cache.stamp[1]).toBe(env.cache.frameId);
    });
  });

  describe('debug tracing', () => {
    it('calls debug sink when enabled', () => {
      const traceInfo: BusCombineTraceInfo[] = [];
      const debug: DebugSink = {
        traceBusCombine: (info) => traceInfo.push(info)
      };

      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 },
        { kind: 'const', type: numType, constId: 1 },
        {
          kind: 'busCombine',
          type: numType,
          busIndex: 42,
          terms: [0, 1],
          combine: { mode: 'sum' }
        }
      ];
      const env = createTestEnv({ consts: [10, 20], debug });

      evalSig(2, env, nodes);

      expect(traceInfo).toHaveLength(1);
      expect(traceInfo[0].busIndex).toBe(42);
      expect(traceInfo[0].termValues).toEqual([10, 20]);
      expect(traceInfo[0].result).toBe(30);
    });
  });
});
```

---

### P2: Update Documentation

**Description:**
Update README with busCombine node documentation.

**Acceptance Criteria:**
- [ ] README updated with busCombine node section
- [ ] All combine modes documented with examples
- [ ] Empty bus behavior documented
- [ ] Debug tracing documented
- [ ] Publisher ordering note (compiler responsibility)

---

## Definition of Done

Sprint 3 is complete when:

1. [ ] `BusCombineNode` type defined
2. [ ] All 6 combine modes work correctly
3. [ ] Empty bus returns default value
4. [ ] Debug tracing implemented (optional)
5. [ ] All tests pass (`just test`)
6. [ ] No TypeScript errors (`just typecheck`)
7. [ ] Documentation updated

**Files Created/Modified:**

- Modified: `src/runtime/signal-expr/types.ts` (add BusCombineNode, CombineSpec, CombineMode)
- Created: `src/runtime/signal-expr/DebugSink.ts`
- Modified: `src/runtime/signal-expr/SigEnv.ts` (add optional debug)
- Modified: `src/runtime/signal-expr/SigEvaluator.ts` (add busCombine case, applyCombine)
- Modified: `src/runtime/signal-expr/__tests__/SigEvaluator.test.ts` (add tests)
- Modified: `src/runtime/signal-expr/README.md` (update docs)

---

## Risks

1. **Performance with many terms** - Evaluating many terms could be slow
   - Mitigation: Cache individual terms, consider lazy evaluation for first/last

2. **Debug overhead** - Debug tracing could slow hot path
   - Mitigation: Check for debug existence before creating trace info

---

## Next Sprint

Sprint 4: Transform Nodes - Implement adapter/lens transform chain execution.
