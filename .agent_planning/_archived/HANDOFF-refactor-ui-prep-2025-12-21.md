# Handoff: UI Prep Refactor - Spec Compliance

**Created**: 2025-12-21
**For**: Iterative implementer or planning agent
**Status**: in-progress (2 of 9 issues fixed)

---

## Objective

Fix all divergences from the design spec in `design-docs/10-Refactor-for-UI-prep/` to prepare the codebase for multi-UI support, proper bus/composite handling, and clean time authority.

## Current State

### What's Been Done
- **Time Authority (3-Time.md)**: Player time is now monotonic - cyclic/infinite modes no longer wrap `tMs` in Player.tick()
  - Commit: `1857bb8 feat(player): Make time monotonic for cyclic/infinite modes`
  - File: `src/editor/runtime/player.ts`
- **Port Identity (2-PortIdentity.md)**: `BindingEndpoint` now uses canonical `slotId` + `dir` instead of `port` string
  - Changed: `BindingEndpoint`, `Publisher`, `Listener`, `CompositeConnection` types
  - Updated: BusStore, compiler files, UI components, demo patches, all tests
  - File: `src/editor/types.ts` + ~20 other files
- Analysis complete for all 9 issues in the spec

### What's In Progress
- Layout Projection identified but not started

### What Remains (7 issues)
1. **Layout Projection** (4-Layout.md) - Lanes are semantic, not projective
2. **Divergent Types** (5-DivergentTypes.md) - No shared validation layer
3. **Semantic Kernel** (7-PatchSemantics.md) - No SemanticGraph or centralized validation
4. **Op System** (8-PatchOps.md) - No Op types or Transaction builder
5. **Settings Partitioning** (Overview point 7) - Settings grab-bag not partitioned
6. **TimeRoot auto-publish** (3.5-PhaseClock-Fix.md) - TimeRoot doesn't auto-publish to canonical buses
7. **Macro/Composite boundary** (Overview point 4) - Composites don't have stable port maps

## Context & Background

### Why We're Doing This
The codebase has accumulated "two truths" patterns where editor and compiler disagree on semantics. This causes bugs like "bus listeners don't work through composites" and prevents building multi-UI without duplicating validation logic.

### Key Decisions Made
| Decision | Rationale | Date |
|----------|-----------|------|
| Player time monotonic | Spec: TimeRoot owns topology, not Player | 2025-12-21 |
| Fix Port Identity first | Spec recommends: "root of a thousand paper cuts" | Pending |
| Semantic Kernel is foundation | Required for all other fixes to be maintainable | Pending |

### Important Constraints
- Must maintain backward compatibility with existing patches where possible
- Changes should be incremental, not big-bang refactor
- Tests must pass after each change
- Focus ONLY on design-docs/10-Refactor-for-UI-prep/ issues

## Acceptance Criteria

Complete when all 9 spec issues are addressed:

- [x] Time Authority: Player time is monotonic
- [x] Port Identity: `BindingEndpoint` uses `{ blockId, slotId, dir }`
- [ ] Layout Projection: Lanes are view-only, not in Patch semantics
- [ ] Divergent Types: Shared validation layer exists
- [ ] Semantic Kernel: `SemanticGraph` with indices exists
- [ ] Op System: Op types and Transaction builder exist
- [ ] Settings: Partitioned into semantic/runtime/view
- [ ] TimeRoot auto-publish: CycleTimeRoot → phaseA/pulse buses
- [ ] Composite boundaries: Stable port maps prevent expansion breaks

## Scope

### Files to Modify (Priority Order)

**Port Identity Fix:**
- `src/editor/types.ts:164-250` - Change `BindingEndpoint` from `port` to `slotId`
- `src/editor/stores/BusStore.ts` - Update Publisher/Listener handling
- `src/editor/compiler/compileBusAware.ts` - Use slotId in compilation
- `src/editor/events/types.ts` - Update binding events

**TimeRoot Auto-publish:**
- `src/editor/compiler/blocks/domain/TimeRoot.ts` - Add wrap Event output to CycleTimeRoot
- `src/editor/compiler/compileBusAware.ts` - Auto-publish TimeRoot outputs to canonical buses

**Semantic Kernel (major):**
- Create `src/editor/kernel/` directory
- `kernel/graph.ts` - SemanticGraph builder
- `kernel/validate.ts` - Shared validation rules
- `kernel/resolve.ts` - Default bindings, adapter chains

### Related Components
- `src/editor/stores/PatchStore.ts` - Lanes currently in patch semantics
- `src/editor/compiler/compile.ts` - Validation currently scattered here
- `src/editor/composites.ts` - Needs port map enforcement

### Out of Scope
- UI redesign (separate work)
- Performance optimization (separate work)
- New features (bus meters, etc.)
- Issues NOT in design-docs/10-Refactor-for-UI-prep/

## Implementation Approach

### Recommended Priority (per spec)
1. **Port Identity** - Fixes composites, macros, buses, diagnostics
2. **Time Authority** - ✅ Done (Player monotonic)
3. **Layout Projection** - Required for multi-UI
4. **Shared Validation** - Prevents UI/compile drift
5. **Bus Semantics** - Determinism + explainability

