# IR Transform Support Status

**Date**: 2025-12-31
**Evaluator**: project-evaluator
**Scope**: Unified Transforms IR Compilation Support
**Confidence**: FRESH
**Git Commit**: 7e86b7e

---

## Executive Summary

The IR transform infrastructure is **complete and functional**, but coverage is **minimal**. Only 3 of 41 total transforms (7%) have `compileToIR` implementations.

**Infrastructure Status**: ✅ COMPLETE
- IR node types defined (`TransformStepAdapter`, `TransformStepLens`)
- Pass 8 integration complete (`applyAdapterChain()`, `applyLensStack()`)
- Clear error messages when transforms unsupported in IR mode
- Validation framework in place

**Implementation Status**: 🔶 MINIMAL
- **Adapters**: 1/13 implemented (8%)
- **Lenses**: 2/28 implemented (7%)
- **Total**: 3/41 transforms (7%)

---

## Current State

### Adapters: 1 of 13 Implemented (8%)

| Adapter ID | Domain | Status | Complexity | Notes |
|------------|--------|--------|------------|-------|
| ConstToSignal:float | float | ✅ DONE | Low | Sprint 5 |
| ConstToSignal:vec2 | vec2 | ❌ TODO | Low | Similar to float |
| ConstToSignal:color | color | ❌ TODO | Low | Similar to float |
| ConstToSignal:boolean | boolean | ❌ TODO | Low | Similar to float |
| BroadcastScalarToField:* | all | ❌ TODO | Medium | Needs field IR support |
| BroadcastSignalToField:* | all | ❌ TODO | Medium | Needs field IR support |
| ReduceFieldToSignal:* | all | ❌ TODO | High | Expensive, may need runtime fallback |
| NormalizeToPhase:signal | float | ❌ TODO | Low | Modulo 1.0 operation |
| NormalizeToPhase:scalar | float | ❌ TODO | Low | Compile-time modulo |
| PhaseToNumber:signal | float | ❌ TODO | Trivial | Identity transform |
| PhaseToNumber:scalar | float | ❌ TODO | Trivial | Identity transform |
| NumberToDurationMs:* | duration | ❌ TODO | Low | Multiply by 1000 |
| DurationToNumberMs:* | duration | ❌ TODO | Low | Divide by 1000 |
| ExpressionToWaveform | waveform | ❌ TODO | High | Complex signal construction |

**Notes**:
- ConstToSignal only works for float domain currently
- Vec2, color, boolean variants unimplemented but trivial
- Duration adapters have stub implementations (return Error artifacts)
- ExpressionToWaveform has stub implementation

### Lenses: 2 of 28 Implemented (7%)

| Lens ID | Domain | Status | Complexity | Notes |
|---------|--------|--------|------------|-------|
| scale | float | ✅ DONE | Low | Sprint 5 |
| clamp | float | ✅ DONE | Low | Sprint 5 |
| polarity | float | ❌ TODO | Low | Negate/abs operation |
| softclip | float | ❌ TODO | Medium | Tanh/sigmoid saturation |
| deadzone | float | ❌ TODO | Medium | Conditional zero |
| slew | float | ❌ TODO | High | **STATEFUL** - requires per-frame state |
| quantize | float | ❌ TODO | Low | Step rounding |
| ease | float | ❌ TODO | Medium | Easing curve lookup |
| mapRange | float | ❌ TODO | Low | Linear remap (high value) |
| hysteresis | float | ❌ TODO | High | **STATEFUL** - requires state |
| phaseOffset | float | ❌ TODO | Low | Add + modulo 1.0 |
| pingPong | float | ❌ TODO | Medium | Triangle wave mapping |
| phaseScale | float | ❌ TODO | Low | Multiply phase |
| phaseQuantize | float | ❌ TODO | Medium | Phase step quantize |
| wrapMode | float | ❌ TODO | Medium | Wrap/clamp/mirror modes |
| phaseWindow | float | ❌ TODO | Medium | Phase windowing |
| rotate2d | vec2 | ❌ TODO | Medium | 2D rotation matrix |
| vec2GainBias | vec2 | ❌ TODO | Low | Component-wise scale/offset |
| translate2d | vec2 | ❌ TODO | Low | 2D translation |
| clampBounds | vec2 | ❌ TODO | Medium | 2D bounds clamping |
| swirl | vec2 | ❌ TODO | Medium | Polar coordinate distortion |
| normalize | vec2 | ❌ TODO | Low | Vec2 normalization |
| smoothPath | vec2 | ❌ TODO | High | **STATEFUL** - path smoothing |
| hueShift | color | ❌ TODO | Medium | HSL color rotation |
| colorGain | color | ❌ TODO | Low | RGB multiply |
| saturate | color | ❌ TODO | Medium | HSL saturation |
| contrast | color | ❌ TODO | Low | RGB contrast curve |
| clampGamut | color | ❌ TODO | Medium | RGB clamping |

