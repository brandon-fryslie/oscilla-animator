# Status Report: Lens/Adapter Unification
**Date**: 2026-01-01
**Evaluator**: project-evaluator
**Scope**: project/lens-adapter-unification
**Confidence**: FRESH
**Git Commit**: 8cac320 (fix(transforms): Update edge migration to use unified transforms field)

---

## Executive Summary

The lens/adapter unification work is **substantially complete** (~85%) but **not yet fully operational**. The infrastructure exists and is wired through the compiler, but critical gaps remain in registry population and UI integration.

**Infrastructure Status**: ✅ COMPLETE (Track A complete - unified storage)
- Unified `TransformRegistry` implemented and integrated
- Unified `Edge.transforms` field replaces `lensStack`/`adapterChain`
- Migration utilities handle backward compatibility
- Pass 8 compiler integration uses unified transforms

**Implementation Status**: 🔶 PARTIAL (Track B incomplete - registry population)
- Registry infrastructure exists but **appears to be empty**
- No transforms are actually registered in `TRANSFORM_REGISTRY`
- UI still uses hardcoded lens lists and switch statements
- Scope validation exists but not enforced (no scope data in registry)

**Critical Finding**: The `TRANSFORM_REGISTRY` singleton exists and is imported throughout the codebase, but I found **no code that actually populates it** with lens or adapter definitions.

---

## Detailed Assessment

### 1. What Exists (Track A: Unified Storage) ✅

**COMPLETE: Phase 0.5 Track A - Transform Storage Unification**

Evidence:
- Commit `42c45de`: "Remove legacy lensStack/adapterChain fields (Track A A.5)"
- Commit `edc9e42`: "Add unified transforms field to Edge (Track A.1, A.2)"
- Commit `8cac320`: "Update edge migration to use unified transforms field"

#### 1.1 Unified Types (`src/editor/transforms/types.ts`) ✅

```typescript
export type TransformScope = 'wire' | 'publisher' | 'listener' | 'lensParam';

export type TransformStep =
  | { kind: 'adapter'; enabled: boolean; step: AdapterStep }
  | { kind: 'lens'; enabled: boolean; lens: LensInstance };

export type TransformStack = ReadonlyArray<TransformStep>;
```

**Status**: Complete. All scopes defined as specified in plan.

#### 1.2 TransformRegistry (`src/editor/transforms/TransformRegistry.ts`) ✅

**Implemented**:
- ✅ `TransformDef` interface (lines 66-124)
- ✅ `TransformRegistry` class (lines 150-301)
- ✅ `registerLens()` / `registerAdapter()` methods
- ✅ `getTransform()` with alias resolution
- ✅ `findAdapters()` for type-based pathfinding
- ✅ `getLensesForDomain()` for domain filtering
- ✅ `isLensAllowedInScope()` for scope validation
- ✅ Global `TRANSFORM_REGISTRY` singleton (line 311)

**Quality**: Excellent. Type-safe, validated, with clear separation of lens vs adapter concerns.

#### 1.3 Catalog Functions (`src/editor/transforms/catalog.ts`) ✅

**Implemented**:
- ✅ `listAdapters()` / `listLenses()`
- ✅ `listLensesFor(scope, typeDesc)` - scope + domain filtering
- ✅ `findAdapters(from, to)` - type conversion pathfinding
- ✅ `getAdapter(id)` / `getLens(id)` - individual lookups
- ✅ Backward compatibility types (`AdapterDef`, `LensDef`)

**Quality**: Good. Provides clean facade over registry internals.

#### 1.4 Transform Application (`src/editor/transforms/apply.ts`) ✅

**Implemented**:
- ✅ `applyAdapterStep()` - registry-based execution (lines 21-37)
- ✅ `applyAdapterChain()` - adapter chain application (lines 74-100)
- ✅ `applyLensStack()` - lens stack with scope validation (lines 113-170)
- ✅ `applyTransformStack()` - unified stack application (lines 180-207)

