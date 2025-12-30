# Plan: Default Sources as Hidden, Allowlisted Blocks

**Audience:** Junior engineer with no context, no internet.  
**Verification:** Use `just dev` + UI/DevTools checks; do **not** rely on tests.

This plan makes **all** “default sources” be **hidden provider blocks** so an input’s fallback can be e.g. an `Oscillator` producing a sine wave. **The current constant-default behavior becomes a hidden `Const` provider block** (constant over time). The provider blocks:
- are not shown in PatchBay
- are not listed in the library
- cannot accept wires from normal blocks (“no public inputs”)
- can only read from global time/buses and internal constant defaults
- are restricted by a single, explicit allowlist

The implementation is designed to avoid special-case duplication:
- Authoring stores a compact “provider attachment” per input.
- Compilation lowers attachments into an **injected hidden graph** so both compilers see normal blocks/wires/listeners.

---

## 0) Goals (what “done” looks like)

1) Any input slot that has a default can use an allowlisted **Default Source Provider** block (e.g., `Oscillator`) as its fallback when undriven.  
   - “Constant” is just the allowlisted `Const` provider block for that slot type.  
2) Provider blocks are configurable in a limited way (e.g., oscillator `shape/amplitude/bias`), but **cannot** be wired from the visible patch.  
3) Provider blocks may depend only on:
   - global buses (e.g., `phaseA`, `energy`, `palette`, `progress`), and/or
   - time signals (via those buses), and/or
   - internal constant values (edited via existing default-value controls, but implemented as inputs on the hidden provider blocks).  
4) There is one central allowlist file; no scattered hardcoded rules.
5) Legacy compiler and IR compiler produce consistent behavior (no “ignored default” mode).

---

## 1) Current state (what exists today)

### 1.1 Default sources are literal values (not programs)
- Store: `src/editor/stores/DefaultSourceStore.ts`
  - Holds `DefaultSourceState` objects (`id/type/value/uiHint`).
  - Created when a block is added (`createDefaultSourcesForBlock`).
- UI: `src/editor/Inspector.tsx` (`DefaultSourcesSection`)
  - Shows sliders/number/etc when an input is undriven.
- Compiler (legacy): `src/editor/compiler/compileBusAware.ts`
  - Resolves input as Wire → Bus Listener → DefaultSource constant.
  - Reads user-edited values via a `defaultSourceValues[\"blockId:slotId\"]` map.
- Compiler (IR): `src/editor/compiler/passes/pass1-normalize.ts`
  - Independently attaches default sources for unwired inputs (constant-only).
  - Does not understand “default source as block”.

### 1.2 Key limitation
Default sources cannot be time-varying or bus-driven except via ad-hoc future mechanisms. You can’t say: “if this input is unwired, use a sine wave”.

---

## 2) Core design: “Default Source Attachment” + “Injected Hidden Graph”

We add a new authoring concept:
- **DefaultSourceAttachment**: attaches to a specific input port and selects a provider block instance.

Then at compile time we lower it into normal graph primitives:
- **Injected hidden blocks**
- **Injected wires** from provider output → target input
- **Injected listeners** from global bus → provider input (when required)

This keeps compilation semantics unified:
- Both compilers already understand blocks, wires, and listeners.
- We avoid introducing a new “magic default” mechanism inside compilers.

---

## 3) Data model (authoring-time)

Add a dedicated module: `src/editor/defaultSources/types.ts`

### 3.1 Attachment identity
Each attachment targets exactly one input port:
```ts
export type DefaultSourceTarget = Readonly<{
  blockId: string;
  slotId: string; // input slot id
}>;
```

### 3.2 Provider model (block-only)
**All** default sources are provider blocks; there is no “literal” provider.

“Constant” defaults are implemented with allowlisted **Const provider blocks** whose output type matches the target slot type (e.g., `DSConstSignalFloat`, `DSConstFieldVec2`, etc.).

```ts
export type DefaultSourceProvider = Readonly<{
  providerId: string;     // stable id for the hidden provider block instance
  blockType: string;      // must be allowlisted
  outputPortId: string;   // which provider output feeds the target input
  // limited user config: per-provider-input constant overrides
  // (values live in DefaultSourceStore, keyed by providerId + inputId)
  editableInputSourceIds: Readonly<Record<string, string>>;
}>;
```

