# Sprint 7: Block Compiler Migration

Generated: 2025-12-25
Depends on: Sprint 6 (Closure Bridge)
Source: HANDOFF.md §6, design-docs/12-Compiler-Final/16-Block-Lowering.md

---

## Sprint Goal

**Migrate signal block compilers to emit SignalExpr IR instead of closures, enabling the full IR-driven runtime.**

When complete:
- All 9 signal block compilers emit SignalExpr IR
- Block outputs are SignalExpr nodes instead of closures
- Migration validation confirms IR matches closure behavior

---

## Prerequisites

Sprint 6 must be complete:
- [ ] Closure bridge working for fallback
- [ ] Migration tracking in place
- [ ] All evaluator features complete

---

## Scope

### In Scope (This Sprint)

1. **IRBuilder API** (Minimal for this sprint)
   - sigConst, sigTimeAbsMs, sigMap, sigZip
   - Enough to migrate pure signal blocks

2. **Pure Signal Block Migration**
   - AddSignal, SubSignal, MulSignal, DivSignal
   - MinSignal, MaxSignal, ClampSignal

3. **Oscillator Block Migration**
   - Waveform generation using IR
   - Time-based signals

4. **Migration Validation**
   - Golden tests comparing IR vs closure output
   - Automated validation during migration

### Out of Scope

- Shaper, ColorLFO (more complex, Sprint 8)
- Full IRBuilder API (Phase 3)
- Dual-emit mode (Phase 3)
- Stateful block migration (Sprint 8)

---

## Migration Order

Based on HANDOFF.md recommendations:

1. **Pure math blocks** (simplest, no state)
   - AddSignal, SubSignal, MulSignal, DivSignal
   - MinSignal, MaxSignal, ClampSignal

2. **Oscillator** (time-based, no state in IR)
   - Uses timeAbsMs and math ops

3. **Shaper** (uses easing curves)
   - Deferred to Sprint 8

4. **ColorLFO** (complex, multiple outputs)
   - Deferred to Sprint 8

---

## Work Items

### P0: Create Minimal IRBuilder

**Description:**
Create a minimal IRBuilder interface sufficient for pure signal blocks.

```typescript
interface IRBuilder {
  /** Allocate a constant and return its ID */
  sigConst(value: number): SigExprId;

  /** Create timeAbsMs node */
  sigTimeAbsMs(): SigExprId;

  /** Create map node (unary operation) */
  sigMap(src: SigExprId, fn: PureFnRef): SigExprId;

  /** Create zip node (binary operation) */
  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId;

  /** Get the nodes array */
  getNodes(): SignalExprIR[];

  /** Get the const pool */
  getConstPool(): ConstPool;
}

class IRBuilderImpl implements IRBuilder {
  private nodes: SignalExprIR[] = [];
  private constPool: number[] = [];
  private constMap = new Map<number, number>(); // value -> constId (dedup)

  sigConst(value: number): SigExprId {
    // Deduplicate constants
    if (this.constMap.has(value)) {
      const constId = this.constMap.get(value)!;
      // Still need to create a node referencing it
      const id = this.nodes.length;
      this.nodes.push({
        kind: 'const',
        type: numberType,
        constId,
      });
      return id;
    }

    const constId = this.constPool.length;
    this.constPool.push(value);
    this.constMap.set(value, constId);

    const id = this.nodes.length;
    this.nodes.push({
      kind: 'const',
      type: numberType,
      constId,
    });
    return id;
  }

  sigTimeAbsMs(): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: 'timeAbsMs',
      type: numberType,
    });
    return id;
  }

  sigMap(src: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: 'map',
      type: numberType,
      src,
      fn,
    });
    return id;
  }

  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: 'zip',
      type: numberType,
      a,
      b,
      fn,
    });
    return id;
  }

  getNodes(): SignalExprIR[] {
    return this.nodes;
  }

  getConstPool(): ConstPool {
    return { numbers: this.constPool };
  }
}

function createIRBuilder(): IRBuilder {
  return new IRBuilderImpl();
}
```