**Notes**:
- Only float domain lenses have compileToIR implementations
- 3 stateful lenses (slew, hysteresis, smoothPath) require IR runtime state support
- Listener-only lenses (ease, mapRange, hysteresis, phaseWindow, normalize, smoothPath) marked in registry

---

## Infrastructure Review

### IR Node Types (transforms.ts) ✅

```typescript
// Adapter step - type world conversion
export interface TransformStepAdapter {
  kind: "adapter";
  adapterId: string;
  params?: Record<string, number>;
}

// Lens step - value transformation
export interface TransformStepLens {
  kind: "lens";
  lensId: string;
  params?: Record<string, number>;
}
```

**Status**: Complete. IR types defined and integrated into `TransformStepIR` union.

### Pass 8 Integration (pass8-link-resolution.ts) ✅

**Functions**:
- `applyAdapterChain()` (lines 398-452): Applies adapter chain to ValueRefPacked
- `applyLensStack()` (lines 460-521): Applies lens stack to ValueRefPacked

**Behavior**:
- Iterates through adapter/lens chain
- Calls `compileToIR` for each transform
- Returns `null` if compilation fails
- Emits clear error messages with context
- Continues with original value on failure (graceful degradation)

**Error Messages** (Examples):
```
Adapter 'Signal → Field (float)' used in wire to RenderParticles.field
is not yet supported in IR compilation mode. This adapter requires
special runtime handling that hasn't been implemented in the IR compiler.
To use this adapter, either:
  - Switch to legacy closure compilation mode (set VITE_USE_UNIFIED_COMPILER=false)
  - Remove this adapter from your connection
  - Use an alternative adapter if available
```

**Status**: Complete and production-ready.

### Registry Infrastructure ✅

**AdapterRegistry.ts**:
- `AdapterDef.compileToIR` field defined (line 29)
- `AdapterIRCtx` context type defined (lines 12-16)
- Context provides: IRBuilder, adapterId, params

**LensRegistry.ts**:
- `LensDef.compileToIR` field defined (line 30)
- Context provides: IRBuilder
- Params passed as `Record<string, ValueRefPacked>`

**Status**: Complete. Type-safe context for IR compilation.

---

## Implementation Quality Assessment

### Existing Implementations

#### ConstToSignal:float (AdapterRegistry.ts:145-174)

**What it does**: Converts scalar constant to signal constant

```typescript
compileToIR: (input, ctx) => {
  if (input.k !== 'scalarConst') return null;
  const constValue = ctx.builder.getConstPool()[input.constId];
  const outputType: IRTypeDesc = { world: 'signal', domain: 'float' };
  const sigId = ctx.builder.sigConst(constValue, outputType);
  const slot = ctx.builder.allocValueSlot(outputType);
  ctx.builder.registerSigSlot(sigId, slot);
  return { k: 'sig', id: sigId, slot };
}
```

**Quality**: ✅ Good
- Validates input kind
- Uses const pool correctly
- Registers signal slot
- Returns properly packed ValueRef

