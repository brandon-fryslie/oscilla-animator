# Plan: IR Schema Unification (ADR-001)

**Status**: Ready for Implementation
**Date**: 2026-01-02

## Objective
Implement `ADR-001` by standardizing `CompiledProgramIR` as the authoritative immutable source of truth, aligning naming with `SignalExpr`/`FieldExpr` specs, and enforcing a strictly schedule-driven execution model.

## Phase 1: Schema & Types Hardening
- [ ] **Refactor `src/editor/compiler/ir/program.ts`**
    - [ ] Update `CompiledProgramIR` interface to match tightened ADR definition.
    - [ ] Change `irVersion` to `number`.
    - [ ] Define `SlotMetaTable` as a dense array indexed by `SlotId`.
    - [ ] Rename `signalTable` to `signalExprs`, `fieldTable` to `fieldExprs`, `eventIR` to `eventExprs`.
    - [ ] Remove `defaultSources` field (move to normalization pass).
    - [ ] Ensure `RenderIR`, `CameraTable`, and `MeshTable` are marked as assets for schedule steps.
- [ ] **Update `src/editor/compiler/ir/types.ts`**
    - [ ] Define `ConstPool` (JSON + typed arrays).
    - [ ] Ensure `SigExprId`, `FieldExprId`, `EventExprId` are strictly `number`.

## Phase 2: Runtime & Execution Contract
- [ ] **Audit & Refactor Runtime Executors**
    - [ ] `executeSignalEval.ts`: Change `program.signalTable` access to `program.signalExprs`. Ensure it only runs based on `StepSignalEval`.
    - [ ] `executeEventBusEval.ts`: Align with `eventExprs` naming.
    - [ ] `executeTimeDerive.ts`: Ensure it writes to explicitly defined `SlotId`s from the program.
- [ ] **Implement Enforcement**
    - [ ] Add runtime assertions/logs to ensure no "table scanning" (walking expr tables outside of schedule steps).

## Phase 3: Builder Transformation (Finalization)
- [ ] **Implement `finalizeCompiledProgram` in `src/editor/compiler/ir/finalizer.ts`**
    - [ ] Topological sort and schedule validation.
    - [ ] Map `BuilderProgramIR` (Map-based) to `CompiledProgramIR` (Dense Array-based).
    - [ ] Deduplicate and serialize constants into `ConstPool`.
    - [ ] Allocate dense `SlotId`s and populate `SlotMetaTable`.
    - [ ] Verify referential integrity (all IDs resolved).
    - [ ] Verify data-flow integrity (initialized reads).
- [ ] **Update `compileBusAware.ts`**
    - [ ] Insert normalization pass to inject `DefaultSource` blocks before IR lowering.
    - [ ] Call `finalizeCompiledProgram` as the final step.

## Phase 4: Verification & Cleanup
- [ ] **Fix TypeScript Errors**: Resolve the 278+ errors by strictly adhering to the new schema.
- [ ] **Invariant Verification**: Ensure `compiledAt` does not leak into cache keys or determinism logic.
- [ ] **Unit Tests**: Add tests for the finalizer to ensure dense ID stability and referential integrity.
