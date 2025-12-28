# Plan: Remove `busEligible` (Junior Engineer Guide)

Goal: Remove the `busEligible` flag from the type system and shift bus validation to combine-mode semantics.

## Scope
- Remove `busEligible` from type definitions and derived tables.
- Remove all eligibility checks based on `busEligible`.
- Replace with a combine‑mode compatibility check (type + combine mode) so any type can connect to a bus, but multi‑publisher buses must use a valid combine mode.

## Workstream 1: Type System Cleanup
1. **Remove `busEligible` from type definitions**
   - `src/editor/types.ts` (TypeDesc interface)
   - `src/editor/ir/types/TypeDesc.ts`
2. **Remove `busEligible` from type maps**
   - `src/editor/types.ts` `SLOT_TYPE_TO_TYPE_DESC`
   - `src/editor/semantic/index.ts` type descriptor table
3. **Remove `isBusEligible` helpers**
   - `src/editor/types.ts`
   - `src/editor/semantic/index.ts`
   - `src/editor/ir/types/TypeDesc.ts`

## Workstream 2: Compiler Validation Changes
1. **Replace bus eligibility checks in the compiler**
   - `src/editor/compiler/passes/pass2-types.ts` currently rejects bus types via `isBusEligible`.
   - Replace with a new function: `isCombineModeAllowed(typeDesc, combineMode)`.
2. **Define combine‑mode rules**
   - Implement a central compatibility table (recommended location: `src/editor/semantic/busSemantics.ts` or new `busCombineRules.ts`).
   - Rules: single publisher is always valid; multiple publishers require a defined combine mode.
3. **Update reserved bus validation**
   - `src/editor/semantic/busContracts.ts`: remove the `busEligible` comparisons.
   - Ensure reserved bus types still validate against type/world/domain and combine mode only.

## Workstream 3: Editor/UI + Stores
1. **Remove UI gating that checks `busEligible`**
   - `src/editor/modulation-table/ModulationTableStore.ts`
   - Any logic that hides bus options based on `busEligible` should be replaced with combine‑mode compatibility checks (or removed if buses are always allowed).
2. **Update DefaultSourceStore usage**
   - `src/editor/stores/DefaultSourceStore.ts` uses `busEligible` in a derived type; remove it.
3. **Update tests in UI/store layers**
   - Update any tests that assert `busEligible` presence or behavior.

## Workstream 4: Tests + Diagnostics
1. **Update unit tests**
   - `src/editor/compiler/passes/__tests__/pass2-types.test.ts`
   - `src/editor/semantic/__tests__/busContracts.test.ts`
   - `src/editor/ir/types/__tests__/TypeDesc.test.ts`
   - Any tests asserting `busEligible` fields must be revised or removed.
2. **Add tests for combine‑mode compatibility**
   - Validate that multiple publishers on unsupported combine modes produce a compile error.
   - Validate that single‑publisher buses always compile.

## Implementation Notes
- This change is *behavioral*: bus gating shifts from “type eligibility” to “combine compatibility.”
- Start by removing `busEligible` from types, then fix compile errors.
- Introduce a single source of truth for combine compatibility so UI and compiler can share the same logic.
- Do NOT change UX: only underlying validation and typing.

## Acceptance Checklist
- No references to `busEligible` remain in the codebase.
- Compiler allows any type to connect to a bus.
- Compiler rejects only invalid combine mode usage (multi‑publisher + unsupported combine mode).
- Reserved bus contracts still enforce correct type and combine mode.
- All tests updated or replaced accordingly.

