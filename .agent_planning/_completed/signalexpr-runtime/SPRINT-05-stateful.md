# Sprint 5: Stateful Signal Operations

Generated: 2025-12-25
Depends on: Sprint 4 (Transform)
Source: HANDOFF.md §4, design-docs/12-Compiler-Final/12-SignalExpr.md, design-docs/12-Compiler-Final/13-SignalExpr-Evaluator.md

---

## Sprint Goal

**Implement stateful signal operations with explicit state management, enabling integrate, delay, sample-hold, and slew operations.**

When complete, the evaluator can:
- Maintain persistent state across frames using StateBuffer
- Evaluate stateful operations (integrate, delay, sampleHold, slew)
- Complete slew transform step (from Sprint 4)
- Preserve and reset state correctly

---

## Prerequisites

Sprint 4 must be complete:
- [ ] Transform node evaluation working
- [ ] SlewStep placeholder throwing error
- [ ] All pure transform steps implemented

---

## Scope

### In Scope (This Sprint)

1. **StateBuffer System**
   - Typed arrays for state storage (f64, f32, i32)
   - StateLayout describing allocation
   - State initialization and reset

2. **Stateful Node Evaluation**
   - `stateful` node kind
   - Operations: integrate, delayMs, delayFrames, sampleHold, slew

3. **Slew Transform Step**
   - Complete slew implementation from Sprint 4
   - Exponential smoothing with rate parameter

4. **RuntimeCtx Integration**
   - deltaSec for time-based operations
   - Frame timing information

### Out of Scope

- Hot-swap state preservation (Phase 6)
- State layout hashing (Phase 6)
- State migration between incompatible layouts

---

## Work Items

### P0: Define StateBuffer Types

**Description:**
Create the state buffer structure for holding stateful operation values.

```typescript
interface StateBuffer {
  f64: Float64Array;   // 64-bit floats (most signals)
  f32: Float32Array;   // 32-bit floats (when precision not critical)
  i32: Int32Array;     // 32-bit integers (counters, indices)
}

interface StateLayout {
  f64Count: number;    // Number of f64 slots needed
  f32Count: number;    // Number of f32 slots needed
  i32Count: number;    // Number of i32 slots needed
}

function createStateBuffer(layout: StateLayout): StateBuffer {
  return {
    f64: new Float64Array(layout.f64Count),
    f32: new Float32Array(layout.f32Count),
    i32: new Int32Array(layout.i32Count),
  };
}

function resetStateBuffer(buffer: StateBuffer): void {
  buffer.f64.fill(0);
  buffer.f32.fill(0);
  buffer.i32.fill(0);
}
```

**Acceptance Criteria:**
- [ ] `StateBuffer` interface defined with f64, f32, i32 arrays
- [ ] `StateLayout` interface defined with counts
- [ ] `createStateBuffer()` factory allocates typed arrays
- [ ] `resetStateBuffer()` zeros all arrays
- [ ] Types exported for use in evaluator
- [ ] Unit tests for creation and reset

**Technical Notes:**
- Typed arrays are pre-allocated based on StateLayout
- Layout is determined at compile time
- State persists across frames, reset on demand

---

### P0: Define RuntimeCtx Interface

**Description:**
Create the runtime context that provides frame timing information.

```typescript
interface RuntimeCtx {
  readonly deltaSec: number;     // Time since last frame (seconds)
  readonly deltaMs: number;      // Time since last frame (milliseconds)
  readonly frameIndex: number;   // Monotonic frame counter
}

function createRuntimeCtx(deltaSec: number, frameIndex: number): RuntimeCtx {
  return {
    deltaSec,
    deltaMs: deltaSec * 1000,
    frameIndex,
  };
}
```

**Acceptance Criteria:**
- [ ] `RuntimeCtx` interface defined with deltaSec, deltaMs, frameIndex
- [ ] `createRuntimeCtx()` factory function
- [ ] All fields are readonly
- [ ] Types exported

**Technical Notes:**
- deltaSec is typically ~0.016 (60fps) or ~0.033 (30fps)
- frameIndex is monotonically increasing
- RuntimeCtx is frame-scoped

---

### P0: Extend SigEnv with State and RuntimeCtx

**Description:**
Add state and runtime context to the evaluation environment.