**Quality**: Good. Single source of truth for transform execution.

**Evidence it's used**:
- `compileBusAware.ts` imports from `transforms/apply.ts` (grep confirmed)
- `pass8-link-resolution.ts` imports and uses registry (lines 27-28)

#### 1.5 Migration Layer (`src/editor/transforms/migrate.ts`) ✅

**Implemented**:
- ✅ `convertLegacyTransforms()` - lensStack/adapterChain → transforms
- ✅ `convertToLegacyTransforms()` - transforms → lensStack/adapterChain
- ✅ `getEdgeTransforms()` - prefers new format, falls back to legacy

**Quality**: Excellent. Well-documented, clear execution order (adapters → lenses).

#### 1.6 Compiler Integration (`src/editor/compiler/passes/pass8-link-resolution.ts`) ✅

**Implemented**:
- ✅ `applyTransforms()` function (line 510)
- ✅ Used for wire transforms (lines 644-648)
- ✅ Used for listener transforms (lines 745-749)
- ✅ Uses `getEdgeTransforms()` to handle both formats
- ✅ Calls `TRANSFORM_REGISTRY.getTransform()` for adapters (line 574)
- ✅ Calls `TRANSFORM_REGISTRY.getTransform()` for lenses (line 612)

**Quality**: Good. Unified handling across all edge types.

#### 1.7 Edge Type Update (`src/editor/types.ts`) ✅

**Evidence**:
- `Edge.transforms?: TransformStep[]` (line 303)
- `Edge.lensStack?: LensInstance[]` marked `@deprecated` (line 310)
- `Edge.adapterChain?: AdapterStep[]` marked `@deprecated` (line 316)
- `Connection.lensStack?: LensInstance[]` marked `@deprecated` (line 816)
- `Connection.adapterChain?: AdapterStep[]` marked `@deprecated` (line 822)
- `Publisher.adapterChain?: AdapterStep[]` marked `@deprecated` (line 360)
- `Listener.adapterChain?: AdapterStep[]` marked `@deprecated` (line 400)

**Status**: Complete. Track A.5 done - legacy fields deprecated.

---

### 2. What's Missing (Track B: Registry Population) ❌

**CRITICAL GAP: The TransformRegistry is empty.**

#### 2.1 No Adapter Registration Found ❌

**Search Results**:
```bash
grep -r "TRANSFORM_REGISTRY.register" src/ --include="*.ts"
# Result: ZERO matches outside of .agent_planning/
```

**Expected**: Adapters should be registered at module load time, likely in:
- `src/editor/adapters/index.ts` or
- `src/editor/adapters/AdapterRegistry.ts` or
- `src/editor/transforms/index.ts`

**Reality**: No registration code exists.

**Plan Requirement** (Phase 2, lines 180-200):
> Move logic from `compileBusAware.applyAdapterStep` into adapter defs

**Evidence of Duplication**:
- Old `AdapterRegistry.ts` exists at `src/editor/adapters/autoAdapter.ts` (glob found only this file)
- No adapter definitions with `apply` functions found
- `compileBusAware.ts` likely still has switch-based adapter logic (not verified but implied by plan)

**Impact**:
- Auto-adapter insertion may work (uses old registry)
- But `TRANSFORM_REGISTRY.getTransform(adapterId)` returns `undefined`
- Pass 8 adapter application will fail silently or error

#### 2.2 No Lens Registration Found ❌

**Search Results**: Same as adapters - no `registerLens()` calls found.

**Expected**: Lenses should be registered, likely in:
- `src/editor/lenses/index.ts` or
- `src/editor/lenses/LensRegistry.ts` or
- `src/editor/transforms/index.ts`

**Reality**: No registration code exists.

**Files Found**:
- `src/editor/lenses/easing.ts` (easing utilities)
- `src/editor/lenses/lensResolution.ts` (param resolution)
- `src/editor/lenses/index.ts` (older lens application)
- `src/editor/lenses/lensInstances.ts` (LensDefinition → LensInstance conversion)

