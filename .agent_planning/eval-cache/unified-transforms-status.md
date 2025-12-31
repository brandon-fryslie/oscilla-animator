# Unified Transforms IR Support Status

**Cached**: 2025-12-31 (FRESH)
**Source**: project-evaluator (unified-transforms evaluation)
**Confidence**: HIGH (direct code inspection)

---

## Quick Facts

**Coverage**: 3/41 transforms (7%)
- Adapters: 1/13 implemented
- Lenses: 2/28 implemented

**What Works in IR Mode**:
- ConstToSignal:float adapter
- scale lens (gain/bias)
- clamp lens (min/max)

**What Doesn't Work**: Everything else (emits clear errors)

---

## Infrastructure Status: COMPLETE ✅

**IR Node Types** (transforms.ts):
- TransformStepAdapter - references AdapterRegistry by ID
- TransformStepLens - references LensRegistry by ID

**Pass 8 Integration** (pass8-link-resolution.ts):
- `applyAdapterChain()` - applies adapter compileToIR in sequence
- `applyLensStack()` - applies lens compileToIR in sequence
- Clear error messages when unsupported
- Graceful degradation (continues with original value on failure)

**Registry Support**:
- `AdapterDef.compileToIR` field (optional)
- `LensDef.compileToIR` field (optional)
- `AdapterIRCtx` context type
- Params as `Record<string, ValueRefPacked>`

---

## Implementation Tiers

### Tier 1: Trivial (1-2 hours) - 8 transforms
Identity and single-line operations that copy existing patterns

### Tier 2: Simple (4-6 hours) - 11 transforms
Single OpCode with wrapper logic

### Tier 3: Moderate (8-12 hours) - 10 transforms
Multiple OpCodes, conditionals, multi-step operations

### Tier 4: Complex (24-36 hours) - 8 transforms
Stateful (3) - BLOCKED on state infrastructure
Field (6) - depends on field IR maturity

### Tier 5: Very Complex (40+ hours) - 2 transforms
ReduceFieldToSignal, ExpressionToWaveform - recommend closure-only forever

---

## Implementation Pattern (from existing code)

```typescript
compileToIR: (input, params, ctx) => {
  // 1. Validate input kind (signal only currently)
  if (input.k !== 'sig') return null;

  // 2. Validate param kinds (scalar const only currently)
  if (param?.k !== 'scalarConst') return null;

  // 3. Extract param values from const pool
  const value = ctx.builder.getConstPool()[param.constId];

  // 4. Build IR nodes
  const outputType: IRTypeDesc = { world: 'signal', domain: 'float' };
  const paramSig = ctx.builder.sigConst(value, outputType);
  const result = ctx.builder.sigZip(
    input.id, paramSig,
    { kind: 'opcode', opcode: OpCode.Add },
    outputType
  );

  // 5. Allocate slot and register
  const slot = ctx.builder.allocValueSlot(outputType);
  ctx.builder.registerSigSlot(result, slot);

  // 6. Return packed ValueRef
  return { k: 'sig', id: result, slot };
}
```

---

## Current Limitations

**Input Types**:
- Only signal inputs supported
- No field input support yet

**Param Types**:
- Only scalar const params supported
- No dynamic/signal params yet

**Domains**:
- ConstToSignal only works for float
- Vec2/color/boolean variants unimplemented

---

## Recommended Phased Approach

**Phase 1** (Quick Wins): 8 trivial transforms → 27% coverage
**Phase 2** (High Value): +6 common transforms → 41% coverage
**Phase 3** (Complete Simple): +5 more transforms → 54% coverage
**Phase 4** (Moderate): +6 vec2/color ops → 68% coverage
**Phase 5** (Advanced): +4 niche ops → 78% coverage

**Target**: Phase 4 (68%) is sufficient for most patches

---

## Blockers

**None for Tier 1-3** (29 transforms)
- All can be implemented with existing IR primitives

**For Stateful** (3 transforms)
- Need IR runtime state infrastructure design
- Defer until state system planned

**For Field Broadcast** (6 transforms)
- Need field IR maturity audit
- Implement if field support ready

**For Tier 5** (2 transforms)
- Complexity too high, ROI too low
- Accept permanent closure-only limitation

---

## Testing Requirements

Each implementation needs:
1. Unit tests (param validation, IR node creation)
2. Integration tests (Pass 8 application)
3. Runtime tests (output matches closure mode)

Pattern established by scale/clamp implementations.
