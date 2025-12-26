# Sprint 6: Closure Bridge

Generated: 2025-12-25
Depends on: Sprint 5 (Stateful Ops)
Source: HANDOFF.md §5, design-docs/12-Compiler-Final/01.1-CompilerMigration-Roadmap.md

---

## Sprint Goal

**Implement the closure bridge that enables gradual migration from closure-based signals to SignalExpr IR.**

When complete, the evaluator can:
- Call legacy closure-based signals from within SignalExpr DAG
- Enable block-by-block migration without breaking existing functionality
- Track which blocks are migrated vs using closures

---

## Prerequisites

Sprint 5 must be complete:
- [ ] All stateful operations working
- [ ] StateBuffer integrated
- [ ] RuntimeCtx integrated

---

## Scope

### In Scope (This Sprint)

1. **Closure Bridge Node**
   - New node kind `closureBridge`
   - Call legacy closure with current time/context
   - Return result as signal value

2. **Closure Registry**
   - Store legacy closures by ID
   - Lookup during evaluation
   - Registration API

3. **Migration Tracking**
   - Track which block types are migrated
   - Runtime check for migration status
   - Logging/metrics for migration progress

### Out of Scope

- Actual block compiler migration (Sprint 7+)
- Dual-emit compiler (Phase 3)
- Full IRBuilder API (Phase 3)

---

## Work Items

### P0: Add ClosureBridge Node Type

**Description:**
Extend SignalExprIR union with `closureBridge` node kind for calling legacy closures.

```typescript
interface ClosureBridgeNode {
  kind: 'closureBridge';
  type: TypeDesc;
  closureId: string;          // Unique ID for closure lookup
  inputSlots: SigExprId[];    // Input signals to pass to closure (optional)
}
```

**Acceptance Criteria:**
- [ ] `ClosureBridgeNode` interface added to SignalExprIR union
- [ ] Node includes `closureId` for registry lookup
- [ ] Node includes optional `inputSlots` for passing evaluated signals
- [ ] Type includes JSDoc explaining bridge purpose (TEMPORARY)
- [ ] Type exports updated

**Technical Notes:**
- closureId is string (matches legacy block/port identity)
- inputSlots are evaluated and passed to closure
- This is a TEMPORARY node kind for migration period

---

### P0: Define Legacy Closure Types

**Description:**
Define the interface for legacy signal closures.

```typescript
// Legacy closure signature (from existing compiler)
type LegacyClosure = (tAbsMs: number, ctx: LegacyContext) => number;

interface LegacyContext {
  // Matches existing RuntimeCtx-like interface
  deltaSec: number;
  deltaMs: number;
  frameIndex: number;
  // Additional fields as needed for compatibility
}

// Wrapper that adapts SigEnv to LegacyContext
function createLegacyContext(env: SigEnv): LegacyContext {
  return {
    deltaSec: env.runtimeCtx.deltaSec,
    deltaMs: env.runtimeCtx.deltaMs,
    frameIndex: env.runtimeCtx.frameIndex,
  };
}
```

**Acceptance Criteria:**
- [ ] `LegacyClosure` type defined matching existing signature
- [ ] `LegacyContext` interface defined
- [ ] `createLegacyContext()` adapts SigEnv to LegacyContext
- [ ] Types are compatible with existing closure compilers
- [ ] Types exported

**Technical Notes:**
- Must match existing `Signal<number>` type from compiler
- Context must include all fields legacy closures expect
- Adapter function bridges new and old interfaces

---

### P0: Implement Closure Registry

**Description:**
Create a registry for storing and retrieving legacy closures.

```typescript
interface ClosureRegistry {
  /** Register a legacy closure by ID */
  register(id: string, closure: LegacyClosure): void;

  /** Get a closure by ID, returns undefined if not found */
  get(id: string): LegacyClosure | undefined;

  /** Check if closure exists */
  has(id: string): boolean;

  /** Get count of registered closures */
  size(): number;

  /** Clear all closures (for testing/hot-swap) */
  clear(): void;
}

function createClosureRegistry(): ClosureRegistry {
  const closures = new Map<string, LegacyClosure>();

  return {
    register(id: string, closure: LegacyClosure): void {
      closures.set(id, closure);
    },
    get(id: string): LegacyClosure | undefined {
      return closures.get(id);
    },
    has(id: string): boolean {
      return closures.has(id);
    },
    size(): number {
      return closures.size;
    },
    clear(): void {
      closures.clear();
    },
  };
}
```

