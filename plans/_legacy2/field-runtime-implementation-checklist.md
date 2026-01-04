# Field Runtime Implementation Checklist (Technical)

## P0: Hard error on signal fallback
- [ ] In `src/editor/runtime/field/Materializer.ts`, change `evalSig()` fallback:
  - If no `irEnv`/`irNodes` and no `signalBridge`, throw with a message:
    - “Signal evaluation unavailable; compiler must emit signal IR or provide a bridge.”
- [ ] Verify error includes context (sigId or op name) where possible.

## P0.5: No silent default source fallback
- [ ] Audit compiler default source flow:
  - If a block input is missing and there is no defaultSource, emit a compile error.
  - If a defaultSource exists, wire it into the IR explicitly.
- [ ] Ensure runtime never injects default values for missing inputs.

## P1: Compiler default source handling (Field Ops)
- [ ] Identify field ops that currently rely on params:
  - JitterVec2, Vec2Rotate, Vec2Scale, Vec2Translate, Vec2Reflect
  - FieldMap/FieldZip ops using `k`, `a`, `b`, `seed`, etc.
- [ ] Update compiler field lowering to emit explicit field inputs:
  - For each op param:
    - If a signal input exists: emit `FieldExprBroadcastSig`.
    - Else if a defaultSource exists: emit `FieldExprConst` or `broadcastSig`.
  - Ensure `FieldExprIR` nodes reference these inputs (no params bag).
- [ ] Update field op IR shape if needed:
  - Prefer n‑ary op nodes in runtime (`args: FieldExprId[]`), not params.

## P2: Remove legacy params code
- [ ] Remove `readParamNumber()` and all uses in `src/editor/runtime/field/Materializer.ts`.
- [ ] Remove `params?: Record<string, unknown>` from:
  - `src/editor/compiler/ir/fieldExpr.ts` (FieldExprMap/Zip)
  - `src/editor/runtime/field/types.ts` (FieldExpr handles)
- [ ] Remove any compiler emission of params into field IR.

## P3: Update audit docs
- [ ] Mark resolved items in the field runtime audit doc.
- [ ] Document the new field‑op input model (explicit field inputs).

## Validation (DevTools)
- [ ] Compile + run patch using JitterVec2 default inputs only.
- [ ] Compile + run patch using Vec2Rotate default inputs only.
- [ ] Compile + run patch using Vec2Scale default inputs only.
- [ ] Confirm no “silent 0s”, no missing input warnings.
