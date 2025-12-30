# Sprint 2 Plan: TypeWorld Unification (Issues #1, #4, #7)

**Generated:** 2025-12-30-120000
**Source STATUS:** STATUS-2025-12-30.md
**Git Commit:** 21cae9f
**Scope:** Fix TypeWorld vocabulary mismatch and add compile-time transform chain detection

---

## Executive Summary

### Current State

Sprint 1 successfully fixed Issues #2, #3, #5, #6 (type compatibility and adapter/lens compile errors), but **did NOT** address Issues #1, #4, #7.

**Remaining issues:**
- **Issue #1:** Two incompatible TypeWorld enums (`'special'` in compiler IR vs `'config'` in editor type system)
- **Issue #4:** Transform chain execution throws runtime error (but never fires because no compiler code creates transform chains)
- **Issue #7:** Duplicate of Issue #1 (same config vs special mismatch)

**Risk Level:** MEDIUM
- Issue #1 causes latent type system confusion across code boundaries
- Issue #4 is a landmine for future type conversion work

### Sprint 2 Scope

This sprint delivers **2 deliverables** that fix the remaining issues:

1. **Unify TypeWorld Vocabulary** - Replace `'special'` with `'config'` across ~20 files (Issues #1 & #7)
2. **Transform Chain Compile-Time Detection** - Prevent runtime crash by detecting transform chains at compile time (Issue #4)

**Out of scope:** Implementing actual transform chain execution (deferred to Sprint 4+)

**Estimated effort:** 4-5 hours total

---

## Deliverable 1: Unify TypeWorld Vocabulary

**Status:** Not Started
**Effort:** Small (2-3 hours)
**Dependencies:** None
**Spec Reference:** design-docs/spec/ (type system) • **Status Reference:** STATUS-2025-12-30.md lines 25-93

### Description

The codebase has two incompatible `TypeWorld` enum definitions:

- **IR compiler** (`src/editor/compiler/ir/types.ts:25`): Uses `'special'`
- **Editor type system** (`src/editor/ir/types/TypeDesc.ts:41`): Uses `'config'`

This causes semantic types like `Domain`, `Scene`, and `RenderTree` to have **different world values** depending on which code path created them:

```typescript
// pass2-types.ts:113
Domain: { world: "special", domain: "domain" }

// typeConversion.ts:53
'Domain': createTypeDesc({ world: 'config', domain: 'domain' })
```

**Decision:** Unify to `'config'` (not `'special'`)

**Rationale:**
1. Semantic clarity - "config" accurately describes compile-time configuration values
2. Existing usage - Editor type system already uses 'config' consistently
3. Bus eligibility - TypeDesc.ts:175 already has `if (type.world === 'config') return false` logic
4. Documentation - TypeDesc.ts:40 documents 'config' as "Configuration values (not runtime)"
5. Vague terminology - "special" doesn't convey meaning, "config" is precise

### Implementation Steps

1. **Update IR TypeWorld enum**
   - File: `src/editor/compiler/ir/types.ts:25`
   - Change: `"special"` → `"config"`

2. **Search and replace across codebase**
   - Pattern: `world: "special"` → `world: "config"`
   - Estimated files affected: ~20 files
   - Primary locations:
     - `src/editor/compiler/passes/pass2-types.ts` (type mappings)
     - Block compilers in `src/editor/compiler/blocks/domain/`
     - Runtime executor in `src/editor/runtime/executor/`
     - Type adapter tests
     - Debug tools

3. **Update test assertions**
   - Find tests asserting on `world: "special"`
   - Update to `world: "config"`

4. **Verification**
   - Run `just typecheck` - must pass with no new errors
   - Run `just test` - all existing tests must pass
   - Grep for remaining `"special"` references (should be none in TypeWorld context)

### Acceptance Criteria

- [ ] IR TypeWorld enum (`src/editor/compiler/ir/types.ts:25`) includes `'config'` instead of `'special'`
- [ ] All `world: "special"` assignments in pass2-types.ts are changed to `world: "config"`
- [ ] Domain type has `world: 'config'` in both typeConversion.ts and pass2-types.ts (verified by grep)
- [ ] Full test suite passes (`just test`) with no regressions
- [ ] TypeScript compilation succeeds (`just typecheck`) with no new type errors

### Technical Notes

**Files to modify (primary):**
- `src/editor/compiler/ir/types.ts` - TypeWorld enum definition
- `src/editor/compiler/passes/pass2-types.ts` - Type mappings for Domain, Scene, RenderTree

**Files already correct (no changes):**
- `src/editor/ir/types/TypeDesc.ts` - Already uses 'config'
- `src/editor/ir/types/typeConversion.ts` - Already uses 'config'

**Search strategy:**
```bash
# Find all "special" references in TypeWorld context
rg 'world.*"special"' --type ts
rg '"special".*world' --type ts
```

**Risk mitigation:**
- This is a mechanical search-replace with test verification
- No behavioral changes - just vocabulary unification
- TypeScript compiler will catch any missed references

---

## Deliverable 2: Transform Chain Compile-Time Detection

**Status:** Not Started
**Effort:** Small (1-2 hours)
**Dependencies:** None
**Spec Reference:** design-docs/spec/ (type conversion) • **Status Reference:** STATUS-2025-12-30.md lines 95-167

### Description

The runtime throws when a Transform FieldHandle is materialized:

```typescript
// src/editor/runtime/field/Materializer.ts:1174
throw new Error(`fillBufferTransform: transform chain evaluation not implemented`);
```

**Current status:** This error never fires because no compiler code creates transform chains.

**Evidence:** Search for `builder.transformChain()` only finds test usage, no production code.

**Problem:** This is a landmine for future type conversion work. If someone adds transform chain creation logic, they'll get a runtime error instead of a clear compile-time error.

**Solution:** Add compile-time detection to emit a clear error when transform chains would be created, similar to the Issue #5 fix for adapters/lenses.

**Out of scope:** Actually implementing transform chain execution (TODO Phase 6, deferred to Sprint 4+)

### Implementation Steps

1. **Identify transform chain creation points**
   - Search for where IR builder methods `fieldTransform()` or `sigTransform()` could be called
   - Look in compiler passes (pass2-types.ts likely location)

2. **Add compile-time detection**
   - File: `src/editor/compiler/passes/pass2-types.ts` (or wherever transforms would be created)
   - Add check: if transform chain would be created, emit compile error
   - Error code: `UnsupportedTransformChainInIRMode` (add to `src/editor/compiler/types.ts`)

3. **Error message**
   - Clear message: "Transform chains are not yet supported in IR mode. Type conversion via transforms is planned for a future release."
   - Reference TODO comment at Materializer.ts:1161 (Phase 6)

4. **Add test**
   - Create test case that would trigger transform chain creation
   - Assert that compile error is emitted (not runtime error)
   - Similar to adapter/lens tests from Issue #5 fix

### Acceptance Criteria

- [ ] Compile-time error is emitted when IR mode would create a transform chain (instead of runtime crash)
- [ ] Error message clearly states "Transform chains are not yet supported in IR mode"
- [ ] Test added that verifies compile error is emitted for transform chain creation
- [ ] Existing tests continue to pass (no transform chains are created in current compiler)
- [ ] Materializer.ts:1174 runtime error becomes unreachable code (documented with comment)

### Technical Notes

**Error detection location:**
- Likely in `src/editor/compiler/passes/pass2-types.ts` where type conversions would be handled
- May need to check IR builder state to detect if `transformChain()` was called

**Error code to add:**
```typescript
// src/editor/compiler/types.ts
export type CompileError =
  | ... existing errors ...
  | { code: 'UnsupportedTransformChainInIRMode'; message: string; context: { blockId: string } };
```

**Reference implementation:**
- Issue #5 fix (commit 7139829) added similar compile-time detection for adapters/lenses
- Use same pattern: detect unsupported IR construct, emit clear error

**Future work (Sprint 4+):**
- Design type conversion system holistically
- Implement `fillBufferTransform()` in Materializer.ts
- Support ScaleBias, Cast, Map transform steps (see transforms.ts:58-72)
- Remove compile-time error once execution is implemented

---

## Dependency Graph

```
Deliverable 1 (TypeWorld unify) ─┐
                                  ├──> Can be done independently
Deliverable 2 (Transform detect) ─┘

Issue #7 (Config vs special) ────> Automatically resolved by Deliverable 1
```

**No blocking dependencies** - both deliverables can be implemented in parallel or any order.

---

## Sprint Planning Recommendations

### Execution Order

**Recommended:** Deliverable 1 first, then Deliverable 2

**Rationale:**
1. TypeWorld unification is foundational for type system work
2. Transform detection may reference TypeWorld enum (cleaner if already unified)
3. Logical progression: fix type system vocabulary → add safety checks

**Alternative:** Both can be done in parallel by different developers (no conflicts)

### Testing Strategy

**After Deliverable 1:**
- Run full test suite: `just test`
- Typecheck: `just typecheck`
- Grep verification: No `world: "special"` remains
- Spot check: Domain type has `world: 'config'` in both systems

**After Deliverable 2:**
- Run tests including new transform chain error test
- Verify runtime error at Materializer.ts:1174 is unreachable
- Confirm existing compiler passes emit no transform chain errors

**Full sprint verification:**
- All tests pass
- No TypeScript errors
- No 'special' world references remain
- Transform chains trigger compile error (not runtime error)

### Time Estimates

- Deliverable 1: 2-3 hours (mechanical but thorough)
- Deliverable 2: 1-2 hours (simpler, similar to existing pattern)
- Testing/verification: 30 minutes
- **Total: 4-5 hours**

---

## Risk Assessment

### Deliverable 1: TypeWorld Unification

**Risk:** LOW

**Mitigations:**
- TypeScript compiler catches missed references
- Test suite verifies no behavioral changes
- Grep verification ensures completeness
- Mechanical change reduces human error

**Failure modes:**
- Miss a file → TypeScript error → easy to fix
- Break a test → Test failure → easy to fix
- No silent failures expected

### Deliverable 2: Transform Detection

**Risk:** LOW

**Mitigations:**
- Similar pattern already exists (Issue #5 fix)
- Clear test coverage
- Compiler error prevents runtime issues
- No existing code creates transform chains (safe to add check)

**Failure modes:**
- False positive (detect non-transform as transform) → Test catches, easy to fix
- Miss a creation point → No immediate impact (code doesn't create transforms yet)

---

## Definition of Done

Sprint 2 is complete when:

1. ✅ All acceptance criteria for Deliverable 1 are met
2. ✅ All acceptance criteria for Deliverable 2 are met
3. ✅ Full test suite passes (`just test`)
4. ✅ TypeScript compilation succeeds (`just typecheck`)
5. ✅ No `world: "special"` references remain in TypeWorld context
6. ✅ Transform chains emit compile error (not runtime error)
7. ✅ DOD-2025-12-30-SPRINT2.md checklist is 100% complete

**Deferred to Sprint 4+:**
- Implementing actual transform chain execution
- Designing holistic type conversion system

---

## Files Modified (Expected)

### Deliverable 1 (TypeWorld Unification)

**Primary:**
- `src/editor/compiler/ir/types.ts` - TypeWorld enum
- `src/editor/compiler/passes/pass2-types.ts` - Type mappings

**Secondary (search-replace):**
- Block compilers in `src/editor/compiler/blocks/domain/`
- Runtime executor files
- Type adapter tests
- Debug tools
- Estimated: ~20 files total

**No changes:**
- `src/editor/ir/types/TypeDesc.ts` - Already correct
- `src/editor/ir/types/typeConversion.ts` - Already correct

### Deliverable 2 (Transform Detection)

**Modified:**
- `src/editor/compiler/passes/pass2-types.ts` - Add detection logic
- `src/editor/compiler/types.ts` - Add error code
- Test file (new or modified) - Add test case
- `src/editor/runtime/field/Materializer.ts` - Add comment marking line 1174 unreachable

**Estimated:** 4 files

---

## Post-Sprint Actions

After Sprint 2 completion:

1. **Update STATUS file**
   - Create STATUS-2025-12-30-SPRINT2.md marking Issues #1, #4, #7 as FIXED
   - Note that transform execution is deferred (compile error added instead)

2. **Clean up planning artifacts**
   - Keep last 4 PLAN-*.md and DOD-*.md files
   - Archive older files to `.agent_planning/compiler-audit-redflag/archive/`

3. **Prepare for Sprint 3**
   - If more red flags remain, evaluate next priority
   - If all red flags fixed, close out this topic

4. **Documentation**
   - Update HANDOFF.md to note transform execution is deferred to Phase 6
   - Document 'config' as canonical TypeWorld value (not 'special')

---

## References

**Source Documents:**
- STATUS-2025-12-30.md (this sprint's input)
- Original audit: STATUS-2025-12-28.md

**Related Commits:**
- Sprint 1: 28c5307 (Issues #2, #3, #6), 7139829 (Issue #5)

**Key Specification Sections:**
- design-docs/spec/ - Type system architecture
- design-docs/spec/ - Type conversion (future work)

**Code References:**
- TypeDesc definitions: `src/editor/compiler/ir/types.ts`, `src/editor/ir/types/TypeDesc.ts`
- Type conversion: `src/editor/ir/types/typeConversion.ts`
- Pass 2: `src/editor/compiler/passes/pass2-types.ts`
- Transform runtime: `src/editor/runtime/field/Materializer.ts:1150-1175`
- Transform IR: `src/editor/compiler/ir/transforms.ts`