### 3.3 The attachment record
```ts
export type DefaultSourceAttachment = Readonly<{
  target: DefaultSourceTarget;
  provider: DefaultSourceProvider;
}>;
```

### 3.4 Where attachments live in the patch
Add a new patch field (do NOT overload existing `defaultSources` list):
- `Patch.defaultSourceAttachments: DefaultSourceAttachment[]`

Keep `Patch.defaultSources: DefaultSourceState[]` as the constant-value table (already exists).

Why separate?
- `defaultSources` stays a simple “constants table” (also used by lens params later).
- “default sources as blocks” stays isolated in one dedicated concept.

---

## 4) Allowlist (single source of truth)

Create: `src/editor/defaultSources/allowlist.ts`

This file is the **only** place to declare which block types may be used as default source providers.

### 4.1 Spec format
```ts
export type DefaultSourceProviderBlockSpec = Readonly<{
  blockType: string;
  label: string;
  outputPortId: string;
  // inputs that are allowed to be user-configurable (must have defaultSource metadata in the block def)
  editableInputs: readonly string[];
  // bus-fed inputs (must be satisfied only from global buses)
  busInputs: Readonly<Record<string, string>>; // inputSlotId -> busName (e.g. phase -> phaseA)
}>;

import { DEFAULT_CONST_PROVIDER_BLOCKS } from './constProviders';

export const DEFAULT_SOURCE_PROVIDER_BLOCKS: readonly DefaultSourceProviderBlockSpec[] = [
  // “Constant” defaults (one entry per supported slot type)
  ...DEFAULT_CONST_PROVIDER_BLOCKS,
  {
    blockType: 'Oscillator',
    label: 'Oscillator (Sine/LFO)',
    outputPortId: 'out',
    editableInputs: ['shape', 'amplitude', 'bias'],
    busInputs: { phase: 'phaseA' },
  },
  // add more later
];
```

Implementation note (to avoid “random const blocks” everywhere):
- Put the const-provider family + mapping in one file, e.g. `src/editor/defaultSources/constProviders.ts`.
- `allowlist.ts` should import that list and spread it into `DEFAULT_SOURCE_PROVIDER_BLOCKS` (as shown).

### 4.2 Eligibility rules (enforced centrally)
In `src/editor/defaultSources/validate.ts`, enforce:
- blockType must exist in registry (`getBlockDefinition`)
- provider output port exists and is type-compatible with target slot type
- every declared `editableInputs` exists and has `slot.defaultSource` metadata (so UI can render controls)
- every declared `busInputs` exists and its busName exists in `BusStore` (by name)
- provider block has **no other required inputs** besides those satisfied by `busInputs` or `editableInputs`

If any rule fails: show a diagnostic and fall back to a safe **Const provider block** for the target slot type.

---

## 4.3 Const provider blocks (required)
To satisfy “ALL default sources are hidden blocks”, **constant defaults must be implemented as blocks**, not as a compiler-side “literal fallback”.

### 4.3.1 What a Const provider block is
A const provider block is a tiny internal primitive that:
- has one editable input: `value`
- has one output: `out`
- outputs `out = value` (pure pass-through)

Because the provider block is injected and cannot be wired from the visible patch, `value` behaves as a constant default (edited in the Default Sources UI).

### 4.3.2 Required const family
You need one const-provider block **per slot type you want to support** (because port typing is static). Start with the types that appear in `slot.defaultSource` across the registry:
- `Signal<float>` → `DSConstSignalFloat`
- `Signal<int>` → `DSConstSignalInt`
- `Signal<color>` → `DSConstSignalColor`
- `Signal<vec2>` → `DSConstSignalVec2`
- `Signal<Unit>` / `Signal<phase>` / `Signal<time>` as needed (look for these in defaultSource metadata)
- `Field<float>` → `DSConstFieldFloat`
- `Field<vec2>` → `DSConstFieldVec2`
- `Field<color>` → `DSConstFieldColor`
- `Scalar:string` → `DSConstScalarString`
- `Scalar:waveform` → `DSConstScalarWaveform`

If you miss one, you’ll see it quickly: a block input will have a defaultSource but the “Constant” provider won’t be selectable or compilation will fail due to missing block type.