**Acceptance Criteria:**
- [ ] `IRBuilder` interface defined
- [ ] `createIRBuilder()` factory function
- [ ] `sigConst()` creates const node with deduplication
- [ ] `sigTimeAbsMs()` creates time node
- [ ] `sigMap()` creates map node
- [ ] `sigZip()` creates zip node
- [ ] `getNodes()` returns built nodes
- [ ] `getConstPool()` returns const pool
- [ ] Unit tests for all methods

**Technical Notes:**
- Constant deduplication saves memory
- Nodes are appended to array (dense IDs)
- Type is always numberType for now

---

### P0: Migrate AddSignal Block

**Description:**
Update AddSignal compiler to emit SignalExpr IR.

**Current (closure):**
```typescript
// src/editor/compiler/blocks/signal/AddSignal.ts
compile(block, inputs, env) {
  const a = inputs.a; // Signal<number>
  const b = inputs.b; // Signal<number>
  return {
    output: (t: number, ctx: RuntimeCtx) => a(t, ctx) + b(t, ctx)
  };
}
```

**New (IR):**
```typescript
compile(block, inputs, builder: IRBuilder) {
  const a = inputs.a; // SigExprId
  const b = inputs.b; // SigExprId
  return {
    output: builder.sigZip(a, b, { opcode: OpCode.Add })
  };
}
```

**Acceptance Criteria:**
- [ ] AddSignal compiler updated to use IRBuilder
- [ ] Emits `zip` node with `OpCode.Add`
- [ ] Inputs are SigExprIds (not closures)
- [ ] Output is SigExprId
- [ ] Migration tracking updated: `MIGRATED_BLOCKS.add('AddSignal')`
- [ ] Golden test: IR output matches closure output
- [ ] Unit test for compiled node structure

**Technical Notes:**
- Input type changes from `Signal<number>` to `SigExprId`
- Compiler interface changes - may need adapter for gradual migration

---

### P0: Migrate SubSignal, MulSignal, DivSignal

**Description:**
Update remaining basic math block compilers to emit SignalExpr IR.

**Acceptance Criteria:**
- [ ] SubSignal: emits `zip` with `OpCode.Sub`
- [ ] MulSignal: emits `zip` with `OpCode.Mul`
- [ ] DivSignal: emits `zip` with `OpCode.Div`
- [ ] All have golden tests
- [ ] Migration tracking updated for each

**Code Pattern:**
```typescript
// SubSignal
output: builder.sigZip(a, b, { opcode: OpCode.Sub })

// MulSignal
output: builder.sigZip(a, b, { opcode: OpCode.Mul })

// DivSignal
output: builder.sigZip(a, b, { opcode: OpCode.Div })
```

---

### P0: Migrate MinSignal, MaxSignal

**Description:**
Update min/max block compilers to emit SignalExpr IR.

**Acceptance Criteria:**
- [ ] MinSignal: emits `zip` with `OpCode.Min`
- [ ] MaxSignal: emits `zip` with `OpCode.Max`
- [ ] Both have golden tests
- [ ] Migration tracking updated

---

### P1: Migrate ClampSignal

**Description:**
Update clamp block compiler to emit SignalExpr IR.

Clamp(x, min, max) = min(max(x, min), max)

**Acceptance Criteria:**
- [ ] ClampSignal: emits two `zip` nodes (max then min)
- [ ] Structure: `min(max(x, lo), hi)`
- [ ] Golden test verifies behavior
- [ ] Migration tracking updated

**Code:**
```typescript
compile(block, inputs, builder: IRBuilder) {
  const x = inputs.x;
  const lo = inputs.min;
  const hi = inputs.max;

  // max(x, lo)
  const clamped_lo = builder.sigZip(x, lo, { opcode: OpCode.Max });

  // min(result, hi)
  const clamped = builder.sigZip(clamped_lo, hi, { opcode: OpCode.Min });

  return { output: clamped };
}
```