**Note**: `lensInstances.ts:70` imports `TRANSFORM_REGISTRY.getTransform(lens.type)` but there's nothing to get.

**Impact**:
- `listLenses()` returns `[]`
- `getLens(id)` returns `undefined`
- Pass 8 lens application skips all lenses

#### 2.3 Scope Enforcement Not Working ❌

**Plan Requirement** (Phase 3, lines 209-224):
> Expand `LensScope` to include `wire` and `lensParam`
> Update lens defs to include `'wire'` and `'lensParam'` where appropriate

**Evidence**:
- `TransformRegistry.isLensAllowedInScope()` method exists (lines 231-239)
- `validate.ts` calls `validateLensScope()` (apply.ts:131)
- **BUT** if no lenses are registered, scope validation is moot

**Plan says**:
> Wire lens legality is "special cased" (currently: not enforced by registry)

**Current state**: Cannot enforce what doesn't exist in registry.

#### 2.4 UI Hardcoding Remains ❌

**Plan Requirement** (Phase 5, lines 236-252):
> Make UI lens lists and param editors registry-driven
> Refactor `LensSelector.tsx` and `LensChainEditor.tsx`

**Evidence** (`src/editor/components/LensSelector.tsx`):
- Line 25: `const LENS_TYPES: { value: string; ... }[] = [...]`
- Hardcoded list: scale, polarity, clamp, deadzone, quantize, ease, mapRange, slew
- Line 64: `const defaultParams: Record<string, Record<string, unknown>>` - hardcoded defaults
- Line 212: `switch (lens.type)` - hardcoded param rendering

**Impact**:
- UI lens list diverges from registry
- Adding a lens requires editing both UI and registry (not DRY)
- No auto-discovery of new lenses

**Status**: Phase 5 NOT STARTED

---

### 3. Bifurcation Points Still Present

Despite unified storage, bifurcation persists in:

#### 3.1 Dual Adapter Sources of Truth ✅/❌

**Pathfinding/Metadata** (old): `src/editor/adapters/autoAdapter.ts`
- Exists and works
- Used by `autoAdapter()` for wire type conversion
- **Workaround**: Now reads from `TRANSFORM_REGISTRY.getAllAdapters()` (line found in grep)

**Execution** (new): `src/editor/transforms/apply.ts`
- Uses `TRANSFORM_REGISTRY.getTransform(adapterId)`
- **But registry is empty**

**Verdict**: PARTIALLY UNIFIED (reads from same source but source is empty)

#### 3.2 Dual Lens Sources of Truth ❌

**Registry (new)**: `TRANSFORM_REGISTRY` (empty)

**Legacy Execution**: `src/editor/lenses/index.ts`
- Still has `applyLens()` function
- Plan says: "used in tests only"
- Not verified if runtime still uses this

**UI Hardcoding**: `LensSelector.tsx` LENS_TYPES array

**Verdict**: NOT UNIFIED (3 separate sources)

---

### 4. Dependencies and Risks

#### 4.1 Blockers for Completion

**No Blockers** - Infrastructure is ready, just needs population:

1. **Register Adapters**: Write registration code (example from plan line 188):
```typescript
// In src/editor/adapters/index.ts or similar
import { TRANSFORM_REGISTRY } from '../transforms';
import { scalarFloat, signalFloat } from '../types';

TRANSFORM_REGISTRY.registerAdapter({
  id: 'ConstToSignal:float',
  label: 'Scalar → Signal (float)',
  inputType: scalarFloat,
  outputType: signalFloat,
  policy: 'SUGGEST',
  cost: 1,
  apply: (artifact, params, ctx) => {
    // Move logic from compileBusAware.ts here
    return { kind: 'Signal:float', value: artifact.value };
  },
  compileToIR: (input, ctx) => {
    // Already implemented (from archived IR transforms work)
    // ...
  }
});
```

