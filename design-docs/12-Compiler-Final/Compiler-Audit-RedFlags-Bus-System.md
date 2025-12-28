# Compiler Audit — Bus System Red Flags

This file audits bus-related compilation/runtime logic. Items are ordered by severity.

## Critical

- **Event buses are not lowered to IR**
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:231`
  - **Detail:** `createDefaultBusValue()` only handles signal/field; event buses fall through to `null` with a warning.
  - **Impact:** Reserved bus `pulse` (`world: 'event'`) cannot be lowered, so any event bus listeners in IR mode will be missing values.

- **Bus evaluation in runtime only supports numeric signals**
  - **Location:** `src/editor/runtime/executor/steps/executeBusEval.ts:24`
  - **Detail:** `executeBusEval` reads `number` values and combines them as scalars. It does not handle vec2, color, or field buses.
  - **Impact:** If/when `busEval` steps are emitted, any non-number bus will fail or produce incorrect results.

## High

- **Field bus combination only supports `Field<number>` in runtime**
  - **Location:** `src/editor/runtime/field/Materializer.ts:1202`
  - **Detail:** `fillBufferCombine` throws unless `handle.type.kind === 'number'`.
  - **Impact:** Field buses for color/vec2/etc. are allowed by type constraints but cannot be materialized at runtime.

- **Legacy bus semantics contradict IR combine behavior for `layer`**
  - **Location:** `src/editor/semantic/busSemantics.ts:210` and `src/editor/compiler/passes/pass7-bus-lowering.ts:217`
  - **Detail:** `busSemantics` does not implement `layer` for fields (falls back to error), while IR lowering maps `layer` → `last` for field buses.
  - **Impact:** A patch can behave differently in legacy vs IR mode for the same bus combine mode.

- **Bus default values are inconsistent between legacy and IR**
  - **Location:** `src/editor/semantic/busSemantics.ts:170` vs `src/editor/compiler/passes/pass7-bus-lowering.ts:231`
  - **Detail:** Legacy combine only supports numeric default values for fields; IR creates const fields for any default value.
  - **Impact:** Same patch may fail in legacy mode but “work” in IR (or vice versa), masking type errors.

- **Publisher transform chains are ignored in IR bus lowering**
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:177`
  - **Detail:** TODO indicates publisher adapter/lens stacks are not applied.
  - **Impact:** Bus values in IR will be incorrect when publishers use adapters/lenses.

## Medium

- **Feature flag `busCompilation` is unused**
  - **Location:** `src/editor/compiler/featureFlags.ts:27`
  - **Detail:** The flag is defined but not referenced in compiler logic.
  - **Impact:** There is no supported way to disable bus compilation if needed for migration/testing.

- **Combine-mode compatibility is broader than runtime support**
  - **Location:** `src/editor/semantic/busContracts.ts:49`
  - **Detail:** Compatibility allows `color`/`vec2` buses with `layer`, but runtime/materializer only supports numeric combine.
  - **Impact:** Valid bus definitions can still fail at runtime in IR mode.

