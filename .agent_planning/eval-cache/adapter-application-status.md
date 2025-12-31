# Adapter Application Status (Eval Cache)
Cached: 2025-12-31 01:45
Source: project-evaluator (type-contracts-ir-plumbing)
Confidence: HIGH

## Summary
Adapters and lenses are applied in **Pass 8 only**. Pass 6 does NOT apply them. This means block lowering functions see unadapted types.

## Current Implementation

### Pass 8: Link Resolution ✅ APPLIES ADAPTERS
**Location**: `src/editor/compiler/passes/pass8-link-resolution.ts:598-618`

**For wire connections**:
```typescript
if (ref !== undefined) {
  // Apply adapter chain if present
  if (wire.adapterChain !== undefined && wire.adapterChain.length > 0) {
    ref = applyAdapterChain(ref, wire.adapterChain, builder, errors, context);
  }
  // Apply lens stack if present
  if (wire.lensStack !== undefined && wire.lensStack.length > 0) {
    ref = applyLensStack(ref, wire.lensStack, builder, errors, context);
  }
  refs[flatIdx] = ref;
}
```

**For bus listeners**: `pass8-link-resolution.ts:650-661`
- Same pattern: applyAdapterChain, then applyLensStack

**Error handling**: Soft (warns, continues with original value)
- Adapter not found → error logged, skip adapter
- Adapter compileToIR undefined → error logged, skip adapter
- Lens not found → error logged, skip lens
- Lens compileToIR undefined → error logged, skip lens

### Pass 6: Block Lowering ❌ NO ADAPTERS
**Location**: `src/editor/compiler/passes/pass6-block-lowering.ts:296-351`

**What it does**:
1. Gets artifact from compiledPortMap
2. Converts artifact to ValueRef
3. Checks for defaultSource
4. Passes ValueRef to block lowering function

**What it DOESN'T do**:
- No adapter application
- No lens application
- No wire metadata access (no adapterChain/lensStack)

## Gap Analysis

### Why This Is a Problem

**Block lowering sees wrong types**:
- Upstream block outputs `signal<float>`
- Wire has adapter `float → vec2`
- Block expects `signal<vec2>` input
- Pass 6 passes raw `signal<float>` to block lowering
- Block lowering may fail or produce wrong IR

**Type checking happens too late**:
- Type mismatches only caught in Pass 8
- Block lowering already ran with wrong types
- IR may be inconsistent

**Adapters/lenses appear in wrong IR location**:
- Should be applied at input resolution (Pass 6)
- Instead applied at link resolution (Pass 8)
- IR structure doesn't reflect where transform happens

### Why Pass 6 Doesn't Apply Adapters

**Missing context**: Pass 6 operates on `compiledPortMap` (artifact-based), doesn't have wire/listener metadata

**Artifact system**: Pass 6 gets Artifacts (closure-based values), not wires
- Artifacts don't carry adapter/lens information
- Wire metadata (adapterChain, lensStack) only available in Pass 8

## Fix Options

### Option A: Move adapters to Pass 6 (Plan's intent)
**Approach**:
1. Thread wire/listener data into Pass 6 context
2. After getting artifact, look up corresponding wire
3. Apply adapterChain and lensStack before block lowering
4. Block lowering sees adapted types

**Pros**:
- Block lowering sees correct types
- Type errors caught early
- IR structure reflects actual data flow

**Cons**:
- Needs wire data in Pass 6 (architectural change)
- More complex Pass 6 logic

### Option B: Keep in Pass 8 (Status quo)
**Approach**:
- Pass 6 handles raw types
- Pass 8 applies adapters during link resolution
- Block lowering works with unadapted types

**Pros**:
- Current implementation works
- No architectural changes

**Cons**:
- Block lowering sees wrong types
- Type checking delayed
- IR structure misleading

### Option C: Hybrid
**Approach**:
- Pass 6: Apply adapters for simple cases (direct wire, no bus)
- Pass 8: Apply adapters for complex cases (bus listeners, multi-hop)

**Pros**:
- Incremental migration

**Cons**:
- Complex, inconsistent behavior

## Implementation Notes

### applyAdapterChain Function
**Location**: `pass8-link-resolution.ts:398-452`

**Signature**:
```typescript
function applyAdapterChain(
  valueRef: ValueRefPacked,
  adapterChain: readonly AdapterStep[],
  builder: IRBuilder,
  errors: CompileError[],
  context: string
): ValueRefPacked
```

**Behavior**:
- Iterates adapter chain
- Calls adapter.compileToIR(valueRef, irCtx)
- Returns transformed ValueRef
- Errors logged but don't fail compilation

### applyLensStack Function
**Location**: `pass8-link-resolution.ts:460-521`

**Signature**:
```typescript
function applyLensStack(
  valueRef: ValueRefPacked,
  lensStack: readonly LensInstance[],
  builder: IRBuilder,
  errors: CompileError[],
  context: string
): ValueRefPacked
```

**Behavior**:
- Iterates lens stack
- Converts lens params to ValueRefPacked
- Calls lens.compileToIR(valueRef, paramsMap, irCtx)
- Returns transformed ValueRef
- Errors logged but don't fail compilation

## Test Strategy

**If moving to Pass 6**:
1. Test adapter application before block lowering
2. Test lens application before block lowering
3. Test that block lowering receives adapted types
4. Test error cases (missing adapter, incompatible types)

**Runtime validation**:
1. Create patch with adapter (float → vec2)
2. Verify IR has adapter node BEFORE block lowering IR
3. Verify block lowering sees vec2, not float

## Related Files

**Pass 6**: `src/editor/compiler/passes/pass6-block-lowering.ts`
**Pass 8**: `src/editor/compiler/passes/pass8-link-resolution.ts`
**Adapter Registry**: `src/editor/adapters/AdapterRegistry.ts`
**Lens Registry**: `src/editor/lenses/LensRegistry.ts`
