# V2 Migration Analysis

This document outlines the analysis of the `oscilla-animator_codex` codebase to support a clean V2 implementation based on the new IR Compiler architecture.

## Executive Summary

The codebase is already in a transition state. The "New Compiler" (IR-based) is implemented alongside legacy components. A significant portion of the code (`src/core`, `src/editor/stores`, `src/editor/components`, `src/editor/compiler/ir`) is reusable and forms the foundation of V2. The "Legacy Fallback Garbage" is confined mostly to specific parts of the compiler pipeline and outdated debug tools.

## 1. Core & Types (KEEP)
**Status:** ✅ Clean
**Path:** `src/core`
*   **Analysis:** Contains fundamental types (`TypeDesc`, `Domain`, `Signal`, `Field`) and utilities (`rand`). These are pure data/logic and essential for the new architecture.
*   **Action:** Copy entirely.

## 2. Editor State & Logic (KEEP)
**Status:** ✅ Clean
**Path:** `src/editor/stores`, `src/editor/events`, `src/editor/transactions`
*   **Analysis:** MobX stores (`RootStore`, `PatchStore`, etc.) manage the graph state and UI state. They interface with the compiler but do not contain legacy compiler logic themselves.
*   **Action:** Copy entirely. Verify `PatchStore` doesn't inadvertently trigger legacy paths (it triggers `CompilerService` which we control).

## 3. UI Components (KEEP)
**Status:** ✅ Clean
**Path:** `src/editor/components`, `src/editor/PatchBay.tsx`, `src/editor/Editor.tsx`
*   **Analysis:** React components are largely decoupled from the runtime implementation. `PatchBay.tsx` uses the stores to render the graph.
*   **Action:** Copy entirely. Ensure `PatchBay` connects to the correct stores in the new app.

## 4. Block Definitions (KEEP)
**Status:** ✅ Clean
**Path:** `src/editor/blocks`
*   **Analysis:** Block definitions (e.g., `signal.ts`, `math/add.ts`) use `createBlock` and are metadata-driven. They do *not* contain `compile:` properties with legacy closures (verified in `signal.ts`).
*   **Action:** Copy entirely.

## 5. Compiler (MIXED)
**Status:** ⚠️ Mixed
**Path:** `src/editor/compiler`

### A. The New IR Core (KEEP)
*   **`ir/`**: The heart of the new architecture (`Schedule`, `SignalExpr`, `FieldExpr`).
    *   *Note*: `ir/signalExpr.ts` contains `SignalExprClosureBridge` marked as "TEMPORARY". This should be stripped or unused in V2.
*   **`blocks/`**: The "Block Compilers" (Lowering logic) that emit IR. Essential.
*   **`passes/`**:
    *   `pass1` to `pass5`: Standard graph analysis. Keep.
    *   `pass6-block-lowering.ts`: The bridge to IR. Confirmed to *not* have legacy fallbacks. Keep.
    *   `pass8-link-resolution.ts`: Wiring. Keep.

### B. The Legacy Artifacts (DISCARD/REFACTOR)
*   **`debugSampler.ts`**: ❌ **DISCARD**. Relies on `Artifact` being a function (closure), which is the old model. The new debugger works differently.
*   **`pure-operator-ast.ts`**: ⚠️ **REFACTOR**. Contains the `closureBridge` type. This file validates that blocks compile to "Pure ASTs". It is useful, but the bridge type should be removed.
*   **`pass9-codegen.ts.wip`**: ❌ **DISCARD**. Likely abandoned or old.
*   **`v2adapter.ts`**: ❌ **DISCARD** (Already seems deleted, but ensure it stays gone).

### C. Entry Points (KEEP)
*   **`compile.ts`**: The V2 pipeline definition. Keep.
*   **`integration.ts`**: MobX glue. Keep.

## 6. Runtime (KEEP)
**Status:** ✅ Clean (mostly)
**Path:** `src/editor/runtime`
*   **Analysis:**
    *   `executor/`: Contains `ScheduleExecutor`, the V2 runner.
    *   `signal-expr/`, `field/`: Runtime implementations of IR.
    *   `canvasRenderer.ts`: Has an IR mode. Ensure legacy "command" mode is not the primary path.
    *   `player.ts`: The loop. Needs to be wired to `IRRuntimeAdapter`.
*   **Action:** Copy, but ensure the entry point uses `IRRuntimeAdapter` and `ScheduleExecutor`.

## 7. Tests (FILTER)
**Status:** ⚠️ Mixed
**Path:** `src/test`
*   **Analysis:** Likely contains a mix of tests for old and new systems.
*   **Action:** Port tests gradually. Prioritize tests that import from `compiler/ir` or `runtime/executor`.

## Migration Plan

1.  **Scaffold V2**: Create new project structure.
2.  **Lift Core**: Move `src/core`.
3.  **Lift Definitions**: Move `src/editor/blocks`.
4.  **Lift New Compiler**: Move `src/editor/compiler` (excluding `debugSampler.ts`, `pass9`, `pure-operator-ast.ts` adjustments).
5.  **Lift Runtime**: Move `src/editor/runtime`.
6.  **Lift State & UI**: Move `src/editor/stores`, `components`, `PatchBay.tsx`.
7.  **Wire Up**: Ensure `main.tsx` -> `App.tsx` -> `Editor` -> `CompilerService` flows through the new `compile.ts` pipeline.

## Specific "Red Flags" to Watch For
*   Any code importing `BlockCompiler` (legacy interface).
*   Any code assuming `Artifact.value` is a `function`.
*   Any code using `ClosureRegistry` (legacy bridge).
*   `compileBusAware` (legacy stub).
