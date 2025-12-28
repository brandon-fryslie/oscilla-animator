# Sprint 4: Transform Chain Execution

Generated: 2025-12-25
Depends on: Sprint 3 (BusCombine)
Source: HANDOFF.md §3, design-docs/12-Compiler-Final/05-Lenses-Adapters.md

---

## Sprint Goal

**Implement transform chain execution for signals, enabling adapters and lenses to modify signal values through a series of transformation steps.**

When complete, the evaluator can:
- Apply a chain of transform steps to a signal
- Support all transform step kinds: scaleBias, normalize, quantize, ease, map
- Prepare infrastructure for stateful transforms (slew - implemented in Sprint 5)

---

## Prerequisites

Sprint 3 must be complete:
- [ ] BusCombine evaluation working
- [ ] All combine modes tested
- [ ] DebugSink infrastructure in place

---

## Scope

### In Scope (This Sprint)

1. **Transform Node Evaluation**
   - Evaluate source signal
   - Apply transform chain steps in order
   - Return final transformed value

2. **Pure Transform Steps**
   - `scaleBias`: `value * scale + bias`
   - `normalize`: Clamp to 0..1 or -1..1
   - `quantize`: Round to nearest step
   - `ease`: Apply easing curve
   - `map`: Apply pure function (reuse OpCode)

3. **Transform Table Integration**
   - TransformTable in SigEnv
   - Chain lookup by index
   - Step iteration

### Out of Scope

- Stateful transforms (slew) - Sprint 5
- Easing curve registry (use simple built-ins for now)
- Full TransformChainIR schema (Phase 2)

---

## Work Items

### P0: Add Transform Node Type

**Description:**
Extend SignalExprIR union with `transform` node kind.

```typescript
interface TransformNode {
  kind: 'transform';
  type: TypeDesc;
  src: SigExprId;         // Input signal
  chain: TransformChainId; // Index into transform table
}

type TransformChainId = number;  // Dense index into TransformTable
```

**Acceptance Criteria:**
- [ ] `TransformNode` interface added to SignalExprIR union
- [ ] `TransformChainId` type alias defined
- [ ] Node includes `src` and `chain` references
- [ ] Type includes JSDoc explaining transform semantics
- [ ] Type exports updated

**Technical Notes:**
- Transform chains are pre-compiled and stored in TransformTable
- Node references chain by index, not inline
- Source is evaluated first, then chain is applied

---

### P0: Define Transform Chain Types

**Description:**
Create types for transform chains and steps.

```typescript
interface TransformChain {
  steps: TransformStep[];
}

type TransformStep =
  | ScaleBiasStep
  | NormalizeStep
  | QuantizeStep
  | EaseStep
  | MapStep
  | SlewStep;  // Placeholder - implemented Sprint 5

interface ScaleBiasStep {
  kind: 'scaleBias';
  scale: number;
  bias: number;
}

interface NormalizeStep {
  kind: 'normalize';
  mode: '0..1' | '-1..1';
}

interface QuantizeStep {
  kind: 'quantize';
  step: number;  // Quantization step size
}

interface EaseStep {
  kind: 'ease';
  curveId: EasingCurveId;  // Index into easing curve table
}

interface MapStep {
  kind: 'map';
  fn: PureFnRef;  // Reuse OpCode
}

interface SlewStep {
  kind: 'slew';
  rate: number;
  stateOffset: number;  // Index into StateBuffer
}

type EasingCurveId = number;
```

**Acceptance Criteria:**
- [ ] `TransformChain` interface defined with steps array
- [ ] `TransformStep` union type with all step kinds
- [ ] Each step kind has required parameters
- [ ] `SlewStep` defined as placeholder (evaluated in Sprint 5)
- [ ] `EasingCurveId` type defined
- [ ] All types exported

**Technical Notes:**
- Steps are applied in order (pipeline)
- SlewStep requires StateBuffer (Sprint 5)
- EaseStep uses curve lookup (simplified for now)

---

### P0: Define TransformTable

**Description:**
Create the transform table that stores pre-compiled chains.

```typescript
interface TransformTable {
  chains: TransformChain[];
}

// Extend SigEnv
interface SigEnv {
  // ... existing fields ...
  readonly transformTable: TransformTable;
}
```