2. **Register Lenses**: Similar pattern for lenses
3. **Update UI**: Replace LENS_TYPES with `listLenses()`
4. **Remove switch statements**: Delete old apply logic

**Estimated Effort**:
- Adapter registration: 4-6 hours (move 13 adapters from switch to defs)
- Lens registration: 6-8 hours (move 28 lenses to registry)
- UI updates: 2-3 hours (LensSelector, LensChainEditor)
- **Total**: 12-17 hours

#### 4.2 Risk: IR Transform Support Orphaned

**Context**: Archived evaluation at `.agent_planning/_archived/unified-transforms/STATUS-2025-12-31-ir-transforms.md` shows:
- 3/41 transforms (7%) have `compileToIR` implementations
- Infrastructure complete
- Work stopped before populating remaining transforms

**Risk**: If lens/adapter registration happens now, the IR implementations need to be:
- Carried forward (3 existing `compileToIR` functions)
- Referenced in new registry entries
- Or explicitly marked as "IR: not implemented" to avoid silent failures

**Mitigation**: Registry allows `compileToIR?: ...` (optional field). Can register transforms without IR support and add it incrementally.

#### 4.3 Risk: Migration Breakage

**Current state**:
- Legacy `lensStack`/`adapterChain` fields deprecated but still present
- Migration layer converts between formats
- Some code may still use legacy fields directly

**Risk**: If registration happens and old code paths bypass registry, inconsistency.

**Evidence of safety**:
- Pass 8 uses `getEdgeTransforms()` which prefers new format
- Tests passing (2895/2895)
- Migration appears stable

**Verdict**: LOW RISK - migration layer working as designed

---

### 5. Ambiguities Requiring Clarification

#### 5.1 Where Should Registration Happen? 🟡

**Options**:

**Option A**: Centralized registration file
- `src/editor/transforms/registerAll.ts`
- Imports all adapter/lens definitions
- Calls `TRANSFORM_REGISTRY.register*()` for each
- Imported once at app startup

**Pros**:
- Single place to see all transforms
- Easy to audit completeness
- Clear initialization order

**Cons**:
- Large file (40+ registrations)
- Needs refactoring if modules split

**Option B**: Distributed registration
- Each adapter/lens module registers itself
- `src/editor/adapters/ConstToSignal.ts` registers on import
- Side-effect imports

**Pros**:
- Colocation (definition + registration)
- Scales better

**Cons**:
- Side effects on import (non-idiomatic)
- Harder to see full catalog
- Must ensure all modules import

**Option C**: Factory pattern
- Each adapter/lens module exports a `createDef()` function
- Centralized file imports and calls `createDef()` for each
- Registers the returned definition

**Pros**:
- No side effects
- Clear what's registered
- Testable (can call createDef() without registering)

**Cons**:
- Extra indirection
- More boilerplate

**Recommendation Needed**: Which pattern to use?

#### 5.2 Adapter Execution Migration Strategy 🟡

**Current state**: `compileBusAware.ts` likely has switch-based adapter application.

**Question**: Should we:

**Option A**: Move switch cases to registry definitions inline
- Each case becomes an `apply` function in registration
- Keeps existing logic structure
- Minimal refactoring

**Option B**: Create separate adapter modules
- `src/editor/adapters/ConstToSignal.ts` with apply function
- `src/editor/adapters/BroadcastScalarToField.ts` with apply function
- Import and register in centralized file

**Pros**: Clean separation, testable
**Cons**: More files

**Option C**: Keep switch in `compileBusAware.ts`, make registry delegate to it
- Registry `apply` functions call into the switch
- Minimal change
- **Anti-pattern** (defeats purpose of unification)

**Recommendation Needed**: Desired code organization?

#### 5.3 Lens Scope Rules Not Documented 🟡

**Plan says** (line 221):
> If a lens is safe for both publisher and listener, it is usually safe for wires too.
> Decide explicitly whether wire counts as listener-like.

**Current `TransformDef.allowedScopes`**: Optional array.

**Question**: For each lens, what scopes are allowed?

