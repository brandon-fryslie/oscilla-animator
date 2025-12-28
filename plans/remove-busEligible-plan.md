# Plan: Remove `busEligible` + Remove `last` Combine Mode (Junior Engineer Guide)

Goal: Remove `busEligible` from the type system and eliminate the `last` combine mode, replacing all validation with explicit combine‑mode compatibility checks. Keep UX unchanged.

Constraints
- No internal fallbacks on blocks.
- Default sources must exist for every input; missing defaults are compile errors.
- All work targets the NEW IR compiler + renderer only.

Deliverables
- `busEligible` removed everywhere (types, UI, compiler, tests).
- `last` removed from combine semantics and from any reserved bus definitions.
- A single shared “combine compatibility” utility used by compiler + UI.
- Updated tests covering multi‑publisher behavior.

---

## Workstream A: Type System Cleanup (remove `busEligible`)

1) Remove `busEligible` from TypeDesc types
- Files:
  - `src/editor/types.ts` (TypeDesc interface)
  - `src/editor/ir/types/TypeDesc.ts`
- Actions:
  - Delete `busEligible?: boolean` or `busEligible: boolean`.
  - Fix all TypeDesc construction sites by removing the field.
  - Update any “shape” tests in `src/editor/ir/types/__tests__/TypeDesc.test.ts`.

2) Remove `busEligible` from derived tables
- Files:
  - `src/editor/types.ts` (SLOT_TYPE_TO_TYPE_DESC)
  - `src/editor/semantic/index.ts` (type descriptor table)
  - Any other static TypeDesc maps
- Actions:
  - Delete `busEligible` entries.
  - Ensure TypeDesc maps still compile.

3) Remove helpers that reference `busEligible`
- Files:
  - `src/editor/types.ts` (e.g., `isBusEligible`)
  - `src/editor/semantic/index.ts`
  - `src/editor/ir/types/TypeDesc.ts`
- Actions:
  - Delete helpers and references.
  - Use new combine‑compatibility logic in Workstream B.

---

## Workstream B: Combine‑Mode Compatibility (replace eligibility)

1) Define a single combine compatibility module
- Create a new helper:
  - `src/editor/semantic/busCombineRules.ts` (recommended)
- API (example):
  - `isCombineAllowed(typeDesc: TypeDesc, combine: CombineMode, publisherCount: number): boolean`
  - `explainCombineError(typeDesc, combine, publisherCount): string`
- Rules:
  - Single publisher: always valid (any combine mode acceptable).
  - Multiple publishers: only allow combine modes explicitly designed for that type.
  - `last` mode should be removed completely (see Workstream C).

2) Replace compiler eligibility checks with combine compatibility
- Files:
  - `src/editor/compiler/passes/pass2-types.ts`
  - `src/editor/semantic/busContracts.ts`
- Actions:
  - Remove any `isBusEligible` gating.
  - Use `isCombineAllowed` + `publisherCount` instead.
  - Ensure reserved bus checks still validate `world/domain/category`.

3) Update UI + stores to use combine compatibility
- Files:
  - `src/editor/modulation-table/ModulationTableStore.ts`
  - `src/editor/stores/DefaultSourceStore.ts`
  - Any bus‑related UI gating
- Actions:
  - Remove `busEligible` checks.
  - If the UI filters bus options, filter by combine compatibility instead.
  - If there’s no UI filtering, remove gating entirely.

---

## Workstream C: Remove `last` Combine Mode

1) Remove `last` from combine definitions
- Files:
  - `src/editor/semantic/busContracts.ts` (reserved bus definitions)
  - Combine mode enums/types (search `CombineMode`, `combine:`)
  - Any schema files defining combine modes
- Actions:
  - Delete `last` from enums or union types.
  - Update any defaults or factories that set `last`.

2) Update any existing bus definitions or defaults using `last`
- Files:
  - `src/editor/stores/BusStore.ts` (default buses)
  - `src/editor/semantic/busContracts.ts`
  - Any bus seeding logic (search `combine: 'last'`)
- Actions:
  - Replace with another combine mode (likely `sum` or `or`) only if it preserves intended semantics.
  - If unclear, leave combine undefined but fail compile when multiple publishers exist.

3) Update error messages / diagnostics
- Files:
  - Any compiler errors referencing `last`
- Actions:
  - Ensure errors explain: “Multiple publishers require a combine mode compatible with this type.”

---

## Workstream D: Tests + Verification

1) Update tests that reference `busEligible`
- Files:
  - `src/editor/compiler/passes/__tests__/pass2-types.test.ts`
  - `src/editor/semantic/__tests__/busContracts.test.ts`
  - `src/editor/ir/types/__tests__/TypeDesc.test.ts`
- Actions:
  - Remove `busEligible` assertions.
  - Add combine‑compatibility tests.

2) Add tests for combine compatibility
- Suggested cases:
  - Single publisher on any type: OK.
  - Multiple publishers with compatible combine mode: OK.
  - Multiple publishers with incompatible combine mode: compile error.
  - Reserved bus type mismatch: compile error (still enforced).

3) Manual validation (DevTools only)
- Use DevTools console to compile a patch with:
  - Two publishers on a bus with a valid combine mode (success).
  - Two publishers on a bus with no combine mode (error).
  - Reserved bus type mismatch (error).

---

## Implementation Order (Suggested)
1) Workstream A (remove `busEligible`) to unblock build.
2) Workstream C (remove `last`) so combine rules are final.
3) Workstream B (combine compatibility) to enforce new rules.
4) Workstream D (tests + diagnostics).

---

## Acceptance Checklist
- `rg "busEligible"` returns no hits.
- `rg "last" src/editor` has no combine mode references.
- Compiler error for multi‑publisher buses without a compatible combine mode.
- Reserved bus types enforced without `busEligible`.
- Tests updated and pass (use DevTools to validate if tests are unreliable).
