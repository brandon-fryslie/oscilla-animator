# Bus and Slot Combine Unification Status

**Cached**: 2026-01-01
**Source**: project-evaluator STATUS-2026-01-01-050000.md
**Confidence**: HIGH
**Design Authority**: design-docs/now/01-MultiBlock-Input.md §1.1-1.3, §6.2

---

## Key Finding: Already Correctly Unified

**Bus.combineMode and Slot.combine are INTENTIONALLY DIFFERENT.**

The unification already exists at the **type level** (CombineMode), not the **field level**.

---

## What's Unified (Correct)

### Shared CombineMode Type (src/editor/types.ts:113-129)

```typescript
// Base type for buses (line 113)
export type BusCombineMode = 'sum' | 'average' | 'max' | 'min' | 'last' | 'layer';

// Extended type for slots (line 125) - superset of BusCombineMode
export type CombineMode =
  | BusCombineMode      // All bus modes
  | 'first'             // Input-only
  | 'error'             // Input-only
  | { kind: 'custom'; id: string };
```

**This IS the unification** - both use the same combine modes.

### Shared Reducer Implementations

Both Bus and Slot combine operations use:
- `src/editor/compiler/passes/combine-utils.ts` - `createCombineNode()`
- Same IR combine nodes
- Same runtime reducers

---

## What's Different (Intentional)

### Bus: Simple Direct Mode (Line 172)

```typescript
export interface Bus {
  combineMode: BusCombineMode;  // Direct mode, no wrapper
}
```

**Why**: Buses ALWAYS combine publishers when N > 1. No "when" policy needed.

### Slot: Rich Policy Wrapper (Line 667)

```typescript
export interface Slot {
  combine?: CombinePolicy;
}

export type CombinePolicy =
  | { when: 'multi'; mode: CombineMode }   // Only combine when N >= 2
  | { when: 'always'; mode: CombineMode }  // Always reduce
  | { when: 'multi'; mode: 'error' };      // Forbid multi-input
```

**Why**: Input slots need:
1. `when: 'multi' vs 'always'` semantics
2. `mode: 'error'` to forbid multi-input
3. Support for 'first' mode (not available for buses)

---

## Design Intent (from spec)

From `design-docs/now/01-MultiBlock-Input.md`:

**§1.1**: "A single unified enum, used by both inputs and buses"
- ✅ Achieved via CombineMode type

**§1.2**: "Every input Slot must declare a combine policy"
- ✅ Achieved via CombinePolicy wrapper

**§6.2**: "They use the same reducer implementations and type rules, but they are distinct sites"
- ✅ Different usage sites justify different field structures

---

## Why NOT to Unify Field Names

### 1. Type Safety Loss

**Current (type-safe)**:
```typescript
function createBus(combineMode: BusCombineMode) { ... }
// Can't pass 'error' or 'first' - compile error
```

**After unification (type-UNsafe)**:
```typescript
function createBus(combine: CombinePolicy) {
  if (combine.when === 'always') throw new Error();  // Runtime check
  if (combine.mode === 'error') throw new Error();   // Runtime check
  if (combine.mode === 'first') throw new Error();   // Runtime check
}
```

### 2. Added Complexity

Every bus usage site would need to:
- Unwrap `bus.combine.mode` instead of `bus.combineMode`
- Validate policy constraints at runtime
- Filter UI options (can't show 'error' or 'first')

### 3. Violates Design Spec

Spec explicitly states buses and inputs are "distinct sites" with shared reducers, not identical structures.

---

## Files Using Bus.combineMode (18 locations)

**Type Definitions** (1 file):
- `src/editor/types.ts:172`

**Bus Store** (6 locations):
- `src/editor/stores/BusStore.ts:99,103-109,125,149,216`

**Compiler** (6 locations):
- `src/editor/compiler/passes/pass7-bus-lowering.ts:274`
- `src/editor/compiler/compileBusAware.ts:242,489,498,1088,1090`

**Semantic** (5 locations):
- `src/editor/semantic/busContracts.ts:20,41,53,65,77,89,100,241,266`
- `src/editor/semantic/validator.ts:445,583,604`

**UI** (3 files):
- `src/editor/BusInspector.tsx:294`
- `src/editor/BusChannel.tsx:183`
- `src/editor/BusCreationDialog.tsx:13,57-67,281,302,360,466`

**Transaction System** (3 locations):
- `src/editor/kernel/TransactionBuilder.ts:218,224`
- `src/editor/kernel/types.ts:116`
- `src/editor/kernel/ops.ts:94`

**Tests**: 20+ files

---

## Recommendation

**DO NOT UNIFY FIELD NAMES** - system is already correctly designed.

**If unification is requested anyway**:
1. Ask user to clarify what problem they're solving
2. Explain that CombineMode type IS the unification
3. Show the type safety and complexity costs of field unification
4. Reference design spec §6.2

---

## Usage Notes for Evaluators

**When seeing Bus.combineMode vs Slot.combine**:
- This is CORRECT by design
- The unification is at the CombineMode type level
- Different wrappers serve different purposes
- Do NOT flag as "inconsistency" or "cleanup needed"

**When evaluating combine-related bugs**:
- Both use createCombineNode() from combine-utils.ts
- Both use same IR combine nodes
- Check if bug is in shared reducer vs policy logic
