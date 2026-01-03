# Work Evaluation - 2025-12-31-11:20:00
Scope: work/type-contracts-ir-plumbing
Confidence: FRESH

## Goals Under Evaluation
From PLAN-2025-12-31-045033.md:
1. **P0**: Fix Test Blocker (debugProbes field)
2. **P0**: Unified TypeDesc Contract in src/core/types.ts
3. **P1**: DefaultSource Shared Helper  
4. **P1**: Harden Pass 8 Link Resolution

## Previous Evaluation Reference
Last evaluation: STATUS-2025-12-31.md (project-evaluator, 2025-12-31 01:45)
- Found TypeDesc divergence (editor vs IR incompatible)
- Found adapter application gap (Pass 8 only, not Pass 6)
- Found 'config' vs 'special' world mismatch
- Test blocker: 6 type errors from missing debugProbes field

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `pnpm typecheck` | **FAIL** | 90+ type errors in editor/types.ts and runtime tests |
| `just test` | **BLOCKED** | Cannot run (typecheck must pass first) |
| `just lint` | **NOT RUN** | (blocked by typecheck) |

**Critical Finding**: TypeDesc migration is INCOMPLETE. While unified TypeDesc exists in core/types.ts, the re-export in editor/types.ts is broken, causing cascade of type errors.

## Manual Runtime Testing

### What I Tried
1. **Verified P0 test blocker fix** (commit bbb89cb):
   - Checked git diff for debugProbes additions
   - Verified all 6 test mocks in state-offset-resolution.test.ts now have `debugProbes: []`
   
2. **Verified unified TypeDesc creation** (commit 1ef5e3e):
   - Checked src/core/types.ts contains complete TypeDesc interface
   - Verified helper functions: getTypeArity(), inferBundleLanes(), createTypeDesc()
   - Confirmed TypeWorld uses 'config' (not 'special')
   - Confirmed TypeDesc includes lanes[], category, busEligible fields

3. **Checked migration status**:
   - editor/types.ts line 39: imports TypeDesc from core/types ✅
   - editor/types.ts line 41: re-exports helpers ✅  
   - compiler/ir/types.ts line 29: imports from core/types ✅
   - compiler/ir/types.ts lines 37, 158, 185: deprecation warnings added ✅

4. **Ran typecheck** to find migration gaps

### What Actually Happened

**P0 Test Blocker**: ✅ FIXED
- All 6 test mocks updated correctly
- Field type: `debugProbes: []` (matches BuilderProgramIR)
- Commit bbb89cb applied cleanly

**P0 Unified TypeDesc**: ⚠️ PARTIALLY COMPLETE
- Core TypeDesc created: ✅ DONE (lines 545-580 in core/types.ts)
- Helper functions created: ✅ DONE (getTypeArity, inferBundleLanes, createTypeDesc)
- TypeWorld unified to 'config': ✅ DONE (line 459)
- Domain unified: ✅ DONE (CoreDomain + InternalDomain, lines 465-521)
- lanes[] system: ✅ DONE (replaces bundleKind/bundleArity)
- category, busEligible: ✅ DONE (in TypeDesc interface)

**Migration to use unified TypeDesc**: ❌ BROKEN
- editor/types.ts imports TypeDesc but doesn't export it properly
- Lines 73, 198, 714, 716, 726, 778, 793, 800, 809, 827, 832: "Cannot find name 'TypeDesc'" errors
- Root cause: Import statement exists but re-export is malformed or missing

**Test fixture migration**: ❌ NOT STARTED
- 90+ errors in runtime tests using old TypeDesc format `{ world: "signal", domain: "float" }`
- Missing required fields: category, busEligible
- Some tests still use 'special' world (now invalid)

