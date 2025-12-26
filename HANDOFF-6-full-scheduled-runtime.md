# Phase 6: Full Scheduled Runtime - Complete Handoff Document

**Mission:** Complete IR-driven runtime with explicit schedule, ValueStore, state management, and hot-swap.

**You are replacing the closure runtime.** After this phase, we run BOTH runtimes in parallel, compare results, then remove the closure runtime.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: ValueStore](#topic-1-valuestore)
3. [Topic 2: StateBuffer System](#topic-2-statebuffer-system)
4. [Topic 3: ScheduleExecutor](#topic-3-scheduleexecutor)
5. [Topic 4: FrameCache System](#topic-4-framecache-system)
6. [Topic 5: Hot-Swap Semantics](#topic-5-hot-swap-semantics)
7. [Topic 6: Determinism Enforcement](#topic-6-determinism-enforcement)
8. [Topic 7: Legacy Runtime Removal](#topic-7-legacy-runtime-removal)
9. [Testing Strategy](#testing-strategy)
10. [Verification Checklist](#verification-checklist)

---

## Philosophy

### Schedule is Explicit

The runtime doesn't "figure out" what to evaluate. The schedule tells it exactly what to do:

```typescript
// OLD: Traverse closure tree, hope for the best
const result = program.evaluate(t);

// NEW: Execute explicit steps in order
for (const step of schedule.steps) {
  executeStep(step, runtime);
}
```

### Single Writer Per Slot

Every ValueSlot has exactly one writer per frame. This is enforced at compile time:

```typescript
// Step 1: NodeA writes slot 0
{ kind: 'nodeEval', outputs: [0], ... }

// Step 2: NodeB reads slot 0, writes slot 1
{ kind: 'nodeEval', inputs: [0], outputs: [1], ... }

// NEVER: Two steps writing the same slot in one frame
```

---

## Topic 1: ValueStore

### ValueStore Structure

```typescript
interface ValueStore {
  // Typed arrays for each value type
  f64: Float64Array;      // Numbers, phases, etc.
  f32: Float32Array;      // Floats
  i32: Int32Array;        // Integers
  u32: Uint32Array;       // Unsigned integers

  // Slot metadata
  slotMeta: SlotMeta[];   // Type info per slot

  // Object storage (for complex types)
  objects: unknown[];     // FieldHandles, RenderTrees, etc.
}

interface SlotMeta {
  slot: ValueSlot;
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object';
  offset: number;         // Offset in typed array
  type: TypeDesc;
}
```

### Slot Access

```typescript
class ValueStoreImpl implements ValueStore {
  read(slot: ValueSlot): unknown {
    const meta = this.slotMeta[slot];
    switch (meta.storage) {
      case 'f64': return this.f64[meta.offset];
      case 'f32': return this.f32[meta.offset];
      case 'i32': return this.i32[meta.offset];
      case 'u32': return this.u32[meta.offset];
      case 'object': return this.objects[meta.offset];
    }
  }

  write(slot: ValueSlot, value: unknown): void {
    const meta = this.slotMeta[slot];
    switch (meta.storage) {
      case 'f64': this.f64[meta.offset] = value as number; break;
      case 'f32': this.f32[meta.offset] = value as number; break;
      case 'i32': this.i32[meta.offset] = value as number; break;
      case 'u32': this.u32[meta.offset] = value as number; break;
      case 'object': this.objects[meta.offset] = value; break;
    }
  }
}
```

### Single Writer Invariant

```typescript
// Compile-time check
function validateSingleWriter(schedule: ScheduleIR): ValidationResult {
  const writers = new Map<ValueSlot, StepIR>();

  for (const step of schedule.steps) {
    for (const output of step.outputs) {
      if (writers.has(output)) {
        return {
          valid: false,
          error: `Slot ${output} written by multiple steps`
        };
      }
      writers.set(output, step);
    }
  }

  return { valid: true };
}
```

---

## Topic 2: StateBuffer System

### StateLayout

```typescript
interface StateLayout {
  // Allocation info for each state cell
  cells: StateCellLayout[];

  // Total sizes
  f64Size: number;
  f32Size: number;
  i32Size: number;
}

interface StateCellLayout {
  stateId: StateId;
  storage: 'f64' | 'f32' | 'i32';
  offset: number;
  size: number;           // Number of elements (for arrays like delay buffers)
  nodeId: string;         // For debug/hot-swap matching
  role: string;           // 'accumulator', 'ringBuffer', etc.
}
```

### StateBuffer

```typescript
interface StateBuffer {
  f64: Float64Array;
  f32: Float32Array;
  i32: Int32Array;
}

function createStateBuffer(layout: StateLayout): StateBuffer {
  return {
    f64: new Float64Array(layout.f64Size),
    f32: new Float32Array(layout.f32Size),
    i32: new Int32Array(layout.i32Size)
  };
}
```

### State Initialization

```typescript
function initializeState(
  buffer: StateBuffer,
  layout: StateLayout,
  constPool: ConstPool
): void {
  for (const cell of layout.cells) {
    const initial = cell.initialConstId !== undefined
      ? getConst(constPool, cell.initialConstId)
      : 0;

    switch (cell.storage) {
      case 'f64':
        for (let i = 0; i < cell.size; i++) {
          buffer.f64[cell.offset + i] = initial as number;
        }
        break;
      // Similar for f32, i32
    }
  }
}
```

---

## Topic 3: ScheduleExecutor

### Executor Interface

```typescript
interface ScheduleExecutor {
  /**
   * Execute one frame of the schedule.
   */
  executeFrame(
    program: CompiledProgramIR,
    runtime: RuntimeState,
    tMs: number
  ): RenderOutput;
}
```

### Execution Algorithm

```typescript
function executeFrame(
  program: CompiledProgramIR,
  runtime: RuntimeState,
  tMs: number
): RenderOutput {
  // 1. New frame
  runtime.frameCache.newFrame();
  runtime.values.clear();

  // 2. Compute effective time
  const effectiveTime = resolveTime(tMs, program.timeModel);

  // 3. Execute each step in order
  for (const step of program.schedule.steps) {
    executeStep(step, program, runtime, effectiveTime);
  }

  // 4. Extract render output
  return extractRenderOutput(runtime);
}
```

### Step Execution

```typescript
function executeStep(
  step: StepIR,
  program: CompiledProgramIR,
  runtime: RuntimeState,
  time: EffectiveTime
): void {
  switch (step.kind) {
    case 'timeDerive':
      executeTimeDerive(step, runtime, time);
      break;

    case 'nodeEval':
      executeNodeEval(step, program, runtime);
      break;

    case 'busEval':
      executeBusEval(step, program, runtime);
      break;

    case 'materialize':
      executeMaterialize(step, program, runtime);
      break;

    case 'renderSink':
      executeRenderSink(step, program, runtime);
      break;

    case 'debugProbe':
      executeDebugProbe(step, runtime);
      break;
  }
}
```

### Time Derive Step

```typescript
function executeTimeDerive(
  step: TimeDeriveStep,
  runtime: RuntimeState,
  time: EffectiveTime
): void {
  // Write canonical time values to their slots
  runtime.values.write(step.outputs[0], time.tAbsMs);
  runtime.values.write(step.outputs[1], time.tModelMs);
  if (step.outputs[2] !== undefined) {
    runtime.values.write(step.outputs[2], time.phase01);
  }
  if (step.outputs[3] !== undefined) {
    runtime.values.write(step.outputs[3], time.wrapEvent);
  }
}
```

### Node Eval Step

```typescript
function executeNodeEval(
  step: NodeEvalStep,
  program: CompiledProgramIR,
  runtime: RuntimeState
): void {
  // Read inputs
  const inputs = step.inputs.map(slot => runtime.values.read(slot));

  // Execute opcode
  const outputs = executeOpcode(step.opcode, inputs, program, runtime);

  // Write outputs
  for (let i = 0; i < step.outputs.length; i++) {
    runtime.values.write(step.outputs[i], outputs[i]);
  }
}
```

---

## Topic 4: FrameCache System

### FrameCache Structure

```typescript
interface FrameCache {
  frameId: number;

  // Signal caches (from Phase 4)
  sigValue: Float64Array;
  sigStamp: Uint32Array;

  // Field handle caches (from Phase 5)
  fieldHandles: FieldHandle[];
  fieldStamp: Uint32Array;

  // Materialized buffer cache
  bufferCache: Map<string, ArrayBufferView>;

  // Invalidation
  invalidate(): void;
  newFrame(): void;
}
```

### Cache Key Validation

```typescript
interface CacheKeySpec {
  policy: 'none' | 'perFrame' | 'untilInvalidated';
  deps: CacheDep[];
}

function shouldInvalidate(
  spec: CacheKeySpec,
  oldDeps: CacheDepValues,
  newDeps: CacheDepValues
): boolean {
  if (spec.policy === 'none') return true;
  if (spec.policy === 'perFrame') return true; // Always fresh per frame

  // Check each dependency
  for (const dep of spec.deps) {
    switch (dep.kind) {
      case 'time':
        if (oldDeps.time !== newDeps.time) return true;
        break;
      case 'phase':
        if (oldDeps.phase !== newDeps.phase) return true;
        break;
      case 'slot':
        if (oldDeps.slots[dep.slot] !== newDeps.slots[dep.slot]) return true;
        break;
      case 'domain':
        if (oldDeps.domainCounts[dep.domainSlot] !== newDeps.domainCounts[dep.domainSlot]) return true;
        break;
      case 'viewport':
        if (!viewportsEqual(oldDeps.viewport, newDeps.viewport)) return true;
        break;
      case 'seed':
        if (oldDeps.seed !== newDeps.seed) return true;
        break;
    }
  }

  return false;
}
```

---

## Topic 5: Hot-Swap Semantics

### The No-Jank Requirement

When the user edits the patch, the animation must continue smoothly:
- Time continues (no reset)
- Compatible state preserves (no pops)
- Incompatible state reinitializes gracefully

### State Preservation via Layout Hash

```typescript
interface StateLayoutHash {
  // Per-cell hash for matching
  cellHashes: Map<string, string>;  // stableKey -> layoutHash
}

function computeLayoutHash(cell: StateCellLayout): string {
  return hash([
    cell.storage,
    cell.size,
    cell.role,
    cell.type?.domain
  ].join(':'));
}

function computeStableKey(cell: StateCellLayout): string {
  return `${cell.nodeId}:${cell.role}`;
}
```

### Swap Algorithm

```typescript
function hotSwap(
  oldProgram: CompiledProgramIR,
  oldState: StateBuffer,
  newProgram: CompiledProgramIR
): StateBuffer {
  const newState = createStateBuffer(newProgram.stateLayout);

  // Build hash maps
  const oldHashes = buildLayoutHashes(oldProgram.stateLayout);
  const newHashes = buildLayoutHashes(newProgram.stateLayout);

  // Preserve compatible cells
  for (const newCell of newProgram.stateLayout.cells) {
    const stableKey = computeStableKey(newCell);
    const oldCell = findCellByStableKey(oldProgram.stateLayout, stableKey);

    if (oldCell && layoutHashesMatch(oldHashes, newHashes, stableKey)) {
      // Copy state
      copyStateCell(oldState, oldCell, newState, newCell);
    } else {
      // Initialize fresh
      initializeCell(newState, newCell, newProgram.constPool);
    }
  }

  return newState;
}
```

### Time Continuity

```typescript
function handleTimeModelChange(
  oldModel: TimeModelIR,
  newModel: TimeModelIR,
  currentTAbsMs: number
): { tAbsMs: number; resetState: boolean } {
  // Same kind: continue
  if (oldModel.kind === newModel.kind) {
    return { tAbsMs: currentTAbsMs, resetState: false };
  }

  // Different kind: map time appropriately
  if (newModel.kind === 'cyclic' && oldModel.kind === 'infinite') {
    // Map absolute time to phase
    return { tAbsMs: currentTAbsMs, resetState: false };
  }

  // Topology change: don't reset unless explicitly requested
  return { tAbsMs: currentTAbsMs, resetState: false };
}
```

---

## Topic 6: Determinism Enforcement

### Stable Topological Sort

```typescript
function stableTopoSort(graph: DepGraph): StepIR[] {
  const sorted: StepIR[] = [];
  const visited = new Set<number>();
  const inStack = new Set<number>();

  function visit(nodeId: number): void {
    if (inStack.has(nodeId)) {
      throw new Error('Cycle detected');
    }
    if (visited.has(nodeId)) return;

    inStack.add(nodeId);

    // Visit dependencies in stable order (by nodeId)
    const deps = graph.getDeps(nodeId).sort((a, b) => a - b);
    for (const dep of deps) {
      visit(dep);
    }

    inStack.delete(nodeId);
    visited.add(nodeId);
    sorted.push(graph.getStep(nodeId));
  }

  // Visit all nodes in stable order
  const nodeIds = graph.getAllNodeIds().sort((a, b) => a - b);
  for (const nodeId of nodeIds) {
    visit(nodeId);
  }

  return sorted;
}
```

### Publisher Ordering

```typescript
function sortPublishers(publishers: PublisherIR[]): PublisherIR[] {
  return [...publishers].sort((a, b) => {
    // Primary: sortKey
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;

    // Secondary: source block index
    if (a.sourceBlockIndex !== b.sourceBlockIndex) {
      return a.sourceBlockIndex - b.sourceBlockIndex;
    }

    // Tertiary: source port index
    if (a.sourcePortIndex !== b.sourcePortIndex) {
      return a.sourcePortIndex - b.sourcePortIndex;
    }

    // Final: publisher id
    return a.id - b.id;
  });
}
```

### No Map/Set Iteration in Hot Paths

```typescript
// BAD: Iteration order is insertion order (unstable)
for (const [key, value] of map) { ... }

// GOOD: Get keys, sort, iterate
const keys = Array.from(map.keys()).sort();
for (const key of keys) {
  const value = map.get(key);
  ...
}
```

---

## Topic 7: Legacy Runtime Removal

### Parallel Execution Phase

```typescript
function executeFrameWithValidation(
  program: DualEmitResult,
  runtime: RuntimeState,
  tMs: number
): RenderOutput {
  // Run closure runtime
  const closureResult = executeClosureRuntime(program.closure, runtime, tMs);

  // Run IR runtime
  const irResult = executeIRRuntime(program.ir, runtime, tMs);

  // Compare
  if (process.env.NODE_ENV === 'development') {
    validateResults(closureResult, irResult);
  }

  // Return IR result (or closure if IR fails)
  return irResult ?? closureResult;
}
```

### Validation

```typescript
function validateResults(closure: RenderOutput, ir: RenderOutput): void {
  // Compare instance counts
  if (closure.instanceCount !== ir.instanceCount) {
    console.error(`Instance count mismatch: closure=${closure.instanceCount}, ir=${ir.instanceCount}`);
  }

  // Compare buffer values (with tolerance)
  for (const [name, closureBuf] of Object.entries(closure.buffers)) {
    const irBuf = ir.buffers[name];
    if (!irBuf) {
      console.error(`Missing buffer in IR: ${name}`);
      continue;
    }

    compareBuffers(name, closureBuf, irBuf);
  }

  // Compare uniforms
  for (const [name, closureVal] of Object.entries(closure.uniforms)) {
    const irVal = ir.uniforms[name];
    if (Math.abs(closureVal - irVal) > 1e-6) {
      console.error(`Uniform mismatch ${name}: closure=${closureVal}, ir=${irVal}`);
    }
  }
}
```

### Final Removal

Once validation passes for all test cases:

```typescript
// Remove dual-emit
function compilePatch(patch: Patch): CompiledProgramIR {
  // Only IR, no closures
  return compileToIR(patch);
}

// Remove closure runtime
function executeFrame(
  program: CompiledProgramIR,
  runtime: RuntimeState,
  tMs: number
): RenderOutput {
  return executeIRRuntime(program, runtime, tMs);
}
```

---

## Testing Strategy

### ValueStore Tests

```typescript
describe('ValueStore', () => {
  it('reads and writes slots', () => {
    const store = createValueStore([
      { slot: 0, storage: 'f64', offset: 0, type: numberType }
    ]);

    store.write(0, 42);
    expect(store.read(0)).toBe(42);
  });
});
```

### Schedule Executor Tests

```typescript
describe('ScheduleExecutor', () => {
  it('executes steps in order', () => {
    const schedule: ScheduleIR = {
      steps: [
        { kind: 'timeDerive', outputs: [0, 1] },
        { kind: 'nodeEval', opcode: OpCode.Sin, inputs: [0], outputs: [2] }
      ]
    };

    const runtime = createRuntime();
    executeFrame(program, runtime, 1000);

    expect(runtime.values.read(0)).toBe(1000); // tAbsMs
    expect(runtime.values.read(2)).toBeCloseTo(Math.sin(1000), 5);
  });
});
```

### Hot-Swap Tests

```typescript
describe('Hot-swap', () => {
  it('preserves compatible state', () => {
    const oldProgram = compile(patchV1);
    const oldState = createStateBuffer(oldProgram.stateLayout);
    oldState.f64[0] = 100; // Accumulator value

    const newProgram = compile(patchV2); // Same integrate block
    const newState = hotSwap(oldProgram, oldState, newProgram);

    expect(newState.f64[0]).toBe(100); // Preserved
  });

  it('reinitializes incompatible state', () => {
    const oldProgram = compile(patchV1);
    const oldState = createStateBuffer(oldProgram.stateLayout);
    oldState.f64[0] = 100;

    const newProgram = compile(patchV3); // Different block, different layout
    const newState = hotSwap(oldProgram, oldState, newProgram);

    expect(newState.f64[0]).toBe(0); // Reset to default
  });
});
```

### Determinism Tests

```typescript
describe('Determinism', () => {
  it('produces identical output for identical input', () => {
    const program = compile(patch);
    const runtime1 = createRuntime();
    const runtime2 = createRuntime();

    const result1 = executeFrame(program, runtime1, 1000);
    const result2 = executeFrame(program, runtime2, 1000);

    expect(buffersEqual(result1.buffers.pos, result2.buffers.pos)).toBe(true);
  });
});
```

---

## Verification Checklist

### ValueStore
- [ ] Typed arrays for each storage type
- [ ] Slot metadata correct
- [ ] Single writer invariant validated

### StateBuffer System
- [ ] Layout computed correctly
- [ ] Cells initialized properly
- [ ] State persists across frames

### ScheduleExecutor
- [ ] All step kinds executed
- [ ] Steps execute in order
- [ ] Time derive populates slots

### FrameCache
- [ ] Per-frame invalidation works
- [ ] Cache key validation works
- [ ] Cross-frame caching optional

### Hot-Swap
- [ ] Compatible state preserved
- [ ] Incompatible state reinitialized
- [ ] Time continuity maintained
- [ ] No visual pops

### Determinism
- [ ] Stable topo sort
- [ ] Publisher ordering stable
- [ ] No Map/Set iteration in hot paths
- [ ] Same inputs = same outputs

### Legacy Removal
- [ ] Parallel execution works
- [ ] Validation catches mismatches
- [ ] Clean removal after validation

---

## Success Criteria

Phase 6 is complete when:

1. IR runtime executes full schedule
2. Hot-swap preserves compatible state
3. Determinism tests pass
4. IR and closure results match
5. Closure runtime can be removed
