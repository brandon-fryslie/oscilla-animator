# WS-1: Core Type System & ValueKind Repair (blocking)

## Scope
Bring compiler ValueKind and IR type conversion into alignment with the new int/float split and phase-as-semantics approach.

## Files & Tasks
- [ ] Update ValueKind union to include int variants.
  - `src/editor/compiler/types.ts:199`
  - Add missing entries: `Scalar:int`, `Signal:int`, `Field:int` (and any other int variants already used elsewhere).
  - Ensure comments remain accurate (ValueKind is the compiler compatibility axis).

- [ ] Ensure ValueKind mapping consistency across semantic layer.
  - `src/editor/semantic/index.ts:325` (VALUE_KIND_TO_TYPE_DESC)
  - This map already references `Scalar:int`, `Field:int`, `Signal:int`. No new behavior needed, but verify the union change makes these keys legal.

- [ ] Fix domain string conversion map to avoid invalid domains and duplicate keys.
  - `src/editor/ir/types/typeConversion.ts:210`
  - Change `Phase: 'phase'` → `Phase: 'float'` (phase is semantics on float).
  - Remove duplicate `unit` key (currently defined twice).
  - Keep `phase`/`phase01` mapping to `float` (already correct).

- [ ] Validate domain parser fallback/ValueKind fallback logic still matches new domains.
  - `src/editor/ir/types/typeConversion.ts:305` (`domainFromString`)
  - `src/editor/ir/types/typeConversion.ts:356` (`typeDescToValueKind`)
  - Confirm no explicit references to `phase` domain remain (phase should be float+semantics).

## Notes
- This workstream unblocks other fixes by making `Scalar:int` / `Signal:int` legal ValueKinds and by ensuring domain parsing accepts only real domains.
- If you find other ValueKind strings used in code but missing from the union, add them here (keep the union authoritative).