## Data Flow Verification
| Step | Expected | Actual | Status |
|------|----------|--------|--------|
| **Core TypeDesc created** | Unified interface in src/core/types.ts | Present with all fields | ✅ |
| **Editor imports** | Re-export from core | Import exists, re-export broken | ❌ |
| **IR imports** | Import from core | Imports correctly, adds deprecation | ✅ |
| **Test fixtures** | Use new TypeDesc format | Still use old partial format | ❌ |
| **'special' → 'config'** | All 'special' removed | Some tests still use 'special' | ❌ |

## Break-It Testing
| Attack | Expected | Actual | Severity |
|--------|----------|--------|----------|
| **Incomplete TypeDesc** | Type error at assignment | 90+ errors in tests | HIGH |
| **Invalid world 'special'** | Type error | Type error (correctly caught) | MEDIUM |
| **Missing category field** | Type error | Type error (correctly caught) | LOW |

**Good**: The unified TypeDesc is STRICT - it catches incomplete type objects.
**Bad**: Hundreds of existing test locations need migration.

## Evidence

**Test Blocker Fix** (commit bbb89cb):
```diff
+        debugProbes: [],
```
(6 locations in state-offset-resolution.test.ts)

**Unified TypeDesc** (src/core/types.ts:545-580):
```typescript
export interface TypeDesc {
  readonly world: TypeWorld; // 'signal' | 'event' | 'field' | 'scalar' | 'config'
  readonly domain: Domain; // CoreDomain | InternalDomain
  readonly category: TypeCategory; // 'core' | 'internal'
  readonly busEligible: boolean;
  readonly lanes?: number[]; // Bundle shape
  readonly semantics?: string;
  readonly unit?: string;
}
```

**Migration Evidence**:
- editor/types.ts:39: `import { TypeWorld, Domain, ... } from '../core/types';`
- editor/types.ts:41: `export { getTypeArity, inferBundleLanes, createTypeDesc } from '../core/types';`
- editor/types.ts:73: `ERROR: Cannot find name 'TypeDesc'`

**Type Error Pattern** (90+ instances):
```
Type '{ world: "signal"; domain: "float"; }' is missing the following 
properties from type 'TypeDesc': category, busEligible
```

## Assessment

### ✅ Working
1. **P0 Test Blocker FIXED**: debugProbes field added to all 6 test mocks
2. **Unified TypeDesc Created**: Comprehensive interface in src/core/types.ts
   - TypeWorld: 'config' (not 'special') ✅
   - Domain: Unified CoreDomain + InternalDomain ✅
   - lanes[]: Replaces bundleKind/bundleArity ✅
   - category, busEligible: Present ✅
   - Helper functions: All present ✅
3. **IR Migration Started**: compiler/ir/types.ts imports from core, adds deprecation warnings

### ❌ Not Working
1. **editor/types.ts Re-Export**: Import exists but export is broken
   - 12 "Cannot find name 'TypeDesc'" errors in editor/types.ts itself
   - Blocks all downstream code
2. **Test Fixture Migration**: 90+ test files use old TypeDesc format
   - Missing category, busEligible fields
   - Some still use invalid 'special' world
3. **Typecheck Fails**: Cannot proceed with testing or lint until migration complete

### ⚠️ Ambiguities Found
| Decision | What Was Assumed | Should Have Asked | Impact |
|----------|------------------|-------------------|--------|
| **Re-export strategy** | Simple re-export would work | How to handle existing TypeDesc usage in editor/types.ts? | editor/types.ts broken |
| **Test migration** | Tests would adapt automatically | How many test files need manual updates? | 90+ errors, manual work required |
| **Migration order** | Core first, then downstream | Should tests be updated before or after? | Blocked on broken re-export |

## Assessment by Goal

### P0: Fix Test Blocker
**Verdict**: ✅ COMPLETE
**Evidence**: 
- Git diff shows debugProbes: [] added to all 6 test mocks
- Field matches BuilderProgramIR interface
- Commit bbb89cb applied successfully

### P0: Unified TypeDesc Contract  
**Verdict**: ⚠️ INCOMPLETE (60% complete)
**What Works**:
- [x] Unified TypeDesc interface in src/core/types.ts
- [x] TypeWorld: 'config' (not 'special')
- [x] Domain: Unified enum
- [x] lanes[] system
- [x] Helper functions (getTypeArity, inferBundleLanes, createTypeDesc)
- [x] compiler/ir/types.ts imports from core