**Acceptance Criteria:**
- [ ] `ClosureRegistry` interface defined
- [ ] `createClosureRegistry()` factory function
- [ ] `register()` stores closure by ID
- [ ] `get()` retrieves closure (or undefined)
- [ ] `has()` checks existence
- [ ] `size()` returns count
- [ ] `clear()` removes all closures
- [ ] Unit tests for all methods

**Technical Notes:**
- Map-based for O(1) lookup
- IDs are strings (block identity)
- Registry can be cleared for hot-swap

---

### P0: Extend SigEnv with Closure Registry

**Description:**
Add closure registry to the evaluation environment.

```typescript
interface SigEnv {
  // ... existing fields ...
  readonly closureRegistry: ClosureRegistry;
}
```

**Acceptance Criteria:**
- [ ] SigEnv includes `closureRegistry` field
- [ ] `createSigEnv()` updated to accept closureRegistry
- [ ] Default empty registry for tests
- [ ] Field is readonly

**Technical Notes:**
- Registry is populated by compiler before evaluation
- Registry persists across frames (closures don't change)

---

### P0: Implement ClosureBridge Evaluation

**Description:**
Add closureBridge evaluation to the evaluator.

```typescript
function evalClosureBridge(
  node: ClosureBridgeNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // Get closure from registry
  const closure = env.closureRegistry.get(node.closureId);
  if (!closure) {
    throw new Error(`Missing closure: ${node.closureId}`);
  }

  // Evaluate input slots (if any)
  const inputValues = node.inputSlots.map(slotId => evalSig(slotId, env, nodes));

  // Create legacy context
  const ctx = createLegacyContext(env);

  // Call legacy closure
  // Note: Legacy closures typically only use (t, ctx), not inputValues
  // This is for future compatibility
  const result = closure(env.tAbsMs, ctx);

  return result;
}
```

**Acceptance Criteria:**
- [ ] `evalClosureBridge()` function implemented
- [ ] Evaluator switch includes `case 'closureBridge'`
- [ ] Closure retrieved from registry
- [ ] Missing closure throws clear error
- [ ] Legacy context created from SigEnv
- [ ] Closure called with time and context
- [ ] Result returned and cached
- [ ] Unit test: basic closure call
- [ ] Unit test: missing closure error
- [ ] Integration test: closure in DAG

**Technical Notes:**
- inputSlots currently unused but reserved for future
- Closure evaluation is NOT cached by closure itself
- Result IS cached by evaluator (same as other nodes)

---

### P1: Migration Tracking

**Description:**
Track which block types have been migrated to IR.

```typescript
// Set of block types that are fully migrated to IR
const MIGRATED_BLOCKS = new Set<string>([
  // Add as blocks are migrated in Sprint 7+
  // 'AddSignal',
  // 'MulSignal',
  // etc.
]);

function isMigrated(blockType: string): boolean {
  return MIGRATED_BLOCKS.has(blockType);
}

function getMigrationStatus(): {
  migrated: string[];
  pending: string[];
  total: number;
  percentage: number;
} {
  const allSignalBlocks = [
    'AddSignal', 'SubSignal', 'MulSignal', 'DivSignal',
    'MinSignal', 'MaxSignal', 'ClampSignal',
    'Oscillator', 'Shaper', 'ColorLFO',
    // Add all signal block types
  ];

  const migrated = allSignalBlocks.filter(b => MIGRATED_BLOCKS.has(b));
  const pending = allSignalBlocks.filter(b => !MIGRATED_BLOCKS.has(b));

  return {
    migrated,
    pending,
    total: allSignalBlocks.length,
    percentage: (migrated.length / allSignalBlocks.length) * 100,
  };
}
```

**Acceptance Criteria:**
- [ ] `MIGRATED_BLOCKS` set defined (initially empty)
- [ ] `isMigrated()` function checks if block is migrated
- [ ] `getMigrationStatus()` returns current migration progress
- [ ] Status includes migrated list, pending list, percentage
- [ ] Easy to update as blocks are migrated

**Technical Notes:**
- Start with empty set (all blocks use closures)
- Add blocks to set as they're migrated in Sprint 7+
- Percentage helps track progress

---

### P1: Debug Tracing for Closure Bridge

**Description:**
Extend DebugSink with closure bridge tracing.

```typescript
interface DebugSink {
  // ... existing traces ...
  traceClosureBridge?(info: ClosureBridgeTraceInfo): void;
}

interface ClosureBridgeTraceInfo {
  closureId: string;
  tAbsMs: number;
  result: number;
  executionTimeMs?: number;  // For performance tracking
}
```

**Acceptance Criteria:**
- [ ] `ClosureBridgeTraceInfo` interface defined
- [ ] DebugSink extended with `traceClosureBridge`
- [ ] Trace includes closure ID and result
- [ ] Optional execution time for performance tracking
- [ ] Unit test verifies trace info

**Technical Notes:**
- Execution time helps identify slow closures
- Useful for migration prioritization

---

### P1: Comprehensive Test Suite

**Description:**
Full test coverage for closure bridge.

**Acceptance Criteria:**
- [ ] Test closure registration and retrieval
- [ ] Test missing closure error
- [ ] Test closure called with correct time
- [ ] Test closure called with correct context
- [ ] Test closure result returned
- [ ] Test closure result cached
- [ ] Test closure in DAG with other nodes
- [ ] Test migration status tracking
- [ ] Test debug tracing
- [ ] All tests pass with `just test`

**Test Examples:**

```typescript
describe('closureBridge nodes', () => {
  it('calls registered closure', () => {
    const registry = createClosureRegistry();
    registry.register('testClosure', (t, ctx) => t * 2);

    const nodes: SignalExprIR[] = [
      {
        kind: 'closureBridge',
        type: numType,
        closureId: 'testClosure',
        inputSlots: []
      }
    ];

    const env = createTestEnv({
      tAbsMs: 100,
      closureRegistry: registry
    });

    expect(evalSig(0, env, nodes)).toBe(200);
  });

  it('throws on missing closure', () => {
    const registry = createClosureRegistry();
    // No closure registered

    const nodes: SignalExprIR[] = [
      {
        kind: 'closureBridge',
        type: numType,
        closureId: 'missing',
        inputSlots: []
      }
    ];

    const env = createTestEnv({ closureRegistry: registry });

    expect(() => evalSig(0, env, nodes)).toThrow('Missing closure');
  });

  it('caches closure result', () => {
    let callCount = 0;
    const registry = createClosureRegistry();
    registry.register('countingClosure', (t, ctx) => {
      callCount++;
      return 42;
    });

    const nodes: SignalExprIR[] = [
      {
        kind: 'closureBridge',
        type: numType,
        closureId: 'countingClosure',
        inputSlots: []
      }
    ];

    const env = createTestEnv({ closureRegistry: registry });

    evalSig(0, env, nodes);
    evalSig(0, env, nodes); // Second call same frame

    expect(callCount).toBe(1); // Only called once (cached)
  });

  it('works in DAG with IR nodes', () => {
    const registry = createClosureRegistry();
    registry.register('halfTime', (t, ctx) => t / 2);

    const nodes: SignalExprIR[] = [
      { kind: 'timeAbsMs', type: numType },
      {
        kind: 'closureBridge',
        type: numType,
        closureId: 'halfTime',
        inputSlots: []
      },
      {
        kind: 'zip',
        type: numType,
        a: 0,
        b: 1,
        fn: { opcode: OpCode.Add }
      }
    ];

    const env = createTestEnv({
      tAbsMs: 100,
      closureRegistry: registry
    });

    // timeAbsMs (100) + halfTime (50) = 150
    expect(evalSig(2, env, nodes)).toBe(150);
  });
});

describe('migration tracking', () => {
  it('tracks migration status', () => {
    const status = getMigrationStatus();

    expect(status.total).toBeGreaterThan(0);
    expect(status.percentage).toBeGreaterThanOrEqual(0);
    expect(status.percentage).toBeLessThanOrEqual(100);
  });

  it('isMigrated returns false for unmigrated blocks', () => {
    expect(isMigrated('AddSignal')).toBe(false); // Initially
  });
});
```

---

### P2: Validation and Safety Checks

**Description:**
Add safety checks for closure bridge usage.

```typescript
function validateClosureBridgeNode(
  node: ClosureBridgeNode,
  registry: ClosureRegistry
): void {
  if (!node.closureId) {
    throw new Error('ClosureBridge node missing closureId');
  }

  if (!registry.has(node.closureId)) {
    console.warn(
      `ClosureBridge references unregistered closure: ${node.closureId}. ` +
      `Make sure closure is registered before evaluation.`
    );
  }
}

// Optional: Validate all closure bridges in a DAG before evaluation
function validateClosureBridges(
  nodes: SignalExprIR[],
  registry: ClosureRegistry
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const node of nodes) {
    if (node.kind === 'closureBridge') {
      if (!registry.has(node.closureId)) {
        missing.push(node.closureId);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
```

**Acceptance Criteria:**
- [ ] `validateClosureBridgeNode()` checks single node
- [ ] `validateClosureBridges()` checks entire DAG
- [ ] Missing closures reported clearly
- [ ] Validation can be run before evaluation
- [ ] Unit tests for validation

---

### P2: Update Documentation

**Description:**
Update README with closure bridge documentation.

**Acceptance Criteria:**
- [ ] README updated with closure bridge section
- [ ] Bridge marked as TEMPORARY (migration only)
- [ ] Registration API documented
- [ ] Migration tracking documented
- [ ] Examples for using bridge

**Documentation Content:**

```markdown
## Closure Bridge (Temporary)

The closure bridge enables gradual migration from closure-based signals to
SignalExpr IR. It allows the evaluator to call legacy closures as leaf nodes
in the DAG.

### Usage

```typescript
// 1. Create registry and register legacy closure
const registry = createClosureRegistry();
registry.register('my-block-output', (t, ctx) => Math.sin(t * 0.001));

// 2. Create node referencing the closure
const node: ClosureBridgeNode = {
  kind: 'closureBridge',
  type: numberType,
  closureId: 'my-block-output',
  inputSlots: []
};

// 3. Evaluate normally
const result = evalSig(nodeId, env, nodes);
```

### Migration Status

Track migration progress:

```typescript
const status = getMigrationStatus();
console.log(`Migration: ${status.percentage.toFixed(1)}% complete`);
console.log(`Migrated: ${status.migrated.join(', ')}`);
console.log(`Pending: ${status.pending.join(', ')}`);
```

### Important Notes

- This is a TEMPORARY mechanism for migration
- Will be removed once all blocks are migrated
- Closure results are cached like any other node
- Performance: closure evaluation has overhead vs native IR
```

---

## Definition of Done

Sprint 6 is complete when:

1. [ ] `ClosureBridgeNode` type defined
2. [ ] `LegacyClosure` and `LegacyContext` types defined
3. [ ] `ClosureRegistry` implemented
4. [ ] SigEnv extended with closureRegistry
5. [ ] `evalClosureBridge()` implemented
6. [ ] Migration tracking implemented
7. [ ] All tests pass (`just test`)
8. [ ] No TypeScript errors (`just typecheck`)
9. [ ] Documentation updated

**Files Created/Modified:**

- Modified: `src/runtime/signal-expr/types.ts` (add ClosureBridgeNode)
- Created: `src/runtime/signal-expr/LegacyClosure.ts`
- Created: `src/runtime/signal-expr/ClosureRegistry.ts`
- Created: `src/runtime/signal-expr/MigrationTracking.ts`
- Modified: `src/runtime/signal-expr/SigEnv.ts` (add closureRegistry)
- Modified: `src/runtime/signal-expr/SigEvaluator.ts` (add closureBridge case)
- Modified: `src/runtime/signal-expr/DebugSink.ts` (add traceClosureBridge)
- Modified: `src/runtime/signal-expr/__tests__/SigEvaluator.test.ts` (add tests)
- Modified: `src/runtime/signal-expr/README.md` (update docs)

---

## Risks

1. **Closure compatibility** - Legacy closure signature may have variations
   - Mitigation: Review all existing closure compilers, ensure LegacyContext covers all fields

2. **Performance overhead** - Bridge adds indirection
   - Mitigation: Accept for migration period, remove once migrated

3. **Registry management** - Closures must be registered before evaluation
   - Mitigation: Validate DAG before evaluation, clear error messages

---

## Next Sprint

Sprint 7: Block Compiler Migration - Migrate signal block compilers to emit SignalExpr IR.