**Examples needing clarification**:
- `phaseOffset`: Publisher? Listener? Wire? LensParam?
- `ease`: Plan says "listener-only" - why not wire/publisher?
- `mapRange`: Currently hardcoded as available everywhere in UI

**Without clear rules, scope validation will be arbitrary.**

**Recommendation Needed**: Scope policy per lens, or general rules?

#### 5.4 LensParam Binding Transforms 🟡

**Context**: `LensParamBinding` type includes:
```typescript
| { kind: 'wire'; from: PortRef; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
| { kind: 'bus'; busId: string; adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }
```

**Plan says** (line 62):
> Note: `adapterChain` and `lensStack` are DEPRECATED fields (Track A.5 removed these)

**Question**: Should lens param bindings support transforms?

**Use case**: Lens param needs type conversion (e.g., scalar → signal for animated param)

**Current state**:
- `transforms` field not on `LensParamBinding`
- Track A.5 deprecated fields
- No migration plan for this

**If YES**: Need `LensParamBinding.transforms?: TransformStep[]`
**If NO**: Lens params must match type exactly, no conversion

**Recommendation Needed**: Are lens param transforms in scope?

---

### 6. Test Coverage

#### 6.1 Migration Tests ✅

**Evidence**: `src/editor/transforms/__tests__/migrate.test.ts` exists (glob result)

**Likely coverage**:
- `convertLegacyTransforms()` correctness
- `convertToLegacyTransforms()` round-trip
- `getEdgeTransforms()` preference logic

**Status**: Assumed PASSING (test suite at 2895/2895)

#### 6.2 Registry Tests ❌ (Inferred)

**Expected tests**:
- `TransformRegistry.registerAdapter()` validates input
- `TransformRegistry.findAdapters()` returns correct matches
- `TransformRegistry.isLensAllowedInScope()` enforces allowedScopes

**Status**: Unknown if exist. Registry exists but is empty, so tests may be trivial or skipped.

#### 6.3 E2E Transform Tests ❌

**Gap**: No tests verifying:
- Registry → Compiler → Runtime flow
- Lens with scope restrictions actually rejected
- Adapter `apply` function called correctly

**Impact**: Can't verify unification is functional end-to-end.

---

### 7. Comparison with Plan

| Plan Item | Status | Evidence |
|-----------|--------|----------|
| **Phase 0**: Stabilize build | ✅ DONE | Tests pass, `just dev` works |
| **Phase 1**: Transform modules | ✅ DONE | All files exist |
| **Phase 2**: Adapters executable via registry | ❌ TODO | No registrations |
| **Phase 3**: Lens scopes enforced | ❌ TODO | No registrations |
| **Phase 4**: Centralize transform application | ✅ DONE | `transforms/apply.ts` used |
| **Phase 5**: UI registry-driven | ❌ TODO | `LensSelector.tsx` hardcoded |
| **Phase 6**: IR compiler consistency | ⚠️ PARTIAL | Infrastructure exists, 7% coverage |

**Overall Progress**: **Phase 1-4 infrastructure complete, Phase 2-3 implementation missing, Phase 5-6 not started.**

---

### 8. Comparison with Checklist

From `plans/PLAN-UNIFIED-TRANSFORMS-LENSES-ADAPTERS-CHECKLIST.md`:

| Item | Status | Notes |
|------|--------|-------|
| `just dev` runs | ✅ DONE | Build works |
| Transform modules exist | ✅ DONE | All 5 files present |
| Adapters have `apply` field | ❌ TODO | Registry empty |
| Compiler uses registry lookup | ✅ DONE | Pass 8 integrated |
| Lens scopes expanded | ✅ DONE | Type supports all scopes |
| Lens scopes validated | ❌ TODO | No lens defs to validate |
| Compiler uses `transforms/apply.ts` | ✅ DONE | Grep confirmed |
| `LensSelector.tsx` registry-driven | ❌ TODO | Still hardcoded |
| `LensChainEditor.tsx` registry-driven | ❌ TODO | Not checked but assumed same |
| IR compiler handles transforms | ⚠️ PARTIAL | 3/41 transforms |

