# Workstream 1: Type Contracts + IR Plumbing

**Goal:** Stabilize the canonical type system and IR plumbing so other workstreams can build on a consistent contract. This stream also fixes defaultSource materialization and link resolution correctness.

## Scope

- Unify TypeDesc across editor + compiler IR.
- Enforce adapter/lens application during IR lowering.
- Make defaultSource materialization consistent in IR (signal/field/scalar).
- Harden Pass 8 link resolution so unresolved references are a hard failure.

## Dependencies

- None (this stream is foundational).

## Primary References

- `plans/SPEC-06-type-system.md` (type unification, adapters, lenses)
- `plans/SPEC-08-default-sources.md` (default sources materialization)
- `plans/SPEC-09-compiler-passes.md` (pass6/pass8 fixes)

## Key Files + Line Anchors

- `src/editor/types.ts:25-164` (canonical editor TypeDesc + domains)
- `src/editor/compiler/ir/types.ts:16-84` (IR TypeDesc currently separate)
- `src/editor/compiler/passes/pass6-block-lowering.ts:256-345` (defaultSource handling + inputsById + strict port contract)
- `src/editor/compiler/passes/pass8-link-resolution.ts:89-185` (createDefaultRef, input/output roots)

## Plan

### 1) Unify TypeDesc between editor and compiler

**Goal:** One authoritative TypeDesc shape; remove drift between `src/editor/types.ts` and `src/editor/compiler/ir/types.ts`.

Steps:

1. Update `src/editor/compiler/ir/types.ts:16-84` to re-export TypeDesc (and domain/world unions) from `src/editor/types.ts`.
   - This should eliminate duplicate TypeDesc definitions.
   - Keep IR-specific types (ValueSlot, BusIndex) local to `compiler/ir/types.ts`.

2. Audit imports for `TypeDesc` in compiler code; shift to the canonical import source.
   - Example targets: `src/editor/compiler/ir/fieldExpr.ts`, `src/editor/compiler/ir/signalExpr.ts`, `src/editor/compiler/ir/lowerTypes.ts`.

3. If `TypeDomain`/`TypeWorld` are needed by compiler-only code, import them from `src/editor/types.ts` instead of re-defining.

**Notes:**
- Use the domains from `src/editor/types.ts:90-130` (including `expression` and `waveform`) as canonical.
- Confirm that editor/IR domain naming matches (avoid `timeMs` vs `time`, etc.).

### 2) Enforce adapter + lens application in Pass 6

**Goal:** Inputs are adapted and lenses applied during IR lowering, not ignored.

Steps:

1. In `src/editor/compiler/passes/pass6-block-lowering.ts:256-345`, extend input resolution to apply:
   - Wire lenses (if present on connections).
   - Adapter registry conversions (from wire type to port type).

2. Add a typed utility in `pass6-block-lowering.ts` to:
   - Resolve the source ValueRef (wire or bus listener).
   - Apply lens transformations (scale, clamp, map, etc.).
   - Apply adapters to reach the port’s expected TypeDesc.

3. Ensure that adapters/lenses produce **new IR nodes** (sigMap/fieldMap etc.) and register slots.

**Notes:**
- The target behavior is described in `plans/SPEC-06-type-system.md`.
- Keep any transform-chain IDs consistent with existing `TransformChainId` usage.

### 3) DefaultSource materialization consistency

**Goal:** Ensure defaultSource works for signal/field/scalar in all lowering paths.

Steps:

1. In `src/editor/compiler/passes/pass6-block-lowering.ts:296-319`, confirm:
   - Signal defaultSource generates sigConst + slot registration.
   - Field defaultSource generates fieldConst + slot registration.
   - Scalar defaultSource writes into const pool and returns scalar ref.

2. In `src/editor/compiler/passes/pass8-link-resolution.ts:152-185`, ensure createDefaultRef is aligned with pass6 behavior:
   - Scalar must remain const pool refs (do not treat as signal).
   - Non-numeric signal defaults should be supported (use const pool as needed).

3. Add a single shared helper used by both pass6 and pass8 (if feasible), or tightly align behavior and document in comments.

### 4) Harden Pass 8 link resolution

**Goal:** Unresolved links are immediate compile errors with actionable context.

Steps:

1. In `src/editor/compiler/passes/pass8-link-resolution.ts:89-185`, add validation for:
   - Inputs that resolve to null/undefined ValueRefs.
   - Output slots missing registrations.
   - Bus roots with missing publisher slots.

2. Emit `CompileError` entries with `blockId`, `portId`, and error codes aligned with diagnostics.

3. Ensure errors are surfaced from Pass 8 to the final compiler output (no silent warnings).

## Deliverables

- Compiler uses a single canonical TypeDesc definition.
- Adapters + lenses apply correctly during IR lowering.
- defaultSource is materialized consistently across pass6 and pass8.
- Pass 8 fails fast on unresolved references and emits diagnostic metadata.

## Validation (No Tests)

- Use Chrome DevTools MCP to load a patch with:
  - An adapted wire (number -> phase01).
  - A lens on a wire (scale/bias).
  - Unconnected optional inputs with defaultSource.
- Confirm runtime no longer emits missing input errors for defaultSource cases.