**Issues**: Only handles float domain (vec2/color/boolean unimplemented)

#### scale lens (LensRegistry.ts:193-237)

**What it does**: Multiply by scale, add offset

```typescript
compileToIR: (input, params, ctx) => {
  if (input.k !== 'sig') return null;
  if (scaleParam?.k !== 'scalarConst' || offsetParam?.k !== 'scalarConst') {
    return null; // Dynamic params not yet supported
  }
  const scaleValue = ctx.builder.getConstPool()[scaleParam.constId];
  const offsetValue = ctx.builder.getConstPool()[offsetParam.constId];

  let result = input.id;
  if (scaleValue !== 1) {
    const scaleSigId = ctx.builder.sigConst(scaleValue, outputType);
    result = ctx.builder.sigZip(result, scaleSigId,
                                 { kind: 'opcode', opcode: OpCode.Mul },
                                 outputType);
  }
  if (offsetValue !== 0) {
    const offsetSigId = ctx.builder.sigConst(offsetValue, outputType);
    result = ctx.builder.sigZip(result, offsetSigId,
                                 { kind: 'opcode', opcode: OpCode.Add },
                                 outputType);
  }
  // ... allocate slot, register, return
}
```

**Quality**: ✅ Excellent
- Validates input kind
- Validates param kinds
- Optimizes (skips scale if 1, offset if 0)
- Uses sigZip with OpCodes correctly
- Returns properly packed ValueRef

#### clamp lens (LensRegistry.ts:280-322)

**What it does**: Clamp value to [min, max] range

```typescript
compileToIR: (input, params, ctx) => {
  if (input.k !== 'sig') return null;
  if (minParam?.k !== 'scalarConst' || maxParam?.k !== 'scalarConst') {
    return null;
  }
  const minValue = ctx.builder.getConstPool()[minParam.constId];
  const maxValue = ctx.builder.getConstPool()[maxParam.constId];

  // Implement as: max(min(value, maxValue), minValue)
  const maxClampSig = ctx.builder.sigZip(input.id, maxSigId,
                                          { kind: 'opcode', opcode: OpCode.Min },
                                          outputType);
  const result = ctx.builder.sigZip(maxClampSig, minSigId,
                                     { kind: 'opcode', opcode: OpCode.Max },
                                     outputType);
  // ... allocate slot, register, return
}
```

**Quality**: ✅ Good
- Validates input/param kinds
- Uses nested sigZip correctly
- Swaps min/max to ensure correctness

**Pattern Observed**:
All implementations follow same structure:
1. Validate input kind (signal only currently)
2. Validate param kinds (scalar const only currently)
3. Extract param values from const pool
4. Build IR nodes (sigConst, sigZip, etc.)
5. Allocate slot and register
6. Return packed ValueRef

**Limitations**:
- Only signal inputs supported (no field support)
- Only scalar const params supported (no dynamic/signal params)

---

## Complexity Tiers

### Tier 1: Trivial (Can copy-paste from existing) - 8 transforms

**Identity transforms**:
- PhaseToNumber:signal (same as input)
- PhaseToNumber:scalar (same as input)

**Single OpCode operations**:
- ConstToSignal:vec2 (copy float, change domain)
- ConstToSignal:color (copy float, change domain)
- ConstToSignal:boolean (copy float, coerce to 0/1)
- polarity lens (OpCode.Neg or OpCode.Abs)
- vec2GainBias lens (component-wise scale, copy from scale lens)
- translate2d lens (component-wise add, copy from scale lens)

**Estimated effort**: 1-2 hours total

### Tier 2: Simple (Single OpCode + wrapper) - 11 transforms

**Math operations**:
- NormalizeToPhase:signal (OpCode.Mod with 1.0)
- NormalizeToPhase:scalar (compile-time modulo)
- NumberToDurationMs:* (OpCode.Mul with 1000)
- DurationToNumberMs:* (OpCode.Div with 1000)
- phaseOffset lens (OpCode.Add + OpCode.Mod)
- phaseScale lens (OpCode.Mul + OpCode.Mod)
- quantize lens (OpCode.Mul, OpCode.Round, OpCode.Div)
- phaseQuantize lens (same as quantize + mod)
- colorGain lens (component-wise multiply)
- contrast lens (scale around 0.5 midpoint)

