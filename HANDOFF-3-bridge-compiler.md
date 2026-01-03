# Phase 3: Bridge Compiler - Complete Handoff Document

**Mission:** Make the compiler emit IR alongside existing closures. IR is validated but not executed yet.

**You are building the bridge.** The old closure-based runtime continues to work. The new IR is emitted and validated. This is the "strangle pattern" in action.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Topic 1: IRBuilder API](#topic-1-irbuilder-api)
3. [Topic 2: Pass 1 - Normalize Patch](#topic-2-pass-1---normalize-patch)
4. [Topic 3: Pass 2 - Type Graph](#topic-3-pass-2---type-graph)
5. [Topic 4: Pass 3 - Time Topology](#topic-4-pass-3---time-topology)
6. [Topic 5: Pass 4-5 - Dependency Graph & SCC](#topic-5-pass-4-5---dependency-graph--scc)
7. [Topic 6: Dual-Emit Compiler](#topic-6-dual-emit-compiler)
8. [Topic 7: IR Validator](#topic-7-ir-validator)
9. [Testing Strategy](#testing-strategy)
10. [Verification Checklist](#verification-checklist)

---

## Philosophy

### Dual-Emit: The Safe Migration Path

During Phase 3, the compiler produces BOTH:
1. **Closures** (existing) - These execute at runtime
2. **IR fragments** (new) - These are validated but not executed

```typescript
interface DualEmitResult {
  // Old world: closures that run
  closure: CompiledProgram;

  // New world: IR that we validate
  ir: CompiledProgramIR;

  // Validation results
  irValid: boolean;
  irWarnings: string[];
}
```

### The 11-Pass Pipeline

Compilation is a deterministic sequence of passes:

```
Pass 1: Normalize Patch     → NormalizedPatch
Pass 2: Type Graph          → TypedPatch
Pass 3: Time Topology       → TimeResolvedPatch
Pass 4: Dependency Graph    → DepGraph
Pass 5: SCC/Cycle Validation→ AcyclicOrLegalGraph
Pass 6: Block Lowering      → UnlinkedIRFragments
Pass 7: Bus Lowering        → IRWithBusRoots
Pass 8: Link Resolution     → LinkedGraphIR
Pass 9: Render Lowering     → RenderIR + MaterializationPlan
Pass 10: Constants Packing  → ConstantIR
Pass 11: DebugIndex         → DebugIndex
```

---

## Topic 1: IRBuilder API

### The Builder Interface

```typescript
interface IRBuilder {
  // Allocation
  allocBlockId(): BlockIndex;
  allocSigExprId(): SigExprId;
  allocFieldExprId(): FieldExprId;
  allocStateId(): StateId;
  allocConstId(value: unknown): number;

  // Signal expressions
  sigConst(value: number): SigExprId;
  sigTimeAbsMs(): SigExprId;
  sigPhase01(): SigExprId;
  sigMap(src: SigExprId, fn: PureFnRef): SigExprId;
  sigZip(a: SigExprId, b: SigExprId, fn: PureFnRef): SigExprId;
  sigSelect(cond: SigExprId, t: SigExprId, f: SigExprId): SigExprId;
  sigTransform(src: SigExprId, chain: TransformChainId): SigExprId;
  sigCombine(busIndex: BusIndex, terms: SigExprId[], mode: CombineMode): SigExprId;
  sigStateful(op: StatefulSignalOp, input: SigExprId, params?: Record<string, number>): SigExprId;

  // Field expressions
  fieldConst(value: unknown): FieldExprId;
  fieldMap(src: FieldExprId, fn: PureFnRef): FieldExprId;
  fieldZip(a: FieldExprId, b: FieldExprId, fn: PureFnRef): FieldExprId;
  fieldSelect(cond: FieldExprId, t: FieldExprId, f: FieldExprId): FieldExprId;
  fieldTransform(src: FieldExprId, chain: TransformChainId): FieldExprId;
  fieldCombine(busIndex: BusIndex, terms: FieldExprId[], mode: CombineMode): FieldExprId;
  broadcastSigToField(sig: SigExprId, domainSlot: ValueSlot): FieldExprId;
  reduceFieldToSig(field: FieldExprId, fn: ReduceFn): SigExprId;

  // Domain
  domainFromN(n: number): ValueSlot;
  domainFromSVG(svgRef: string, sampleCount: number): ValueSlot;

  // Transforms
  transformChain(steps: TransformStepIR[]): TransformChainId;

  // Render sinks
  renderSink(sinkType: string, inputs: Record<string, ValueSlot>): void;

  // State
  allocState(type: TypeDesc, initial?: unknown): StateId;

  // Finalization
  build(): CompiledProgramIR;
}
```

### Builder Implementation Sketch

```typescript
class IRBuilderImpl implements IRBuilder {
  private sigExprs: SignalExprIR[] = [];
  private fieldExprs: FieldExprIR[] = [];
  private constPool: unknown[] = [];
  private stateLayout: StateLayoutEntry[] = [];

  sigConst(value: number): SigExprId {
    const constId = this.allocConstId(value);
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: 'const',
      type: { world: 'signal', domain: 'number' },
      constId
    });
    return id;
  }

  sigMap(src: SigExprId, fn: PureFnRef): SigExprId {
    const srcNode = this.sigExprs[src];
    const id = this.sigExprs.length;
    this.sigExprs.push({
      kind: 'map',
      type: fn.outputType,
      src,
      fn
    });
    return id;
  }

  // ... etc
}
```

---

## Topic 2: Pass 1 - Normalize Patch

### Goal

Make patch structurally well-formed before semantic analysis.

### Input/Output

```typescript
function pass1Normalize(patch: Patch): NormalizedPatch;
```

### Actions

1. **Freeze ID Maps**
   ```typescript
   const blockIndexMap = new Map<string, BlockIndex>();
   let nextBlockIndex = 0;
   for (const blockId of stableSort(patch.blocks.keys())) {
     blockIndexMap.set(blockId, nextBlockIndex++);
   }
   ```

2. **Ensure Default Sources**
   ```typescript
   for (const [blockId, block] of patch.blocks) {
     for (const input of block.definition.inputs) {
       if (!hasWire(patch, blockId, input.id) && !hasBusListener(patch, blockId, input.id)) {
         attachDefaultSource(normalized, blockId, input.id);
       }
     }
   }
   ```

3. **Canonicalize Publishers/Listeners**
   ```typescript
   normalized.publishers = patch.publishers
     .filter(p => p.enabled)
     .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id));
   ```

### Errors

- `InvalidId` - Block/port ID doesn't exist
- `DanglingSlotRef` - Wire references non-existent slot
- `DanglingBusRef` - Publisher/listener references non-existent bus
- `SchemaCorrupt` - Patch structure is malformed

---

## Topic 3: Pass 2 - Type Graph

### Goal

Establish types for every slot and bus using unified TypeDesc.

### Input/Output

```typescript
function pass2TypeGraph(normalized: NormalizedPatch): TypedPatch;
```

### Actions

1. **Convert SlotType to TypeDesc**
   ```typescript
   function slotTypeToTypeDesc(slotType: string): TypeDesc {
     // "Signal<number>" -> { world: 'signal', domain: 'number' }
     const match = slotType.match(/^(\w+)<(\w+)>$/);
     if (match) {
       return { world: match[1].toLowerCase(), domain: match[2] };
     }
     throw new Error(`Unknown slot type: ${slotType}`);
   }
   ```

2. **Validate Bus Type Eligibility**
   ```typescript
   for (const bus of typed.buses) {
     if (!isBusEligible(bus.type)) {
       errors.push({ kind: 'BusIneligibleType', busId: bus.id });
     }
   }
   ```

3. **Precompute Conversion Paths**
   ```typescript
   for (const wire of typed.wires) {
     const fromType = getOutputType(wire.from);
     const toType = getInputType(wire.to);
     if (!typeAssignable(fromType, toType)) {
       const path = findConversionPath(fromType, toType);
       if (!path) {
         errors.push({ kind: 'NoConversionPath', wire });
       }
       wire.conversionPath = path;
     }
   }
   ```

### Errors

- `PortTypeUnknown` - Slot type not recognized
- `BusIneligibleType` - Type can't be used on buses
- `ReservedBusTypeViolation` - Reserved bus has wrong type
- `NoConversionPath` - Can't convert between types

---

## Topic 4: Pass 3 - Time Topology

### Goal

Find the single TimeRoot and produce authoritative TimeModel.

### Input/Output

```typescript
function pass3TimeTopology(typed: TypedPatch): TimeResolvedPatch;
```

### Actions

1. **Find TimeRoot**
   ```typescript
   const timeRoots = typed.blocks.filter(b =>
     b.definition.capability === 'time'
   );

   if (timeRoots.length === 0) {
     errors.push({ kind: 'MissingTimeRoot' });
   } else if (timeRoots.length > 1) {
     errors.push({ kind: 'MultipleTimeRoots', roots: timeRoots.map(r => r.id) });
   }
   ```

2. **Generate Canonical Time Signals**
   ```typescript
   const timeSignals = {
     tAbsMs: builder.sigTimeAbsMs(),
     tModelMs: builder.sigMap(tAbsMs, timeModelMapping),
     phase01: isyCyclic ? builder.sigPhase01() : null,
     wrapEvent: isCyclic ? builder.sigWrapEvent() : null,
   };
   ```

3. **Produce TimeModel**
   ```typescript
   const timeModel: TimeModelIR = timeRoot.kind === 'finite'
     ? { kind: 'finite', durationMs: timeRoot.duration }
     : timeRoot.kind === 'cyclic'
     ? { kind: 'cyclic', periodMs: timeRoot.period, mode: timeRoot.mode }
     : { kind: 'infinite', windowMs: 30000 };
   ```

### Errors

- `MissingTimeRoot` - No time root block found
- `MultipleTimeRoots` - More than one time root
- `TimeRootViolation` - TimeRoot has illegal dependencies

---

## Topic 5: Pass 4-5 - Dependency Graph & SCC

### Pass 4: Build Dependency Graph

```typescript
function pass4DepGraph(timeResolved: TimeResolvedPatch): DepGraph {
  const nodes: DepNode[] = [];
  const edges: DepEdge[] = [];

  // Add block nodes
  for (const block of timeResolved.blocks) {
    nodes.push({ kind: 'BlockEval', blockIndex: block.index });
  }

  // Add bus nodes
  for (const bus of timeResolved.buses) {
    nodes.push({ kind: 'BusValue', busIndex: bus.index });
  }

  // Add wire edges
  for (const wire of timeResolved.wires) {
    edges.push({
      from: { kind: 'BlockEval', blockIndex: wire.fromBlock },
      to: { kind: 'BlockEval', blockIndex: wire.toBlock }
    });
  }

  // Add publisher edges
  for (const pub of timeResolved.publishers) {
    edges.push({
      from: { kind: 'BlockEval', blockIndex: pub.sourceBlock },
      to: { kind: 'BusValue', busIndex: pub.targetBus }
    });
  }

  // Add listener edges
  for (const lis of timeResolved.listeners) {
    edges.push({
      from: { kind: 'BusValue', busIndex: lis.sourceBus },
      to: { kind: 'BlockEval', blockIndex: lis.targetBlock }
    });
  }

  return { nodes, edges };
}
```

### Pass 5: Cycle Validation

```typescript
function pass5CycleValidation(depGraph: DepGraph): AcyclicOrLegalGraph {
  const sccs = tarjanSCC(depGraph);

  for (const scc of sccs) {
    if (scc.length === 1 && !hasSelfLoop(depGraph, scc[0])) {
      continue; // OK: trivial SCC
    }

    // Non-trivial SCC: must have state boundary
    const hasStateBoundary = scc.some(node =>
      node.kind === 'BlockEval' &&
      getBlockCapability(node.blockIndex) === 'state' &&
      blockBreaksCycle(node.blockIndex)
    );

    if (!hasStateBoundary) {
      errors.push({
        kind: 'IllegalCycle',
        nodes: scc.map(n => n.blockIndex)
      });
    }
  }

  return { graph: depGraph, sccs, errors };
}
```

---

## Topic 6: Dual-Emit Compiler

### The Core Modification

```typescript
function compileBusAware(patch: Patch): DualEmitResult {
  // Existing closure compilation
  const closure = compileToClosures(patch);

  // NEW: IR compilation
  const builder = new IRBuilderImpl();

  try {
    const normalized = pass1Normalize(patch);
    const typed = pass2TypeGraph(normalized);
    const timeResolved = pass3TimeTopology(typed);
    const depGraph = pass4DepGraph(timeResolved);
    const acyclic = pass5CycleValidation(depGraph);

    // Passes 6-11: Block lowering, bus lowering, etc.
    const ir = pass6Through11(acyclic, builder);

    // Validate
    const validation = validateIR(ir);

    return {
      closure,
      ir,
      irValid: validation.valid,
      irWarnings: validation.warnings
    };
  } catch (e) {
    return {
      closure,
      ir: null,
      irValid: false,
      irWarnings: [e.message]
    };
  }
}
```

### Block Compiler Contract

Each block type needs a compiler that emits IR:

```typescript
interface BlockCompiler {
  /**
   * Compile a block instance to IR.
   * MUST be pure - no side effects, no captured state.
   */
  compile(
    block: BlockInstance,
    inputs: ValueRef[],
    builder: IRBuilder
  ): BlockCompileResult;
}

interface BlockCompileResult {
  outputs: ValueSlot[];
  stateAllocations?: StateId[];
}
```

### Example: Sin Block Compiler

```typescript
const SinBlockCompiler: BlockCompiler = {
  compile(block, inputs, builder) {
    const inputSig = builder.sigFromSlot(inputs[0]);
    const sinSig = builder.sigMap(inputSig, { opcode: OpCode.Sin });
    const outputSlot = builder.allocValueSlot();
    builder.assignSlot(outputSlot, sinSig);
    return { outputs: [outputSlot] };
  }
};
```

---

## Topic 7: IR Validator

### Validation Rules

```typescript
function validateIR(ir: CompiledProgramIR): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. No missing references
  for (const node of ir.signalIR.nodes) {
    if (node.kind === 'map' && !ir.signalIR.nodes[node.src]) {
      errors.push(`Signal ${node.id}: missing src ${node.src}`);
    }
    if (node.kind === 'inputSlot' && !isValidSlot(node.slot)) {
      errors.push(`Signal ${node.id}: invalid slot ${node.slot}`);
    }
  }

  // 2. Types match
  for (const node of ir.signalIR.nodes) {
    if (node.kind === 'zip') {
      const aType = ir.signalIR.nodes[node.a].type;
      const bType = ir.signalIR.nodes[node.b].type;
      if (!typesCompatible(aType, bType, node.fn)) {
        errors.push(`Signal ${node.id}: type mismatch in zip`);
      }
    }
  }

  // 3. Schedule is topologically valid
  const scheduleValid = validateScheduleOrder(ir.schedule);
  if (!scheduleValid.valid) {
    errors.push(...scheduleValid.errors);
  }

  // 4. Determinism rules satisfied
  for (const bus of ir.buses) {
    if (!isPublisherOrderStable(bus.publishers)) {
      warnings.push(`Bus ${bus.id}: publisher order may be unstable`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

### Run in Dev Mode

```typescript
if (process.env.NODE_ENV === 'development') {
  const validation = validateIR(ir);
  if (!validation.valid) {
    console.error('IR Validation Errors:', validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn('IR Validation Warnings:', validation.warnings);
  }
}
```

---

## Testing Strategy

### Golden Patch Tests

```typescript
describe('dual-emit compiler', () => {
  it('produces valid IR for golden patch', () => {
    const patch = loadGoldenPatch('breathing-constellation');
    const result = compileBusAware(patch);

    expect(result.irValid).toBe(true);
    expect(result.irWarnings).toHaveLength(0);
  });

  it('closure and IR agree on structure', () => {
    const patch = loadGoldenPatch('breathing-constellation');
    const result = compileBusAware(patch);

    // Same number of signals
    const closureSignalCount = countSignals(result.closure);
    const irSignalCount = result.ir.signalIR.nodes.length;
    expect(irSignalCount).toBeGreaterThanOrEqual(closureSignalCount);
  });
});
```

### Pass-by-Pass Tests

```typescript
describe('Pass 1: Normalize', () => {
  it('freezes block IDs to indices', () => {
    const patch = createTestPatch();
    const normalized = pass1Normalize(patch);

    expect(normalized.blockIndexMap.size).toBe(patch.blocks.size);
  });

  it('attaches default sources to unwired inputs', () => {
    const patch = createPatchWithUnwiredInput();
    const normalized = pass1Normalize(patch);

    expect(normalized.defaultSources.length).toBeGreaterThan(0);
  });
});

describe('Pass 3: Time Topology', () => {
  it('finds single TimeRoot', () => {
    const patch = createPatchWithCycleTimeRoot();
    const typed = pass2TypeGraph(pass1Normalize(patch));
    const resolved = pass3TimeTopology(typed);

    expect(resolved.timeModel.kind).toBe('cyclic');
  });

  it('errors on multiple TimeRoots', () => {
    const patch = createPatchWithTwoTimeRoots();
    expect(() => pass3TimeTopology(pass2TypeGraph(pass1Normalize(patch))))
      .toThrow('MultipleTimeRoots');
  });
});
```

### Validator Tests

```typescript
describe('IR Validator', () => {
  it('catches missing signal references', () => {
    const brokenIR = createIRWithMissingRef();
    const result = validateIR(brokenIR);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(/missing src/);
  });

  it('catches type mismatches', () => {
    const brokenIR = createIRWithTypeMismatch();
    const result = validateIR(brokenIR);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(/type mismatch/);
  });
});
```

---

## Verification Checklist

### IRBuilder API
- [ ] All signal expression methods implemented
- [ ] All field expression methods implemented
- [ ] Transform chain building works
- [ ] State allocation works
- [ ] Build produces valid IR

### Pass 1 (Normalize)
- [ ] Block IDs frozen to indices
- [ ] Default sources attached
- [ ] Publishers/listeners canonicalized
- [ ] Errors for invalid IDs

### Pass 2 (Type Graph)
- [ ] SlotType -> TypeDesc conversion
- [ ] Bus eligibility validation
- [ ] Conversion path precomputation

### Pass 3 (Time Topology)
- [ ] Single TimeRoot enforcement
- [ ] TimeModel generation
- [ ] Canonical time signals created

### Pass 4-5 (Dep Graph & SCC)
- [ ] Complete dependency graph
- [ ] Cycle detection working
- [ ] State boundary rules enforced

### Dual-Emit Compiler
- [ ] Both closure and IR emitted
- [ ] IR attached to CompileResult
- [ ] Validation runs in dev mode

### IR Validator
- [ ] No missing references check
- [ ] Type matching check
- [ ] Schedule validity check
- [ ] Determinism warnings

---

## Success Criteria

Phase 3 is complete when:

1. `compileBusAware` returns both closure and IR
2. Golden patch produces valid IR
3. All 11 passes implemented
4. IR validator catches intentionally broken IR
5. Closure runtime still works (no regressions)
