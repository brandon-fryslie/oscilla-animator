# Cleanup Plan: Time Architecture

**Goal:** Remove all legacy time handling mechanisms and strictly enforce `TimeRoot` as the single source of truth for time topology.

## 1. Remove Legacy Player Looping
- [ ] Remove `LoopMode` logic from `Player.ts`. The player should strictly follow the `TimeModel` provided by the compiler.
- [ ] Deprecate/Remove `setLoopMode` and `getLoopMode` from `Player` API.
- [ ] Remove `finiteLoopMode` fallback logic; finite/cyclic/infinite behavior is fully defined by the `TimeModel`.

## 2. Eliminate PhaseClock Remnants
- [ ] Grep for any remaining `PhaseClock` string references or imports in the codebase.
- [ ] Ensure no legacy `PhaseClock` blocks exist in default libraries or templates.
- [ ] Verify that all legacy patches utilizing `PhaseClock` are migrated or flagged (if migration logic exists).

## 3. Unify Time Semantics
- [ ] Refactor `RuntimeCtx` to potentially carry `TimeModel` metadata if needed for debug/viz, but ensure `tMs` is the only driving signal.
- [ ] Review `TimeConsole` UI component. It should derive its state strictly from the `TimeModel` (e.g., showing a progress bar for 'finite', a ring for 'cyclic', a window for 'infinite') rather than player internal state.

## 4. TimeRoot Block Polish
- [ ] Ensure `TimeRoot` blocks are "sealed" against illegal connections (validated by `Validator`, but code should be clean).
- [ ] Remove any `paramSchema` from `TimeRoot` definitions if `DefaultSource` inputs are fully covering the configuration.

## 5. Verification
- [ ] Verify: Changing `TimeRoot` variant correctly updates the Player's behavior (e.g., stopping at end of Finite vs looping in Cyclic).
- [ ] Verify: `systemTime` output is strictly monotonic in the compiler logic.