### Patterns to Follow
- Use existing `PortRef` interface at `src/editor/types.ts:721-725` as template
- Follow event pattern in `src/editor/events/types.ts` for new events
- Match diagnostic pattern in `src/editor/diagnostics/` for validation errors

### Known Gotchas
- `BindingEndpoint` is used in ~20 places - need to update all consistently
- Changing Publisher/Listener types will require migration of existing patches
- TimeRoot compiler missing `wrap` Event output (spec requires it)
- PhaseClock still exists as quasi-authority (should be operator only)

## Reference Materials

### Planning Documents
- [time-authority/DOD-2025-12-21.md](.agent_planning/time-authority/DOD-2025-12-21.md) - Time fix DoD (complete)
- [time-authority/PLAN-2025-12-21.md](.agent_planning/time-authority/PLAN-2025-12-21.md) - Time fix plan (complete)

### Design Spec Documents
- `design-docs/10-Refactor-for-UI-prep/1-Overview.md` - Lists all 9 issues
- `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md` - Port identity spec
- `design-docs/10-Refactor-for-UI-prep/3-Time.md` - Time authority spec
- `design-docs/10-Refactor-for-UI-prep/3.5-PhaseClock-Fix.md` - PhaseClock demotion
- `design-docs/10-Refactor-for-UI-prep/5-DivergentTypes.md` - Validation layer
- `design-docs/10-Refactor-for-UI-prep/7-PatchSemantics.md` - Semantic kernel
- `design-docs/10-Refactor-for-UI-prep/8-PatchOpsCompleteSet.md` - Op system

### Codebase References
- `src/editor/types.ts:721-725` - Existing `PortRef` interface (correct pattern)
- `src/editor/types.ts:164-170` - `BindingEndpoint` (needs fix)
- `src/editor/runtime/player.ts` - Recently fixed for monotonic time
- `src/editor/compiler/blocks/domain/TimeRoot.ts` - TimeRoot compilers

## Questions & Blockers

### Open Questions
- [ ] Should we migrate existing patches or add backward compat shim?
- [ ] How to handle lanes during transition? (Keep both semantic + projection?)
- [ ] What validation errors should block UI vs just warn?

### Current Blockers
- None - can proceed with Port Identity fix

### Need User Input On
- Priority order if not following spec recommendation
- Whether to create new `src/editor/kernel/` or integrate into existing structure

## Testing Strategy

### Existing Tests
- `src/editor/**/__tests__/` - Comprehensive test coverage
- `just test` - 738 tests passing currently

### New Tests Needed
- [ ] Port identity: Publisher/Listener use slotId
- [ ] Port identity: Bus bindings survive composite expansion
- [ ] TimeRoot: wrap Event output exists
- [ ] TimeRoot: auto-publish to canonical buses
- [ ] Semantic kernel: validation catches illegal states

### Manual Testing
- [ ] Create patch with composite, verify bus bindings work
- [ ] Change TimeRoot type, verify UI responds correctly
- [ ] Create cycle that compiler should reject, verify UI prevents it

## Success Metrics

- All 738+ tests pass
- All 9 spec issues addressed
- No "two truths" patterns remain
- Bus bindings work through composites
- Multi-UI possible (no validation duplication needed)

---

## Next Steps for Agent

**Immediate actions**:
1. Read `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md` for full spec
2. Change `BindingEndpoint` to use `slotId` and `dir`
3. Update all usages (~20 locations)
4. Run `just test` to verify no regressions

**Before starting implementation**:
- [ ] Read all reference materials linked above
- [ ] Verify current tests pass: `just test`
- [ ] Check types.ts for BindingEndpoint usage count

**When complete**:
- [ ] Update this handoff with completed items
- [ ] Create commit with descriptive message
- [ ] Move to next priority issue

---

## Detailed Gap Analysis

### Port Identity Gap (CRITICAL)

**Current:**
```typescript
// src/editor/types.ts:164-170
export interface BindingEndpoint {
  readonly blockId: BlockId;
  readonly port: string;  // ← String name, breaks on expansion
}
```

**Required:**
```typescript
export interface BindingEndpoint {
  readonly blockId: BlockId;
  readonly slotId: string;  // ← Canonical slotId
  readonly dir: 'input' | 'output';  // ← Direction
}
```

**Impact:** Publisher, Listener, all bus binding code. This is why "bus listeners don't work through composites."

### TimeRoot Auto-publish Gap

**Current:** TimeRoot outputs phase but doesn't auto-publish to buses
**Required:** CycleTimeRoot auto-publishes: `phase → phaseA`, `wrap → pulse`
**Location:** `src/editor/compiler/compileBusAware.ts`

### Missing Outputs Gap

**Current CycleTimeRoot outputs:** `systemTime`, `phaseA`
**Spec requires:** `t`, `cycleT`, `phase`, `wrap` (Event), `cycleIndex`
**Location:** `src/editor/blocks/time-root.ts` and `src/editor/compiler/blocks/domain/TimeRoot.ts`