**Conditional operations**:
- deadzone lens (OpCode.Abs, conditional zero)

**Estimated effort**: 4-6 hours total

### Tier 3: Moderate (Multiple OpCodes, conditionals) - 10 transforms

**Multi-step operations**:
- softclip lens (tanh/sigmoid curve - may need custom OpCode)
- pingPong lens (conditional triangle wave)
- wrapMode lens (conditional wrap/clamp/mirror)
- ease lens (curve lookup - needs OpCode.LerpCurve or similar)
- mapRange lens (linear remap with optional clamp)
- rotate2d lens (2D rotation matrix - sin/cos OpCodes)
- clampBounds lens (component-wise clamp)
- swirl lens (polar transform - atan2, sin, cos)
- normalize lens (vec2 length + divide)
- clampGamut lens (RGB clamp per component)

**Color space operations**:
- hueShift lens (RGB→HSL→RGB with hue rotation)
- saturate lens (RGB→HSL→RGB with saturation adjustment)

**Estimated effort**: 8-12 hours total

### Tier 4: Complex (Needs new IR infrastructure) - 4 transforms

**Stateful operations** (requires IR runtime state):
- slew lens (rate limiter with lastValue state)
- hysteresis lens (threshold comparator with boolean state)
- smoothPath lens (path smoothing with history buffer)

**Estimated effort**: 16-24 hours total (blocked on state infrastructure)

**Field operations** (requires field IR support):
- BroadcastScalarToField:* adapters
- BroadcastSignalToField:* adapters

**Estimated effort**: 8-12 hours total (depends on field IR maturity)

### Tier 5: Very Complex (Major feature work) - 2 transforms

**Advanced operations**:
- ReduceFieldToSignal:* adapter (field reduction - expensive)
- ExpressionToWaveform adapter (expression parsing + signal generation)

**Estimated effort**: 40+ hours total (deferred indefinitely)

---

## Dependencies and Blockers

### No Blockers for Tier 1-3 (29 transforms)

All low/medium complexity transforms can be implemented with existing IR infrastructure:
- sigConst, sigZip, OpCodes
- Constant pool for params
- Slot allocation

### Blockers for Tier 4 (Stateful) - 3 transforms

**Issue**: No IR runtime state management
- slew, hysteresis, smoothPath require per-frame state
- IR currently stateless (pure signal processing)

**Options**:
1. Add state buffer to IR runtime (new feature)
2. Keep as closure-only (permanent limitation)
3. Implement approximations (e.g., slew → lowpass filter)

**Recommendation**: Defer until state infrastructure designed

### Blockers for Tier 4 (Field) - 6 transforms

**Issue**: Field IR support incomplete
- BroadcastScalarToField, BroadcastSignalToField need field nodes

**Status**: Field IR exists but may have gaps

**Recommendation**: Check field IR maturity, implement if ready

### No Blockers for Tier 5 - 2 transforms

**Issue**: Complexity too high, ROI too low
- ReduceFieldToSignal: expensive operation, rarely used
- ExpressionToWaveform: complex parser, niche use case

**Recommendation**: Keep as closure-only permanently

---

## Impact Analysis

### Current Impact: Minimal

**What works in IR mode**:
- ConstToSignal for float domain
- scale lens (gain/bias)
- clamp lens (min/max)

**What doesn't work in IR mode** (emits clear errors):
- All other adapters (12/13)
- All other lenses (26/28)
- Any patch using vec2/color/phase transforms
- Any patch using stateful transforms

**Real-world consequence**: Most existing patches cannot compile to IR mode

### Post-Tier 1 Impact: Low

**What works after Tier 1** (8 more transforms):
- Identity phase adapters
- All scalar world ConstToSignal variants
- Basic polarity, vec2 offset/scale