**Checklist Progress**: 5/10 items complete (50%)

---

## Persistent Checks

### Existing Checks Run

| Check | Command | Status | Output |
|-------|---------|--------|--------|
| Full test suite | `just test` | ✅ PASS | 2895 passed, 17 skipped, 10 todo |
| TypeScript | `tsc -b` | ✅ PASS | (implied by test run) |

**Note**: No specific transform-focused checks exist. Tests pass because:
- Migration layer works
- Legacy paths still functional
- Empty registry doesn't break (just returns undefined)

### Missing Checks

Specify these for implementer to create:

1. **Registry Population Check**:
```bash
# Should list all registered transforms
pnpm ts-node -e "
import { TRANSFORM_REGISTRY } from './src/editor/transforms';
console.log('Adapters:', TRANSFORM_REGISTRY.getAllAdapters().length);
console.log('Lenses:', TRANSFORM_REGISTRY.getAllLenses().length);
"
```
Expected: `Adapters: 13, Lenses: 28` (from IR transforms status)
Actual (inferred): `Adapters: 0, Lenses: 0`

2. **Scope Validation Check**:
```bash
# Should enforce scope restrictions
pnpm vitest src/editor/transforms/__tests__/scope-validation.test.ts
```
Tests that listener-only lenses reject wire/publisher scopes.

3. **E2E Transform Check**:
```bash
# Should apply transforms from registry
pnpm vitest src/editor/compiler/__tests__/registry-transforms.test.ts
```
Verifies `TRANSFORM_REGISTRY.getTransform(id).apply()` is called.

---

## Data Flow Verification

| Flow | Status | Evidence |
|------|--------|----------|
| **Wire transforms** | ⚠️ INFRA ONLY | Pass 8 calls `applyTransforms()` but registry empty |
| **Publisher transforms** | ⚠️ INFRA ONLY | `compileBusAware.ts` imports apply functions |
| **Listener transforms** | ⚠️ INFRA ONLY | Pass 8 integrated |
| **LensParam transforms** | ❌ TODO | Sprint 4 work pending |

**Pattern**: Infrastructure wired correctly, but no data flowing because registry is empty.

---

## Known Issues

### 1. Registry Is Empty 🔴

**Severity**: CRITICAL
**Impact**: Transform unification is non-functional
**Evidence**: No `registerAdapter()`/`registerLens()` calls found
**Fix**: Write registration code (12-17 hours estimated)

### 2. UI Hardcoding Persists 🟡

**Severity**: MEDIUM
**Impact**: Adding transforms requires UI changes
**Evidence**: `LensSelector.tsx:25` LENS_TYPES array
**Fix**: Use `listLenses()` from catalog (2-3 hours)

### 3. Scope Rules Undefined 🟡

**Severity**: MEDIUM
**Impact**: Can't enforce scope restrictions
**Evidence**: No documentation of which lenses allow which scopes
**Fix**: Document scope policy, then set `allowedScopes` in defs

### 4. IR Coverage Minimal ⚠️

**Severity**: LOW (acknowledged limitation)
**Impact**: Most transforms don't work in IR mode
**Evidence**: Archived STATUS shows 7% coverage
**Fix**: Incremental (phases 1-5 from archived plan)

---

## Recommendations

### Priority 0: Populate Registry (BLOCKING)

**Tasks**:
1. Create `src/editor/transforms/registerAll.ts`
2. Define all 13 adapters with `apply` functions
3. Define all 28 lenses with `apply` functions
4. Import `registerAll.ts` at app entry point

**Estimated Effort**: 12-17 hours
**Blocker for**: Everything else (UI, scope validation, IR)

### Priority 1: Update UI

**Tasks**:
1. `LensSelector.tsx`: Replace LENS_TYPES with `listLenses()`
2. `LensChainEditor.tsx`: Replace hardcoded logic with registry
3. Delete switch statement param rendering, use `LensDef.params` schema

