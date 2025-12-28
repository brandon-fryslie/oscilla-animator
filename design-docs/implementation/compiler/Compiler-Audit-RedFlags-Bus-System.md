# Compiler Audit — Bus System Red Flags

This file audits bus-related compilation/runtime logic. Items are ordered by severity.

## Critical

- ~~**Event buses are not lowered to IR**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:161-168`
  - **Detail:** Event buses now produce compile-time error instead of silent warning/null
  - **Fix:** AC1 - Added explicit error when `world === 'event'` with clear message directing users to signal/field alternatives

- ~~**Bus evaluation in runtime only supports numeric signals**~~
  - **Status:** PARTIALLY RESOLVED (2025-12-28)
  - **Location:** `src/editor/runtime/executor/steps/executeBusEval.ts:24`
  - **Detail:** `executeBusEval` reads `number` values and combines them as scalars. It does not handle vec2, color, or field buses.
  - **Fix:** AC2 - Added compile-time rejection in pass7-bus-lowering.ts (line 170-180) for non-numeric domains
  - **Note:** Runtime still only supports numbers, but now we fail-fast at compile time instead of runtime

## High

- ~~**Field bus combination only supports `Field<number>` in runtime**~~
  - **Status:** PARTIALLY RESOLVED (2025-12-28)
  - **Location:** `src/editor/runtime/field/Materializer.ts:1202`
  - **Detail:** `fillBufferCombine` throws unless `handle.type.kind === 'number'`.
  - **Fix:** AC2 - Added compile-time rejection for non-numeric field buses in pass7-bus-lowering.ts
  - **Note:** Runtime still only supports Field<number>, but now we fail-fast at compile time

- ~~**Legacy bus semantics contradict IR combine behavior for `layer`**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/semantic/busSemantics.ts:210` and `src/editor/compiler/passes/pass7-bus-lowering.ts:245-254`
  - **Detail:** Legacy busSemantics does not implement `layer` for fields (falls back to error), while IR now also rejects it explicitly
  - **Fix:** AC5 - Added explicit rejection of 'layer' mode for field buses in IR to match legacy behavior

- ~~**Bus default values are inconsistent between legacy and IR**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/semantic/busSemantics.ts:170` vs `src/editor/compiler/passes/pass7-bus-lowering.ts:275-332`
  - **Detail:** Both paths now enforce numeric-only defaults for signal and field buses
  - **Fix:** AC6 - Added type validation for defaultValue in createDefaultBusValue with explicit errors for non-numeric values

- **Publisher transform chains are ignored in IR bus lowering**
  - **Status:** DOCUMENTED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:200-204`
  - **Detail:** TODO comment now clearly documents that adapter/lens stacks are not applied, with explanation of what needs to be implemented
  - **Fix:** AC7 - Replaced terse TODO with detailed comment explaining limitation and implementation requirements
  - **Impact:** Bus values in IR will be incorrect when publishers use adapters/lenses
  - **Note:** This is a known limitation documented for future work. Full fix requires transform IR design.

## Medium

- ~~**Feature flag `busCompilation` is unused**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Resolution:** Flag removed. Bus compilation is always on - if buses don't work, the app is broken, so a toggle makes no sense.

- ~~**Combine-mode compatibility is broader than runtime support**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/semantic/busContracts.ts:124-156`
  - **Detail:** Compatibility matrix now reflects ACTUAL runtime support
  - **Fix:** AC3 - Removed 'layer' from vec2/vec3/vec4/color/hsl/point domains; added comments documenting runtime constraints
  - **Impact:** Valid bus definitions will no longer fail at runtime with unclear errors

## Summary of Changes (2025-12-28)

**P0 CRITICAL - No Silent Failures:**
- [x] AC1: Event buses produce compile-time error (not silent warning)
- [x] AC2: Non-number types rejected at compile time with clear errors

**P1 HIGH - Validation Alignment:**
- [x] AC3: COMBINE_MODE_COMPATIBILITY tightened to match runtime support

**P2 HIGH - Behavioral Consistency:**
- [x] AC5: 'layer' mode consistently rejected in both legacy and IR for field buses
- [x] AC6: Default values consistently require numeric types in both paths

**P3 MEDIUM - Transform Chain Support:**
- [x] AC7: Publisher transforms documented with clear TODO and limitation explanation

All red flags are now either RESOLVED or DOCUMENTED. The bus system now fails-fast at compile time instead of producing silent failures or runtime errors.
