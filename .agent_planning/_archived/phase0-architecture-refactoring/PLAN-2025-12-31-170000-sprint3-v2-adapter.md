# Sprint 3: V2 Adapter Implementation

**Generated**: 2025-12-31-170000
**Status Source**: STATUS-2025-12-31.md
**Spec Reference**: compiler-final/ARCHITECTURE-RECOMMENDATIONS.md Part 4
**Priority**: P1 (High - Compiler Completion)
**Estimated Effort**: 3-5 days

---

## Sprint Goal

Replace V2 adapter stub with full implementation that bridges V1 closure-based blocks with V2 IR-based blocks, enabling legacy blocks to work in the new runtime.

---

## In-Scope Deliverables

1. **V2 Adapter Core** - Full implementation replacing stub
2. **IR Extensions** - Add SignalExprClosure node type for V1 bridges
3. **Runtime Integration** - Update evalSig to handle closure nodes

---

## Out-of-Scope

- Converting existing blocks to V2 (keep as V1 with bridge)
- Performance optimization (deferred to Phase 6)
- Field/Event IR (only Signal IR in this sprint)
- Complete V1 removal (maintain dual system)

---

## Work Items

### 1. Add SignalExprClosure Node Type to IR

**Status**: Not Started
**Effort**: Small (3-4 hours)
**Dependencies**: None
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 462-484

#### Description

Extend Signal IR with a new node type that wraps V1 closures, allowing them to be embedded as leaves in V2 expression trees.

#### Acceptance Criteria

- [ ] `SignalExprClosure` node type added to `SignalExprNode` discriminated union
- [ ] Node contains: `{ kind: 'closure'; closureFn: (ctx: FrameContext) => number; type: TypeDesc }`
- [ ] `SignalExprBuilder.closureNode()` method implemented
- [ ] Type safety preserved (closure return type matches expected Signal type)
- [ ] Unit tests verify closure nodes serialize/deserialize correctly
- [ ] IR validation accepts closure nodes

#### Technical Notes

```typescript
// src/editor/compiler/ir/types.ts
type SignalExprNode =
  | { kind: 'const'; constId: number }
  | { kind: 'param'; paramId: string }
  | { kind: 'map'; src: SigExprId; fn: KernelRef }
  | { kind: 'zip'; srcs: SigExprId[]; fn: KernelRef }
  | { kind: 'closure'; closureFn: (ctx: FrameContext) => number; type: TypeDesc };  // NEW

// src/editor/compiler/ir/SignalExprBuilder.ts
class SignalExprBuilder {
  // ... existing methods

  closureNode(fn: (ctx: FrameContext) => number, type: TypeDesc): SigExprId {
    const id = this.nodes.length;
    this.nodes.push({
      kind: 'closure',
      closureFn: fn,
      type
    });
    return id;
  }
}
```

---

### 2. Implement artifactToSigExprId Converter

**Status**: Not Started
**Effort**: Medium (6-8 hours)
**Dependencies**: Work Item 1
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 447-459

#### Description

Create helper function that converts V1 Artifact values (closures or constants) to V2 SigExprId references for use in block compilation.

#### Acceptance Criteria

- [ ] `artifactToSigExprId(artifact: Artifact, builder: SignalExprBuilder, ctx: CompileCtx): SigExprId` implemented
- [ ] Handles constant artifacts: wraps in `builder.sigConst()`
- [ ] Handles closure artifacts: wraps in `builder.closureNode()`
- [ ] Type validation: artifact.type matches expected Signal type
- [ ] Error handling: rejects Field/Event artifacts with clear message
- [ ] Unit tests cover all artifact types (const, closure, invalid)
- [ ] Performance: converter adds < 1µs per artifact

#### Technical Notes

```typescript
// src/editor/compiler/v2adapter.ts
function artifactToSigExprId(
  artifact: Artifact,
  builder: SignalExprBuilder,
  ctx: CompileCtx
): SigExprId {
  // Validate world
  if (artifact.world !== 'signal' && artifact.world !== 'scalar') {
    throw new CompileError(
      `V2 adapter only supports signal/scalar artifacts, got ${artifact.world}`,
      { artifact }
    );
  }

  // Check if constant or closure
  if (typeof artifact.value === 'function') {
    // V1 closure - wrap in closure node
    return builder.closureNode(
      artifact.value as (ctx: FrameContext) => number,
      artifact.type
    );
  } else {
    // Constant - emit const node
    if (typeof artifact.value !== 'number') {
      throw new CompileError(
        `Expected number constant, got ${typeof artifact.value}`,
        { artifact }
      );
    }
    return builder.sigConst(artifact.value, artifact.type);
  }
}
```

