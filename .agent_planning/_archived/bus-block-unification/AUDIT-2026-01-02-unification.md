# Code Quality Audit: Bus-Block Unification

**Audit Date**: 2026-01-02
**Scope**: Architecture, design, and implementation of bus-block unification
**Audit Intensity**: Thorough
**Auditor**: audit-master (code quality dimension)

---

## Executive Summary

| Dimension | Rating | Key Findings |
|-----------|--------|--------------|
| **Architecture** | ⚠️ 60% aligned | Solid conceptual model, partially implemented |
| **Design Quality** | ✅ Good | Clean patterns, well-documented intent |
| **Efficiency** | ⚠️ Medium | Dual paths create overhead; cleanup will help |
| **Completeness** | ❌ Incomplete | Sprint 3 stalled; Sprint 4 blocked |

**Overall Health**: 🟡 PARTIAL - Strong foundation, execution incomplete

---

## 1. Architecture Assessment

### 1.1 Conceptual Model: ✅ SOUND

The unification insight is architecturally correct:

> **Buses ARE blocks with multi-input combiners in disguise.**

| Concept | Bus | Block (multi-input) |
|---------|-----|---------------------|
| Merge strategy | `Bus.combine` | `Slot.combine` |
| Output | Single combined value | Single output port |
| Ordering | `sortKey`, `weight` | Edge `sortKey`, `weight` |

**Evidence**: Both use `CombinePolicy` type, both use `createCombineNode()` in compiler.

### 1.2 Type System: ⚠️ DUPLICATION

**Problem**: Two parallel type hierarchies exist:

```
LEGACY (still active)           UNIFIED (target state)
─────────────────────           ──────────────────────
Bus interface                →  BusBlock (params store metadata)
Endpoint.kind === 'bus'      →  Eliminated (all PortRef)
```

**Files with dual systems**:
- `src/editor/stores/BusStore.ts` - Facade pattern, but still exists
- `src/editor/compiler/passes/pass7-bus-lowering.ts` - Supports both old and new formats

**Finding P1**: Type duplication increases cognitive load and bug surface area.

### 1.3 Store Architecture: ⚠️ FACADE INCOMPLETE

**Current State**:
```
BusStore (facade)
  ├── buses: computed → PatchStore.busBlocks.map(convertBlockToBus)
```

1. Split ownership of bus-related data
2. Potential sync issues between BusBlocks and legacy arrays
3. Incomplete migration that's easy to forget


### 1.4 Compiler Architecture: ✅ WELL-UNIFIED

The compiler is the most successfully unified component:

| Pass | Status | Notes |
|------|--------|-------|
| Pass 6 (Block Lowering) | ✅ | Uses `createCombineNode()` for multi-input |
| Pass 7 (Bus Lowering) | ✅ | Refactored to use BusBlocks internally |
| Pass 8 (Link Resolution) | ⚠️ | Partial - lens params only support `literal` kind |

**Evidence**: `src/editor/compiler/bus-block-utils.ts` provides unified helpers.

---

## 2. Design Quality Assessment

### 2.1 Pattern Consistency: ✅ GOOD

**Hidden Block Pattern**: Well-established and consistent
```typescript
// BusBlock definition (src/editor/blocks/bus-block.ts)
tags: {
  hidden: true,
  bus: true,
  role: 'bus',
}
```

**Conversion Utilities**: Clean bidirectional conversion
- `convertBusToBlock()` - Bus → BusBlock
- `convertBlockToBus()` - BusBlock → Bus

**Finding P3**: Consider extracting hidden block pattern to a shared utility.

### 2.2 Code Smells Detected

#### Smell 1: Backward Compatibility Overload (P2)

`pass7-bus-lowering.ts` signature:
```typescript
export function pass7BusLowering(
  unlinked: UnlinkedIRFragments,
  blocksOrBuses: readonly Block[] | readonly Bus[],     // Union type!
  blocksLegacy?: readonly Block[],
  edgesLegacy?: readonly Edge[]
): IRWithBusRoots
```

**Problem**: Complex signature with multiple optional params to support old/new formats.
**Recommendation**: After Sprint 3 completes, simplify to single signature.

#### Smell 2: Kind Checks Scattered (P1)

67 files contain `kind.*:.*'bus'` patterns:
- Compiler passes: 5 files with active checks
- Stores: 3 files with active checks
- Migration utils: 2 files (acceptable)
- Planning docs: ~60 files (acceptable)