---

### P1: Migrate Oscillator Block

**Description:**
Update oscillator block compiler to emit SignalExpr IR.

The oscillator generates waveforms based on time and frequency.

**Current (closure):**
```typescript
compile(block, inputs, env) {
  const freq = block.params.frequency;
  const waveform = block.params.waveform; // 'sine', 'square', etc.

  return {
    output: (t: number, ctx: RuntimeCtx) => {
      const phase = (t * freq / 1000) % 1;
      switch (waveform) {
        case 'sine': return Math.sin(phase * 2 * Math.PI);
        case 'square': return phase < 0.5 ? 1 : -1;
        // etc.
      }
    }
  };
}
```

**New (IR):**
```typescript
compile(block, inputs, builder: IRBuilder) {
  const freq = block.params.frequency;
  const waveform = block.params.waveform;

  // t * freq / 1000
  const t = builder.sigTimeAbsMs();
  const freqConst = builder.sigConst(freq);
  const freqScaled = builder.sigZip(t, freqConst, { opcode: OpCode.Mul });
  const msScale = builder.sigConst(0.001);
  const phase = builder.sigZip(freqScaled, msScale, { opcode: OpCode.Mul });

  // Apply waveform
  switch (waveform) {
    case 'sine': {
      const twoPi = builder.sigConst(2 * Math.PI);
      const angle = builder.sigZip(phase, twoPi, { opcode: OpCode.Mul });
      return { output: builder.sigMap(angle, { opcode: OpCode.Sin }) };
    }
    case 'square': {
      // phase % 1 < 0.5 ? 1 : -1
      // Needs select node - may need to use closure bridge for now
      // Or implement using math: sign(sin(phase * 2 * PI))
      const twoPi = builder.sigConst(2 * Math.PI);
      const angle = builder.sigZip(phase, twoPi, { opcode: OpCode.Mul });
      const sine = builder.sigMap(angle, { opcode: OpCode.Sin });
      return { output: builder.sigMap(sine, { opcode: OpCode.Sign }) };
    }
    // Add other waveforms
  }
}
```

**Acceptance Criteria:**
- [ ] Oscillator compiler updated to use IRBuilder
- [ ] Sine waveform fully in IR
- [ ] Square waveform in IR (using Sign of sine)
- [ ] Triangle and saw may use closure bridge initially
- [ ] Golden test for sine output
- [ ] Migration tracking updated

**Technical Notes:**
- May need to add OpCode.Sign, OpCode.Fract
- Complex waveforms can fall back to closure bridge
- Frequency modulation is future work

---

### P1: Add Additional OpCodes

**Description:**
Add opcodes needed for oscillator and other blocks.

```typescript
export enum OpCode {
  // Existing
  Sin = 'sin',
  Cos = 'cos',
  Tan = 'tan',
  Abs = 'abs',
  Floor = 'floor',
  Ceil = 'ceil',
  Add = 'add',
  Sub = 'sub',
  Mul = 'mul',
  Div = 'div',
  Min = 'min',
  Max = 'max',

  // New for oscillator
  Sign = 'sign',     // -1, 0, or 1
  Fract = 'fract',   // fractional part (x - floor(x))
  Mod = 'mod',       // modulo (binary)
}
```

**Acceptance Criteria:**
- [ ] `OpCode.Sign` added and implemented
- [ ] `OpCode.Fract` added and implemented
- [ ] `OpCode.Mod` added and implemented (binary)
- [ ] `applyPureFn()` updated for Sign, Fract
- [ ] `applyBinaryFn()` updated for Mod
- [ ] Unit tests for new opcodes

**Implementation:**
```typescript
case OpCode.Sign:
  return input === 0 ? 0 : (input > 0 ? 1 : -1);

case OpCode.Fract:
  return input - Math.floor(input);

case OpCode.Mod:
  return b !== 0 ? a % b : 0;
```