---

### 3. Implement Full V2 Adapter

**Status**: Not Started
**Effort**: Medium (8-12 hours)
**Dependencies**: Work Item 2
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 407-444

#### Description

Replace the stub V2 adapter with full implementation that creates SignalExprBuilder, converts inputs, calls V2 compiler, and wraps outputs as closures.

#### Acceptance Criteria

- [ ] `adaptV2Compiler()` creates SignalExprBuilder for each block instance
- [ ] Input artifacts converted to SigExprIds via `artifactToSigExprId()`
- [ ] Calls `v2Compiler.compileV2()` with converted inputs
- [ ] Output SigExprIds wrapped as closures: `(ctx) => evalSig(ir, id, ctx)`
- [ ] IR built once per block, cached in closure scope
- [ ] Error artifacts removed (stub code deleted)
- [ ] All V2 block types compile without errors
- [ ] Unit tests verify adapter with mock V2 blocks

#### Technical Notes

```typescript
// src/editor/compiler/v2adapter.ts (full implementation)
export function adaptV2Compiler(v2Compiler: BlockCompilerV2): BlockCompiler {
  return {
    type: v2Compiler.type,
    inputs: v2Compiler.inputs,
    outputs: v2Compiler.outputs,

    compile(args: BlockCompileArgs): Record<string, Artifact> {
      const { id, params, inputs, ctx } = args;

      // 1. Create builder for this block
      const builder = new SignalExprBuilder();

      // 2. Convert input artifacts to SigExprIds
      const inputIds: Record<string, SigExprId> = {};
      for (const [name, artifact] of Object.entries(inputs)) {
        inputIds[name] = artifactToSigExprId(artifact, builder, ctx);
      }

      // 3. Call V2 compiler
      const outputIds = v2Compiler.compileV2({
        id,
        params,
        inputs: inputIds,
        builder,
        ctx
      });

      // 4. Build IR once
      const ir = builder.build();

      // 5. Wrap outputs as closures that evaluate IR
      const outputs: Record<string, Artifact> = {};
      for (const [name, sigExprId] of Object.entries(outputIds)) {
        const outputDef = v2Compiler.outputs.find(o => o.name === name);
        if (!outputDef) {
          throw new CompileError(`Unknown output: ${name}`, { blockId: id });
        }

        outputs[name] = {
          world: outputDef.world,
          type: outputDef.type,
          value: (frameCtx: FrameContext) => {
            return evalSig(ir, sigExprId, frameCtx);
          }
        };
      }

      return outputs;
    }
  };
}
```

---

### 4. Update evalSig to Handle Closure Nodes

**Status**: Not Started
**Effort**: Small (4-6 hours)
**Dependencies**: Work Item 3
**Spec Reference**: ARCHITECTURE-RECOMMENDATIONS.md lines 466-484

#### Description

Extend Signal IR evaluator to handle the new closure node type, enabling V1 closures to execute within V2 expression trees.

#### Acceptance Criteria

- [ ] `evalSig()` switch statement includes `case 'closure'`
- [ ] Closure nodes invoke `node.closureFn(ctx)` and return result
- [ ] Type safety preserved (closure return type validated)
- [ ] Performance: closure invocation overhead < 10ns
- [ ] Unit tests verify closure nodes evaluate correctly
- [ ] Integration tests: mixed V1/V2 blocks in same patch

#### Technical Notes

```typescript
// src/editor/runtime/executor/evalSig.ts
export function evalSig(
  ir: SignalIR,
  id: SigExprId,
  ctx: FrameContext
): number {
  const node = ir.nodes[id];

  switch (node.kind) {
    case 'const':
      return ir.constPool[node.constId];

    case 'param':
      return ctx.params[node.paramId] ?? 0;

    case 'closure':  // NEW: V1 bridge
      return node.closureFn(ctx);

    case 'map': {
      const src = evalSig(ir, node.src, ctx);
      return applyKernel(node.fn, [src], ctx);
    }

    case 'zip': {
      const srcs = node.srcs.map(srcId => evalSig(ir, srcId, ctx));
      return applyKernel(node.fn, srcs, ctx);
    }

    default:
      throw new Error(`Unknown node kind: ${(node as any).kind}`);
  }
}
```

---

### 5. Test V2 Adapter with All Block Types

**Status**: Not Started
**Effort**: Medium (8-10 hours)
**Dependencies**: Work Item 4
**Spec Reference**: New testing infrastructure

#### Description