```typescript
interface SigEnv {
  readonly tAbsMs: number;
  readonly constPool: ConstPool;
  readonly cache: SigFrameCache;
  readonly slotValues: SlotValueReader;
  readonly debug?: DebugSink;
  readonly transformTable: TransformTable;
  readonly easingCurves?: EasingCurveTable;
  readonly state: StateBuffer;        // NEW
  readonly runtimeCtx: RuntimeCtx;    // NEW
}
```

**Acceptance Criteria:**
- [ ] SigEnv includes `state: StateBuffer` (required)
- [ ] SigEnv includes `runtimeCtx: RuntimeCtx` (required)
- [ ] `createSigEnv()` updated to accept state and runtimeCtx
- [ ] Default state buffer for tests (empty layout)
- [ ] Default runtimeCtx for tests (deltaSec=0.016)

**Technical Notes:**
- State is shared across all evaluations in a frame
- RuntimeCtx changes each frame
- State persists across frames (passed from previous frame)

---

### P0: Add Stateful Node Type

**Description:**
Extend SignalExprIR union with `stateful` node kind.

```typescript
interface StatefulNode {
  kind: 'stateful';
  type: TypeDesc;
  op: StatefulOp;
  input?: SigExprId;           // Some ops have no input (e.g., pure accumulator)
  params?: StatefulParams;
  stateOffset: number;         // Index into StateBuffer.f64
}

type StatefulOp = 'integrate' | 'delayMs' | 'delayFrames' | 'sampleHold' | 'slew';

interface StatefulParams {
  // For delayMs
  delayMs?: number;
  bufferSize?: number;

  // For delayFrames
  delayFrames?: number;

  // For sampleHold
  trigger?: SigExprId;

  // For slew
  rate?: number;
}
```

**Acceptance Criteria:**
- [ ] `StatefulNode` interface added to SignalExprIR union
- [ ] `StatefulOp` type with all 5 operations
- [ ] `StatefulParams` interface with operation-specific params
- [ ] Node includes `stateOffset` for state access
- [ ] Node includes optional `input` signal reference
- [ ] Type includes JSDoc explaining each operation
- [ ] Type exports updated

**Technical Notes:**
- stateOffset is index into StateBuffer.f64 (or other array as needed)
- Different ops use different amounts of state
- integrate: 1 f64 (accumulator)
- delayMs: 1 i32 (write index) + N f64 (ring buffer)
- sampleHold: 2 f64 (held value, last trigger)
- slew: 1 f64 (current smoothed value)

---

### P0: Implement Integrate Operation

**Description:**
Implement integration (accumulation over time).

```typescript
function evalIntegrate(
  node: StatefulNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined
    ? evalSig(node.input, env, nodes)
    : 0;

  const current = env.state.f64[node.stateOffset];
  const dt = env.runtimeCtx.deltaSec;

  // Euler integration: accumulator += input * dt
  const next = current + input * dt;

  // Update state
  env.state.f64[node.stateOffset] = next;

  return next;
}
```

**Acceptance Criteria:**
- [ ] `evalIntegrate()` function implemented
- [ ] Reads current accumulator from state
- [ ] Adds `input * deltaSec` to accumulator
- [ ] Writes new value back to state
- [ ] Returns new accumulated value
- [ ] No input defaults to 0
- [ ] Unit test: accumulates over multiple frames
- [ ] Unit test: different deltaSec values

**Technical Notes:**
- Euler integration is simple but sufficient
- State persists across frames
- integrate(1) over 1 second = 1 (approximately)

---

### P0: Implement SampleHold Operation

**Description:**
Implement sample-and-hold with trigger detection.

```typescript
function evalSampleHold(
  node: StatefulNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined
    ? evalSig(node.input, env, nodes)
    : 0;
  const trigger = evalSig(node.params!.trigger as SigExprId, env, nodes);

  const heldValue = env.state.f64[node.stateOffset];
  const lastTrigger = env.state.f64[node.stateOffset + 1];

  // Detect rising edge (trigger crosses 0.5 threshold)
  if (trigger > 0.5 && lastTrigger <= 0.5) {
    // Sample the input
    env.state.f64[node.stateOffset] = input;
    env.state.f64[node.stateOffset + 1] = trigger;
    return input;
  }

  // Update trigger state
  env.state.f64[node.stateOffset + 1] = trigger;

  // Return held value
  return heldValue;
}
```

