# Compiler Operational Backlog (Groomed from SPEC-00..11)

**Purpose:** Actionable backlog to make the current IR compiler/runtime operational. This is *not* a forward‑looking spec; it is a verified gap list with implementation tasks.

**Legend**
- **Status:** Confirmed / Partial / Needs verification / Likely resolved
- **Priority:** P0 (blocking) / P1 / P2 / P3

---

## P0 — Blocking (Confirmed)

### P0.1 Emit bus evaluation steps in schedule
- **Status:** Confirmed
- **Evidence:** `src/editor/compiler/ir/buildSchedule.ts` comment: StepBusEval not emitted.
- **Impact:** Bus values never computed; listeners get nothing.
- **Action:** Thread busRoots from pass7 into BuilderProgramIR and emit StepBusEval in schedule build.
- **Dependencies:** Pass7 bus lowering.

### P0.2 Field transform chains are unimplemented
- **Status:** Confirmed
- **Evidence:** `src/editor/runtime/field/Materializer.ts` throws `transform chain evaluation not implemented`.
- **Impact:** Any field lens/transform crashes at runtime.
- **Action:** Implement transform chain evaluation in materializer and support in transforms table.

### P0.3 Field reduce is placeholder (closureBridge)
- **Status:** Confirmed
- **Evidence:** `src/editor/compiler/ir/IRBuilderImpl.ts` uses `closureBridge` for `reduceFieldToSig`.
- **Impact:** Field reductions are incorrect/unsupported in IR mode.
- **Action:** Add proper IR node for field reduce + runtime evaluator.

### P0.4 Path field materialization only supports const
- **Status:** Confirmed
- **Evidence:** `src/editor/runtime/executor/steps/executeMaterializePath.ts` errors if field node is not const.
- **Impact:** Dynamic path fields fail.
- **Action:** Implement non-const path field evaluation and flattening if needed.

### P0.5 Adapters/lenses unsupported in IR mode
- **Status:** Confirmed
- **Evidence:** `src/editor/compiler/passes/pass7-bus-lowering.ts` and `pass8-link-resolution.ts` emit `UnsupportedAdapterInIRMode`.
- **Impact:** Any adapter/lens chain breaks IR compilation.
- **Action:** Add adapter and lens evaluation in IR or provide equivalent lowering in pass6/7/8.

---

## P1 — Core Features (Confirmed/Partial)

### P1.1 Field-signal combination primitives
- **Status:** Confirmed
- **Evidence:** `JitterFieldVec2`, `FieldMapVec2`, `FieldHueGradient` throw in IR lowering.
- **Impact:** Common animated field operations can’t lower to IR.
- **Action:** Implement `FieldExprZipSig`, `FieldExprMapIndexed` (or equivalent kernels) and update affected blocks.

### P1.2 Color ops (HSL → RGB) for FieldHueGradient
- **Status:** Confirmed
- **Evidence:** `FieldHueGradient` IR lowering throws due to missing ops.
- **Impact:** No IR support for gradient color generation.
- **Action:** Add color conversion opcode/kernel and lower `FieldHueGradient`.

### P1.3 Event bus evaluation in schedule
- **Status:** Partial
- **Evidence:** Event bus step exists in runtime (`executeEventBusEval`), but bus eval steps aren’t emitted at all.
- **Impact:** Event buses still non-functional without schedule emission.
- **Action:** Same fix as P0.1; ensure event buses are wired too.

### P1.4 Render z-order support
- **Status:** Likely missing
- **Evidence:** Render assembly uses `z: 0` in `executeRenderAssemble` (check `src/editor/runtime/executor/steps/executeRenderAssemble.ts`).
- **Impact:** Render order undefined.
- **Action:** Thread z-order from compile-time sinks to runtime assembly.

---

## P2 — Gaps / Quality Issues (Needs Verification)

### P2.1 Domain identity propagation in hashing
- **Status:** Needs verification
- **Evidence:** Spec claims fallback behavior for hash/id; verify `FieldHash01ById` IR runtime uses stable IDs.
- **Action:** Confirm IR uses real domain element IDs; fix if fallback is used.

### P2.2 Cache invalidation after hot-swap
- **Status:** Needs verification
- **Evidence:** Spec notes stale handles after swap.
- **Action:** Trace runtime swap path and confirm field/signal caches reset.

### P2.3 Non-numeric field combine
- **Status:** Needs verification
- **Evidence:** Specs imply only numeric field combine works; check `fieldZip` and transforms.
- **Action:** Confirm support for color/path/string fields; add kernels if missing.

### P2.4 PostFX passes (Canvas)
- **Status:** Confirmed
- **Evidence:** `src/editor/runtime/canvasRenderer.ts` warns and skips `postfx`.
- **Impact:** Post-processing effects unavailable.
- **Action:** Implement canvas postfx pipeline or disable UI affordances.

---

## Likely Resolved / Partial (Confirm Before De‑scoping)

### R.1 TimeModel propagation from TimeRoot
- **Status:** Likely resolved
- **Evidence:** `pass3-time.ts` extracts TimeModel and `pass6` sets it via `builder.setTimeModel`.
- **Action:** Verify runtime time resolution uses `timeModel` correctly.

### R.2 Stateful signal ops (PulseDivider / EnvelopeAD)
- **Status:** Partial
- **Evidence:** `SigEvaluator.ts` contains implementations for `pulseDivider`, `envelopeAD`, `delayFrames`, `integrate`.
- **Action:** Confirm IR lowering uses these op IDs and state layout matches runtime.

### R.3 Default sources materialization
- **Status:** Partial
- **Evidence:** `pass6` and `pass8` now create defaults; confirm consistency for all worlds (signal/field/scalar/special).
- **Action:** Validate defaults in IR mode for representative blocks.

---

## Type System / Infrastructure

### T.1 TypeDesc fragmentation
- **Status:** Needs verification
- **Evidence:** Multiple TypeDesc definitions exist in editor vs compiler IR.
- **Impact:** Mismatched type handling in IR vs editor.
- **Action:** Decide whether to unify or enforce a bridge; document a single source of truth.

---

## Suggested Execution Order
1) P0.1 Bus eval schedule emission
2) P0.2 Field transform chains
3) P0.3 Field reduce node + runtime evaluator
4) P0.4 Path field materialization
5) P0.5 Adapters/lenses in IR
6) P1 field-signal primitives + color ops
7) P1 render z-order
8) P2 verifications / polish

---

## Sources
- `plans/SPEC-00-missing-primitives-index.md`
- `plans/SPEC-01-field-signal-combination.md`
- `plans/SPEC-02-field-runtime.md`
- `plans/SPEC-03-signal-runtime.md`
- `plans/SPEC-04-render-pipeline.md`
- `plans/SPEC-05-time-architecture.md`
- `plans/SPEC-06-type-system.md`
- `plans/SPEC-07-bus-system.md`
- `plans/SPEC-08-default-sources.md`
- `plans/SPEC-09-compiler-passes.md`
- `plans/SPEC-10-export-pipeline.md`
- `plans/SPEC-11-debug-system.md`