Comprehensive testing of V2 adapter with various block types, input combinations, and edge cases.

#### Acceptance Criteria

- [ ] Unit tests: V2 blocks with constant inputs compile correctly
- [ ] Unit tests: V2 blocks with closure inputs compile correctly
- [ ] Unit tests: Mixed V1 and V2 blocks in same patch
- [ ] Unit tests: Nested V2 blocks (V2 output feeds V2 input)
- [ ] Integration tests: Golden patch with V2 blocks renders correctly
- [ ] Error handling: Invalid input worlds rejected with clear message
- [ ] Performance: V2 adapter overhead < 5% vs native V1

#### Technical Notes

```typescript
// tests/compiler/v2adapter.test.ts
describe('V2 Adapter', () => {
  it('compiles V2 block with constant inputs', () => {
    const v2Block: BlockCompilerV2 = {
      type: 'Add',
      inputs: [
        { name: 'a', world: 'signal', type: { domain: 'float' } },
        { name: 'b', world: 'signal', type: { domain: 'float' } }
      ],
      outputs: [
        { name: 'out', world: 'signal', type: { domain: 'float' } }
      ],
      compileV2({ inputs, builder }) {
        const sum = builder.sigZip([inputs.a, inputs.b], { kind: 'kernel', kernelId: 'add' });
        return { out: sum };
      }
    };

    const adapted = adaptV2Compiler(v2Block);
    const result = adapted.compile({
      id: 'add1',
      params: {},
      inputs: {
        a: { world: 'signal', type: { domain: 'float' }, value: 10 },
        b: { world: 'signal', type: { domain: 'float' }, value: 20 }
      },
      ctx: createCompileCtx()
    });

    expect(result.out.world).toBe('signal');
    expect(typeof result.out.value).toBe('function');

    const output = (result.out.value as (ctx: FrameContext) => number)({ t: 0, params: {} });
    expect(output).toBe(30);
  });

  it('compiles V2 block with V1 closure inputs', () => {
    const v2Block: BlockCompilerV2 = {
      // ... same as above
    };

    const adapted = adaptV2Compiler(v2Block);
    const result = adapted.compile({
      id: 'add1',
      params: {},
      inputs: {
        a: { world: 'signal', type: { domain: 'float' }, value: (ctx) => ctx.t * 2 },  // V1 closure
        b: { world: 'signal', type: { domain: 'float' }, value: (ctx) => 10 }          // V1 closure
      },
      ctx: createCompileCtx()
    });

    const output = (result.out.value as (ctx: FrameContext) => number)({ t: 5, params: {} });
    expect(output).toBe(20);  // (5 * 2) + 10
  });

  it('rejects Field/Event inputs with clear error', () => {
    const v2Block: BlockCompilerV2 = {
      type: 'FieldMap',
      inputs: [{ name: 'field', world: 'field', type: { domain: 'float' } }],
      outputs: [{ name: 'out', world: 'field', type: { domain: 'float' } }],
      compileV2() { return { out: 0 }; }
    };

    const adapted = adaptV2Compiler(v2Block);

    expect(() => {
      adapted.compile({
        id: 'map1',
        params: {},
        inputs: {
          field: { world: 'field', type: { domain: 'float' }, value: {} }  // Field not supported yet
        },
        ctx: createCompileCtx()
      });
    }).toThrow(/only supports signal\/scalar/);
  });
});
```

---

### 6. Document V1/V2 Bridge Architecture

**Status**: Not Started
**Effort**: Small (2-3 hours)
**Dependencies**: Work Item 5
**Spec Reference**: New documentation

#### Description

Create clear documentation explaining the V1/V2 bridge, when to use each, and migration path for block authors.

#### Acceptance Criteria

- [ ] Architecture doc created: `design-docs/compiler/v1-v2-bridge.md`
- [ ] Explains closure node concept and rationale
- [ ] Documents when to use V1 vs V2 compilers
- [ ] Provides migration guide for converting V1 blocks to V2
- [ ] Includes performance implications
- [ ] Code examples for both systems
- [ ] CHANGELOG entry summarizes V2 adapter completion

#### Technical Notes

**Key Points to Document**:
- V1 compilers return closures (opaque, runtime evaluation)
- V2 compilers return IR (transparent, optimizable)
- Bridge enables gradual migration (no flag day)
- Closure nodes have overhead (~10ns per call)
- Future: V2-only runtime will remove closure support

---

## Dependencies

**Blocks This Sprint**:
- None (enables legacy blocks in new runtime)