**Coverage**: 11/41 (27%)

### Post-Tier 2 Impact: Medium

**What works after Tier 2** (11 more transforms):
- Phase domain conversion
- Duration domain conversion
- Phase offset/scale
- Basic quantization
- Basic color gain/contrast

**Coverage**: 22/41 (54%)

### Post-Tier 3 Impact: High

**What works after Tier 3** (10 more transforms):
- All common lenses except stateful ones
- Full vec2 support (rotate, clamp, swirl, normalize)
- Full color support (hue, saturation, gamut)
- Advanced phase manipulation

**Coverage**: 32/41 (78%)

**Estimate**: 78% coverage is **sufficient for most patches** to work in IR mode

### Post-Tier 4 Impact: Very High

**Coverage**: 38/41 (93%)

**Remaining gap**: Only ReduceFieldToSignal and ExpressionToWaveform unsupported

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Tier 1) - 1-2 hours
**Priority**: HIGH
**Transforms**: 8 identity/trivial operations
**Impact**: Enables ConstToSignal for all domains, basic vec2

**Deliverables**:
1. ConstToSignal:vec2, :color, :boolean
2. PhaseToNumber adapters (identity)
3. polarity, vec2GainBias, translate2d lenses

### Phase 2: High-Value Simple Ops (Tier 2 subset) - 2-3 hours
**Priority**: HIGH
**Transforms**: 6 most commonly used operations
**Impact**: Enables phase manipulation, common math ops

**Deliverables**:
1. NormalizeToPhase adapters (modulo)
2. phaseOffset, phaseScale lenses
3. quantize lens
4. mapRange lens (listener-only but high value)

### Phase 3: Complete Simple Ops (Tier 2 remainder) - 2-3 hours
**Priority**: MEDIUM
**Transforms**: 5 less common operations
**Impact**: Enables duration conversion, color basics

**Deliverables**:
1. NumberToDurationMs, DurationToNumberMs adapters
2. phaseQuantize lens
3. deadzone lens
4. colorGain, contrast lenses

### Phase 4: Moderate Complexity (Tier 3 subset) - 4-6 hours
**Priority**: MEDIUM
**Transforms**: 6 high-value vec2/color operations
**Impact**: Enables most vec2 and color use cases

**Deliverables**:
1. rotate2d, clampBounds, normalize lenses (vec2)
2. hueShift, saturate, clampGamut lenses (color)

### Phase 5: Advanced Ops (Tier 3 remainder) - 4-6 hours
**Priority**: LOW
**Transforms**: 4 advanced/niche operations
**Impact**: Completes non-stateful transform support

**Deliverables**:
1. softclip, pingPong, wrapMode lenses
2. ease lens (may need curve OpCode)
3. swirl lens (polar transform)

### Phase 6: Field Broadcast (Tier 4 subset) - 8-12 hours
**Priority**: DEFERRED
**Blocker**: Depends on field IR maturity
**Transforms**: 6 field broadcast adapters

### Phase 7: Stateful Ops (Tier 4 subset) - 16-24 hours
**Priority**: DEFERRED
**Blocker**: Requires IR state infrastructure
**Transforms**: 3 stateful lenses

### Phase 8: Complex Ops (Tier 5) - NEVER
**Priority**: WONTFIX
**Transforms**: 2 very complex adapters
**Recommendation**: Keep as closure-only permanently

---

## Coverage Milestones

| Milestone | Transforms | Coverage | Effort | Impact |
|-----------|-----------|----------|--------|--------|
| Current | 3 | 7% | 0h | Minimal |
| Phase 1 | 11 | 27% | 1-2h | Low |
| Phase 2 | 17 | 41% | 3-5h | Medium |
| Phase 3 | 22 | 54% | 5-8h | Medium-High |
| Phase 4 | 28 | 68% | 9-14h | High |
| Phase 5 | 32 | 78% | 13-20h | Very High |
| Phase 6 | 38 | 93% | 21-32h | Near-Complete |
| Phase 7 | 41 | 100% | 37-56h | Complete (minus Tier 5) |