**Acceptance Criteria:**
- [ ] `TransformTable` interface defined
- [ ] SigEnv extended with `transformTable` field
- [ ] `createSigEnv()` updated to accept transformTable
- [ ] Empty transform table provided as default for tests
- [ ] Chain lookup by index is O(1)

**Technical Notes:**
- Transform table is populated by compiler
- Chains are immutable at runtime
- Empty chains are valid (no-op transform)

---

### P0: Implement Transform Node Evaluation

**Description:**
Add transform evaluation to the evaluator.

```typescript
function evalTransform(
  node: TransformNode,
  env: SigEnv,
  nodes: SignalExprIR[]
): number {
  // Evaluate source signal
  const src = evalSig(node.src, env, nodes);

  // Get transform chain
  const chain = env.transformTable.chains[node.chain];

  // Apply steps in order
  let value = src;
  for (const step of chain.steps) {
    value = applyTransformStep(step, value, env);
  }

  return value;
}
```

**Acceptance Criteria:**
- [ ] `evalTransform()` function implemented
- [ ] Evaluator switch includes `case 'transform'`
- [ ] Source signal evaluated first
- [ ] Chain looked up from transform table
- [ ] Steps applied in order
- [ ] Result is cached after evaluation
- [ ] Missing chain throws clear error
- [ ] Empty chain returns source unchanged

**Technical Notes:**
- Each step gets previous step's output
- Value is mutated through pipeline
- Cache the final result, not intermediate steps

---

### P0: Implement Pure Transform Steps

**Description:**
Implement all non-stateful transform step evaluations.

```typescript
function applyTransformStep(
  step: TransformStep,
  value: number,
  env: SigEnv
): number {
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
      return applyEasing(step.curveId, value, env);

    case 'map':
      return applyPureFn(step.fn, value);

    case 'slew':
      // Placeholder - requires StateBuffer (Sprint 5)
      throw new Error('Slew step requires StateBuffer (not implemented yet)');

    default:
      throw new Error(`Unknown transform step: ${(step as any).kind}`);
  }
}
```

**Acceptance Criteria:**
- [ ] `applyTransformStep()` handles all pure step kinds
- [ ] `scaleBias`: `value * scale + bias`
- [ ] `normalize 0..1`: clamp to [0, 1]
- [ ] `normalize -1..1`: clamp to [-1, 1]
- [ ] `quantize`: round to nearest step
- [ ] `ease`: apply easing curve
- [ ] `map`: apply pure function (reuse applyPureFn)
- [ ] `slew`: throws clear error (Sprint 5)
- [ ] Unknown step throws error
- [ ] Unit tests for each step kind

**Technical Notes:**
- ScaleBias is linear: `y = mx + b`
- Quantize uses round, not floor/ceil
- Ease requires curve lookup

---

### P1: Implement Basic Easing Curves

**Description:**
Implement a simple set of built-in easing curves.

```typescript
interface EasingCurveTable {
  curves: EasingCurve[];
}

interface EasingCurve {
  name: string;
  fn: (t: number) => number;  // t in [0,1], returns [0,1]
}

// Built-in curves
const BUILTIN_CURVES: EasingCurve[] = [
  { name: 'linear', fn: (t) => t },
  { name: 'easeInQuad', fn: (t) => t * t },
  { name: 'easeOutQuad', fn: (t) => t * (2 - t) },
  { name: 'easeInOutQuad', fn: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t },
  { name: 'easeInCubic', fn: (t) => t * t * t },
  { name: 'easeOutCubic', fn: (t) => (--t) * t * t + 1 },
  { name: 'smoothstep', fn: (t) => t * t * (3 - 2 * t) },
];

function applyEasing(curveId: EasingCurveId, t: number, env: SigEnv): number {
  const curve = env.easingCurves?.curves[curveId];
  if (!curve) {
    throw new Error(`Unknown easing curve: ${curveId}`);
  }
  // Clamp input to [0, 1] before applying curve
  const clampedT = Math.max(0, Math.min(1, t));
  return curve.fn(clampedT);
}
```

