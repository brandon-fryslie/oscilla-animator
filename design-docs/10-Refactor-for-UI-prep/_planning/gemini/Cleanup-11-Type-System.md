# Cleanup Plan: Type System & DTOs

**Goal:** Eliminate redundant type definitions and enforce strict mapping between Editor and Compiler types.

## 1. Converge Type Descriptors
- [ ] Review `TypeDesc` (Editor) vs `ValueKind` (Compiler).
- [ ] `SLOT_TYPE_TO_TYPE_DESC` and `VALUE_KIND_TO_TYPE_DESC` are bridges. Ensure they are complete and bijective where possible.
- [ ] Ideally, deprecate `ValueKind` strings in favor of `TypeDesc` objects everywhere, or strictly generate `ValueKind` from `TypeDesc`.

## 2. Clean Up `types.ts`
- [ ] Remove unused types (e.g., legacy `LaneName`, `TypeDescriptor` alias).
- [ ] Organize `types.ts` into logical sections (Graph, Bus, Block, UI) or split into files.

## 3. Standardize Artifact Types
- [ ] Ensure `Artifact` discriminated union covers all `TypeDesc` domains.
- [ ] Remove ad-hoc "magic string" artifact kinds if any exist.

## 4. Strict Null Checks
- [ ] Review all `?` optional fields in DTOs. If a field should always be present (e.g., `id`), remove the optional modifier and fix the creation logic.

## 5. Verification
- [ ] Verify: `tsc` passes with `strict: true`.
- [ ] Verify: No `any` casts in the core compiler pipeline (or at least minimizing them).
