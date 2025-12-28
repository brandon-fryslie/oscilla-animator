# Cleanup Plan: Bus System

**Goal:** Productionalize the `BusStore` and compiler integration, removing experimental features and enforcing strict contracts.

## 1. Remove Legacy "Auto-Connect"
- [ ] Review `PatchStore.ts` for any "magic" auto-wiring logic that bypasses the explicit `autoBusPublications` / `autoBusSubscriptions` definitions.
- [ ] Ensure all auto-connections are driven strictly by the `BlockDefinition` metadata or `TimeRoot` compiler logic.

## 2. Unify Publisher Sorting
- [ ] Ensure `sortKey` handling is centralized in `busSemantics.ts`.
- [ ] Remove any ad-hoc sorting in `BusStore` or `BusViz` components; they should call the shared semantic helper.
- [ ] Validate that `sortKey` is deterministic (stable tie-breaking by ID).

## 3. Strict Reserved Bus Enforcement
- [ ] Review `BusStore.createDefaultBuses`. Ensure it strictly matches `RESERVED_BUS_CONTRACTS`.
- [ ] Add runtime checks (in addition to `Validator` checks) to prevent accidental mutation of reserved bus properties (e.g., renaming `phaseA`).

## 4. BusStore Polish
- [ ] Refactor `BusStore` to cleaner Action/Query separation if needed (preparing for Transaction migration).
- [ ] Remove unused methods (e.g., legacy single-lens accessors if `lensStack` is fully adopted).
- [ ] Ensure `migrations` (like `migrateLegacyLenses`) are run once and then code is clean.

## 5. Verification
- [ ] Verify: Reserved buses cannot be deleted or retyped.
- [ ] Verify: Publishers are always sorted deterministically in the compiled artifact.
