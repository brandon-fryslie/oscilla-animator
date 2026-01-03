# Sprint 2: Select and InputSlot Nodes

Generated: 2025-12-25
Depends on: Sprint 1 (Core Evaluator)
Source: HANDOFF.md, design-docs/12-Compiler-Final/12-SignalExpr.md

---

## Sprint Goal

**Add conditional evaluation (select) and external input resolution (inputSlot) to the SignalExpr evaluator.**

When complete, the evaluator can:
- Conditionally evaluate one of two branches based on a boolean signal
- Read values from external input slots (wired connections, bus subscriptions)

---

## Prerequisites

Sprint 1 must be complete:
- [ ] SignalExprIR types defined (const, timeAbsMs, map, zip)
- [ ] SigFrameCache working
- [ ] SigEnv with constPool
- [ ] evalSig() working for basic nodes

---

## Scope

### In Scope (This Sprint)

1. **Select Node Evaluation**
   - Conditional branching based on boolean signal
   - Short-circuit evaluation (only evaluate taken branch)
   - Cache behavior for conditional nodes

2. **InputSlot Node Evaluation**
   - SlotValueReader interface
   - Read external values by slot key
   - Integration with SigEnv

3. **Extended SigEnv**
   - Add `slotValues: SlotValueReader` field
   - Update createSigEnv() factory

### Out of Scope

- busCombine nodes (Sprint 3)
- transform nodes (Sprint 4)
- stateful nodes (Sprint 5)
- Actual slot value providers (compiler integration)

---

## Work Items

### P0: Add Select Node Type

**Description:**
Extend SignalExprIR union with `select` node kind for conditional evaluation.

```typescript
interface SelectNode {
  kind: 'select';
  type: TypeDesc;
  cond: SigExprId;    // Boolean signal (truthy = then, falsy = else)
  then: SigExprId;    // Evaluated if cond > 0.5
  else: SigExprId;    // Evaluated if cond <= 0.5
}
```

**Acceptance Criteria:**
- [ ] `SelectNode` interface added to SignalExprIR union
- [ ] Node includes `cond`, `then`, `else` signal references
- [ ] Type includes JSDoc explaining short-circuit behavior
- [ ] Type exports updated

**Technical Notes:**
- Boolean threshold is 0.5 (cond > 0.5 = true)
- Only one branch is evaluated per frame (short-circuit)
- Both branches must have same result type

---

### P0: Implement Select Node Evaluation

**Description:**
Add select evaluation to the evaluator with proper short-circuit semantics.

```typescript
function evalSelect(node: SelectNode, env: SigEnv, nodes: SignalExprIR[]): number {
  const cond = evalSig(node.cond, env, nodes);

  // Short-circuit: only evaluate taken branch
  if (cond > 0.5) {
    return evalSig(node.then, env, nodes);
  } else {
    return evalSig(node.else, env, nodes);
  }
}
```

**Acceptance Criteria:**
- [ ] `evalSelect()` function implemented
- [ ] Evaluator switch includes `case 'select'`
- [ ] Condition evaluated first, then one branch
- [ ] Short-circuit verified: untaken branch not evaluated
- [ ] Threshold is 0.5 (not 0)
- [ ] Result is cached after evaluation
- [ ] Unit tests for true/false conditions
- [ ] Unit test verifies short-circuit (side-effect detection)

**Technical Notes:**
- Short-circuit is critical for performance (avoid evaluating expensive untaken branches)
- Short-circuit enables safe patterns like `select(x > 0, 1/x, 0)` without div-by-zero
- Cache the result of select, not the branches (branches may be shared)

---

### P0: Add InputSlot Node Type

**Description:**
Extend SignalExprIR union with `inputSlot` node kind for reading external values.

```typescript
interface InputSlotNode {
  kind: 'inputSlot';
  type: TypeDesc;
  slot: SlotKey;      // Dense index into slot table
}

type SlotKey = number;  // Dense index
```

