# TypeDesc Migration Status (Eval Cache)
Cached: 2025-12-31 11:20
Source: work-evaluator (type-contracts-ir-plumbing)
Confidence: FRESH

## Summary
Unified TypeDesc created in src/core/types.ts but migration is INCOMPLETE. Editor re-export is broken, 90+ test fixtures need migration.

## Unified TypeDesc Status

**Location**: src/core/types.ts:445-684 ✅ COMPLETE

**Interface** (lines 545-580):
```typescript
export interface TypeDesc {
  readonly world: TypeWorld; // 'signal' | 'event' | 'field' | 'scalar' | 'config'
  readonly domain: Domain; // CoreDomain | InternalDomain
  readonly category: TypeCategory; // 'core' | 'internal'
  readonly busEligible: boolean;
  readonly lanes?: number[]; // Replaces bundleKind/bundleArity
  readonly semantics?: string;
  readonly unit?: string;
}
```

**Key Decisions**:
- ✅ TypeWorld: 'config' (not 'special' - IR-only world removed)
- ✅ Domain: Unified CoreDomain + InternalDomain (~90 total domains)
- ✅ lanes[]: Array of lane counts (e.g., [2] for vec2, [3] for vec3, [4] for rgba)
- ✅ Replaces bundleKind/bundleArity from old IR TypeDesc
- ✅ Includes category and busEligible from old editor TypeDesc

**Helper Functions**:
- `getTypeArity(type: TypeDesc): number` - Sum of lane counts (default 1)
- `inferBundleLanes(domain: Domain): number[] | undefined` - Auto-infer from domain
- `createTypeDesc(world, domain, category, busEligible, opts?)` - Factory with inference

## Migration Status by Layer

### src/core/types.ts ✅ COMPLETE
- TypeDesc interface: ✅ (lines 545-580)
- TypeWorld enum: ✅ (line 459) - uses 'config', not 'special'
- Domain enum: ✅ (lines 465-521)
- TypeCategory enum: ✅ (line 528)
- Helpers: ✅ (lines 596-684)

### src/editor/types.ts ❌ BROKEN
- Import from core: ✅ (line 39) `import { TypeWorld, Domain, ... } from '../core/types'`
- Re-export helpers: ✅ (line 41) `export { getTypeArity, inferBundleLanes, createTypeDesc }`
- Re-export TypeDesc: ❌ MISSING/MALFORMED
  - Lines 73, 198, 714, 716, 726, 778, 793, 800, 809, 827, 832: "Cannot find name 'TypeDesc'" errors
  - Likely missing: `export type { TypeDesc } from '../core/types'`

### src/editor/compiler/ir/types.ts ✅ MIGRATED
- Import from core: ✅ (line 29) `import { TypeWorld, TypeDesc, Domain, ... } from '../../../core/types'`
- Import helpers: ✅ (line 31) `import { getTypeArity, inferBundleLanes }`
- Deprecation warnings: ✅ (lines 37, 158, 185) for old TypeDomain, bundleKind usage
- Comment: ✅ (line 8) "TypeDesc now imports from src/core/types.ts (unified contract)"

### Test Files ❌ NOT MIGRATED (90+ errors)

**Pattern**: Old format `{ world: X, domain: Y }` missing `category, busEligible`

**Affected files**:
- src/editor/runtime/integration/__tests__/integration.test.ts (4 errors)
- src/editor/runtime/integration/__tests__/typeAdapter.test.ts (62 errors)
- src/editor/runtime/integration/typeAdapter.ts (7 errors)
- src/editor/runtime/signal-expr/__tests__/goldenTests.test.ts (2 errors)
- src/editor/runtime/signal-expr/__tests__/SigClosureBridge.test.ts (1 error)
- src/editor/runtime/signal-expr/__tests__/SigEvaluator.test.ts (2 errors)
- src/editor/runtime/signal-expr/__tests__/SigStateful.test.ts (1 error)
- src/editor/runtime/signal-expr/SignalExprBuilder.ts (2 errors)

**Also**: 3 instances of invalid world 'special' (typeAdapter.test.ts:126, 284, 346)

## Blockers

### BLOCKER 1: editor/types.ts Re-Export
**Severity**: CRITICAL (blocks all compilation)
**Location**: src/editor/types.ts:39-73
**Fix**: Add missing `export type { TypeDesc } from '../core/types';`
**Impact**: 12 errors in editor/types.ts itself, blocks downstream

### BLOCKER 2: Test Fixture Migration
**Severity**: HIGH (blocks test suite)
**Count**: 90+ type errors across 9 files
**Fix**: Update all `{ world: X, domain: Y }` to include `category, busEligible`
**Automation**: Codemod pattern: add `, category: 'core', busEligible: true` to literals

### BLOCKER 3: 'special' World Cleanup
**Severity**: MEDIUM (only 3 instances)
**Locations**: typeAdapter.test.ts lines 126, 284, 346
**Fix**: Replace `world: 'special'` with `world: 'config'` (or appropriate world)

## Migration Path Forward

**Step 1: Fix editor/types.ts** (5 minutes)
- Add `export type { TypeDesc } from '../core/types';`
- Verify error count drops from 90+ to ~70 (test-only)

**Step 2: Migrate test fixtures** (2-4 hours)
- Option A: Manual (tedious but straightforward)
- Option B: Codemod (write script, apply, verify)
- Recommended: Codemod for bulk changes, manual for 'special' → 'config'

**Step 3: Verify typecheck** (1 minute)
- Run `pnpm typecheck`
- Should pass with 0 errors

**Step 4: Verify tests** (5 minutes)
- Run `pnpm test run`
- Catch any runtime type issues not caught by typecheck

## Codemod Pattern

**Find**:
```typescript
{ world: "signal", domain: "float" }
```

**Replace**:
```typescript
{ world: "signal", domain: "float", category: "core", busEligible: true }
```

**Special cases**:
- Internal domains (mesh, camera, quat, mat4, unknown): `category: 'internal'`
- Non-bus-eligible types (renderTree, program, spec): `busEligible: false`
- Most test cases: `category: 'core', busEligible: true` (default)

## Related Eval Cache
- adapter-application-status.md: Documents Pass 6 vs Pass 8 adapter timing
- type-contracts-divergence.md: INVALIDATED (problem now documented here)