**Acceptance Criteria:**
- [ ] `EasingCurveTable` interface defined
- [ ] `EasingCurve` interface defined
- [ ] At least 7 built-in curves implemented
- [ ] `applyEasing()` function implemented
- [ ] Input clamped to [0, 1] before curve
- [ ] SigEnv extended with optional `easingCurves` field
- [ ] Unit tests for each built-in curve
- [ ] Missing curve throws error

**Technical Notes:**
- Easing curves expect input in [0, 1]
- Output is typically [0, 1] but not enforced
- Custom curves can be added to table

---

### P1: Extend SigEnv with Transform Infrastructure

**Description:**
Add transform-related fields to SigEnv.

```typescript
interface SigEnv {
  readonly tAbsMs: number;
  readonly constPool: ConstPool;
  readonly cache: SigFrameCache;
  readonly slotValues: SlotValueReader;
  readonly debug?: DebugSink;
  readonly transformTable: TransformTable;    // NEW
  readonly easingCurves?: EasingCurveTable;   // NEW (optional)
}
```

**Acceptance Criteria:**
- [ ] SigEnv includes `transformTable` (required)
- [ ] SigEnv includes `easingCurves` (optional)
- [ ] `createSigEnv()` updated with new parameters
- [ ] Default empty transform table for tests
- [ ] Default built-in curves for tests

**Technical Notes:**
- transformTable is required (may be empty)
- easingCurves is optional (uses built-ins if not provided)

---

### P1: Comprehensive Test Suite for Transforms

**Description:**
Full test coverage for transform evaluation.

**Acceptance Criteria:**
- [ ] Test empty transform chain (no-op)
- [ ] Test single scaleBias step
- [ ] Test scaleBias with negative scale
- [ ] Test normalize 0..1 (clamps above and below)
- [ ] Test normalize -1..1
- [ ] Test quantize with various step sizes
- [ ] Test ease with linear curve
- [ ] Test ease with easeInQuad curve
- [ ] Test map step (reuses OpCode)
- [ ] Test chain with multiple steps
- [ ] Test transform result is cached
- [ ] Test missing chain throws error
- [ ] Test slew throws "not implemented" error
- [ ] All tests pass with `just test`

**Test Examples:**

```typescript
describe('transform nodes', () => {
  describe('scaleBias step', () => {
    it('applies scale and bias', () => {
      const chain: TransformChain = {
        steps: [{ kind: 'scaleBias', scale: 2, bias: 10 }]
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 5
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] }
      });
      // 5 * 2 + 10 = 20
      expect(evalSig(1, env, nodes)).toBe(20);
    });
  });

  describe('normalize step', () => {
    it('clamps to 0..1', () => {
      const chain: TransformChain = {
        steps: [{ kind: 'normalize', mode: '0..1' }]
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 1.5
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [1.5],
        transformTable: { chains: [chain] }
      });
      expect(evalSig(1, env, nodes)).toBe(1);
    });

    it('clamps to -1..1', () => {
      const chain: TransformChain = {
        steps: [{ kind: 'normalize', mode: '-1..1' }]
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // -2
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [-2],
        transformTable: { chains: [chain] }
      });
      expect(evalSig(1, env, nodes)).toBe(-1);
    });
  });

  describe('quantize step', () => {
    it('rounds to nearest step', () => {
      const chain: TransformChain = {
        steps: [{ kind: 'quantize', step: 0.25 }]
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 0.3
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [0.3],
        transformTable: { chains: [chain] }
      });
      // 0.3 rounds to 0.25
      expect(evalSig(1, env, nodes)).toBe(0.25);
    });
  });

  describe('ease step', () => {
    it('applies easing curve', () => {
      const chain: TransformChain = {
        steps: [{ kind: 'ease', curveId: 1 }] // easeInQuad
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 0.5
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [0.5],
        transformTable: { chains: [chain] },
        easingCurves: { curves: BUILTIN_CURVES }
      });
      // easeInQuad(0.5) = 0.5^2 = 0.25
      expect(evalSig(1, env, nodes)).toBe(0.25);
    });
  });

  describe('chained steps', () => {
    it('applies steps in order', () => {
      const chain: TransformChain = {
        steps: [
          { kind: 'scaleBias', scale: 2, bias: 0 },  // 5 * 2 = 10
          { kind: 'scaleBias', scale: 1, bias: 5 }   // 10 + 5 = 15
        ]
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 5
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [5],
        transformTable: { chains: [chain] }
      });
      expect(evalSig(1, env, nodes)).toBe(15);
    });
  });

  describe('empty chain', () => {
    it('returns source unchanged', () => {
      const chain: TransformChain = { steps: [] };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 }, // 42
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [42],
        transformTable: { chains: [chain] }
      });
      expect(evalSig(1, env, nodes)).toBe(42);
    });
  });

  describe('slew step', () => {
    it('throws not implemented error', () => {
      const chain: TransformChain = {
        steps: [{ kind: 'slew', rate: 1, stateOffset: 0 }]
      };
      const nodes: SignalExprIR[] = [
        { kind: 'const', type: numType, constId: 0 },
        { kind: 'transform', type: numType, src: 0, chain: 0 }
      ];
      const env = createTestEnv({
        consts: [0],
        transformTable: { chains: [chain] }
      });
      expect(() => evalSig(1, env, nodes)).toThrow('StateBuffer');
    });
  });
});
```