**Acceptance Criteria:**
- [ ] `evalSampleHold()` function implemented
- [ ] Detects rising edge of trigger (crosses 0.5)
- [ ] Samples input on rising edge
- [ ] Returns held value otherwise
- [ ] State: heldValue at offset, lastTrigger at offset+1
- [ ] Unit test: samples on rising edge
- [ ] Unit test: holds value between edges
- [ ] Unit test: ignores falling edge

**Technical Notes:**
- Trigger threshold is 0.5 (consistent with select)
- Rising edge: was <= 0.5, now > 0.5
- Uses 2 state slots: held value and last trigger

---

### P0: Implement Slew Operation (and Transform Step)

**Description:**
Implement exponential smoothing for both stateful node and transform step.

```typescript
function evalSlew(
  node: StatefulNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const target = node.input !== undefined
    ? evalSig(node.input, env, nodes)
    : 0;
  const rate = node.params?.rate ?? 1;

  return applySlewCore(target, rate, node.stateOffset, env);
}

function applySlewCore(
  target: number,
  rate: number,
  stateOffset: number,
  env: SigEnv
): number {
  const current = env.state.f64[stateOffset];
  const dt = env.runtimeCtx.deltaSec;

  // Exponential approach: alpha = 1 - e^(-rate * dt)
  const alpha = 1 - Math.exp(-rate * dt);
  const next = current + (target - current) * alpha;

  // Update state
  env.state.f64[stateOffset] = next;

  return next;
}

// Update applyTransformStep for slew:
case 'slew':
  return applySlewCore(value, step.rate, step.stateOffset, env);
```

**Acceptance Criteria:**
- [ ] `evalSlew()` function implemented for stateful node
- [ ] `applySlewCore()` shared implementation
- [ ] Transform step slew updated to use applySlewCore
- [ ] Exponential smoothing formula correct
- [ ] Higher rate = faster approach
- [ ] Unit test: slew towards target over frames
- [ ] Unit test: different rate values
- [ ] Unit test: slew transform step works

**Technical Notes:**
- Rate controls smoothing speed (higher = faster)
- rate=10 means roughly 99% approach in 0.5 seconds
- Exponential approach never exactly reaches target

---

### P1: Implement DelayMs Operation

**Description:**
Implement delay using ring buffer.

```typescript
function evalDelayMs(
  node: StatefulNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined
    ? evalSig(node.input, env, nodes)
    : 0;

  const delayMs = node.params?.delayMs ?? 100;
  const bufferSize = node.params?.bufferSize ?? 64;

  // State layout:
  // i32[stateOffset]: write index
  // f64[stateOffset ... stateOffset + bufferSize - 1]: ring buffer

  const i32Offset = node.stateOffset;  // For write index
  const f64Offset = node.stateOffset;  // For ring buffer

  // Calculate read offset based on delay
  const samplesDelay = Math.floor(delayMs / (env.runtimeCtx.deltaMs));
  const readOffset = Math.min(samplesDelay, bufferSize - 1);

  // Read from delay buffer
  const writeIdx = env.state.i32[i32Offset];
  const readIdx = (writeIdx + bufferSize - readOffset) % bufferSize;
  const result = env.state.f64[f64Offset + 1 + readIdx];

  // Write current value to buffer
  env.state.f64[f64Offset + 1 + writeIdx] = input;
  env.state.i32[i32Offset] = (writeIdx + 1) % bufferSize;

  return result;
}
```

**Acceptance Criteria:**
- [ ] `evalDelayMs()` function implemented
- [ ] Ring buffer for sample storage
- [ ] Write index tracked in i32 state
- [ ] Read position calculated from delay time
- [ ] Buffer wraps correctly
- [ ] Unit test: basic delay
- [ ] Unit test: delay longer than buffer (clamps)
- [ ] Unit test: delay changes over time

**Technical Notes:**
- delayMs is converted to sample count using deltaMs
- Buffer size limits maximum delay
- Ring buffer is simple and efficient

---

### P1: Implement DelayFrames Operation

**Description:**
Implement frame-based delay (simpler than time-based).

```typescript
function evalDelayFrames(
  node: StatefulNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  const input = node.input !== undefined
    ? evalSig(node.input, env, nodes)
    : 0;

  const delayFrames = node.params?.delayFrames ?? 1;
  const bufferSize = delayFrames + 1;

  const i32Offset = node.stateOffset;
  const f64Offset = node.stateOffset;

  const writeIdx = env.state.i32[i32Offset];
  const readIdx = (writeIdx + 1) % bufferSize;  // Oldest value
  const result = env.state.f64[f64Offset + 1 + readIdx];

  env.state.f64[f64Offset + 1 + writeIdx] = input;
  env.state.i32[i32Offset] = (writeIdx + 1) % bufferSize;

  return result;
}
```