**What's Broken**:
- [ ] editor/types.ts re-export (12 errors)
- [ ] Test fixtures migration (90+ errors)
- [ ] `just typecheck` passing

**Blocker**: editor/types.ts line 39-41 import/export malformed

### P1: DefaultSource Shared Helper
**Verdict**: ❌ NOT STARTED
**Blocker**: Cannot proceed while typecheck fails

### P1: Harden Pass 8 Link Resolution
**Verdict**: ❌ NOT STARTED  
**Blocker**: Cannot proceed while typecheck fails

## Missing Checks (implementer should create)

1. **Type boundary test** (`tests/type-contracts/boundary-crossing.test.ts`)
   - Create TypeDesc in editor layer
   - Pass to compiler layer
   - Verify no data loss or field coercion
   - **Why needed**: Catches silent type mismatches at layer boundaries

2. **Test fixture helper** (`tests/helpers/createTestTypeDesc.ts`)
   - Helper: `createTestTypeDesc(world, domain, opts?)` → complete TypeDesc
   - Use in all test files instead of manual object literals
   - **Why needed**: Centralize test TypeDesc creation, catch missing fields

3. **Typecheck smoke test** (add to CI)
   - Fail build if typecheck has errors
   - **Why needed**: Prevent incomplete migrations from being committed

## Verdict: INCOMPLETE

**What Needs to Change**:

1. **CRITICAL: Fix editor/types.ts re-export** (blocks everything)
   - Location: src/editor/types.ts:39-73
   - Problem: Import exists but TypeDesc not exported/re-exported correctly
   - Fix: Add `export type { TypeDesc } from '../core/types';` or fix existing export
   - **Must fix first** - blocks all other work

2. **HIGH: Migrate test fixtures** (90+ files affected)
   - Pattern: `{ world: X, domain: Y }` → `createTypeDesc(world, domain, category, busEligible)`
   - Affected files:
     - src/editor/runtime/integration/__tests__/*.test.ts (50+ errors)
     - src/editor/runtime/integration/typeAdapter.ts (7 errors)
     - src/editor/runtime/signal-expr/__tests__/*.test.ts (6 errors)
   - **Automation opportunity**: Write codemod to fix mechanical changes

3. **HIGH: Remove 'special' world usage**
   - Locations: typeAdapter.test.ts:126, 284, 346
   - Replace with: 'config' (for compile-time resources) or appropriate world
   - **Why**: 'special' removed from TypeWorld union

4. **MEDIUM: Create test helper**
   - Add `tests/helpers/createTestTypeDesc.ts`:
     ```typescript
     export function createTestTypeDesc(
       world: TypeWorld,
       domain: Domain,
       opts?: { category?: TypeCategory, busEligible?: boolean }
     ): TypeDesc {
       return createTypeDesc(
         world,
         domain,
         opts?.category ?? 'core',
         opts?.busEligible ?? true
       );
     }
     ```
   - Use in future tests to prevent regression

## Recommended Next Steps

**Immediate (15 minutes)**:
1. Fix editor/types.ts export (likely one line)
2. Verify typecheck error count drops from 90+ to ~70 (test-only errors)

**Short term (2-4 hours)**:
3. Write codemod or manual migration for test fixtures
4. Update all test files to use complete TypeDesc format
5. Verify `just typecheck` passes
6. Run `just test` to catch runtime issues

**After typecheck passes**:
7. Implement P1: DefaultSource shared helper
8. Implement P1: Pass 8 validation hardening
9. Create type boundary tests

**Automation opportunity**: 
- Codemod to add `category: 'core', busEligible: true` to existing TypeDesc literals
- Pattern: `{ world: X, domain: Y }` → `{ world: X, domain: Y, category: 'core', busEligible: true }`
