# Plan: Port Catalog + Lowering Migration (Beginner-Friendly)

This plan is written for a teammate who is newer to the codebase. Follow the steps in order. Each step includes where to edit and what success looks like.

---

## Goal

Make Oscillator the canonical example for a future‑proof IR lowering architecture by:
- enforcing strict port contracts by default (opt‑out),
- migrating lowering to `inputsById` and `outputsById`,
- adding a typed port catalog helper.

---

## Step 1: Audit current lowering usage

**Why:** We must update all implementations that rely on positional `inputs[]` or return positional outputs without a map.

**What to inspect:**
- All files under `src/editor/compiler/blocks/**` that implement `BlockLowerFn`.
- `src/editor/compiler/passes/pass6-block-lowering.ts` (the caller).
- Tests that call `lower()` directly, especially `src/editor/compiler/__tests__/signal-math.test.ts`.

**Checklist:**
- Note each block that uses `inputs[0]` etc.
- Note which blocks return only `outputs: []` and do not return a map.
- Identify test files that construct `inputs` arrays manually.

**Deliverable:** A short list of files to update (you can keep this in your notes).

---

## Step 2: Add a typed PortCatalog helper

**Why:** Prevent drift by making it hard to define ports incorrectly.

**Edit:** `src/editor/blocks/portCatalog.ts`

**Add a helper:**
Create `definePortCatalog` that enforces:
- `inputOrder` keys are exactly the keys of `inputs`
- `outputOrder` keys are exactly the keys of `outputs`

Example shape:
```ts
export function definePortCatalog<const Inputs extends Record<string, PortSpec>, const Outputs extends Record<string, PortSpec>>(
  catalog: {
    inputs: Inputs;
    inputOrder: readonly (keyof Inputs)[];
    outputs: Outputs;
    outputOrder: readonly (keyof Outputs)[];
  }
) {
  return catalog;
}
```

**Update usage:**
Wrap the `OSCILLATOR_PORTS` object with `definePortCatalog(...)`.

**Success criteria:** TypeScript errors if any order list doesn't match the keys.

---

## Step 3: Make port contract strict by default + opt‑out

**Why:** Ensure editor and IR port lists never drift unless explicitly allowed.

**Edit:** `src/editor/compiler/passes/pass6-block-lowering.ts`

**Current behavior:** Enforces strict port contract only when `tags.irPortContract === 'strict'`.

**Change to:** Strict by default unless **opt‑out** tag is set:
- If `tags.irPortContract === 'relaxed'`, skip enforcement.
- Otherwise enforce port order match.

**Error format:** Use `IRValidationFailed` with a clear message that includes:
- block type and ID,
- editor input list vs IR input list,
- editor output list vs IR output list.

**Success criteria:**
- Oscillator (or any block) fails compilation with a clear error if port lists don't match.
- Blocks can opt‑out via `tags: { irPortContract: 'relaxed' }`.

---

## Step 4: Add `inputsById` and `outputsById` support

**Why:** This is the new future‑proof API. `inputs`/`outputs` arrays are legacy.

**Edit:** `src/editor/compiler/ir/lowerTypes.ts`

Changes:
- Add `inputsById?: Readonly<Record<string, ValueRefPacked>>` to `BlockLowerFn` args (already exists, keep optional).
- Add `outputsById?: Readonly<Record<string, ValueRefPacked>>` to `LowerResult` (keep optional during migration).

**Edit:** `src/editor/compiler/passes/pass6-block-lowering.ts`

Changes:
- Always build `inputsById` from inputs array + port definitions.
- Pass both `inputs` (positional) and `inputsById` (keyed) to `blockType.lower`.
- When mapping outputs:
  - If `result.outputsById` is present and non-empty, use it.
  - Otherwise fall back to positional `result.outputs`.

**Symmetry:** The migration path is the same for inputs and outputs:
- Legacy blocks use positional arrays
- Migrated blocks use `*ById` maps
- Pass6 supports both during transition

**Success criteria:**
- All lowerers compile with the new signature.
- `pass6` doesn't crash when a block returns only `outputs` or only `outputsById`.

---

## Step 5: Migrate Oscillator and a few reference blocks

**Why:** Provide canonical examples for new blocks.

**Edit:**
- `src/editor/compiler/blocks/signal/Oscillator.ts`
- `src/editor/compiler/blocks/signal/AddSignal.ts`
- `src/editor/compiler/blocks/signal/MulSignal.ts`
- `src/editor/compiler/blocks/signal/SubSignal.ts`

**Changes:**
- Replace positional `inputs[n]` with `inputsById.<port>`.
- Return **only** `outputsById` with keys matching output port IDs.
- Set `outputs: []` (empty) to signal this block is fully migrated.

Example:
```ts
const slot = ctx.b.allocValueSlot();
return {
  outputs: [],  // Legacy - empty for migrated blocks
  outputsById: { out: { k: 'sig', id: sigId, slot } }  // Future API
};
```

**Success criteria:**
- These blocks use only `inputsById`.
- These blocks return only `outputsById` (with empty `outputs`).

---

## Step 6: Update tests affected by the new signature

**Edit:** `src/editor/compiler/__tests__/signal-math.test.ts`

Changes:
- When calling `lower()`, pass `inputsById` in the args.
- Expect `outputsById` where appropriate.

**Success criteria:**
- Tests compile and pass.

---

## Step 7: Document the finalized pattern

**Edit:** `design-docs/_needs-review/Oscillator-Single-Source.md`

Update with:
- Port catalog usage.
- Strict‑by‑default contract and opt‑out tag.
- `inputsById` / `outputsById` usage (future API).
- `inputs` / `outputs` arrays (legacy, use empty `outputs: []` when migrated).

**Success criteria:**
- The Oscillator doc can be used as a "how‑to" for new block definitions.

---

## Notes

- Do not remove legacy behavior until all blocks are migrated.
- Keep error messages user‑readable; this feeds diagnostics.
- Avoid any changes to the legacy compiler path.
- `outputsById` is the future; `outputs` is legacy. Migrated blocks return `outputs: []`.