**Acceptance Criteria:**
- [ ] `evalDelayFrames()` function implemented
- [ ] Fixed-size ring buffer (delayFrames + 1)
- [ ] Returns value from N frames ago
- [ ] Unit test: 1 frame delay
- [ ] Unit test: 5 frame delay

**Technical Notes:**
- Simpler than delayMs (fixed sample count)
- Buffer size is delayFrames + 1 (need one extra for current)

---

### P1: Main Evaluator Integration

**Description:**
Add stateful node case to main evaluator.

```typescript
// In evalSig switch:
case 'stateful':
  result = evalStateful(node, env, nodes);
  break;

function evalStateful(
  node: StatefulNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  switch (node.op) {
    case 'integrate':
      return evalIntegrate(node, env, nodes);
    case 'sampleHold':
      return evalSampleHold(node, env, nodes);
    case 'slew':
      return evalSlew(node, env, nodes);
    case 'delayMs':
      return evalDelayMs(node, env, nodes);
    case 'delayFrames':
      return evalDelayFrames(node, env, nodes);
    default:
      throw new Error(`Unknown stateful op: ${node.op}`);
  }
}
```

**Acceptance Criteria:**
- [ ] Evaluator switch includes `case 'stateful'`
- [ ] `evalStateful()` dispatches to op-specific functions
- [ ] All 5 ops work through main evaluator
- [ ] Results are cached after evaluation
- [ ] Integration test: stateful node in DAG

---

### P1: Comprehensive Test Suite for Stateful Ops

**Description:**
Full test coverage for stateful operations.

**Acceptance Criteria:**
- [ ] StateBuffer creation and reset tests
- [ ] RuntimeCtx creation tests
- [ ] Integrate: accumulates correctly
- [ ] Integrate: respects deltaSec
- [ ] Integrate: persists across frames
- [ ] SampleHold: samples on rising edge
- [ ] SampleHold: holds between edges
- [ ] SampleHold: ignores falling edge
- [ ] Slew: approaches target
- [ ] Slew: rate controls speed
- [ ] Slew (transform): works in chain
- [ ] DelayMs: delays signal
- [ ] DelayMs: ring buffer wraps
- [ ] DelayFrames: delays by N frames
- [ ] State persists across frames
- [ ] State reset zeroes values
- [ ] All tests pass with `just test`

**Test Examples:**

```typescript
describe('stateful nodes', () => {
  describe('integrate', () => {
    it('accumulates input over time', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 1.0
        {
          kind: 'stateful',
          type: numType,
          op: 'integrate',
          input: 0,
          stateOffset: 0
        }
      ];

      const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });
      const runtimeCtx = createRuntimeCtx(0.1, 0); // 0.1 sec per frame

      const env1 = createTestEnv({
        consts: [1.0],
        state,
        runtimeCtx
      });

      // Frame 1: 0 + 1.0 * 0.1 = 0.1
      expect(evalSig(1, env1, nodes)).toBeCloseTo(0.1, 5);

      // Frame 2: 0.1 + 1.0 * 0.1 = 0.2
      newFrame(env1.cache, 1);
      const env2 = createTestEnv({
        consts: [1.0],
        state,
        runtimeCtx: createRuntimeCtx(0.1, 1)
      });
      expect(evalSig(1, env2, nodes)).toBeCloseTo(0.2, 5);
    });
  });

  describe('sampleHold', () => {
    it('samples on rising edge', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // input: 42
        { kind: 'const', type: numType, constId: 1 }, // trigger: 0 (low)
        {
          kind: 'stateful',
          type: numType,
          op: 'sampleHold',
          input: 0,
          params: { trigger: 1 },
          stateOffset: 0
        }
      ];

      const state = createStateBuffer({ f64Count: 2, f32Count: 0, i32Count: 0 });

      // Frame 1: trigger low, no sample yet
      const env1 = createTestEnv({
        consts: [42, 0],
        state,
        runtimeCtx: createRuntimeCtx(0.016, 0)
      });
      expect(evalSig(2, env1, nodes)).toBe(0); // Initial held value

      // Frame 2: trigger high - sample!
      newFrame(env1.cache, 1);
      const nodesHighTrigger = [...nodes];
      nodesHighTrigger[1] = { kind: 'const', type: numType, constId: 1 }; // trigger: 1
      const env2 = createTestEnv({
        consts: [42, 1],
        state,
        runtimeCtx: createRuntimeCtx(0.016, 1)
      });
      expect(evalSig(2, env2, nodesHighTrigger)).toBe(42); // Sampled!
    });
  });

  describe('slew', () => {
    it('smoothly approaches target', () => {
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // target: 100
        {
          kind: 'stateful',
          type: numType,
          op: 'slew',
          input: 0,
          params: { rate: 10 },
          stateOffset: 0
        }
      ];

      const state = createStateBuffer({ f64Count: 1, f32Count: 0, i32Count: 0 });

      // Frame 1: start at 0, slew towards 100
      const env1 = createTestEnv({
        consts: [100],
        state,
        runtimeCtx: createRuntimeCtx(0.1, 0)
      });
      const v1 = evalSig(1, env1, nodes);
      expect(v1).toBeGreaterThan(0);
      expect(v1).toBeLessThan(100);

      // Frame 2: closer to 100
      newFrame(env1.cache, 1);
      const env2 = createTestEnv({
        consts: [100],
        state,
        runtimeCtx: createRuntimeCtx(0.1, 1)
      });
      const v2 = evalSig(1, env2, nodes);
      expect(v2).toBeGreaterThan(v1);
    });
  });
});
```

