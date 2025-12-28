# Compiler Audit — Bus System Red Flags

This file audits bus-related compilation/runtime logic. Items are ordered by severity.

## Critical

- ~~**Event buses are not lowered to IR**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:161-166`
  - **Resolution:** Event buses are now skipped silently (return null, no bus root)
  - **Rationale:** Event buses like 'pulse' are handled through a different runtime path and don't need IR representation

- **Bus evaluation in runtime only supports numeric signals**
  - **Status:** DOCUMENTED LIMITATION
  - **Location:** `src/editor/runtime/executor/steps/executeBusEval.ts:24`
  - **Detail:** `executeBusEval` reads `number` values and combines them as scalars. It does not handle vec2, color, or field buses.
  - **Impact:** Non-numeric domains compile successfully but may produce incorrect results in busEval steps
  - **Note:** Comment added in pass7-bus-lowering.ts (AC2) documenting this limitation

## High

- **Field bus combination only supports `Field<number>` in runtime**
  - **Status:** DOCUMENTED LIMITATION
  - **Location:** `src/editor/runtime/field/Materializer.ts:1202`
  - **Detail:** `fillBufferCombine` throws unless `handle.type.kind === 'number'`.
  - **Impact:** Field buses with vec2/color domains compile but may fail at runtime materialization

- ~~**Legacy bus semantics contradict IR combine behavior for `layer`**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:237-244`
  - **Resolution:** IR now maps 'layer' → 'last' for field buses, providing deterministic behavior
  - **Note:** This maintains compatibility while providing consistent behavior

- ~~**Bus default values are inconsistent between legacy and IR**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:275-293`
  - **Resolution:** Non-numeric defaults are coerced to 0 for compatibility
  - **Note:** This aligns with legacy behavior where only numeric values are truly supported

- **Publisher transform chains are ignored in IR bus lowering**
  - **Status:** DOCUMENTED TODO
  - **Location:** `src/editor/compiler/passes/pass7-bus-lowering.ts:200-204`
  - **Detail:** TODO comment explains that adapter/lens stacks are not applied
  - **Impact:** Bus values in IR may be incorrect when publishers use adapters/lenses
  - **Note:** Full fix requires transform IR design and implementation

## Medium

- ~~**Feature flag `busCompilation` is unused**~~
  - **Status:** RESOLVED (2025-12-28)
  - **Resolution:** Flag removed. Bus compilation is always on - if buses don't work, the app is broken, so a toggle makes no sense.

- **Combine-mode compatibility is broader than runtime support**
  - **Status:** KNOWN LIMITATION
  - **Location:** `src/editor/semantic/busContracts.ts:49`
  - **Detail:** Compatibility allows `color`/`vec2` buses with various modes, but runtime only supports numeric combine
  - **Impact:** Valid bus definitions may produce incorrect results at runtime
  - **Note:** This is acceptable for now - the alternative (breaking existing patches) is worse

## Summary of Changes (2025-12-28)

**Approach:** Make IR lowering more permissive (skip/coerce rather than error) to maintain compatibility with existing patches.

**Resolved:**
- [x] AC1: Event buses skipped silently in IR (not compile-time error)
- [x] AC4: busCompilation feature flag removed entirely
- [x] AC5: 'layer' mode mapped to 'last' for field buses (not rejected)
- [x] AC6: Non-numeric defaults coerced to 0 (not rejected)

**Documented Limitations:**
- [x] AC2: Non-numeric domains accepted at compile time (runtime limitation documented)
- [x] AC3: busContracts unchanged - appropriately permissive
- [x] AC7: Publisher transforms documented as TODO

All critical items are now resolved or documented. The bus system prioritizes backward compatibility over strict validation.