### 4.3.3 Where to implement them (editor + compiler)
1) **Editor block definitions**
   - Add a new module, e.g. `src/editor/blocks/default-source-providers.ts`, exporting the `DSConst*` block definitions.
   - Ensure `src/editor/blocks/registry.ts` includes them (import the module and spread the exports into `ALL_INDIVIDUAL_BLOCKS`).
   - Tag them so the UI can hide them from the palette, e.g. `tags: { role: 'defaultSourceProvider', hidden: true }`.

2) **Compiler blocks**
   - Add compilers for each `DSConst*` block, preferably via one helper that generates “pass-through” compilers.
   - Suggested location: `src/editor/compiler/blocks/defaultSources/`.
   - Register them in `src/editor/compiler/blocks/index.ts` so both legacy compilation and IR lowering recognize the block types.

### 4.3.4 Hide them from the library (do this once, centrally)
Provider blocks must not show up in the block palette/library:
- Update `src/editor/BlockLibrary.tsx` (and any other block lists, e.g. context menus) to filter out any block definition with `getBlockTags(def).hidden === true` (or the chosen tag).
- Do not add scattered `if (type.startsWith('DSConst'))` checks.

## 5) Store changes (authoring + persistence)

### 5.1 Extend DefaultSourceStore responsibilities
Keep `DefaultSourceStore` as the table of constant values (`DefaultSourceState`) but add:
- a map of attachments by target input port
- helper methods to create/update attachments and provider configs

Recommended new structures inside `src/editor/stores/DefaultSourceStore.ts`:
- `attachmentsByTarget: Map<string /*blockId:slotId*/, DefaultSourceAttachment>`
- helper `targetKey(blockId, slotId)` function

### 5.2 Stable IDs (critical for persistence)
Stop generating default-source IDs with `root.generateId('ds')` for input defaults.

Instead, generate deterministic IDs:
- default source value for a target input (used by its Const provider): `ds:input:${blockId}:${slotId}`
- provider block id for an input: `dsprov:${blockId}:${slotId}`
- provider internal input default ids: `ds:prov:${providerId}:${inputId}`

This eliminates the current “can’t rebuild mappings after load” problem and makes provider configs stable.

### 5.3 Patch save/load
Update:
- `src/editor/types.ts` (`Patch` interface): add `defaultSourceAttachments: DefaultSourceAttachment[]`
- `src/editor/stores/RootStore.ts`:
  - `toJSON()` includes `defaultSourceAttachments`
  - `loadPatch()` loads `defaultSourceAttachments` then loads `defaultSources`

Backward compatibility:
- If a loaded patch has no `defaultSourceAttachments`, rebuild attachments for each block input that has `slot.defaultSource` metadata using the appropriate **Const provider block** for the slot type (so legacy patches still behave the same).

---

## 6) Compiler integration (the key: inject hidden graph)

### 6.1 Where to inject
Do not mutate editor state. Inject only into the compiler patch representation.

Best location:
- `src/editor/compiler/integration.ts` inside `editorToPatch(store)`

Add a new pure function:
- `injectDefaultSourceProviders(store, patch): CompilerPatch`

### 6.2 What to inject
For each attachment target input that is **undriven** (no wire + no enabled listener):
1) Add provider block instance to `CompilerPatch.blocks` (if not already added).
2) Add a wire connection: provider output → target input.
3) Add injected listeners for provider bus inputs:
   - convert busName → busId by searching `store.busStore.buses` by `bus.name`
   - create a listener to provider block input (`to.blockId = providerId`)
4) Extend `defaultSourceValues` map to include provider internal defaults:
   - for each editable provider input, add `defaultSourceValues[\"${providerId}:${inputId}\"] = value`

Because the provider is injected as normal graph primitives:
- `compileBusAware` will see a normal wire into the target input.
- IR pipeline will see the input as wired and won’t auto-attach a constant default.

### 6.3 Deterministic IDs for injected objects
Injected listeners and connections must have stable ids (no random UUIDs), e.g.:
- wire id: `wire:ds:${providerId}->${target.blockId}:${target.slotId}`
- listener id: `lis:ds:${busId}->${providerId}:${inputId}`

This makes compiler output deterministic and easier to debug.

---

## 7) UI changes (limited configuration UX)

