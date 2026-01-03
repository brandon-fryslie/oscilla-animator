# Port Identity Investigation - Status Report

**Date**: 2025-12-21
**Evaluator**: project-evaluator
**Scope**: Port identity bug preventing macro compilation
**Confidence**: FRESH

---

## Executive Summary

**Critical Finding**: The codebase is in a **broken transitional state**. The `BindingEndpoint` interface was changed from `port: string` to `slotId: string` + `dir: 'input'|'output'`, but 70+ usages were not updated. This causes:

1. **Immediate**: TypeScript compilation fails (tests won't run)

3. **Architectural**: Port matching uses string names instead of type matching (violates spec)

**Verdict**: PAUSE - Must fix incomplete migration before addressing architectural issues.

---

## Current State: Broken Build

### TypeScript Compilation Errors

**70+ errors** across the codebase, all variants of:
```
error TS2353: Object literal may only specify known properties,
and 'port' does not exist in type 'BindingEndpoint'.
```

**Affected files** (partial list):
- Tests: `bus-compilation.test.ts`, `field-bus-compilation.test.ts`, `bus-diagnostics.test.ts`
- UI: `BusChannel.tsx`, `BusInspector.tsx`, `BusPicker.tsx`, `PublishMenu.tsx`
- Compiler: `integration.ts`, `compileBusAware.ts`
- Stores: `PatchStore.ts`, `CompositeStore.ts`, `ModulationTableStore.ts`

### What Changed vs What Didn't

**Changed** (correct per spec):
```typescript
// src/editor/types.ts:164-170
export interface BindingEndpoint {
  readonly blockId: BlockId;
  readonly slotId: string;  // Was: port
  readonly dir: 'input' | 'output';  // NEW
}
```

**Not changed** (70+ locations still using old API):
```typescript
// Example from bus-compilation.test.ts:102
  from: { blockId: 'block-1', port: 'out' },  // ❌ Should be: slotId + dir
  // ...
}]
```

**Tests cannot run** - TypeScript compilation fails before vitest starts.

---

## The Underlying Bug: phase vs phaseA

Once the build is fixed, the **actual runtime bug** will still exist:

### Symptom
```
UpstreamError: Missing upstream artifact for block-88:phase [block-89.phase]
```

### Root Cause Analysis

**1. Macro references use generic `phase` name**:
```typescript
// src/editor/macros.ts - 24 occurrences
{ fromRef: 'time', fromSlot: 'phase', toRef: 'osc', toSlot: 'phase' }
{ fromRef: 'time', fromSlot: 'phase', busName: 'phaseA' }
```


```typescript
// src/editor/blocks/time-root.ts:66
outputs: [
  output('systemTime', 'System Time', 'Signal<time>'),
  output('phaseA', 'Phase A', 'Signal<phase>'),  // ← Named phaseA, not phase
]
```

**3. Compiler produces `phaseA`**:
```typescript
// src/editor/compiler/blocks/domain/TimeRoot.ts:63
outputs: [
  { name: 'systemTime', type: { kind: 'Signal:Time' } },
  { name: 'phaseA', type: { kind: 'Signal:phase' } },  // ← Named phaseA
]
```

**4. String-based port lookup fails**:
```typescript
// compileBusAware.ts uses string keys
const srcKey = keyOf(wireConn.from.blockId, wireConn.from.port);
// Looks for 'block-88:phase' but only 'block-88:phaseA' exists
```

### Why This Violates the Spec

From `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md`:

> **Option 1 (recommended): Composites are boundaries**
>
> The compiler resolves bus/wire dependencies through composite boundaries
> **without requiring composite expansion to rewrite document references.**

Current system:
- ❌ Uses string port names as lookup keys
- ❌ Requires exact name matching (fragile)
- ❌ Breaks when port is renamed (phaseA ≠ phase)
- ❌ No type-based matching fallback

Spec requires:
- ✅ Canonical `PortRef` with stable `slotId`
- ✅ Type-based resolution through composite boundaries
- ✅ Port renames don't break references

---

## The Design Spec's Answer

### Per spec section 3.5 (PhaseClock-Fix.md)

**TimeRoot should output `phase`, not `phaseA`:**

> TimeRoot has params that cover the PhaseClock modes:
> - mode: finite | cyclic | infinite
> - If cyclic: periodMs, shape: loop | pingpong | once
>
> This instantly gives every patch a "PhaseClock equivalent," but with correct authority.

**Key quote**:
```
TimeRoot outputs:
  • Signal:TimeMs (monotonic or local, depends on mode)
  • Signal:phase (0..1) — the canonical replacement for PhaseClock output
  • Event:pulse (optional, but you'll want it soon)
```

The spec says `phase`, not `phaseA`. The block definition is wrong.

### Per spec section 2 (PortIdentity.md)

**Should match by type, not name:**

> SlotId is the port's identity. Not label. Not index. Not "port name" inferred in compiler.
>
> If you ever want to rename a port label, you keep slotId stable and change only label.

The issue isn't that macros use `phase` - it's that the compiler requires exact string name matches instead of type-compatible resolution.

---

## Three Fixes, Three Timescales

### Fix 1: Unblock Build (Immediate - Hours)

**Goal**: Make TypeScript compile so tests can run.

**Scope**: Update all 70+ usages of `BindingEndpoint` to use `slotId` + `dir` instead of `port`.

**Files** (grep results):
- Test files: Update test data structures
- UI components: `BusChannel.tsx`, `BusInspector.tsx`, `BusPicker.tsx`, `PublishMenu.tsx`
- Compiler: `integration.ts`, `compileBusAware.ts`
- Stores: `PatchStore.ts`, `CompositeStore.ts`, `ModulationTableStore.ts`

**Pattern** (mechanical replacement):
```typescript
// Before
{ from: { blockId: 'block-1', port: 'out' } }

// After
{ from: { blockId: 'block-1', slotId: 'out', dir: 'output' } }
```

**Risk**: LOW - Mechanical search/replace. Tests will catch errors.

**Blocker**: NONE - Can proceed immediately.

---

### Fix 2: Make Macros Work (Short-term - Days)

**Two approaches, pick one:**



**Rationale**: Match the spec. TimeRoot should output canonical `phase`.

**Files to change**:
- `src/editor/blocks/time-root.ts:66` - Change output name
- `src/editor/compiler/blocks/domain/TimeRoot.ts:63` - Change output name


**Pros**:
- Aligns with spec exactly
- Fixes macro references automatically (they already use `phase`)
- Simpler mental model (one canonical phase signal)

**Cons**:
- May break existing patches that wire to `phaseA` explicitly
- Need migration or backward compat shim

#### Approach 2B: Rename macros `phase` → `phaseA` (24 occurrences)

**Rationale**: Match current block output names.

**Files to change**:
- `src/editor/macros.ts` - 24 occurrences of `fromSlot: 'phase'`

**Pros**:
- No breaking change to existing patches
- Smaller code change surface

**Cons**:
- Perpetuates naming inconsistency (phaseA vs phase)
- Doesn't align with spec
- Still requires TimeRoot to add missing outputs (wrap Event, etc.)

**Recommendation**: **Approach 2A** - Rename to `phase` per spec.

---

### Fix 3: Type-Based Port Resolution (Long-term - Weeks)

**Goal**: Match ports by type compatibility, not exact string names.

**Rationale**: Per spec section 2 (PortIdentity.md), the architectural issue is string-based port lookup. Even after fixing the immediate name mismatch, the system is fragile because:
- Port renames break wiring
- No type-based fallback
- Composite expansion can break references

**Implementation**:

1. **Add type resolution to compiler**:
```typescript
// Instead of: exact string match
const srcKey = keyOf(wireConn.from.blockId, wireConn.from.port);
const src = compiledPortMap.get(srcKey);

// Do: type-compatible resolution
const src = resolvePort(wireConn.from, compiledPortMap, {
  allowTypeMatch: true,  // If slotId not found, find compatible type
  preferExactMatch: true // Exact slotId wins if exists
});
```

2. **Implement `resolvePort()` logic**:
- First try exact `slotId` match
- If not found, search for compatible type (e.g., Signal<phase> matches Signal<phase>)
- Emit warning if using fallback resolution (helps debugging)

3. **Enforce at definition time**:
- Block definitions must declare stable `slotId` for all ports
- Composite definitions must provide `portMap` (external slotId → internal port)

**Scope**: New compiler module, integration with existing graph builder.

**Risk**: MEDIUM - Changes core compilation logic. Needs careful testing.

**Blocker**: Requires Fix 1 complete (build must work).

---

## Missing Validation (Spec Violations)

Beyond the immediate bug, these validations are missing:

### 1. Port Validation in compileBusAware.ts

**Current**: `compileBusAware.ts` does NOT validate that referenced ports exist.

**Compare with** `compile.ts:241-259`:
```typescript
// Validate outputs and store
for (const outDef of compiler.outputs) {
  const produced = outs[outDef.name];
  if (!produced) {
    errors.push({
      code: 'PortMissing',
      message: `Compiler did not produce required output port ${blockId}.${outDef.name}`,
      where: { blockId, port: outDef.name },
    });
  }
}
```

**Missing from compileBusAware.ts**: Same validation for block outputs.

### 2. SlotId Stability Validation

**Spec requirement**: SlotIds must be stable across block definition versions.

**Current**: No enforcement. Block definitions can add/remove/rename ports freely.

**Should add**:
- Version migration system for block definitions
- Deprecation warnings for removed slotIds
- Compile error if patch references deprecated slotId

### 3. Composite Port Map Validation

**Spec requirement** (section 4 of PortIdentity.md):
> CompositeDefinition must contain:
> - external slots (inputs/outputs) with slotIds
> - internal graph (nodes, edges)
> - portMap: where each external port goes internally

**Current**: No `portMap` in composite definitions. Expansion rewrites IDs without preserving addressability.


---

## Architectural Ambiguities

These questions should be clarified before Fix 3:

### Q1: Direction Inference

**Issue**: Some port references don't specify `dir` (input vs output).

**Examples**:
- Wire connections: `{ from: PortRef, to: PortRef }` - direction is implicit

**Question**: Should `PortRef` always require explicit `dir`, or can it be inferred from context?

**Spec says**: "PortRef = { blockId, slotId, dir }" - implies always explicit.

**Practical concern**: Redundant in wire connections (from is always output, to is always input).

**Recommendation**:
- Allow `dir` optional in wire `Connection` type (inferred from from/to position)

### Q2: Port Name vs SlotId

**Issue**: Current code mixes "port", "slotId", "portName" terminology.

**Spec says**: `slotId` is canonical identity.

**Question**: What about display labels? Can label differ from slotId?

**Example**:
```typescript
{ slotId: 'phaseA', label: 'Phase (0→1)' }
```

**Recommendation**:
- `slotId`: Stable machine identifier (never shown in UI)
- `label`: Human-readable display name (can change)
- Block definitions must provide both

### Q3: Macro Port References

**Issue**: Macros use temporary `ref` IDs during expansion:
```typescript
{ fromRef: 'time', fromSlot: 'phase' }
```

**After expansion**, `ref: 'time'` becomes real block ID like `block-88`.

**Question**: Should macro templates use:
- **Option A**: Generic port names (current - assumes block has that port)
- **Option B**: Type-based matching (resolve any output of type Signal<phase>)
- **Option C**: Explicit slotId from block definition (requires macro knows block internals)

**Spec guidance**: Option B aligns with type-based resolution.

**Recommendation**: Short-term use Option A (exact names), long-term migrate to Option B.

---

## Recommendations

### Immediate (This Sprint)

1. **Fix 1: Complete BindingEndpoint migration** (1-2 days)
   - Update all 70+ usages to `slotId` + `dir`
   - Run tests to verify no regressions
   - Priority: CRITICAL (build is broken)


   - Change `phaseA` → `phase` in block definition + compiler
   - Add backward compat for existing patches (map old `phaseA` wires to new `phase`)
   - Update macros if needed (most already use `phase`)
   - Priority: HIGH (unblocks macros)

3. **Add missing outputs to TimeRoot** (1 day)

   - Spec also mentions: `cycleT`, `cycleIndex` (defer if not needed yet)
   - Priority: MEDIUM (required for complete spec compliance)

### Next Sprint

4. **Fix 3: Type-based port resolution** (3-5 days)
   - Implement `resolvePort()` with type fallback
   - Add tests for port resolution edge cases
   - Priority: MEDIUM (architectural cleanup)

5. **Add validation to compileBusAware.ts** (1 day)
   - Port existence checks (like compile.ts has)
   - Emit `PortMissing` errors for undefined ports
   - Priority: MEDIUM (prevents cryptic errors)

### Future (Deferred)

6. **Composite port maps** (Major - separate epic)
   - Define `portMap` in composite definitions
   - Compiler resolves through composite boundaries
   - Priority: LOW (no composites in use yet)

7. **SlotId stability enforcement** (2-3 days)
   - Version migration system
   - Deprecation warnings
   - Priority: LOW (becomes important at 1.0)

---

## Workflow Recommendation

**PAUSE** - Before implementing anything:

### Clarify with user:



**Q2**: For the 70+ BindingEndpoint usages - are there existing patches in production that would break, or is this a development-only system?

**Q3**: Priority order - should we do quick fix (approach 2B) to unblock development, then clean up later? Or do it right the first time (approach 2A + type resolution)?

### Once clarified:

**CONTINUE** with:
1. Fix 1 (mechanical, low risk)
2. Chosen approach for Fix 2
3. Tests to verify macros work

---

## Evidence & References

### Files Read
- `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md` - Full port identity spec
- `design-docs/10-Refactor-for-UI-prep/3.5-PhaseClock-Fix.md` - TimeRoot should output `phase`
- `src/editor/macros.ts` - 24 occurrences of `fromSlot: 'phase'`

- `src/editor/compiler/blocks/domain/TimeRoot.ts` - Compiler outputs `phaseA` (line 63)
- `src/editor/types.ts` - BindingEndpoint already changed to slotId + dir
- `src/editor/compiler/compileBusAware.ts` - String-based port lookup (line 567)
- `src/editor/compiler/compile.ts` - Has port validation that compileBusAware.ts lacks

### Test Results
```bash
just test
# 70+ TypeScript errors - build fails before tests run
# All variants of: 'port' does not exist in type 'BindingEndpoint'
```

### Git Status
- Modified files show incomplete migration (some changed, some not)
- No untracked files in `.agent_planning/port-identity/` yet

---

## Success Criteria (Per Spec)

From `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md`, section 11:

### Coffin Nails Tests

   - ❌ Not tested (no test file exists)

2. **Composite swapping preserves bindings when slotIds unchanged**
   - ❌ Not tested
   - Requires: Composite replacement logic

3. **Diagnostics location stable**
   - ⚠️ Partially (diagnostics exist but may not use PortRef correctly)
   - Check: Do error messages use `{ blockId, slotId, dir }`?

4. **No document mutation during compile**
   - ✅ Already true (compiler doesn't mutate patch)
   - Verify: Hash patch before/after compile

### Additional Tests Needed

5. **Port name mismatch handling**
   - Macro references `phase`, block outputs `phaseA`
   - Should: Resolve by type compatibility OR emit clear error

6. **Missing port validation**
   - Reference to non-existent port should: Emit `PortMissing` error
   - Currently: Cryptic `UpstreamError: Missing upstream artifact`

---

## Eval Cache Update

Findings cached to `.agent_planning/eval-cache/`:

- **port-identity-issue.md** (FRESH):
  - BindingEndpoint incomplete migration (70+ errors)
  - phase vs phaseA mismatch root cause
  - Three fix approaches with tradeoffs

- **compiler-validation-gaps.md** (FRESH):
  - compileBusAware.ts missing port existence checks
  - No SlotId stability enforcement
  - No composite portMap validation

These findings are stable (architectural, not ephemeral) and can be reused by future evaluations.

---

**End of Status Report**
