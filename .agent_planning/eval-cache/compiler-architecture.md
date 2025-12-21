# Compiler Architecture - Stable Knowledge

**Last Updated**: 2025-12-21 13:35
**Confidence**: HIGH
**Source**: phase4-default-sources evaluation

---

## Block Compiler Inventory

**Total block compiler files**: 36 implementation files
- Domain compilers: 23 files (`src/editor/compiler/blocks/domain/`)
- Signal compilers: 8 files (`src/editor/compiler/blocks/signal/`)
- Rhythm compilers: 2 files (`src/editor/compiler/blocks/rhythm/`)
- Test files: 3 files (GridDomain, TimeRoot, ColorLFO)
- Helper files: 2 files (helpers.ts, index.ts)

**Current params usage**: 80 total `params.` references across 28 compiler files
- Most common pattern: `Number(params.key ?? defaultValue)`
- Range: 1-8 params per block compiler
- Average: ~3 params per block

---

## BlockCompiler Interface

**Location**: `src/editor/compiler/types.ts:398-416`

```typescript
export interface BlockCompiler {
  type: string;
  inputs: readonly PortDef[];
  outputs: readonly PortDef[];

  compile(args: {
    id: BlockId;
    params: Record<string, unknown>;  // Current: will be removed in Phase 4
    inputs: Record<string, Artifact>;
    ctx: CompileCtx;
  }): CompiledOutputs;
}
```

**Key Pattern**: All compilers follow same structure:
1. Validate required inputs exist and have correct kind
2. Extract parameter values with fallback defaults
3. Construct runtime functions (Signal, Field, etc.)
4. Return output artifacts

---

## Input Resolution Logic

**Location**: `src/editor/compiler/compileBusAware.ts:364-415`

**Current priority**:
1. Wire connection (explicit edge)
2. Bus listener (subscribe to bus value)
3. Error artifact (if required)
4. Nothing (if optional)

**Missing**: Default Source resolution (Phase 4 addition)

**Target priority** (post-Phase 4):
1. Wire connection
2. Bus listener
3. Default Source (from slot.defaultSource)
4. Error (only if no default exists)

---

## Common Compiler Patterns

### Signal Construction
```typescript
const signal: Signal<number> = (t: number, ctx: RuntimeCtx) => {
  const upstream = upstreamSignal(t, ctx);
  return transform(upstream, params);
};
```

### Field Construction
```typescript
const field: Field<Vec2> = (seed: number, n: number, ctx: CompileCtx) => {
  const out = new Array<Vec2>(n);
  for (let i = 0; i < n; i++) {
    out[i] = compute(i, seed, params);
  }
  return out;
};
```

### Parameter Access Pattern
```typescript
// Current (params-based)
const amplitude = Number(params.amplitude ?? 1);
const shape = String(params.shape ?? 'sine');

// Target (input-based)
const amplitude = inputs.amplitude?.value ?? 1;
const shape = inputs.shape?.value ?? 'sine';
```

---

## Test Infrastructure

**Unit tests**: 3 files
- `src/editor/compiler/blocks/domain/__tests__/GridDomain.test.ts`
- `src/editor/compiler/blocks/domain/__tests__/TimeRoot.test.ts`
- `src/editor/compiler/blocks/signal/__tests__/ColorLFO.test.ts`

**Coverage**: Limited - most blocks have no tests

**Testing pattern**:
```typescript
describe('BlockName', () => {
  it('compiles with valid inputs', () => {
    const result = compiler.compile({
      id: 'test',
      params: { /* ... */ },
      inputs: { /* ... */ },
      ctx: mockCtx,
    });
    expect(result.output.kind).toBe('Signal:number');
  });
});
```

---

## Migration Complexity

**Low complexity** (1-2 params, pure math):
- Shaper, ClampSignal, MinSignal, MaxSignal, AddSignal, MulSignal

**Medium complexity** (3-5 params, multiple modes):
- Oscillator, ColorLFO, EnvelopeAD, PulseDivider
- GridDomain, PositionMapCircle, PositionMapLine

**High complexity** (5+ params, nested logic):
- FieldMapVec2 (8 params), PositionMapGrid (5 params)
- RenderInstances2D (3 params + complex render logic)

---

## Key Insights

1. **Mechanical refactor**: Most compilers just need `params.X` → `inputs.X?.value`
2. **No logic changes**: Algorithm stays same, only data source changes
3. **Validation**: Fallback values MUST match slot.defaultSource.value
4. **Testing gap**: Need more compiler tests before migration
5. **Dual-mode period**: Keep params as fallback during transition

---

**Used by**: phase4-default-sources evaluation, compiler migration planning