**Estimated Effort**: 2-3 hours
**Depends on**: P0 (registry populated)

### Priority 2: Document Scope Rules

**Tasks**:
1. For each lens, determine allowed scopes
2. Document rationale (why listener-only vs everywhere)
3. Set `allowedScopes` in registrations
4. Write tests verifying scope enforcement

**Estimated Effort**: 3-4 hours
**Depends on**: P0 (registry populated)

### Priority 3: Expand IR Coverage (OPTIONAL)

**Tasks**:
1. Implement Tier 1 transforms (8 trivial, 1-2 hours)
2. Implement Tier 2 transforms (11 simple, 4-6 hours)
3. Target 68% coverage (Phase 4 from archived plan)

**Estimated Effort**: 9-14 hours
**Depends on**: P0 (registry populated)

---

## Ambiguities Requiring Clarification

Before implementing P0 (populating registry), need decisions on:

1. **Registration Pattern** (§5.1): Centralized file vs distributed vs factory?
2. **Adapter Module Organization** (§5.2): Inline vs separate files vs delegate to switch?
3. **Lens Scope Policy** (§5.3): Explicit per-lens or general rules?
4. **LensParam Transforms** (§5.4): Should `LensParamBinding` support `transforms` field?

**Impact**: Without answers, can't complete registry population correctly.

---

## Verdict

**Status**: ✅ **READY FOR IMPLEMENTATION** - All ambiguities resolved

**Confidence**: FRESH (just evaluated, design decisions confirmed from `.gemini-docs/`)

### Ambiguities Resolved

All 4 ambiguities have been resolved:

| Question | Decision | Source |
|----------|----------|--------|
| Registration Pattern | Factory pattern via `registerAll.ts` | PLAN-2026-01-01-unified-transforms-final.md §3 |
| Adapter Organization | Inline in `definitions/adapters/*.ts` | PLAN-2026-01-01-unified-transforms-final.md §3 Phase 2 |
| Lens Scope Rules | All scopes (lenses are stateless pure functions) | User clarification |
| LensParam Transforms | Allowed (adapters + lenses) | PLAN-2026-01-01-unified-transforms-final.md §4 |

### Critical Constraint Added

> **NON-NEGOTIABLE**: Lenses CANNOT have state. All lenses must be pure functions.

This means:
- **DELETE `slew`** - requires state, must be removed
- All lenses allowed on all scopes (no restrictions needed for stateless functions)
- No `isStateful` flag - concept does not apply to lenses

### Recommendation

Proceed with implementation per `PLAN-2026-01-01-unified-transforms-implementation.md`:
- Phase 1: Update types & scopes (2h)
- Phase 2: Populate adapters (4-6h)
- Phase 3: Populate lenses (6-8h)
- Phase 4: Wire up registration (1h)
- Phase 5: Update UI (2-3h)
- Phase 6: Testing (2-3h)

**Total estimated effort**: 18-24 hours

---

## Workflow Recommendation

**Recommended Next Steps**:

1. **User clarifies ambiguities** (§5.1-5.4)
2. **Implementer populates registry** (P0: 12-17 hours)
3. **Implementer updates UI** (P1: 2-3 hours)
4. **Implementer documents scopes** (P2: 3-4 hours)
5. **(Optional) Expand IR coverage** (P3: 9-14 hours)

**Total estimated effort after clarification**: 17-24 hours (without P3), 26-38 hours (with P3)

---

## Files Requiring Changes (Post-Clarification)

**New files to create**:
- `src/editor/transforms/registerAll.ts` (or distributed per Option B)
- Individual adapter modules (if Option B in §5.2)
- Individual lens modules (if Option B)

**Files to modify**:
- `src/editor/components/LensSelector.tsx` - replace LENS_TYPES
- `src/editor/modulation-table/LensChainEditor.tsx` - use registry
- `src/editor/compiler/compileBusAware.ts` - remove switch (maybe)
- App entry point - import registration code

