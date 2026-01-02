# Definition of Done: Transform Unification
**Date**: 2026-01-02
**Plan**: PLAN-2026-01-02-transform-unification.md

---

## Core Deliverable

A single function that handles all transforms uniformly:

```typescript
applyTransforms(value, transforms: TransformStep[], ctx) → value
```

---

## Acceptance Criteria

### Phase 1: Unified Runtime Dispatcher

- [ ] `applyTransformStep()` created - handles single transform (adapter or lens)
- [ ] `applyTransforms()` created - iterates transform chain
- [ ] Unified `apply` signature: `(value, params, ctx) => value`
- [ ] `resolveTransformParams()` works for both adapters and lenses
- [ ] Old functions deleted:
  - [ ] `applyAdapterChain()`
  - [ ] `applyLensStack()`
  - [ ] `applyAdapterStep()` (old version)

### Phase 2: Unified IR Dispatcher

- [ ] `applyTransformStepIR()` created
- [ ] `applyTransformsIR()` created
- [ ] Old IR functions deleted:
  - [ ] `applyAdapterStep()` in pass8
  - [ ] `applyLensStep()` in pass8

### Phase 3: Dead Code Deleted

- [ ] `src/editor/lenses/index.ts` deleted (legacy implementations)
- [ ] `slew` lens deleted (stateful - violates constraint)
- [ ] Duplicate validation removed (single location in `applyTransformStep`)
- [ ] `compileBusAware.ts` updated to use unified `applyTransforms()`

### Phase 4: Transforms Registered

- [ ] All adapters have `apply` function in registry
- [ ] All lenses have `apply` function in registry
- [ ] `registerAll.ts` created and imported at app entry
- [ ] Console shows transform count on startup

### Phase 5: Verification

- [ ] Unit test: mixed adapter+lens chain works
- [ ] Unit test: disabled transforms skipped
- [ ] Integration: wire transforms work
- [ ] Integration: publisher transforms work
- [ ] Integration: listener transforms work
- [ ] All existing tests pass (`just test`)
- [ ] Manual: `just dev` runs, UI works

---

## Critical Constraint

> **Lenses CANNOT have state.** `slew` must be deleted.

- [ ] `slew` lens removed from codebase
- [ ] No stateful lens implementations remain

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Transform apply functions | 4+ | 1 (`applyTransforms`) |
| Code paths for transforms | 6 | 1 |
| Lines in `apply.ts` | ~208 | ~80 |
| Dead code in `lenses/` | ~374 lines | 0 |

---

## Verification Commands

```bash
# Typecheck
just typecheck

# Run tests
just test

# Dev server
just dev
```

---

## Enables

After completion, Bus-Block cleanup can use:

```typescript
// For ANY edge type (wire, publisher, listener, unified edge)
const result = applyTransforms(value, edge.transforms, ctx);
```

---

## Sign-Off

- [ ] All acceptance criteria met
- [ ] All verification commands pass
- [ ] Ready for Bus-Block cleanup to use unified transforms

**Approved by**: _______________
**Date**: _______________