**Blocked By**:
- Sprint 1 (needs Edge type for input resolution)
- Sprint 2 (needs input resolution to work correctly)

---

## Risks

### MEDIUM: Runtime Performance Degradation

**Impact**: Closure node overhead could slow down patches with many V1 blocks
**Mitigation**:
- Performance profiling with golden patches
- Document overhead in migration guide
- Prioritize high-frequency blocks for V2 conversion
- Consider closure node caching if overhead > 10ns

### MEDIUM: Memory Management Complexity

**Impact**: IR objects captured in closure scope may cause memory leaks
**Mitigation**:
- Careful IR lifetime management
- Unit tests verify no memory leaks
- Document ownership model clearly
- Consider IR pooling if memory usage spikes

### LOW: Type System Edge Cases

**Impact**: Some V1 artifacts may not convert cleanly to V2
**Mitigation**:
- Comprehensive error handling
- Clear error messages for unsupported types
- Fallback to V1-only compilation if needed
- Document unsupported cases

---

## Test Strategy

### Unit Tests

```typescript
// tests/compiler/ir/SignalExprClosure.test.ts
describe('SignalExprClosure node', () => {
  it('creates closure node via builder', () => {
    const builder = new SignalExprBuilder();
    const closureFn = (ctx: FrameContext) => ctx.t * 2;
    const id = builder.closureNode(closureFn, { domain: 'float' });

    expect(id).toBe(0);
    const ir = builder.build();
    expect(ir.nodes[0]).toMatchObject({
      kind: 'closure',
      closureFn,
      type: { domain: 'float' }
    });
  });
});

// tests/compiler/v2adapter/artifactToSigExprId.test.ts
describe('artifactToSigExprId', () => {
  it('converts constant artifact to const node', () => {
    const builder = new SignalExprBuilder();
    const artifact: Artifact = {
      world: 'signal',
      type: { domain: 'float' },
      value: 42
    };

    const id = artifactToSigExprId(artifact, builder, createCompileCtx());
    const ir = builder.build();

    expect(ir.nodes[id].kind).toBe('const');
  });

  it('converts closure artifact to closure node', () => {
    const builder = new SignalExprBuilder();
    const artifact: Artifact = {
      world: 'signal',
      type: { domain: 'float' },
      value: (ctx: FrameContext) => ctx.t
    };

    const id = artifactToSigExprId(artifact, builder, createCompileCtx());
    const ir = builder.build();

    expect(ir.nodes[id].kind).toBe('closure');
  });
});
```

### Integration Tests

```typescript
// tests/compiler/mixed-v1-v2.test.ts
describe('Mixed V1 and V2 blocks', () => {
  it('chains V1 block → V2 block → V1 block', () => {
    const patch = createPatch({
      blocks: [
        { id: 'lfo', type: 'LFO' },           // V1 block
        { id: 'add', type: 'Add' },           // V2 block
        { id: 'osc', type: 'Oscillator' }     // V1 block
      ],
      edges: [
        { from: port('lfo', 'out'), to: port('add', 'a') },
        { from: port('add', 'out'), to: port('osc', 'frequency') }
      ]
    });

    const result = compile(patch);
    expect(result.errors).toHaveLength(0);

    const runtime = new Runtime(result.ir);
    const output = runtime.evaluate({ t: 0 });
    expect(output).toMatchSnapshot();
  });
});
```

### Performance Tests

```typescript
// tests/performance/v2adapter.bench.ts
describe('V2 Adapter Performance', () => {
  it('has < 5% overhead vs native V1', () => {
    const patch = createLargePatch({ blockCount: 100 });

    const timeV1 = measureCompileTime(patch, { forceV1: true });
    const timeV2 = measureCompileTime(patch, { useAdapter: true });

    const overhead = (timeV2 - timeV1) / timeV1;
    expect(overhead).toBeLessThan(0.05);  // < 5% overhead
  });
});
```

---

## Success Criteria

- [ ] All 302 existing tests pass with V2 adapter
- [ ] Golden patch with V2 blocks renders identically to V1
- [ ] Compilation time increase < 5% for mixed V1/V2 patches
- [ ] Runtime performance unchanged for V1-only patches
- [ ] No memory leaks in closure node handling
- [ ] Error messages clear for unsupported artifact types
- [ ] Documentation complete and accurate
- [ ] CHANGELOG entry written

---

## Follow-Up Work (Not in Sprint)

- Extend V2 adapter to support Field/Event worlds
- Performance optimization: closure node caching
- Convert high-frequency blocks to native V2
- V2-only runtime (remove closure support)
- Memory pooling for IR objects
