# Cleanup Plan: Store Mutation Interface

**Goal:** Prepare `PatchStore` for the Transaction migration by isolating mutations and removing legacy action patterns.

## 1. Audit Direct Mutations
- [ ] Scan `PatchStore.ts` for actions that mutate `blocks` or `connections` arrays directly.
- [ ] Identify all "composite actions" (e.g., `replaceBlock` which does remove+add+rewire). These must be broken down for the Transaction Builder.

## 2. Standardize Action Signatures
- [ ] Refactor `addBlock`, `removeConnection`, etc., to take pure data objects (DTOs) rather than relying on inferred state.
- [ ] Ensure every mutation returns a clean status result (success/fail/ids) rather than void or complex objects.

## 3. Separate Query from Mutation
- [ ] Move query methods (e.g., `getBlocksByLane`) to a separate `PatchQuery` or `PatchSelector` helper, or clearly separate them in the store class.
- [ ] This separation makes it easier to implement `TxView` (which is pure query) later.

## 4. Remove Legacy Event Emissions
- [ ] Review `emitGraphCommitted` usage. Ensure it's called consistently at the *end* of atomic operations.
- [ ] Deprecate ad-hoc events like `BlockMoved` if they are not used by the history/diagnostics system.

## 5. Verification
- [ ] Verify: Every user action in the UI flows through a defined `PatchStore` action (no direct array manipulation in components).