---

### P2: Debug Tracing for Stateful Ops

**Description:**
Extend DebugSink with stateful operation tracing.

```typescript
interface DebugSink {
  traceBusCombine?(info: BusCombineTraceInfo): void;
  traceTransform?(info: TransformTraceInfo): void;
  traceStateful?(info: StatefulTraceInfo): void;  // NEW
}

interface StatefulTraceInfo {
  op: StatefulOp;
  input: number;
  prevState: number;
  newState: number;
  result: number;
}
```

**Acceptance Criteria:**
- [ ] `StatefulTraceInfo` interface defined
- [ ] DebugSink extended with `traceStateful`
- [ ] Trace includes previous and new state
- [ ] Unit test verifies trace info

---

### P2: Update Documentation

**Description:**
Update README with stateful operation documentation.

**Acceptance Criteria:**
- [ ] README updated with StateBuffer explanation
- [ ] README updated with RuntimeCtx explanation
- [ ] Each stateful op documented with examples
- [ ] State layout requirements documented
- [ ] Hot-swap considerations noted (future)

---

## Definition of Done

Sprint 5 is complete when:

1. [ ] `StateBuffer` and `StateLayout` types defined
2. [ ] `RuntimeCtx` type defined
3. [ ] SigEnv extended with state and runtimeCtx
4. [ ] `StatefulNode` type defined with all ops
5. [ ] All 5 stateful ops implemented (integrate, delayMs, delayFrames, sampleHold, slew)
6. [ ] Slew transform step completed (from Sprint 4)
7. [ ] State persists correctly across frames
8. [ ] All tests pass (`just test`)
9. [ ] No TypeScript errors (`just typecheck`)
10. [ ] Documentation updated

**Files Created/Modified:**

- Created: `src/runtime/signal-expr/StateBuffer.ts`
- Created: `src/runtime/signal-expr/RuntimeCtx.ts`
- Modified: `src/runtime/signal-expr/types.ts` (add StatefulNode, StatefulOp, StatefulParams)
- Modified: `src/runtime/signal-expr/SigEnv.ts` (add state, runtimeCtx)
- Modified: `src/runtime/signal-expr/SigEvaluator.ts` (add stateful case, op implementations)
- Modified: `src/runtime/signal-expr/TransformTable.ts` (update slew step)
- Modified: `src/runtime/signal-expr/DebugSink.ts` (add traceStateful)
- Modified: `src/runtime/signal-expr/__tests__/SigEvaluator.test.ts` (add tests)
- Modified: `src/runtime/signal-expr/README.md` (update docs)

---

## Risks

1. **State layout complexity** - Different ops need different state sizes
   - Mitigation: Document state requirements clearly, compiler handles layout

2. **DelayMs buffer sizing** - Large delays need large buffers
   - Mitigation: Provide sensible defaults, warn on large delays

3. **Numerical precision** - Slew exponential may accumulate error
   - Mitigation: Use f64 for all state, test precision

---

## Next Sprint

Sprint 6: Closure Bridge - Implement fallback to legacy closures for gradual migration.
