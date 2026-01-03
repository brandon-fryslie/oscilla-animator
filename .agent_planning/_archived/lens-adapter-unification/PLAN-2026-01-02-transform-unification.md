# Implementation Plan: Transform Unification
**Date**: 2026-01-02
**Scope**: lens-adapter-unification
**Goal**: Single code path for all transforms, enabling simplified Bus-Block cleanup

---

## Executive Summary

Unify adapter and lens handling into a single transform dispatcher. This removes 6 code paths (3 connection types × 2 transform types) and replaces them with 1 unified path.

**Key Deliverable**:
```typescript
applyTransforms(value, transforms: TransformStep[], ctx) → value
```

This function works identically for:
- Wire transforms (connections between blocks)
- Any future edge type from Bus-Block unification

| Phase | Description | Effort |
|-------|-------------|--------|
| **Phase 1** | Unify runtime dispatcher | 3-4h |
| **Phase 2** | Unify IR dispatcher | 2-3h |
| **Phase 3** | Delete dead/duplicate code | 2-3h |
| **Phase 4** | Register missing transforms | 4-6h |
| **Phase 5** | Verification | 2h |
| **Total** | | 13-18h |

---

## Why This Matters

### Current State (Fragmented)

```
Wire connection ──→ applyTransformStack() ──→ applyAdapterChain()
                                          └─→ applyLensStack()

                                          └─→ applyLensStack()

                                          └─→ applyLensStack()
```

**6 code paths**, duplicated logic, scattered validation.

### Target State (Unified)

```
Any Edge ──→ applyTransforms(value, edge.transforms, ctx) ──→ value
```

**1 code path** that:
- Iterates through `TransformStep[]`
- For each step, calls `transformDef.apply(value, params)`
- Handles errors uniformly
- Works for adapters AND lenses identically

---

## Critical Constraint

> **Lenses CANNOT have state.** All lenses must be pure functions.
> Delete `slew` lens during this refactor.

---

## Phase 1: Unify Runtime Dispatcher

**Goal**: Replace `applyAdapterChain()` + `applyLensStack()` with single unified function.

### 1.1 Create Unified Apply Function

**File**: `src/editor/transforms/apply.ts`

Replace the current structure with:

```typescript
/**
 * Apply a single transform step to a value.
 * Works identically for adapters and lenses.
 */
export function applyTransformStep(
  value: Artifact,
  step: TransformStep,
  ctx: TransformContext
): Artifact | TransformError {
  // Get transform definition from registry
  const id = step.kind === 'adapter' ? step.step.adapterId : step.lens.type;
  const def = TRANSFORM_REGISTRY.getTransform(id);

  if (!def) {
    return { kind: 'Error', message: `Unknown transform: ${id}` };
  }

  // Skip if disabled
  if (!step.enabled) {
    return value;
  }

  // Resolve parameters (unified for both types)
  const params = resolveTransformParams(step, ctx);

  // Apply the transform
  return def.apply(value, params, ctx);
}

/**
 * Apply a chain of transforms to a value.
 * Single entry point for all transform application.
 */
export function applyTransforms(
  value: Artifact,
  transforms: TransformStep[],
  ctx: TransformContext
): Artifact {
  let current = value;

  for (const step of transforms) {
    const result = applyTransformStep(current, step, ctx);

    if (result.kind === 'Error') {
      return result; // Early exit on error
    }

    current = result;
  }

  return current;
}
```

### 1.2 Unify Parameter Resolution

**Current problem**: Adapters and lenses resolve params differently.

**Solution**: Single `resolveTransformParams()` function:

```typescript
function resolveTransformParams(
  step: TransformStep,
  ctx: TransformContext
): Record<string, Artifact> {
  if (step.kind === 'adapter') {
    // Adapters have simple params in step.step.params
    return step.step.params ?? {};
  } else {
    // Lenses have LensInstance with param bindings
    return resolveLensParams(step.lens, ctx);
  }
}
```

### 1.3 Unify TransformDef.apply Signature

**Current problem**: Adapters and lenses have different `apply` signatures.

```typescript
// Current adapter apply:
apply: (artifact: Artifact, params: Record<string, unknown>, ctx: RuntimeCtx) => Artifact

// Current lens apply:
apply: (value: Artifact, params: Record<string, Artifact>) => Artifact
```

**Solution**: Standardize on single signature:

```typescript
apply: (value: Artifact, params: Record<string, Artifact>, ctx: TransformContext) => Artifact
```

All transforms receive:
- `value`: The input artifact
- `params`: Resolved parameters as artifacts
- `ctx`: Context with time, runtime info, etc.

### 1.4 Delete Old Functions

After unification, delete:
- `applyAdapterChain()` (lines 74-100)
- `applyLensStack()` (lines 113-170)
- `applyAdapterStep()` (lines 21-37)

Keep only:
- `applyTransformStep()` (new)
- `applyTransforms()` (new, replaces `applyTransformStack()`)

---

## Phase 2: Unify IR Dispatcher

**Goal**: Align pass8 IR application with runtime pattern.

### 2.1 Update Pass 8 Transform Application

**File**: `src/editor/compiler/passes/pass8-link-resolution.ts`

Current structure (lines 358-535):
- `applyAdapterStep()` - IR adapter application
- `applyLensStep()` - IR lens application
- `applyTransforms()` - dispatcher

Replace with unified pattern:

```typescript
/**
 * Apply a single transform step in IR mode.
 */
function applyTransformStepIR(
  valueRef: ValueRefPacked,
  step: TransformStep,
  ctx: IRContext
): ValueRefPacked | null {
  const id = step.kind === 'adapter' ? step.step.adapterId : step.lens.type;
  const def = TRANSFORM_REGISTRY.getTransform(id);

  if (!def?.compileToIR) {
    return null; // Transform doesn't support IR
  }

  if (!step.enabled) {
    return valueRef;
  }

  const params = resolveTransformParamsIR(step, ctx);
  return def.compileToIR(valueRef, params, ctx);
}

/**
 * Apply transform chain in IR mode.
 */
function applyTransformsIR(
  valueRef: ValueRefPacked,
  transforms: TransformStep[],
  ctx: IRContext
): ValueRefPacked | null {
  let current = valueRef;

  for (const step of transforms) {
    const result = applyTransformStepIR(current, step, ctx);
    if (result === null) return null;
    current = result;
  }

  return current;
}
```

### 2.2 Delete Old IR Functions

After unification, delete:
- `applyAdapterStep()` (lines 358-414)
- `applyLensStep()` (lines 424-492)

---

## Phase 3: Delete Dead/Duplicate Code

**Goal**: Remove code that's no longer needed.

### 3.1 Delete Legacy Lens Implementations

**File**: `src/editor/lenses/index.ts`

This file has standalone lens implementations that aren't wired to the registry:
- `applyLens()` dispatcher (lines 111-145)
- `applyEaseLens()`, `applyScaleLens()`, etc.
- `applySlewLens()` - **DELETE** (stateful, violates constraint)

**Action**: Delete the entire file after implementations are in registry.

### 3.2 Delete Duplicate Validation

Currently scope validation happens in multiple places:
- `apply.ts:applyLensStack()` (lines 128-147)
- Various call sites in `compileBusAware.ts`

**Action**: Move scope validation to single place in `applyTransformStep()`.

### 3.3 Clean Up compileBusAware.ts

**File**: `src/editor/compiler/compileBusAware.ts`

Update call sites to use new unified `applyTransforms()`:
- Wire transforms (lines 658-670)

All become:
```typescript
const transformed = applyTransforms(value, edge.transforms, ctx);
```

---

## Phase 4: Register Missing Transforms

**Goal**: Ensure all transforms are in the registry with unified `apply` signature.

### 4.1 Audit Current Registry

Check what's already registered vs what's in legacy code.

### 4.2 Register Adapters

Adapters that need `apply` functions:
- `ConstToSignal:float`
- `ConstToSignal:int`
- `ConstToSignal:bool`
- `ConstToSignal:color`
- `BroadcastSignal:float`
- `BroadcastSignal:color`

### 4.3 Register Lenses

Lenses that need `apply` functions:
- `scale`
- `clamp`
- `offset`
- `mapRange`
- `polarity`
- `deadzone`
- `quantize`
- `ease`

**DELETE**: `slew` (requires state)

### 4.4 Create Registration Entry Point

**File**: `src/editor/transforms/registerAll.ts`

```typescript
export function initializeTransforms(): void {
  registerAdapters();
  registerLenses();

  console.log(`[Transforms] ${TRANSFORM_REGISTRY.count()} transforms registered`);
}
```

---

## Phase 5: Verification

### 5.1 Unit Tests

```typescript
describe('Unified Transform Application', () => {
  it('applies adapter and lens in same chain', () => {
    const transforms: TransformStep[] = [
      { kind: 'adapter', enabled: true, step: { adapterId: 'ConstToSignal:float', params: {} } },
      { kind: 'lens', enabled: true, lens: { type: 'scale', params: { scale: 2 } } }
    ];

    const input = { kind: 'Scalar:float', value: 5 };
    const result = applyTransforms(input, transforms, ctx);

    expect(result.kind).toBe('Signal:float');
    expect(result.value(0)).toBe(10); // 5 * 2
  });

  it('handles disabled transforms', () => {
    const transforms: TransformStep[] = [
      { kind: 'lens', enabled: false, lens: { type: 'scale', params: { scale: 0 } } }
    ];

    const input = { kind: 'Signal:float', value: () => 5 };
    const result = applyTransforms(input, transforms, ctx);

    expect(result.value(0)).toBe(5); // Unchanged
  });
});
```

### 5.2 Integration Tests

- Verify wire transforms work
- Verify mixed adapter+lens chains work

### 5.3 Manual Verification

1. [ ] `just dev` runs without errors
2. [ ] Adding lens to wire works in UI
3. [ ] Existing patches still work
4. [ ] `slew` lens is gone

---

## Success Criteria

1. **Single dispatcher**: Only `applyTransforms()` exists, no separate adapter/lens functions
2. **Unified signature**: All transforms use same `apply(value, params, ctx)` signature
3. **Dead code deleted**: `lenses/index.ts` removed, duplicate validation removed
4. **Tests pass**: All existing + new tests pass
5. **Bus-Block ready**: The unified system is ready for Bus-Block cleanup to use

---

## Dependency on Bus-Block Work

This plan is **independent** of Bus-Block unification but **enables** it:

```
Transform Unification (this plan)
         ↓
  applyTransforms(value, edge.transforms, ctx)
         ↓
Bus-Block Cleanup can use single function for all edge types
```

After this plan completes, Bus-Block cleanup can treat all connections identically.

---

## Files Changed

### Modified
- `src/editor/transforms/apply.ts` - Rewrite with unified dispatcher
- `src/editor/transforms/TransformRegistry.ts` - Unify apply signature
- `src/editor/compiler/passes/pass8-link-resolution.ts` - Unify IR dispatcher
- `src/editor/compiler/compileBusAware.ts` - Use unified applyTransforms()

### Deleted
- `src/editor/lenses/index.ts` - Legacy implementations

### Created
- `src/editor/transforms/registerAll.ts` - Registration entry point