Modify only one UI entry point first:
- `src/editor/Inspector.tsx` → `DefaultSourcesSection`

### 7.1 Per-input “Source” selector
For each input slot with a default source attachment:
- show a dropdown:
  - `Constant` (Const provider block for that slot type)
  - any allowlisted provider blocks compatible with the slot type (use semantic type compatibility)

### 7.2 Provider config panel (block provider)
When provider is a block:
- If provider is the Const provider: render the same single “Value” control you render today (this is just editing the const provider’s `value` input).
- Otherwise (e.g., Oscillator): show a compact header: `Default Source: Oscillator`
- show bus-fed inputs as read-only rows:
  - `phase ← bus phaseA` (no editing)
- show editable inputs as existing default value controls:
  - re-use the existing `DefaultSourceControl` UI by creating `DefaultSourceState` objects for each editable input and storing them in `DefaultSourceStore`

### 7.3 Driven inputs remain read-only
Preserve current behavior:
- If an input is driven by wire/bus, show default source UI as read-only (“overridden”) so users understand what would happen if disconnected.

---

## 8) Validation + diagnostics

Add: `src/editor/defaultSources/validate.ts`

Expose:
- `validateDefaultSourceAttachments(rootStore): Diagnostic[]`

Integrate in:
- the semantic validator (preferred), or
- a lightweight check in the compiler integration step that emits warnings/errors to the diagnostic hub

Minimum validations:
- provider block type is allowlisted
- output slot exists and type-compatible
- bus names exist
- provider inputs are satisfiable without wires
- simple cycle guard:
  - if provider reads from bus X and the target block publishes to bus X, emit warning or error (prevents obvious feedback)

---

## 9) Implementation order (do exactly this sequence)

1) **Types + allowlist**
   - Add `src/editor/defaultSources/types.ts`
   - Add `src/editor/defaultSources/allowlist.ts`
   - Add `src/editor/defaultSources/constProviders.ts` (const-provider family + SlotType→Const mapping)
   - Add `Patch.defaultSourceAttachments` field

2) **Const provider blocks (required for “all defaults are blocks”)**
   - Add `DSConst*` editor block defs (hidden via tags)
   - Add `DSConst*` compiler blocks (pass-through)
   - Filter hidden/provider blocks out of `src/editor/BlockLibrary.tsx`

3) **Store + persistence**
   - Extend `DefaultSourceStore` to store/load attachments + stable ids
   - Update `RootStore.toJSON/loadPatch`
   - Back-compat rebuild attachments if missing

4) **Compiler injection**
   - Add `injectDefaultSourceProviders()` in `src/editor/compiler/integration.ts`
   - Ensure injected provider blocks and listeners are included in returned `CompilerPatch`

5) **UI**
   - Update `DefaultSourcesSection` in `src/editor/Inspector.tsx`
   - Implement provider selection + provider config panel

6) **Validation/diagnostics**
   - Add validation module and surface failures in UI (at least console + diagnostics panel)

7) **Manual verification**
   - `just dev`
   - Pick a block input that affects visible output, leave it unwired, set default source to Oscillator, confirm it animates.

---

## 10) Manual verification scenarios (no tests)

Run:
- `just dev`

Verify:
1) **Constant default still works** (no regressions):
   - Add a block with a numeric input default; leave input unwired; tweak default value; see output change.
2) **Oscillator default works**:
   - For a `Signal<float>` input (e.g., a size/opacity/radius input), choose `Oscillator` provider.
   - Confirm the UI shows editable `shape/amplitude/bias` and read-only `phase ← phaseA`.
   - Change `shape` to triangle; see motion change.
3) **Driven override behavior unchanged**:
   - Wire something into the input; confirm default source UI becomes read-only and input follows the wire.
   - Disconnect; confirm it returns to provider behavior.
4) **No provider leakage into bus UI**:
   - Bus board/inspector should not show extra listeners for the provider (since injected listeners are compile-time only).

---

## 11) Acceptance criteria

Required:
- Default source can be set to `Oscillator` for a compatible input.
- Provider is not visible as a block in PatchBay and cannot be wired like a normal block.
- Provider only reads from global buses/time + internal constants.
- Compiler behavior is consistent: both legacy and IR paths respect the provider (no silent “ignored” mode).
- All provider types live in one allowlist file; no scattered special casing.
