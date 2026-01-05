# V2 Migration Deep Audit: "Harvesting the Future"

This document provides a granular, file-by-file analysis of the codebase to identify V2-ready components versus legacy "toxic" artifacts. 

## 1. The V2 Pure Kernel (HARVEST: 100%)
These files are the foundational "New Architecture". They contain no closures, use explicit IR, and are ready for V2.

### A. Core Types (`src/core/*`)
*   **`index.ts`**: Re-exports. ✅
*   **`types.ts`**: The unified `TypeDesc`, `World`, `Domain` system. This is the source of truth. ✅
*   **`rand.ts`**: Deterministic PRNG. ✅

### B. IR Specification (`src/editor/compiler/ir/*`)
*   **`builderTypes.ts`**: Types for the IR builder. ✅
*   **`buildSchedule.ts`**: Converts IR DAG into a linear execution schedule. ✅
*   **`fieldExpr.ts`**: Field expression AST nodes. ✅
*   **`signalExpr.ts`**: Signal expression AST nodes. *Note: Remove `closureBridge` variant in V2.* ⚠️
*   **`opcodes.ts`**: Standard VM opcodes. ✅
*   **`program.ts`**: Top-level Compiled Program structure. ✅
*   **`schedule.ts`**: Step-level IR definitions. ✅
*   **`renderIR.ts`**: Data-driven rendering contract. ✅
*   **`IRBuilderImpl.ts`**: The main factory for emitting IR. ✅

### C. Lowering Logic (`src/editor/compiler/blocks/*`)
These are the "Block Compilers" that emit IR. 
*   **`defaultSources/*.ts`**: All clean. They emit `sigConst` or `fieldConst`. ✅
*   **`signal/Oscillator.ts`**: Fully migrated to IR opcodes. ✅
*   **`domain/DomainN.ts`, `domain/GridDomain.ts`**: Fully migrated. ✅
*   **`rhythm/EnvelopeAD.ts`**: Migrated to stateful signal ops. ✅
*   *Toxic Alert*: Check `TriggerOnWrap.ts.tmp` or any `.tmp` files. ❌ DISCARD.

---

## 2. Reusable State & Infrastructure (HARVEST: 90%)
The MobX state layer is mostly clean, but needs minor surgery to remove legacy compiler entry points.

### A. Stores (`src/editor/stores/*`)
*   **`RootStore.ts`**: Ties everything together. Keep structure, but prune legacy computed values (like `selectedBus`). ✅
*   **`PatchStore.ts`**: Manages the graph. CLEAN. It uses `NormalizedGraph` which is the correct V2 input. ✅
*   **`DefaultSourceStore.ts`**: Manages user-edited constants. ✅
*   **`HistoryStore.ts` / `TransactionStore.ts`**: The undo/redo and semantic kernel logic. Essential. ✅
*   **`DiagnosticStore.ts`**: Maps compiler errors to UI. Keep, but ensure it only listens to V2 events. ✅

### B. Events & Logging (`src/editor/events/*`, `src/editor/logStore.ts`)
*   Fully harvestable. These use standard patterns and are decoupled from the compiler implementation. ✅

---

## 3. The Hybrid / Transition Layer (REFACTOR)
These components work but contain "Legacy Fallback Garbage" or "Bridges" that must be stripped in V2.

### A. Compiler Entry Point (`src/editor/compiler/*`)
*   **`compile.ts`**: The pipeline is good (Pass 1-8), but remove the `try/catch` fallback to legacy logic.
*   **`pure-operator-ast.ts`**: REFACTOR. Strip `closureBridge` and `isClosure` checks.
*   **`debugSampler.ts`**: ❌ **TOXIC**. This assumes artifacts are functions. V2 debugging uses `TraceController`.

### B. Runtime Engine (`src/editor/runtime/*`)
*   **`executor/ScheduleExecutor.ts`**: This is the V2 runner. HARVEST. ✅
*   **`executor/RuntimeState.ts`**: Manages ValueStore and StateBuffer. HARVEST. ✅
*   **`executor/IRRuntimeAdapter.ts`**: The bridge to the Player. ✅
*   **`integration/SignalBridge.ts`**: ❌ **TOXIC**. Temporary bridge for closure-based signals. DISCARD.
*   **`signal-expr/SigEvaluator.ts`**: The VM for signals. HARVEST, but strip `evalClosureBridge`. ⚠️
*   **`field/Materializer.ts`**: VM for fields. REFACTOR to remove `signalBridge` support. ⚠️

---

## 4. Toxic Legacy Garbage (DISCARD)
Do NOT bring these files into V2. They represent the "Closure Ball" era.

*   **`src/editor/runtime/signal-expr/LegacyClosure.ts`** ❌
*   **`src/editor/runtime/signal-expr/ClosureRegistry.ts`** ❌
*   **`src/editor/runtime/signal-expr/MigrationTracking.ts`** ❌
*   **`src/editor/compiler/passes/pass9-codegen.ts.wip`** ❌
*   **`src/editor/compiler/v2adapter.ts`** (If exists) ❌
*   **`src/editor/compiler/compileBusAware.ts`** (Old logic) ❌

---

## 5. Granular Block Migration Status

| Block Category | Migration Status | Reusable? | Note |
| :--- | :--- | :--- | :--- |
| **Math** | 100% IR | YES | Add, Mul, Sub, etc. |
| **Signal** | 100% IR | YES | Oscillator, Shaper, ColorLFO |
| **Domain** | 100% IR | YES | DomainN, GridDomain, Instances2D |
| **Rhythm** | 100% IR | YES | PulseDivider, EnvelopeAD |
| **Debug** | Hybrid | NO | `DebugDisplay` relies on closures. |
| **Composites**| N/A | YES | They expand to primitives. |

---

## 6. Migration Strategy for V2

### Phase 1: The Clean Kernel
1.  Initialize V2 with `src/core`.
2.  Copy `src/editor/compiler/ir` (spec) and `src/editor/runtime/executor` (runner).
3.  Copy `src/editor/runtime/signal-expr` and `src/editor/runtime/field`. **Immediately delete all files containing "Legacy" or "Bridge"**.
4.  Remove `closureBridge` from `signalExpr.ts` and `SigEvaluator.ts`.

### Phase 2: Block Compilers
1.  Copy `src/editor/blocks` (metadata).
2.  Copy `src/editor/compiler/blocks` (lowerers).
3.  Rewrite `DebugDisplay` compiler to use IR `Print` opcodes instead of closure side-effects.

### Phase 3: The State Layer
1.  Copy MobX stores. 
2.  In `RootStore`, remove any references to `BusStore` (old) or manual bus orchestration.
3.  In `CompilerService` (`integration.ts`), enforce `strictIR: true` and remove all legacy fallback paths.

### Phase 4: UI Reconstruction
1.  Copy `src/editor/components` and `PatchBay.tsx`.
2.  Update `PreviewPanel` to **only** use the IR-based `canvasRenderer.renderFrame` path.
3.  Delete `canvasRenderer.render` (legacy command tree path).

## Key "Red Flag" Patterns to Grep for in V2:
*   `artifact.value as Function`
*   `Artifact` where kind is not a string literal from the new spec.
*   `closureBridge`
*   `signalBridge`
*   `BlockCompiler` (interface)
*   `compileLegacyBlock`
