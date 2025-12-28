# Cleanup Plan: Validation & Semantics

**Goal:** Establish the `Validator` class as the undisputed source of truth for graph integrity, removing scattered checks.

## 1. Centralize Validation Logic
- [ ] Audit `PatchStore`, `BusStore`, and UI components (e.g., `Inspector`, `PatchBay`) for ad-hoc validation checks (e.g., `if (wires.length > 1) ...`).
- [ ] Replace ad-hoc checks with calls to `Validator.canAddConnection`, `Validator.validateAll`, etc.

## 2. Consolidate Diagnostic Codes
- [ ] Review `diagnostics/types.ts` and `semantic/validator.ts` to ensure `DiagnosticCode` enums are exhaustive and consistent.
- [ ] Remove magic strings in error messages; use the `Diagnostic` structure payload for variables (e.g., expected/actual types).

## 3. Remove "Soft" Compiler Checks
- [ ] The compiler currently repeats some validation logic (e.g., `validateTimeRootConstraint` inside `compile.ts`).
- [ ] Refactor the compiler pipeline to trust the `Validator` result (passed in or re-run) and fail fast, rather than re-implementing checks.

## 4. Semantic Graph Optimization
- [ ] Review `SemanticGraph` construction performance. Ensure it's efficient enough to run on every user interaction (hover/drag).
- [ ] Remove any unused indices or legacy graph traversal methods.

## 5. Verification
- [ ] Verify: UI prevents invalid connections using the exact same logic that the compiler uses to reject them.
- [ ] Verify: Diagnostics are clickable and point to the correct `primaryTarget`.