**Recommendation**: Target Phase 4 (68% coverage) as initial goal
- Covers all non-stateful, non-field transforms
- Sufficient for most real-world patches
- Achievable in 9-14 hours of focused work

---

## Risk Assessment

### Low Risk ✅

**Tier 1-3 implementations** (29 transforms):
- Well-understood operations
- Existing IR primitives sufficient
- Clear examples to follow (scale, clamp)
- No runtime changes required

### Medium Risk ⚠️

**Field broadcast adapters** (6 transforms):
- Field IR support exists but maturity unclear
- May reveal gaps in field compilation
- Runtime field handling may need work

**Mitigation**: Audit field IR before starting

### High Risk 🔴

**Stateful lenses** (3 transforms):
- Requires new IR state infrastructure
- Runtime state management design needed
- May conflict with scrub-safety guarantees

**Mitigation**: Design state system first, defer implementation

**Tier 5 adapters** (2 transforms):
- High complexity, low ROI
- May never be worth implementing

**Mitigation**: Accept permanent closure-only limitation

---

## Testing Strategy

### Unit Tests (Required for each transform)

**Test coverage**:
- Scalar const params → IR nodes
- Signal inputs → transformed signals
- Null/invalid inputs → null return
- Edge cases (zero, negative, boundary values)

**Example** (from scale lens pattern):
```typescript
describe('scale lens compileToIR', () => {
  it('should compile scale=2, offset=1', () => {
    const input = { k: 'sig', id: sigId, slot: 0 };
    const params = {
      scale: { k: 'scalarConst', constId: 0 }, // pool[0] = 2
      offset: { k: 'scalarConst', constId: 1 } // pool[1] = 1
    };
    const result = scaleLens.compileToIR(input, params, ctx);
    expect(result).toBeDefined();
    expect(result.k).toBe('sig');
  });

  it('should return null for non-signal input', () => {
    const input = { k: 'scalarConst', constId: 0 };
    const result = scaleLens.compileToIR(input, params, ctx);
    expect(result).toBeNull();
  });
});
```

### Integration Tests (Required for Pass 8)

**Test coverage**:
- Wire with adapter chain → transformed connection
- Listener with lens stack → transformed listener
- Error messages for unsupported transforms

### Runtime Tests (Required for end-to-end)

**Test coverage**:
- Compiled IR executes correctly
- Output matches closure mode
- Performance is acceptable

---

## Comparison with Completion Doc

### Matches COMPLETION-2025-12-30.md ✅

**Confirmed facts**:
- Infrastructure complete (Sprint 5)
- 1/18 adapters have compileToIR ✅ (actually 1/13, doc counted per-domain)
- 2/27 lenses have compileToIR ✅ (actually 2/28, doc undercounted)
- Clear error messages ✅
- Pass 8 integration ✅

**Discrepancies**:
- Doc counts adapters per-domain (ConstToSignal:float, :vec2, :color separate)
- Reality: Registered as template adapters (only float implemented)
- Doc lists 17 remaining adapters, reality is 12 (adjusted for domains)

### Matches AUDIT-2025-12-31.md ✅

**Confirmed assessment**:
- "IR mode patches cannot use most transforms" ✅
- "Error messages are clear but this limits IR adoption" ✅
- "Only 3/45 transforms have compileToIR" ✅ (close: 3/41)
- "All required DOD items: COMPLETE" ✅
- "Main remaining work is expanding IR mode support" ✅

---

## Recommendations

### Immediate Next Steps

1. **Implement Phase 1** (Tier 1 - Quick Wins)
   - 8 trivial transforms
   - 1-2 hours effort
   - Enables basic vec2 and multi-domain support

2. **Implement Phase 2** (Tier 2 subset - High Value)
   - 6 commonly used transforms
   - 2-3 hours effort
   - Enables phase manipulation (critical for animation)