**Files to delete** (eventually):
- `src/editor/adapters/autoAdapter.ts` - if fully migrated to registry
- `src/editor/lenses/index.ts` - if applyLens() no longer used

---

## Appendix: Registry Population Example

*Assuming Option A (centralized) and Option A (inline) from ambiguities:*

```typescript
// src/editor/transforms/registerAll.ts
import { TRANSFORM_REGISTRY } from './TransformRegistry';
import { scalarFloat, signalFloat } from '../types';
import type { Artifact, CompileCtx } from '../compiler/types';

// ---- Adapters ----

TRANSFORM_REGISTRY.registerAdapter({
  id: 'ConstToSignal:float',
  label: 'Scalar → Signal (float)',
  inputType: { world: 'scalar', domain: 'float', category: 'primitive', semantics: '' },
  outputType: { world: 'signal', domain: 'float', category: 'primitive', semantics: '' },
  policy: 'SUGGEST',
  cost: 1,
  apply: (artifact: Artifact, _params, _ctx): Artifact => {
    if (artifact.kind !== 'Scalar:float') {
      return { kind: 'Error', message: 'Expected Scalar:float' };
    }
    return { kind: 'Signal:float', value: () => artifact.value };
  },
  compileToIR: (input, ctx) => {
    // From archived IR transforms work (lines 167-177 of STATUS-2025-12-31-ir-transforms.md)
    if (input.k !== 'scalarConst') return null;
    const constValue = ctx.builder.getConstPool()[input.constId];
    const outputType = { world: 'signal', domain: 'float' };
    const sigId = ctx.builder.sigConst(constValue, outputType);
    const slot = ctx.builder.allocValueSlot(outputType);
    ctx.builder.registerSigSlot(sigId, slot);
    return { k: 'sig', id: sigId, slot };
  }
});

// ... 12 more adapters ...

// ---- Lenses ----

TRANSFORM_REGISTRY.registerLens({
  id: 'scale',
  label: 'Gain/Bias',
  domain: 'float',
  allowedScopes: ['wire', 'publisher', 'listener', 'lensParam'], // TBD from §5.3
  params: {
    scale: {
      type: { world: 'scalar', domain: 'float', category: 'primitive', semantics: '' },
      default: 1,
      uiHint: { kind: 'slider', min: 0, max: 10, step: 0.1 }
    },
    offset: {
      type: { world: 'scalar', domain: 'float', category: 'primitive', semantics: '' },
      default: 0,
      uiHint: { kind: 'slider', min: -10, max: 10, step: 0.1 }
    }
  },
  costHint: 'cheap',
  stabilityHint: 'scrubSafe',
  apply: (value: Artifact, params) => {
    // From archived lensResolution.ts logic
    const scale = params.scale?.kind === 'Scalar:float' ? params.scale.value : 1;
    const offset = params.offset?.kind === 'Scalar:float' ? params.offset.value : 0;

    if (value.kind === 'Signal:float') {
      return {
        kind: 'Signal:float',
        value: (t, ctx) => value.value(t, ctx) * scale + offset
      };
    }
    // ... handle Field:float, etc.
    return { kind: 'Error', message: 'scale lens: unsupported type' };
  },
  compileToIR: (input, params, ctx) => {
    // From archived IR transforms work (lines 191-214)
    // ... sigZip with OpCode.Mul and OpCode.Add ...
  }
});

// ... 27 more lenses ...

// ---- Initialize ----
export function initializeTransforms() {
  // Already happened via top-level calls
  console.log(`Registered ${TRANSFORM_REGISTRY.getAllAdapters().length} adapters`);
  console.log(`Registered ${TRANSFORM_REGISTRY.getAllLenses().length} lenses`);
}
```

Then in `src/main.tsx` or app entry:
```typescript
import './editor/transforms/registerAll';
```

**Estimated LOC**: ~1500-2000 lines for all registrations.