**Acceptance Criteria:**
- [ ] `InputSlotNode` interface added to SignalExprIR union
- [ ] `SlotKey` type alias defined as number
- [ ] Node includes `slot` field referencing external value
- [ ] Type includes JSDoc explaining slot resolution
- [ ] Type exports updated

**Technical Notes:**
- SlotKey is a dense numeric index (not string)
- Slots are resolved at compile time, evaluated at runtime
- Slot values come from wired connections or bus subscriptions

---

### P0: Implement SlotValueReader Interface

**Description:**
Create the interface for reading external slot values during evaluation.

```typescript
interface SlotValueReader {
  /** Read a number from a slot. Returns NaN if slot is empty. */
  readNumber(slot: SlotKey): number;

  /** Check if slot has a value. */
  hasValue(slot: SlotKey): boolean;
}

// Simple array-backed implementation for testing
function createArraySlotReader(values: Map<SlotKey, number>): SlotValueReader {
  return {
    readNumber(slot: SlotKey): number {
      return values.get(slot) ?? NaN;
    },
    hasValue(slot: SlotKey): boolean {
      return values.has(slot);
    }
  };
}
```

**Acceptance Criteria:**
- [ ] `SlotValueReader` interface defined with `readNumber()` and `hasValue()`
- [ ] `SlotKey` type used consistently
- [ ] `createArraySlotReader()` factory for testing
- [ ] Missing slots return NaN (not 0, not throw)
- [ ] Interface exported for use in evaluator and tests
- [ ] Unit tests for slot reader (present/missing slots)

**Technical Notes:**
- NaN for missing slots allows detection of unconnected inputs
- Real implementation will read from compiled slot table
- Array-backed reader is for testing only

---

### P0: Implement InputSlot Node Evaluation

**Description:**
Add inputSlot evaluation to the evaluator.

```typescript
function evalInputSlot(node: InputSlotNode, env: SigEnv): number {
  return env.slotValues.readNumber(node.slot);
}
```

**Acceptance Criteria:**
- [ ] `evalInputSlot()` function implemented
- [ ] Evaluator switch includes `case 'inputSlot'`
- [ ] Reads from `env.slotValues` using `node.slot`
- [ ] Result is cached after read
- [ ] Unit tests for reading slot values
- [ ] Unit test for missing slot (returns NaN)

**Technical Notes:**
- InputSlot evaluation is O(1) - just a map lookup
- Slots don't change during a frame (safe to cache)
- NaN propagates through downstream calculations

---

### P1: Extend SigEnv with SlotValues

**Description:**
Add `slotValues` field to SigEnv and update factory.

```typescript
interface SigEnv {
  readonly tAbsMs: number;
  readonly constPool: ConstPool;
  readonly cache: SigFrameCache;
  readonly slotValues: SlotValueReader;  // NEW
}

function createSigEnv(params: {
  tAbsMs: number;
  constPool: ConstPool;
  cache: SigFrameCache;
  slotValues: SlotValueReader;  // NEW (required)
}): SigEnv;
```

**Acceptance Criteria:**
- [ ] `SigEnv` interface includes `slotValues: SlotValueReader`
- [ ] `createSigEnv()` requires `slotValues` parameter
- [ ] All existing tests updated to provide slot reader
- [ ] Default test helper creates empty slot reader
- [ ] Type is readonly (immutable during evaluation)

**Technical Notes:**
- Breaking change to SigEnv - all callers must be updated
- Provide `createEmptySlotReader()` helper for tests that don't use slots

---

### P1: Test Suite for Select and InputSlot

**Description:**
Comprehensive tests for the new node kinds.

**Acceptance Criteria:**
- [ ] Unit tests for select with true condition
- [ ] Unit tests for select with false condition
- [ ] Unit tests for select with dynamic condition (signal-based)
- [ ] Short-circuit test: verify untaken branch not evaluated
- [ ] Unit tests for inputSlot with present value
- [ ] Unit tests for inputSlot with missing value (NaN)
- [ ] Integration test: select based on slot value
- [ ] Integration test: nested select nodes
- [ ] Cache tests: select results are cached
- [ ] Cache tests: inputSlot results are cached
- [ ] All tests pass with `just test`

