# Cleanup Plan: Runtime State

**Goal:** Externalize all state to prepare for robust hot-swapping and "time travel" debugging.

## 1. Identify Closure State
- [ ] Audit all block compilers. Look for variables declared *outside* the returned signal function but *inside* `compile()`.
- [ ] Example: `let accumulator = 0;` inside a compiler closure.
- [ ] Tag these for migration to `StateHandle`.

## 2. Standardize RuntimeCtx
- [ ] Ensure `RuntimeCtx` is the only argument passed to signal functions (besides `tMs`).
- [ ] Remove any other "side channel" access to global state.

## 3. Remove "Magic" Globals
- [ ] Grep for `Math.random()` in runtime code. Replace with seeded random from `ctx` or pre-computed values.
- [ ] Grep for `Date.now()` (unless it's for performance monitoring). Time must come from `tMs`.

## 4. Prepare State Registry
- [ ] Define the `StateKey` interface (stable ID).
- [ ] Create a "Mock" state store to test the API before full implementation.

## 5. Verification
- [ ] Verify: Re-running `compile()` produces a *new* program instance with *fresh* closure state (currently). This confirms we identified the state correctly.
- [ ] Verify: No `Math.random()` calls in the runtime loop.
