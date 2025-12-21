# Port Identity Issue

**Cached**: 2025-12-21 (project-evaluator)
**Confidence**: HIGH (architectural finding, stable)
**Source**: Port identity investigation

---

## The Core Issue

**BindingEndpoint interface changed but usages not updated.**

### Interface Definition (CHANGED)
```typescript
// src/editor/types.ts:164-170
export interface BindingEndpoint {
  readonly blockId: BlockId;
  readonly slotId: string;  // ← Was: port
  readonly dir: 'input' | 'output';  // ← NEW
}
```

### Usages (NOT UPDATED - 70+ locations)
Still use old API: `{ blockId, port }` instead of `{ blockId, slotId, dir }`

**Affected files**:
- Tests: `bus-compilation.test.ts`, `field-bus-compilation.test.ts`, `bus-diagnostics.test.ts`
- UI: `BusChannel.tsx`, `BusInspector.tsx`, `BusPicker.tsx`, `PublishMenu.tsx`
- Compiler: `integration.ts`, `compileBusAware.ts`
- Stores: `PatchStore.ts`, `CompositeStore.ts`, `ModulationTableStore.ts`

**Result**: TypeScript compilation fails with 70+ errors before tests can run.

---

## The Macro Bug (Underlying Issue)

Even after fixing the build, macros fail with:
```
UpstreamError: Missing upstream artifact for block-88:phase [block-89.phase]
```

### Root Cause Chain

1. **Macros reference generic `phase` name** (24 occurrences in `macros.ts`):
   ```typescript
   { fromRef: 'time', fromSlot: 'phase', toRef: 'osc', toSlot: 'phase' }
   ```

2. **CycleTimeRoot outputs `phaseA`** (not `phase`):
   - Block definition: `src/editor/blocks/time-root.ts:66`
   - Compiler: `src/editor/compiler/blocks/domain/TimeRoot.ts:63`

3. **Compiler uses string-based lookup**:
   ```typescript
   const srcKey = keyOf(blockId, port);  // "block-88:phase"
   const src = compiledPortMap.get(srcKey);  // Doesn't find "block-88:phaseA"
   ```

4. **No type-based fallback** - Exact string match required.

---

## The Design Spec's Answer

### What TimeRoot Should Output

Per `design-docs/10-Refactor-for-UI-prep/3.5-PhaseClock-Fix.md`:

```
TimeRoot outputs:
  • Signal:TimeMs (monotonic or local)
  • Signal:phase (0..1) — the canonical replacement for PhaseClock
  • Event:pulse (optional)
```

**Key point**: Should be `phase`, not `phaseA`.

### How Port Resolution Should Work

Per `design-docs/10-Refactor-for-UI-prep/2-PortIdentity.md`:

> **SlotId is the port's identity.** Not label. Not index. Not "port name" inferred in compiler.
>
> If you ever want to rename a port label, you keep slotId stable and change only label.

**Implication**: System should support type-based port resolution, not require exact string matches.

---

## Three Fix Approaches

### Fix 1: Complete BindingEndpoint Migration (Immediate)

**Scope**: Update 70+ usages to use `slotId` + `dir`.

**Effort**: 1-2 days (mechanical search/replace)

**Risk**: LOW (tests will catch errors)

**Blocks**: Everything (build currently broken)

---

### Fix 2A: Rename CycleTimeRoot Output (Recommended)

**Change**: `phaseA` → `phase` in block definition + compiler

**Rationale**: Aligns with spec. Macros already use `phase`.

**Files**:
- `src/editor/blocks/time-root.ts:66`
- `src/editor/compiler/blocks/domain/TimeRoot.ts:63`

**Pros**:
- Spec-compliant
- Fixes macro references automatically
- Simpler mental model (one canonical phase)

**Cons**:
- May break existing patches wiring to `phaseA`
- Need migration/compat shim

---

### Fix 2B: Rename Macro References (Pragmatic)

**Change**: 24 occurrences in `macros.ts` from `phase` → `phaseA`

**Rationale**: Match current implementation.

**Pros**:
- Smaller code change
- No breaking changes

**Cons**:
- Perpetuates naming inconsistency
- Doesn't align with spec
- Still need to add missing TimeRoot outputs

---

### Fix 3: Type-Based Port Resolution (Architectural)

**Goal**: Match ports by type compatibility, not exact string names.

**Implementation**:
```typescript
function resolvePort(
  ref: PortRef,
  compiledPortMap: Map<string, Artifact>,
  options: {
    allowTypeMatch: boolean,  // If slotId not found, find compatible type
    preferExactMatch: boolean // Exact slotId wins if exists
  }
): Artifact | undefined
```

**Scope**:
1. Add type resolution to compiler graph builder
2. Emit warnings when using fallback (helps debugging)
3. Enforce slotId stability in block definitions

**Effort**: 3-5 days

**Risk**: MEDIUM (changes core compilation)

**Blocks**: Requires Fix 1 complete

---

## Validation Gaps

### Missing from compileBusAware.ts

**Port existence validation** (exists in compile.ts, missing in compileBusAware.ts):

```typescript
// compile.ts has this (lines 241-259):
for (const outDef of compiler.outputs) {
  const produced = outs[outDef.name];
  if (!produced) {
    errors.push({
      code: 'PortMissing',
      message: `Compiler did not produce required output port`,
      where: { blockId, port: outDef.name },
    });
  }
}

// compileBusAware.ts LACKS this check
```

**Impact**: Cryptic `UpstreamError` instead of clear `PortMissing` error.

---

## Reuse Guidance

**When evaluating port-related issues:**
1. Check if BindingEndpoint migration is complete (currently: NO)
2. Check if port lookup is string-based or type-based (currently: string-based)
3. Check if TimeRoot outputs match spec (currently: NO - outputs `phaseA` instead of `phase`)

**When implementing port fixes:**
- Fix 1 is prerequisite for everything (build must work)
- Fix 2A recommended over 2B (aligns with spec)
- Fix 3 is architectural cleanup (can defer if time-constrained)

**Fresh validation needed if:**
- Block definitions change port names
- Composite expansion logic changes
- New bus bindings added