**Test Examples:**

```typescript
describe('select nodes', () => {
  it('evaluates then branch when cond > 0.5', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'const', type: numType, constId: 0 }, // 0: cond = 1.0
      { kind: 'const', type: numType, constId: 1 }, // 1: then = 100
      { kind: 'const', type: numType, constId: 2 }, // 2: else = 200
      { kind: 'select', type: numType, cond: 0, then: 1, else: 2 }
    ];
    const env = createTestEnv({ consts: [1.0, 100, 200] });
    expect(evalSig(3, env, nodes)).toBe(100);
  });

  it('short-circuits evaluation', () => {
    // Create a node that would throw if evaluated
    const nodes: SignalExprIR[] = [
      { kind: 'const', type: numType, constId: 0 }, // 0: cond = 0 (false)
      { kind: 'const', type: numType, constId: 1 }, // 1: then (won't eval)
      { kind: 'const', type: numType, constId: 2 }, // 2: else = 42
      { kind: 'select', type: numType, cond: 0, then: 1, else: 2 }
    ];
    // If then branch were evaluated, we'd see cache stamp
    const env = createTestEnv({ consts: [0, 100, 42] });
    evalSig(3, env, nodes);
    expect(env.cache.stamp[1]).not.toBe(env.cache.frameId); // Not evaluated
  });
});

describe('inputSlot nodes', () => {
  it('reads slot value', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'inputSlot', type: numType, slot: 0 }
    ];
    const slots = createArraySlotReader(new Map([[0, 42]]));
    const env = createTestEnv({ slotValues: slots });
    expect(evalSig(0, env, nodes)).toBe(42);
  });

  it('returns NaN for missing slot', () => {
    const nodes: SignalExprIR[] = [
      { kind: 'inputSlot', type: numType, slot: 99 }
    ];
    const slots = createArraySlotReader(new Map());
    const env = createTestEnv({ slotValues: slots });
    expect(evalSig(0, env, nodes)).toBeNaN();
  });
});
```

---

### P2: Update Documentation

**Description:**
Update README with select and inputSlot node documentation.

**Acceptance Criteria:**
- [ ] README updated with select node section
- [ ] README updated with inputSlot node section
- [ ] Short-circuit behavior documented
- [ ] SlotValueReader interface documented
- [ ] Examples for conditional signals
- [ ] Examples for external input reading

---

## Definition of Done

Sprint 2 is complete when:

1. [ ] `SelectNode` type defined and evaluated correctly
2. [ ] Short-circuit evaluation verified by tests
3. [ ] `InputSlotNode` type defined and evaluated correctly
4. [ ] `SlotValueReader` interface implemented
5. [ ] SigEnv extended with slotValues
6. [ ] All tests pass (`just test`)
7. [ ] No TypeScript errors (`just typecheck`)
8. [ ] Documentation updated

**Files Created/Modified:**

- Modified: `src/runtime/signal-expr/types.ts` (add SelectNode, InputSlotNode)
- Created: `src/runtime/signal-expr/SlotValueReader.ts`
- Modified: `src/runtime/signal-expr/SigEnv.ts` (add slotValues)
- Modified: `src/runtime/signal-expr/SigEvaluator.ts` (add select, inputSlot cases)
- Modified: `src/runtime/signal-expr/__tests__/SigEvaluator.test.ts` (add tests)
- Modified: `src/runtime/signal-expr/README.md` (update docs)

---

## Risks

1. **Breaking SigEnv change** - Adding required slotValues field breaks existing code
   - Mitigation: Update all callers in same commit

2. **NaN propagation** - Missing slots return NaN which propagates
   - Mitigation: Document behavior, consider default value option later

---

## Next Sprint