3. **Audit field IR maturity**
   - Determine if BroadcastSignalToField can be implemented
   - Check fieldConst, fieldZip, field slot support

### Short-Term Goal

**Target**: 68% coverage (Phase 4 complete)
- All non-stateful float/vec2/color transforms
- 9-14 hours total effort
- Sufficient for most real-world patches

### Long-Term Strategy

**Accept limitations**:
- Stateful lenses remain closure-only until state infrastructure designed
- Tier 5 adapters remain closure-only permanently

**Monitor adoption**:
- Track which unsupported transforms block IR mode adoption
- Prioritize implementations based on real-world usage

**Document clearly**:
- Maintain clear error messages
- Document IR mode limitations in user-facing docs

---

## Appendix: Implementation Patterns

### Pattern 1: Simple Adapter (ConstToSignal variants)

```typescript
compileToIR: (input, ctx) => {
  // Validate input kind
  if (input.k !== 'scalarConst') return null;

  // Extract value from const pool
  const constValue = ctx.builder.getConstPool()[input.constId];

  // Determine output type
  const outputType: IRTypeDesc = {
    world: 'signal',
    domain: extractDomainFromAdapterId(ctx.adapterId)
  };

  // Create IR node
  const sigId = ctx.builder.sigConst(constValue, outputType);

  // Allocate slot and register
  const slot = ctx.builder.allocValueSlot(outputType);
  ctx.builder.registerSigSlot(sigId, slot);

  // Return packed ref
  return { k: 'sig', id: sigId, slot };
}
```

### Pattern 2: Single OpCode Lens

```typescript
compileToIR: (input, params, ctx) => {
  // Validate input
  if (input.k !== 'sig') return null;

  // Validate params
  const param = params.paramName;
  if (param?.k !== 'scalarConst') return null;

  // Extract param value
  const paramValue = ctx.builder.getConstPool()[param.constId];

  // Build operation
  const outputType: IRTypeDesc = { world: 'signal', domain: 'float' };
  const paramSigId = ctx.builder.sigConst(paramValue, outputType);
  const result = ctx.builder.sigZip(
    input.id,
    paramSigId,
    { kind: 'opcode', opcode: OpCode.Add }, // or Mul, Sub, etc.
    outputType
  );

  // Allocate slot and register
  const slot = ctx.builder.allocValueSlot(outputType);
  ctx.builder.registerSigSlot(result, slot);

  return { k: 'sig', id: result, slot };
}
```

### Pattern 3: Multi-OpCode Lens (from scale)

```typescript
compileToIR: (input, params, ctx) => {
  // Validate
  if (input.k !== 'sig') return null;
  if (param1?.k !== 'scalarConst' || param2?.k !== 'scalarConst') {
    return null;
  }

  // Extract
  const value1 = ctx.builder.getConstPool()[param1.constId];
  const value2 = ctx.builder.getConstPool()[param2.constId];

  // Build chain
  const outputType: IRTypeDesc = { world: 'signal', domain: 'float' };
  let result = input.id;

  // Apply first operation (with optimization)
  if (value1 !== identityValue) {
    const sig1 = ctx.builder.sigConst(value1, outputType);
    result = ctx.builder.sigZip(result, sig1, op1, outputType);
  }

  // Apply second operation (with optimization)
  if (value2 !== identityValue) {
    const sig2 = ctx.builder.sigConst(value2, outputType);
    result = ctx.builder.sigZip(result, sig2, op2, outputType);
  }

  // Allocate and return
  const slot = ctx.builder.allocValueSlot(outputType);
  ctx.builder.registerSigSlot(result, slot);
  return { k: 'sig', id: result, slot };
}
```

---

## Workflow Recommendation

**CONTINUE** ✅

Issues are clear and well-defined. No ambiguities blocking implementation.

Next agent can proceed directly to:
1. Planning phases 1-4
2. Implementing transforms in priority order
3. Adding tests for each implementation

No clarification needed. Infrastructure is solid.