---

### P1: Golden Test Framework

**Description:**
Create framework for comparing IR output to closure output.

```typescript
interface GoldenTest {
  name: string;
  blockType: string;
  params: Record<string, any>;
  inputs: Record<string, number>;
  timePoints: number[];
  tolerance: number;
}

async function runGoldenTest(test: GoldenTest): Promise<{
  passed: boolean;
  failures: { time: number; closure: number; ir: number }[];
}> {
  const closureResult = runClosureCompiler(test);
  const irResult = runIRCompiler(test);

  const failures = [];
  for (const t of test.timePoints) {
    const closureValue = closureResult(t);
    const irValue = evalSig(irResult.outputId, createEnv(t), irResult.nodes);

    if (Math.abs(closureValue - irValue) > test.tolerance) {
      failures.push({ time: t, closure: closureValue, ir: irValue });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
```

**Acceptance Criteria:**
- [ ] `GoldenTest` interface defined
- [ ] `runGoldenTest()` function implemented
- [ ] Tests multiple time points
- [ ] Reports all failures (not just first)
- [ ] Configurable tolerance (default 1e-10)
- [ ] Tests for all migrated blocks

**Test Suite:**
```typescript
const GOLDEN_TESTS: GoldenTest[] = [
  {
    name: 'AddSignal basic',
    blockType: 'AddSignal',
    params: {},
    inputs: { a: 10, b: 20 },
    timePoints: [0, 100, 500, 1000],
    tolerance: 1e-10,
  },
  {
    name: 'MulSignal basic',
    blockType: 'MulSignal',
    params: {},
    inputs: { a: 5, b: 7 },
    timePoints: [0, 100, 500, 1000],
    tolerance: 1e-10,
  },
  {
    name: 'Oscillator sine 1Hz',
    blockType: 'Oscillator',
    params: { frequency: 1, waveform: 'sine' },
    inputs: {},
    timePoints: [0, 250, 500, 750, 1000],
    tolerance: 1e-5,
  },
];

describe('golden tests', () => {
  for (const test of GOLDEN_TESTS) {
    it(test.name, async () => {
      const result = await runGoldenTest(test);
      if (!result.passed) {
        console.error('Failures:', result.failures);
      }
      expect(result.passed).toBe(true);
    });
  }
});
```

---

### P2: Compiler Adapter Layer

**Description:**
Create adapter that allows gradual migration without breaking existing compiler.

```typescript
interface BlockCompilerV2 {
  compile(
    block: Block,
    inputs: Record<string, SigExprId>,
    builder: IRBuilder
  ): { output: SigExprId };
}

// Adapter that wraps V2 compiler to work with existing pipeline
function adaptV2Compiler(v2Compiler: BlockCompilerV2): LegacyBlockCompiler {
  return {
    compile(block, inputs, env) {
      // Create IR builder
      const builder = createIRBuilder();

      // Register input closures as bridge nodes
      const irInputs: Record<string, SigExprId> = {};
      for (const [key, closure] of Object.entries(inputs)) {
        const closureId = `${block.id}-input-${key}`;
        env.closureRegistry.register(closureId, closure);
        irInputs[key] = builder.sigClosureBridge(closureId);
      }

      // Compile to IR
      const { output } = v2Compiler.compile(block, irInputs, builder);

      // Return closure that evaluates IR
      const nodes = builder.getNodes();
      const constPool = builder.getConstPool();

      return {
        output: (t: number, ctx: RuntimeCtx) => {
          const env = createSigEnv({
            tAbsMs: t,
            constPool,
            cache: createSigFrameCache(nodes.length),
            // ... other fields
          });
          return evalSig(output, env, nodes);
        }
      };
    }
  };
}
```