---

### P2: Add Debug Tracing for Transforms

**Description:**
Extend DebugSink with transform tracing.

```typescript
interface DebugSink {
  traceBusCombine?(info: BusCombineTraceInfo): void;
  traceTransform?(info: TransformTraceInfo): void;  // NEW
}

interface TransformTraceInfo {
  srcValue: number;
  chainId: TransformChainId;
  steps: { kind: string; inputValue: number; outputValue: number }[];
  finalValue: number;
}
```

**Acceptance Criteria:**
- [ ] `TransformTraceInfo` interface defined
- [ ] DebugSink extended with `traceTransform`
- [ ] Trace includes input, each step's output, and final value
- [ ] Trace only collected when debug enabled
- [ ] Unit test verifies trace info

---

### P2: Update Documentation

**Description:**
Update README with transform node documentation.

**Acceptance Criteria:**
- [ ] README updated with transform node section
- [ ] All transform step kinds documented
- [ ] Easing curves documented
- [ ] Transform chain pipeline explained
- [ ] Examples for common transforms

---

## Definition of Done

Sprint 4 is complete when:

1. [ ] `TransformNode` type defined
2. [ ] `TransformChain` and `TransformStep` types defined
3. [ ] All pure transform steps implemented (scaleBias, normalize, quantize, ease, map)
4. [ ] Slew step throws "not implemented" (Sprint 5)
5. [ ] Built-in easing curves available
6. [ ] TransformTable integrated into SigEnv
7. [ ] All tests pass (`just test`)
8. [ ] No TypeScript errors (`just typecheck`)
9. [ ] Documentation updated

**Files Created/Modified:**

- Modified: `src/runtime/signal-expr/types.ts` (add TransformNode, TransformStep, etc.)
- Created: `src/runtime/signal-expr/TransformTable.ts`
- Created: `src/runtime/signal-expr/EasingCurves.ts`
- Modified: `src/runtime/signal-expr/SigEnv.ts` (add transformTable, easingCurves)
- Modified: `src/runtime/signal-expr/SigEvaluator.ts` (add transform case, applyTransformStep)
- Modified: `src/runtime/signal-expr/DebugSink.ts` (add traceTransform)
- Modified: `src/runtime/signal-expr/__tests__/SigEvaluator.test.ts` (add tests)
- Modified: `src/runtime/signal-expr/README.md` (update docs)

---

## Risks

1. **Easing curve complexity** - Full easing library is large
   - Mitigation: Start with 7 built-in curves, expand later

2. **Transform chain performance** - Long chains could be slow
   - Mitigation: Chains are typically short (2-4 steps), optimize later if needed

3. **Slew integration** - Slew requires StateBuffer which doesn't exist yet
   - Mitigation: Throw clear error, implement in Sprint 5

---

## Next Sprint

Sprint 5: Stateful Operations - Implement StateBuffer and stateful signal ops (integrate, delay, sampleHold, slew).