**High-Priority Removals**:
| File | Lines | Impact |
|------|-------|--------|
| `pass6-block-lowering.ts` | 417 | Writer kind check |
| `pass7-bus-lowering.ts` | 167, 274 | Legacy edge detection |

#### Smell 3: Stale TODO Comments (P2)

```typescript
// pass8-link-resolution.ts:470
// TODO: Handle other binding kinds (bus, wire, default) in future sprints
```

This TODO has been present since Sprint 2 was completed. Sprint 4 should address it.

### 2.3 Documentation Quality: ✅ EXCELLENT

**Strengths**:
- Comprehensive STATUS documents in `.agent_planning/bus-block-unification/`
- Clear sprint breakdown (1-4) with DOD (Definition of Done)
- Type changes documented with before/after examples
- Risk analysis with mitigation strategies

**Finding**: Documentation is thorough and maintains alignment with code.

---

## 3. Implementation Gaps

### 3.1 Sprint Status Matrix

| Sprint | Scope | Status | Completion |
|--------|-------|--------|------------|
| Sprint 1 | BusBlock definition, conversion utilities | ✅ COMPLETE | 100% |
| Sprint 2 | Compiler unification (Pass 7/8) | ✅ COMPLETE | 100% |
| Sprint 3 | Type cleanup, BusStore deletion | 🟡 PARTIAL | ~30% |
| Sprint 4 | Lens param bindings | ❌ BLOCKED | 0% |

### 3.2 Sprint 3 Remaining Work (Critical Path)

**P0 - Must Do**:
1. [ ] Fix 43 failing tests (blocks Sprint 3 work)
2. [ ] Delete BusStore.ts entirely
3. [ ] Remove RootStore.busStore property

**P1 - Should Do**:
4. [ ] Simplify Endpoint type to PortRef alias
7. [ ] Remove all `kind === 'bus'` checks (except migration)

**P2 - Nice to Have**:
8. [ ] Clean up backward-compat function signatures in Pass 7
9. [ ] Update pass8 comments referencing old format

### 3.3 Sprint 4 Blocked Items

**Lens param bindings** (Pass 8) only support `literal` kind:

```typescript
// Current (src/editor/compiler/passes/pass8-link-resolution.ts:464-472)
if (binding.kind === 'literal') {
  const constId = builder.allocConstId(binding.value);
  paramsMap[paramId] = { k: 'scalarConst', constId };
}
// TODO: Handle bus, wire, default
```

**LensParamBinding** supports 4 kinds:
| Kind | Status | Dependency |
|------|--------|------------|
| `literal` | ✅ Implemented | None |
| `wire` | ❌ Not implemented | Independent |
| `default` | ❌ Not implemented | Independent |
| `bus` | ❌ Not implemented | **Requires Sprint 3** |

---

## 4. Risk Assessment

### 4.1 Active Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Type cleanup cascade (50-100 errors) | HIGH | CERTAIN | TypeScript guides; fix file-by-file |
| UI regression from BusStore removal | MEDIUM | LIKELY | Manual test checklist |
| MobX reactivity breakage | MEDIUM | POSSIBLE | Verify computed getters trigger |
| Test failures block progress | HIGH | CURRENT | Fix 43 failing tests first |
| Patch migration in production | LOW | UNLIKELY | Keep migration utilities |

### 4.2 Technical Debt Created

| Debt Item | Size | Justification |
|-----------|------|---------------|
| Dual Bus/BusBlock representation | LARGE | Necessary during migration |
| Backward-compat function signatures | MEDIUM | Will be cleaned up in Sprint 3 |

---

## 5. Efficiency Analysis

### 5.1 Code Reduction Potential

| Component | Current Lines | After Cleanup | Savings |
|-----------|---------------|---------------|---------|
| BusStore.ts | ~530 | 0 | 530 lines |
| Endpoint handling | ~200 | 0 | 200 lines |
| Pass 7 backward compat | ~100 | 0 | 100 lines |
| **Total** | | | **~980 lines** |

### 5.2 Runtime Efficiency

**No performance impact expected** from unification:
- Same IR nodes emitted (createCombineNode shared)
- No additional indirection in hot paths

### 5.3 Dead Code Detected

| Code | Location | Status |
|------|----------|--------|

---

## 6. Design Ambiguities

The STATUS document identified 5 ambiguities. Current resolution status:

| # | Ambiguity | Resolution | Status |
|---|-----------|------------|--------|
| 1 | Bus metadata representation | Keep Bus interface for metadata | ⚠️ PENDING |
| 2 | BusBlock compiler implementation | Compiler intrinsic (not BlockCompiler) | ✅ RESOLVED |
| 3 | Bus creation UX | BusStore.createBus() creates both | ✅ RESOLVED |
| 4 | Backward compatibility strategy | Automatic migration + version bump | ⚠️ PARTIAL |
| 5 | Diagnostic message formatting | Use Bus.name for diagnostics | ⚠️ PENDING |

**Finding P1**: Ambiguities 1, 4, 5 need explicit decisions before Sprint 3 completion.

---

## 7. Recommendations

### 7.1 Immediate Actions (P0)

1. **Fix failing tests** - 43 tests failing blocks all further work
   - Focus on transaction/ops tests (test setup issues, not bus bugs)
   - Gate: All tests green before continuing

2. **Complete Sprint 3** - Critical path for Sprint 4
   - Delete BusStore.ts
   - Remove Endpoint union
   - Remove legacy types

### 7.2 Short-Term Actions (P1)

3. **Resolve remaining ambiguities**
   - Document decision on Bus metadata representation
   - Implement diagnostic formatting with Bus.name lookup

4. **Clean up backward-compat code**
   - Simplify pass7BusLowering signature
   - Remove legacy edge detection branches

### 7.3 Medium-Term Actions (P2)

5. **Complete Sprint 4**
   - Implement wire/default/bus bindings for lens params
   - Remove TODO comments

6. **Add regression tests**
   - BusBlock creation/deletion syncs correctly
   - Migration converts old patches safely
   - UI still shows "Bus 'energy'" not "Block bus:energy"

---

## 8. Priority Summary

```
P0 (Critical - Fix Now)
├── Fix 43 failing tests
├── Delete BusStore.ts
└── Remove RootStore.busStore

P1 (High - Sprint 3 Completion)
├── Simplify Endpoint → PortRef
├── Remove kind === 'bus' checks
├── Resolve ambiguities 1, 4, 5
└── Fix scattered kind checks in 5 compiler files

P2 (Medium - Sprint 4)
├── Implement wire lens param bindings
├── Implement default lens param bindings
├── Implement bus lens param bindings
└── Clean up backward-compat signatures

P3 (Low - Polish)
├── Extract hidden block pattern utility
├── Update comments referencing old format
└── Documentation cleanup
```

---

## 9. Conclusion

The bus-block unification architecture is **conceptually sound** and **partially implemented**. The core insight that buses and multi-input blocks share identical semantics is correct and well-documented.

**Strengths**:
- Compiler successfully unified (Pass 7/8 use BusBlocks)
- Conversion utilities are bidirectional and tested
- Documentation is thorough with clear sprint plans
- Hidden block pattern is established and consistent

**Weaknesses**:
- Sprint 3 stalled at ~30% completion
- 43 failing tests blocking progress
- Type duplication creates maintenance burden

**Verdict**: ⚠️ **CONTINUE** - but address blockers first

The work is valuable and should be completed. However, the test failures must be fixed before Sprint 3 can proceed. The estimated remaining effort is 12-22 hours of focused engineering time.

---

## Appendix: Key Files Reference

**Types**:
- `src/editor/types.ts:165-270` - Bus, Endpoint, Edge interfaces

**Stores**:
- `src/editor/stores/BusStore.ts` - Facade (to be deleted)
- `src/editor/stores/PatchStore.ts` - Bus management methods

**Compiler**:
- `src/editor/compiler/passes/pass7-bus-lowering.ts` - Bus lowering
- `src/editor/compiler/passes/pass8-link-resolution.ts` - Lens param handling
- `src/editor/compiler/bus-block-utils.ts` - BusBlock helpers

**Blocks**:
- `src/editor/blocks/bus-block.ts` - BusBlock definition
- `src/editor/bus-block/conversion.ts` - Bus ↔ BusBlock conversion

**Planning**:
- `.agent_planning/bus-block-unification/STATUS-2026-01-01-bus-unification.md` - Main architecture
- `.agent_planning/bus-block-unification/STATUS-2026-01-01-sprint34.md` - Sprint status

---

**Audit Completed**: 2026-01-02
**Auditor**: audit-master
**Confidence**: HIGH (fresh evaluation with code inspection)