**Acceptance Criteria:**
- [ ] Adapter layer defined
- [ ] V2 compilers work through adapter
- [ ] Existing pipeline unchanged
- [ ] Mixed V1/V2 compilers work together
- [ ] Unit test for adapter

**Technical Notes:**
- Adapter bridges old and new compiler interfaces
- Allows incremental migration without breaking changes
- Can be removed once all blocks migrated

---

### P2: Update Migration Tracking

**Description:**
Update MIGRATED_BLOCKS set with all migrated blocks.

```typescript
const MIGRATED_BLOCKS = new Set<string>([
  'AddSignal',
  'SubSignal',
  'MulSignal',
  'DivSignal',
  'MinSignal',
  'MaxSignal',
  'ClampSignal',
  'Oscillator', // Partial - some waveforms
]);
```

**Acceptance Criteria:**
- [ ] All 8 migrated blocks in set
- [ ] `getMigrationStatus()` reports correct percentage
- [ ] Notes on partial migrations (Oscillator)

---

### P2: Update Documentation

**Description:**
Update README with block migration documentation.

**Acceptance Criteria:**
- [ ] README updated with IRBuilder section
- [ ] Block migration guide added
- [ ] Golden test documentation
- [ ] Migration status for each block

---

## Definition of Done

Sprint 7 is complete when:

1. [ ] IRBuilder implemented with sigConst, sigTimeAbsMs, sigMap, sigZip
2. [ ] AddSignal, SubSignal, MulSignal, DivSignal migrated
3. [ ] MinSignal, MaxSignal, ClampSignal migrated
4. [ ] Oscillator migrated (at least sine waveform)
5. [ ] New opcodes (Sign, Fract, Mod) implemented
6. [ ] Golden test framework created
7. [ ] All golden tests pass
8. [ ] Migration tracking updated
9. [ ] All tests pass (`just test`)
10. [ ] No TypeScript errors (`just typecheck`)
11. [ ] Documentation updated

**Files Created/Modified:**

- Created: `src/runtime/signal-expr/IRBuilder.ts`
- Modified: `src/runtime/signal-expr/types.ts` (add new opcodes)
- Modified: `src/runtime/signal-expr/OpCodeRegistry.ts` (implement new opcodes)
- Modified: `src/editor/compiler/blocks/signal/AddSignal.ts` (migrate)
- Modified: `src/editor/compiler/blocks/signal/SubSignal.ts` (migrate if exists, or create pattern)
- Modified: `src/editor/compiler/blocks/signal/MulSignal.ts` (migrate)
- Modified: `src/editor/compiler/blocks/signal/MinSignal.ts` (migrate)
- Modified: `src/editor/compiler/blocks/signal/MaxSignal.ts` (migrate)
- Modified: `src/editor/compiler/blocks/signal/ClampSignal.ts` (migrate)
- Modified: `src/editor/compiler/blocks/signal/Oscillator.ts` (migrate)
- Modified: `src/runtime/signal-expr/MigrationTracking.ts` (update)
- Created: `src/runtime/signal-expr/__tests__/goldenTests.test.ts`
- Modified: `src/runtime/signal-expr/README.md` (update docs)

---

## Risks

1. **Compiler interface change** - V2 compilers have different signature
   - Mitigation: Use adapter layer for gradual migration

2. **Input resolution** - Wired inputs need to become SigExprIds
   - Mitigation: Use closure bridge for inputs from non-migrated blocks

3. **Oscillator complexity** - Non-sine waveforms are complex
   - Mitigation: Migrate sine first, others can use closure bridge

---

## Future Sprints

### Sprint 8: Complete Block Migration
- Shaper (easing curves)
- ColorLFO (color output)
- Any remaining signal blocks

### Sprint 9: Integration with Compiler Pipeline
- Remove adapter layer
- Direct IR emission in main compiler
- Full dual-emit mode

### Sprint 10: Performance Optimization
- Cache optimization
- Memory layout optimization
- Profiling and benchmarks
